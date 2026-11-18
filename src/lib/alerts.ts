import { getBrowser } from './browser-api';
import type {
  AlertEventPayload,
  AlertsConfig,
  AlertSoundTone,
  EmailAlertConfig,
  EmailQuotaState,
  WebhookEndpoint,
} from './types';
import { generateId, todayDateKey } from './utils';

/**
 * Interpolate {{variable}} tokens in alert subjects, email bodies, and webhook payloads.
 */
export function interpolateAlertTemplate(
  template: string,
  payload: AlertEventPayload,
): string {
  const iso = new Date(payload.timestamp).toISOString();
  const values: Record<string, string> = {
    url: payload.url,
    title: payload.title,
    reason: formatAlertReason(payload.reason),
    rawReason: payload.reason,
    keyword: payload.keyword,
    snippet: payload.snippet,
    tabId: String(payload.tabId),
    windowId: String(payload.windowId),
    timestamp: iso,
  };

  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    return values[key] ?? '';
  });
}

export function formatAlertReason(reason: AlertEventPayload['reason']): string {
  const labels: Record<AlertEventPayload['reason'], string> = {
    keyword_found: 'Keyword Detected',
    keyword_lost: 'Keyword Disappeared',
    content_changed: 'Page Content Changed',
    numeric_threshold: 'Numeric Threshold Reached',
    captcha: 'CAPTCHA Detected',
    error_page: 'Error Page Detected',
    redirect: 'URL Redirect Detected',
  };
  return labels[reason] ?? reason;
}

/**
 * Feature: Push Notifications (WebExtension desktop notification + Web Audio chime)
 */
export async function sendPushNotification(
  payload: AlertEventPayload,
): Promise<{ sent: boolean; notificationId: string }> {
  const b = getBrowser();
  const notificationId = `pr_alert_${payload.tabId}_${payload.windowId}_${generateId('n')}`;
  const title = `PulseRefresh: ${formatAlertReason(payload.reason)}`;
  const message = [
    payload.title || payload.url,
    payload.keyword ? `Match: ${payload.keyword}` : '',
    payload.snippet ? payload.snippet.slice(0, 120) : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    let iconUrl = 'icon/128.png';
    try {
      if (b.runtime?.getURL) {
        iconUrl = b.runtime.getURL('/icon/128.png');
      }
    } catch {
      // Fallback relative icon
    }

    await b.notifications.create(notificationId, {
      type: 'basic',
      iconUrl,
      title,
      message,
    });
    return { sent: true, notificationId };
  } catch {
    return { sent: false, notificationId };
  }
}

/**
 * Parse tabId & windowId back out of a PulseRefresh notificationId so clicking
 * a desktop notification brings the user right to the detected tab.
 */
export function parseNotificationTarget(
  notificationId: string,
): { tabId: number; windowId: number } | null {
  const match = notificationId.match(/^pr_alert_(\d+)_(\d+)_/);
  if (!match) return null;
  return { tabId: Number(match[1]), windowId: Number(match[2]) };
}

/**
 * Synthesize a crisp alert chime using Web Audio API (no external audio assets required).
 */
export function playAlertTone(
  tone: AlertSoundTone,
  volume = 0.7,
): boolean {
  if (tone === 'none') return false;
  const AudioCtx =
    typeof globalThis !== 'undefined'
      ? (
          globalThis as unknown as {
            AudioContext?: typeof AudioContext;
            webkitAudioContext?: typeof AudioContext;
          }
        ).AudioContext ??
        (
          globalThis as unknown as {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext
      : undefined;
  if (!AudioCtx) return false;

  try {
    const ctx = new AudioCtx();
    const notesMap: Record<Exclude<AlertSoundTone, 'none'>, number[]> = {
      chime: [523.25, 659.25, 783.99],
      radar: [880, 880],
      bell: [659.25, 987.77],
      urgent: [740, 987.77, 740, 1174.66],
    };
    const freqs = notesMap[tone] ?? notesMap.chime;
    const safeVol = Math.max(0.05, Math.min(1, volume)) * 0.25;

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone === 'urgent' ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + idx * 0.13;
      gain.gain.setValueAtTime(safeVol, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.25);
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Feature: Window Focus on Detection
 */
export async function focusTabAndWindow(
  tabId: number,
  windowId: number,
): Promise<boolean> {
  const b = getBrowser();
  let ok = false;
  try {
    if (b.windows?.update && windowId > 0) {
      await b.windows.update(windowId, {
        focused: true,
        drawAttention: true,
      });
      ok = true;
    }
  } catch {
    // Window may not support drawAttention on all platforms; try focused only
    try {
      await b.windows?.update?.(windowId, { focused: true });
      ok = true;
    } catch {
      // Ignore
    }
  }

  try {
    await b.tabs.update(tabId, { active: true });
    ok = true;
  } catch {
    // Ignore missing tab
  }

  return ok;
}

/**
 * Feature: Email Alerts (Self-contained Resend, SendGrid, EmailJS, or Custom HTTP Relay)
 * Unlimited emails/day unlocked by default, with optional user-configurable safety cap
 * and automatic midnight quota reset.
 */
export function normalizeEmailQuota(
  quota: EmailQuotaState,
  now = new Date(),
): EmailQuotaState {
  const key = todayDateKey(now);
  if (quota.dateKey !== key) {
    return { dateKey: key, sentCount: 0, lastSentAt: quota.lastSentAt };
  }
  return { ...quota };
}

export function canSendEmailUnderQuota(
  config: EmailAlertConfig,
  quota: EmailQuotaState,
  now = new Date(),
): { allowed: boolean; remaining: number | 'unlimited'; normalizedQuota: EmailQuotaState } {
  const normalizedQuota = normalizeEmailQuota(quota, now);
  if (config.dailyLimit == null || config.dailyLimit <= 0) {
    return { allowed: true, remaining: 'unlimited', normalizedQuota };
  }
  const remaining = Math.max(0, config.dailyLimit - normalizedQuota.sentCount);
  return {
    allowed: remaining > 0,
    remaining,
    normalizedQuota,
  };
}

export async function sendEmailAlert(params: {
  config: EmailAlertConfig;
  quota: EmailQuotaState;
  payload: AlertEventPayload;
  fetcher?: typeof fetch;
  now?: Date;
}): Promise<{
  sent: boolean;
  updatedQuota: EmailQuotaState;
  statusCode?: number;
  error?: string;
}> {
  const { config, payload } = params;
  const fetchFn = params.fetcher ?? globalThis.fetch;
  const now = params.now ?? new Date();
  const quotaCheck = canSendEmailUnderQuota(config, params.quota, now);

  if (!config.enabled) {
    return {
      sent: false,
      updatedQuota: quotaCheck.normalizedQuota,
      error: 'Email alerts disabled',
    };
  }
  if (!config.toEmail.trim()) {
    return {
      sent: false,
      updatedQuota: quotaCheck.normalizedQuota,
      error: 'Recipient email address is required',
    };
  }
  if (!quotaCheck.allowed) {
    return {
      sent: false,
      updatedQuota: quotaCheck.normalizedQuota,
      error: `Daily email limit (${config.dailyLimit}/day) reached`,
    };
  }

  const subject = interpolateAlertTemplate(
    config.subjectTemplate || '[PulseRefresh] {{reason}} on {{title}}',
    payload,
  );
  const textBody = [
    `PulseRefresh Alert: ${formatAlertReason(payload.reason)}`,
    `Page: ${payload.title}`,
    `URL: ${payload.url}`,
    payload.keyword ? `Matched: ${payload.keyword}` : '',
    payload.snippet ? `Snippet: ${payload.snippet}` : '',
    `Time: ${new Date(payload.timestamp).toISOString()}`,
  ]
    .filter(Boolean)
    .join('\n');

  const htmlBody = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;padding:16px;border:1px solid #e2e8f0;border-radius:10px">
      <h2 style="margin:0 0 8px;color:#059669">${escapeHtml(formatAlertReason(payload.reason))}</h2>
      <p style="margin:4px 0"><strong>Page:</strong> ${escapeHtml(payload.title)}</p>
      <p style="margin:4px 0"><strong>URL:</strong> <a href="${escapeHtml(payload.url)}">${escapeHtml(payload.url)}</a></p>
      ${payload.keyword ? `<p style="margin:4px 0"><strong>Matched:</strong> <code>${escapeHtml(payload.keyword)}</code></p>` : ''}
      ${payload.snippet ? `<blockquote style="margin:10px 0;padding:8px 12px;background:#f8fafc;border-left:3px solid #10b981">${escapeHtml(payload.snippet)}</blockquote>` : ''}
      <p style="margin:12px 0 0;font-size:12px;color:#64748b">Sent by PulseRefresh at ${new Date(payload.timestamp).toISOString()}</p>
    </div>
  `.trim();

  try {
    let url = '';
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: unknown;

    switch (config.provider) {
      case 'resend':
        url = 'https://api.resend.com/emails';
        headers = {
          ...headers,
          Authorization: `Bearer ${config.apiKey}`,
        };
        body = {
          from: config.fromEmail || 'PulseRefresh <onboarding@resend.dev>',
          to: [config.toEmail],
          subject,
          text: textBody,
          html: htmlBody,
        };
        break;

      case 'sendgrid':
        url = 'https://api.sendgrid.com/v3/mail/send';
        headers = {
          ...headers,
          Authorization: `Bearer ${config.apiKey}`,
        };
        body = {
          personalizations: [{ to: [{ email: config.toEmail }] }],
          from: { email: config.fromEmail || 'alerts@yourdomain.com' },
          subject,
          content: [
            { type: 'text/plain', value: textBody },
            { type: 'text/html', value: htmlBody },
          ],
        };
        break;

      case 'emailjs':
        url = 'https://api.emailjs.com/api/v1.0/email/send';
        body = {
          service_id: config.emailJsServiceId,
          template_id: config.emailJsTemplateId,
          user_id: config.apiKey,
          template_params: {
            to_email: config.toEmail,
            subject,
            message: textBody,
            page_url: payload.url,
            page_title: payload.title,
            keyword: payload.keyword,
            snippet: payload.snippet,
          },
        };
        break;

      case 'custom_http':
      default:
        url = config.customEndpointUrl;
        if (!url) {
          return {
            sent: false,
            updatedQuota: quotaCheck.normalizedQuota,
            error: 'Custom email relay URL is required',
          };
        }
        if (config.apiKey) {
          headers.Authorization = `Bearer ${config.apiKey}`;
        }
        body = {
          to: config.toEmail,
          from: config.fromEmail,
          subject,
          text: textBody,
          html: htmlBody,
          event: payload,
        };
        break;
    }

    const res = await fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return {
        sent: false,
        updatedQuota: quotaCheck.normalizedQuota,
        statusCode: res.status,
        error: `Email provider returned HTTP ${res.status}`,
      };
    }

    const updatedQuota: EmailQuotaState = {
      dateKey: quotaCheck.normalizedQuota.dateKey,
      sentCount: quotaCheck.normalizedQuota.sentCount + 1,
      lastSentAt: now.getTime(),
    };

    return { sent: true, updatedQuota, statusCode: res.status };
  } catch (err) {
    return {
      sent: false,
      updatedQuota: quotaCheck.normalizedQuota,
      error: err instanceof Error ? err.message : 'Email network error',
    };
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Compute hex-encoded HMAC-SHA256 signature for webhook payload verification.
 */
export async function computeHmacSha256(
  secret: string,
  body: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Build provider-formatted JSON body for Generic, Slack, Discord, or Telegram webhooks.
 */
export function buildWebhookBody(
  webhook: WebhookEndpoint,
  payload: AlertEventPayload,
): string {
  if (webhook.payloadTemplate?.trim()) {
    return interpolateAlertTemplate(webhook.payloadTemplate, payload);
  }

  const headline = `PulseRefresh — ${formatAlertReason(payload.reason)}`;
  const summaryLine = [
    `*Page:* ${payload.title}`,
    `*URL:* ${payload.url}`,
    payload.keyword ? `*Match:* \`${payload.keyword}\`` : '',
    payload.snippet ? `*Snippet:* ${payload.snippet}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  switch (webhook.preset) {
    case 'slack':
      return JSON.stringify({
        text: `${headline}\n${summaryLine}`,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*${headline}*\n${summaryLine}` },
          },
        ],
      });

    case 'discord':
      return JSON.stringify({
        username: 'PulseRefresh',
        content: `**${headline}**`,
        embeds: [
          {
            title: payload.title || payload.url,
            url: payload.url,
            description: payload.snippet || payload.keyword || headline,
            color: 0x10b981,
            fields: payload.keyword
              ? [{ name: 'Matched', value: payload.keyword, inline: true }]
              : [],
            timestamp: new Date(payload.timestamp).toISOString(),
          },
        ],
      });

    case 'telegram':
      return JSON.stringify({
        chat_id: webhook.telegramChatId || '',
        text: `${headline}\nPage: ${payload.title}\nURL: ${payload.url}\n${
          payload.keyword ? `Match: ${payload.keyword}\n` : ''
        }${payload.snippet || ''}`.trim(),
      });

    case 'generic':
    default:
      return JSON.stringify({
        event: 'pulserefresh.detection',
        reason: payload.reason,
        reasonLabel: formatAlertReason(payload.reason),
        tabId: payload.tabId,
        url: payload.url,
        title: payload.title,
        keyword: payload.keyword,
        snippet: payload.snippet,
        timestamp: new Date(payload.timestamp).toISOString(),
      });
  }
}

/**
 * Feature: Webhook Integration (with HMAC-SHA256 signing & exponential backoff retry)
 */
export async function dispatchWebhook(params: {
  webhook: WebhookEndpoint;
  payload: AlertEventPayload;
  fetcher?: typeof fetch;
  retryBaseDelayMs?: number;
}): Promise<{
  ok: boolean;
  attempts: number;
  statusCode?: number;
  signature?: string;
  error?: string;
}> {
  const { webhook, payload } = params;
  const fetchFn = params.fetcher ?? globalThis.fetch;
  const baseDelay = params.retryBaseDelayMs ?? 150;

  if (!webhook.url.trim()) {
    return { ok: false, attempts: 0, error: 'Webhook URL is empty' };
  }

  const body = buildWebhookBody(webhook, payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...webhook.headers,
  };

  let signature: string | undefined;
  if (webhook.secret?.trim()) {
    signature = `sha256=${await computeHmacSha256(webhook.secret.trim(), body)}`;
    headers['X-PulseRefresh-Signature'] = signature;
  }

  const maxAttempts = Math.max(1, (webhook.maxRetries ?? 0) + 1);
  let lastStatus: number | undefined;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchFn(webhook.url, {
        method: 'POST',
        headers,
        body,
      });
      lastStatus = res.status;
      if (res.ok) {
        return { ok: true, attempts: attempt, statusCode: res.status, signature };
      }
      lastError = `HTTP ${res.status}`;
      // Do not retry deterministic 4xx errors (except 429 rate limits)
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return {
          ok: false,
          attempts: attempt,
          statusCode: res.status,
          signature,
          error: lastError,
        };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Webhook request failed';
    }

    if (attempt < maxAttempts && baseDelay > 0) {
      await new Promise((r) =>
        setTimeout(r, baseDelay * Math.pow(2, attempt - 1)),
      );
    }
  }

  return {
    ok: false,
    attempts: maxAttempts,
    statusCode: lastStatus,
    signature,
    error: lastError,
  };
}

/**
 * Orchestrate all configured Alerts & Notifications for a single detection event.
 */
export async function dispatchAllAlerts(params: {
  alerts: AlertsConfig;
  emailQuota: EmailQuotaState;
  payload: AlertEventPayload;
  fetcher?: typeof fetch;
}): Promise<{
  notificationSent: boolean;
  windowFocused: boolean;
  emailSent: boolean;
  updatedEmailQuota: EmailQuotaState;
  webhookResults: Array<{ webhookId: string; ok: boolean; attempts: number }>;
}> {
  const { alerts, payload, fetcher } = params;
  let notificationSent = false;
  let windowFocused = false;

  if (alerts.pushNotifications) {
    const res = await sendPushNotification(payload);
    notificationSent = res.sent;
    if (alerts.soundTone !== 'none') {
      playAlertTone(alerts.soundTone, alerts.soundVolume);
    }
  }

  if (alerts.focusWindowOnDetection) {
    windowFocused = await focusTabAndWindow(payload.tabId, payload.windowId);
  }

  let emailSent = false;
  let updatedEmailQuota = normalizeEmailQuota(params.emailQuota);
  if (alerts.email.enabled) {
    const emailRes = await sendEmailAlert({
      config: alerts.email,
      quota: updatedEmailQuota,
      payload,
      fetcher,
    });
    emailSent = emailRes.sent;
    updatedEmailQuota = emailRes.updatedQuota;
  }

  const enabledWebhooks = alerts.webhooks.filter((w) => w.enabled && w.url.trim());
  const webhookResults = await Promise.all(
    enabledWebhooks.map(async (webhook) => {
      const r = await dispatchWebhook({ webhook, payload, fetcher });
      return { webhookId: webhook.id, ok: r.ok, attempts: r.attempts };
    }),
  );

  return {
    notificationSent,
    windowFocused,
    emailSent,
    updatedEmailQuota,
    webhookResults,
  };
}
