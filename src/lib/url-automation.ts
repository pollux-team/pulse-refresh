import { DEFAULT_ERROR_STATUS_CODES } from './defaults';
import type {
  AutoStartRule,
  ErrorAction,
  RedirectPolicy,
  TabJob,
  UrlJobConfig,
  UrlMatchType,
} from './types';

/**
 * Escape special RegExp characters in a literal string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Feature: Auto Start URLs
 * Matches a candidate URL against exact, prefix, wildcard (*, ?), or regex patterns.
 */
export function matchesUrlPattern(
  url: string,
  pattern: string,
  matchType: UrlMatchType = 'wildcard',
): boolean {
  const cleanUrl = (url || '').trim();
  const cleanPattern = (pattern || '').trim();
  if (!cleanUrl || !cleanPattern) return false;

  // Reject internal browser pages
  if (/^(chrome|about|moz-extension|chrome-extension|edge):/i.test(cleanUrl)) {
    return false;
  }

  switch (matchType) {
    case 'exact':
      return normalizeTrailingSlash(cleanUrl) === normalizeTrailingSlash(cleanPattern);
    case 'prefix':
      return cleanUrl.toLowerCase().startsWith(cleanPattern.toLowerCase());
    case 'wildcard': {
      if (cleanPattern === '*') return true;
      const rxBody = cleanPattern
        .split(/(\*|\?)/)
        .map((tok) => {
          if (tok === '*') return '.*';
          if (tok === '?') return '.';
          return escapeRegex(tok);
        })
        .join('');
      return new RegExp(`^${rxBody}$`, 'i').test(cleanUrl);
    }
    case 'regex': {
      try {
        const parsed = parseSlashRegex(cleanPattern);
        return parsed.test(cleanUrl);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

function normalizeTrailingSlash(url: string): string {
  return url.endsWith('/') && url.length > 1 ? url.slice(0, -1) : url;
}

function parseSlashRegex(pattern: string): RegExp {
  const match = pattern.match(/^\/(.+)\/([gimsuy]*)$/);
  if (match?.[1] !== undefined) {
    return new RegExp(match[1], (match[2] ?? '').replace('g', ''));
  }
  return new RegExp(pattern, 'i');
}

/**
 * Find the first enabled AutoStartRule matching the given URL.
 */
export function findMatchingAutoStartRule(
  url: string,
  rules: AutoStartRule[],
): AutoStartRule | null {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (matchesUrlPattern(url, rule.pattern, rule.matchType)) {
      return rule;
    }
  }
  return null;
}

/**
 * Feature: Active Tabs List
 * Filters, sorts, and summarizes active/managed tab jobs across all windows.
 */
export interface ActiveTabsSummary {
  jobs: TabJob[];
  runningCount: number;
  pausedCount: number;
  detectedCount: number;
  alertedCount: number;
  totalRefreshes: number;
}

export function buildActiveTabsSummary(
  jobsMap: Record<number, TabJob>,
  filter: 'all' | 'running' | 'paused' | 'issues' = 'all',
): ActiveTabsSummary {
  const all = Object.values(jobsMap).filter(
    (j) => j.status !== 'idle' && j.status !== 'stopped',
  );

  const runningCount = all.filter((j) => j.status === 'running').length;
  const pausedCount = all.filter((j) => j.status === 'paused').length;
  const detectedCount = all.filter((j) => j.status === 'detected').length;
  const alertedCount = all.filter((j) =>
    ['captcha_paused', 'error_paused', 'redirect_stopped'].includes(j.status),
  ).length;
  const totalRefreshes = all.reduce((sum, j) => sum + j.refreshCount, 0);

  const filtered = all.filter((j) => {
    if (filter === 'running') return j.status === 'running';
    if (filter === 'paused') return j.status === 'paused';
    if (filter === 'issues') {
      return [
        'detected',
        'captcha_paused',
        'error_paused',
        'redirect_stopped',
      ].includes(j.status);
    }
    return true;
  });

  // Sort: running first (soonest refresh at top), then issues, then paused/completed
  const priority: Record<TabJob['status'], number> = {
    running: 0,
    captcha_paused: 1,
    error_paused: 2,
    detected: 3,
    redirect_stopped: 4,
    paused: 5,
    completed: 6,
    idle: 7,
    stopped: 8,
  };

  filtered.sort((a, b) => {
    const pa = priority[a.status] ?? 9;
    const pb = priority[b.status] ?? 9;
    if (pa !== pb) return pa - pb;
    return (a.nextRefreshAt ?? Infinity) - (b.nextRefreshAt ?? Infinity);
  });

  return {
    jobs: filtered,
    runningCount,
    pausedCount,
    detectedCount,
    alertedCount,
    totalRefreshes,
  };
}

/**
 * Feature: Refresh Predefined URL (single canonical URL or ordered URL rotation list)
 */
export function resolveTargetRefreshUrl(
  job: Pick<TabJob, 'url' | 'rotationIndex' | 'urlConfig'>,
): { targetUrl: string; nextRotationIndex: number; usedPredefined: boolean } {
  const { urlConfig } = job;
  const validRotation = (urlConfig.rotationUrls ?? [])
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u));

  if (urlConfig.usePredefinedUrl && validRotation.length > 0) {
    const idx = job.rotationIndex % validRotation.length;
    const chosen = validRotation[idx] ?? job.url;
    return {
      targetUrl: chosen,
      nextRotationIndex: (idx + 1) % validRotation.length,
      usedPredefined: true,
    };
  }

  const single = (urlConfig.predefinedUrl || '').trim();
  if (urlConfig.usePredefinedUrl && /^https?:\/\//i.test(single)) {
    return {
      targetUrl: single,
      nextRotationIndex: 0,
      usedPredefined: true,
    };
  }

  return {
    targetUrl: job.url,
    nextRotationIndex: job.rotationIndex,
    usedPredefined: false,
  };
}

/**
 * Strip our internal cache-buster query param when comparing URLs for redirect detection.
 */
function stripInternalParams(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.delete('_pr_cb');
    parsed.hash = '';
    return normalizeTrailingSlash(parsed.toString());
  } catch {
    return normalizeTrailingSlash(rawUrl);
  }
}

/**
 * Feature: URL Changes & Redirection Handling
 */
export interface RedirectDecision {
  changed: boolean;
  sameOrigin: boolean;
  action: 'continue' | 'stop' | 'revert';
  revertUrl?: string;
  reason?: string;
}

export function evaluateUrlRedirect(params: {
  initialUrl: string;
  previousUrl: string;
  newUrl: string;
  policy: RedirectPolicy;
  allowedUrls?: string[];
}): RedirectDecision {
  const cleanInit = stripInternalParams(params.initialUrl);
  const cleanPrev = stripInternalParams(params.previousUrl);
  const cleanNew = stripInternalParams(params.newUrl);

  if (cleanNew === cleanPrev || cleanNew === cleanInit) {
    return { changed: false, sameOrigin: true, action: 'continue' };
  }

  if (params.allowedUrls?.some((u) => stripInternalParams(u) === cleanNew)) {
    return { changed: false, sameOrigin: true, action: 'continue' };
  }

  let sameOrigin = false;
  try {
    sameOrigin = new URL(cleanInit).origin === new URL(cleanNew).origin;
  } catch {
    sameOrigin = false;
  }

  switch (params.policy) {
    case 'follow':
      return { changed: true, sameOrigin, action: 'continue' };
    case 'stop':
      return {
        changed: true,
        sameOrigin,
        action: 'stop',
        reason: `Redirected from ${cleanPrev} to ${cleanNew}`,
      };
    case 'revert':
      return {
        changed: true,
        sameOrigin,
        action: 'revert',
        revertUrl: params.initialUrl,
        reason: `Reverting redirect back to ${params.initialUrl}`,
      };
    case 'allow-same-origin':
      if (sameOrigin) {
        return { changed: true, sameOrigin: true, action: 'continue' };
      }
      return {
        changed: true,
        sameOrigin: false,
        action: 'stop',
        reason: `Cross-origin redirect blocked: ${cleanNew}`,
      };
    default:
      return { changed: true, sameOrigin, action: 'continue' };
  }
}

/**
 * Feature: Captcha Detection
 * Inspects a live Document or parsed HTML Document for major CAPTCHA providers.
 */
export interface CaptchaDetectionResult {
  detected: boolean;
  provider?:
    | 'reCAPTCHA'
    | 'hCaptcha'
    | 'Cloudflare Turnstile'
    | 'Arkose FunCaptcha'
    | 'AWS WAF Captcha'
    | 'Generic Captcha';
  evidence?: string;
}

const CAPTCHA_SELECTORS: Array<{
  provider: NonNullable<CaptchaDetectionResult['provider']>;
  selector: string;
}> = [
  {
    provider: 'reCAPTCHA',
    selector:
      '.g-recaptcha, iframe[src*="google.com/recaptcha"], iframe[src*="recaptcha.net/recaptcha"], #recaptcha',
  },
  {
    provider: 'hCaptcha',
    selector: '.h-captcha, iframe[src*="hcaptcha.com"], [data-hcaptcha-widget-id]',
  },
  {
    provider: 'Cloudflare Turnstile',
    selector:
      '.cf-turnstile, iframe[src*="challenges.cloudflare.com"], #challenge-running, #cf-challenge-running, form#challenge-form',
  },
  {
    provider: 'Arkose FunCaptcha',
    selector:
      '#FunCaptcha, iframe[src*="arkoselabs.com"], iframe[src*="funcaptcha.com"], [data-pkey][id*="captcha" i]',
  },
  {
    provider: 'AWS WAF Captcha',
    selector: 'awswaf-captcha, #captcha-container[data-aws-waf], script[src*="awswaf.com"]',
  },
  {
    provider: 'Generic Captcha',
    selector:
      'input[name="captcha" i], img[src*="captcha" i][alt*="captcha" i], [data-captcha-challenge]',
  },
];

export function detectCaptchaInDocument(
  doc: Document,
): CaptchaDetectionResult {
  for (const entry of CAPTCHA_SELECTORS) {
    try {
      const el = doc.querySelector(entry.selector);
      if (el) {
        return {
          detected: true,
          provider: entry.provider,
          evidence: `Matched selector: ${entry.selector}`,
        };
      }
    } catch {
      // Ignore selector syntax errors on unusual docs
    }
  }

  const title = (doc.title || '').trim();
  const bodyText = (doc.body?.textContent || '').slice(0, 4000);

  if (
    /^Just a moment\.\.\.$/i.test(title) &&
    /cloudflare|verify you are human|checking your browser/i.test(bodyText)
  ) {
    return {
      detected: true,
      provider: 'Cloudflare Turnstile',
      evidence: 'Cloudflare interstitial challenge page',
    };
  }

  if (
    /^(Attention Required!|Security Check|Robot Check|Access to this page has been denied)$/i.test(
      title,
    ) &&
    /(verify you are human|complete the security check|press & hold|unusual traffic from your computer)/i.test(
      bodyText,
    )
  ) {
    return {
      detected: true,
      provider: 'Generic Captcha',
      evidence: `Challenge page title: "${title}"`,
    };
  }

  return { detected: false };
}

/**
 * Feature: Error Page Detection
 * Detects HTTP 4xx/5xx error statuses, browser neterror pages, and server error documents.
 */
export interface ErrorPageDetectionResult {
  detected: boolean;
  statusCode?: number;
  reason?: string;
}

const ERROR_PAGE_PATTERNS: Array<{ code: number; regex: RegExp; label: string }> = [
  { code: 403, regex: /\b403\s+Forbidden\b/i, label: '403 Forbidden' },
  { code: 404, regex: /\b404\s+(Not Found|Page Not Found)\b/i, label: '404 Not Found' },
  { code: 408, regex: /\b408\s+Request Timeout\b/i, label: '408 Request Timeout' },
  {
    code: 429,
    regex: /\b(429\s+Too Many Requests|Rate limit exceeded|Error 1015)\b/i,
    label: '429 Too Many Requests',
  },
  {
    code: 500,
    regex: /\b500\s+Internal Server Error\b/i,
    label: '500 Internal Server Error',
  },
  { code: 502, regex: /\b502\s+Bad Gateway\b/i, label: '502 Bad Gateway' },
  {
    code: 503,
    regex: /\b503\s+(Service (Temporarily )?Unavailable)\b/i,
    label: '503 Service Unavailable',
  },
  { code: 504, regex: /\b504\s+Gateway Time-?out\b/i, label: '504 Gateway Timeout' },
];

const NET_ERROR_REGEX =
  /\b(ERR_CONNECTION_REFUSED|ERR_CONNECTION_TIMED_OUT|ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|DNS_PROBE_FINISHED_NXDOMAIN|NS_ERROR_NET_TIMEOUT)\b/;

export function detectErrorPage(params: {
  doc?: Document;
  url?: string;
  httpStatus?: number;
  monitoredCodes?: number[];
}): ErrorPageDetectionResult {
  const watchedCodes = params.monitoredCodes?.length
    ? params.monitoredCodes
    : DEFAULT_ERROR_STATUS_CODES;

  // 1. Explicit HTTP status code (e.g. from XHR fetch response)
  if (typeof params.httpStatus === 'number' && params.httpStatus >= 400) {
    if (watchedCodes.includes(params.httpStatus)) {
      return {
        detected: true,
        statusCode: params.httpStatus,
        reason: `HTTP ${params.httpStatus}`,
      };
    }
  }

  // 2. Chrome/Firefox internal error page URLs
  if (params.url && /^(chrome-error:\/\/|about:neterror)/i.test(params.url)) {
    return {
      detected: true,
      statusCode: 0,
      reason: 'Browser network error page',
    };
  }

  // 3. Document title / short error body heuristics
  if (params.doc) {
    const title = (params.doc.title || '').trim();
    const h1 = (params.doc.querySelector('h1')?.textContent || '').trim();
    const bodyText = (params.doc.body?.textContent || '').trim();
    const headerZone = `${title}\n${h1}`;

    const netMatch = bodyText.slice(0, 2000).match(NET_ERROR_REGEX);
    if (netMatch) {
      return {
        detected: true,
        statusCode: 0,
        reason: `Network Error: ${netMatch[1]}`,
      };
    }

    // Check title/H1 (or short server error bodies under 2500 chars so normal docs discussing HTTP codes don't false-positive)
    const searchSurface =
      bodyText.length < 2500 ? `${headerZone}\n${bodyText}` : headerZone;

    for (const entry of ERROR_PAGE_PATTERNS) {
      if (!watchedCodes.includes(entry.code)) continue;
      if (entry.regex.test(searchSurface)) {
        return {
          detected: true,
          statusCode: entry.code,
          reason: entry.label,
        };
      }
    }
  }

  return { detected: false };
}

export function resolveErrorActionDecision(
  action: ErrorAction,
  currentBackoffAttempt: number,
): {
  nextStatus: TabJob['status'];
  nextBackoffAttempt: number;
  shouldAlert: boolean;
  shouldReschedule: boolean;
} {
  switch (action) {
    case 'stop':
      return {
        nextStatus: 'error_paused',
        nextBackoffAttempt: 0,
        shouldAlert: false,
        shouldReschedule: false,
      };
    case 'continue':
      return {
        nextStatus: 'running',
        nextBackoffAttempt: 0,
        shouldAlert: false,
        shouldReschedule: true,
      };
    case 'backoff':
      return {
        nextStatus: 'running',
        nextBackoffAttempt: currentBackoffAttempt + 1,
        shouldAlert: currentBackoffAttempt === 0,
        shouldReschedule: true,
      };
    case 'alert-and-pause':
    default:
      return {
        nextStatus: 'error_paused',
        nextBackoffAttempt: 0,
        shouldAlert: true,
        shouldReschedule: false,
      };
  }
}

export function getAllowedRedirectUrls(config: UrlJobConfig): string[] {
  const list: string[] = [];
  if (config.predefinedUrl) list.push(config.predefinedUrl);
  if (config.rotationUrls?.length) list.push(...config.rotationUrls);
  return list;
}
