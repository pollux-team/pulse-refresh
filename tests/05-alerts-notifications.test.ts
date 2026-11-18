import { describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  buildWebhookBody,
  canSendEmailUnderQuota,
  computeHmacSha256,
  dispatchAllAlerts,
  dispatchWebhook,
  focusTabAndWindow,
  parseNotificationTarget,
  sendEmailAlert,
  sendPushNotification,
} from '@/src/lib/alerts';
import { createDefaultAlertsConfig } from '@/src/lib/defaults';
import type { AlertEventPayload, WebhookEndpoint } from '@/src/lib/types';

const samplePayload: AlertEventPayload = {
  tabId: 77,
  windowId: 3,
  url: 'https://shop.example.com/ps5',
  title: 'PS5 Console Listing',
  reason: 'keyword_found',
  keyword: 'Add to Cart',
  snippet: '...In Stock now — click Add to Cart for express delivery...',
  timestamp: 1_760_000_000_000,
};

describe('Category 5 — Alerts & Notifications', () => {
  describe('5.1 Push Notifications', () => {
    it('creates a WebExtension desktop notification with recoverable tab/window routing ID', async () => {
      const createSpy = vi.spyOn(fakeBrowser.notifications, 'create');
      const res = await sendPushNotification(samplePayload);

      expect(res.sent).toBe(true);
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(parseNotificationTarget(res.notificationId)).toEqual({
        tabId: 77,
        windowId: 3,
      });
    });
  });

  describe('5.2 Email Alerts (Unlimited by default + Quota Rollover + Multi-Provider)', () => {
    it('sends emails via Resend/SendGrid/Custom HTTP with Unlimited default and enforces optional daily caps + next-day reset', async () => {
      const cfg = createDefaultAlertsConfig().email;
      cfg.enabled = true;
      cfg.provider = 'resend';
      cfg.toEmail = 'user@example.com';
      cfg.apiKey = 're_test_123';
      cfg.dailyLimit = null; // Unlimited

      const mockFetch = vi
        .fn()
        .mockImplementation(() => Promise.resolve(new Response('{"id":"em_1"}', { status: 200 })));

      const day1 = new Date('2026-11-17T10:00:00Z');
      const r1 = await sendEmailAlert({
        config: cfg,
        quota: { dateKey: '2026-11-17', sentCount: 500, lastSentAt: null },
        payload: samplePayload,
        fetcher: mockFetch as unknown as typeof fetch,
        now: day1,
      });
      expect(r1.sent).toBe(true);
      expect(r1.updatedQuota.sentCount).toBe(501);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({ method: 'POST' }),
      );

      // Optional daily safety cap blocks at limit and resets automatically the next day
      cfg.dailyLimit = 10;
      const blocked = await sendEmailAlert({
        config: cfg,
        quota: { dateKey: '2026-11-17', sentCount: 10, lastSentAt: null },
        payload: samplePayload,
        fetcher: mockFetch as unknown as typeof fetch,
        now: day1,
      });
      expect(blocked.sent).toBe(false);
      expect(blocked.error).toContain('Daily email limit');

      const day2 = new Date('2026-11-18T00:05:00Z');
      const nextDayCheck = canSendEmailUnderQuota(
        cfg,
        { dateKey: '2026-11-17', sentCount: 10, lastSentAt: null },
        day2,
      );
      expect(nextDayCheck.allowed).toBe(true);
      expect(nextDayCheck.remaining).toBe(10);
    });
  });

  describe('5.3 Webhook Integration', () => {
    it('formats Slack, Discord, Telegram, and Generic JSON payloads, signs with HMAC-SHA256, and retries 5xx errors', async () => {
      const slackBody = JSON.parse(
        buildWebhookBody(
          {
            id: 'w1',
            name: 'Slack',
            enabled: true,
            preset: 'slack',
            url: 'https://hooks.slack.com/test',
            secret: '',
            headers: {},
            payloadTemplate: '',
            maxRetries: 0,
          },
          samplePayload,
        ),
      );
      expect(slackBody.blocks).toHaveLength(1);

      const discordBody = JSON.parse(
        buildWebhookBody(
          {
            id: 'w2',
            name: 'Discord',
            enabled: true,
            preset: 'discord',
            url: 'https://discord.com/api/webhooks/test',
            secret: '',
            headers: {},
            payloadTemplate: '',
            maxRetries: 0,
          },
          samplePayload,
        ),
      );
      expect(discordBody.embeds[0].url).toBe(samplePayload.url);

      // Fail once with HTTP 502, then succeed with HTTP 200 + verify HMAC-SHA256 header
      let calls = 0;
      let capturedHeaders: Record<string, string> = {};
      let capturedBody = '';
      const flakyFetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        calls++;
        capturedHeaders = init.headers as Record<string, string>;
        capturedBody = init.body as string;
        if (calls === 1) return new Response('Bad Gateway', { status: 502 });
        return new Response('{"ok":true}', { status: 200 });
      });

      const wh: WebhookEndpoint = {
        id: 'w3',
        name: 'Signed Hook',
        enabled: true,
        preset: 'generic',
        url: 'https://api.example.com/webhook',
        secret: 'top_secret_key',
        headers: { 'X-Custom': 'yes' },
        payloadTemplate: '',
        maxRetries: 2,
      };

      const res = await dispatchWebhook({
        webhook: wh,
        payload: samplePayload,
        fetcher: flakyFetch as unknown as typeof fetch,
        retryBaseDelayMs: 5,
      });

      expect(res.ok).toBe(true);
      expect(res.attempts).toBe(2);
      const expectedSig = `sha256=${await computeHmacSha256('top_secret_key', capturedBody)}`;
      expect(capturedHeaders['X-PulseRefresh-Signature']).toBe(expectedSig);
      expect(capturedHeaders['X-Custom']).toBe('yes');
    });
  });

  describe('5.4 Window Focus on Detection & Full Alert Pipeline', () => {
    it('focuses browser window and activates detected tab as part of dispatchAllAlerts', async () => {
      const winSpy = vi
        .spyOn(fakeBrowser.windows, 'update')
        .mockResolvedValue({} as never);
      const tabSpy = vi
        .spyOn(fakeBrowser.tabs, 'update')
        .mockResolvedValue({} as never);

      expect(await focusTabAndWindow(77, 3)).toBe(true);
      expect(winSpy).toHaveBeenCalledWith(3, { focused: true, drawAttention: true });
      expect(tabSpy).toHaveBeenCalledWith(77, { active: true });

      const alerts = createDefaultAlertsConfig();
      const combined = await dispatchAllAlerts({
        alerts,
        emailQuota: { dateKey: '2026-11-17', sentCount: 0, lastSentAt: null },
        payload: samplePayload,
      });
      expect(combined.notificationSent).toBe(true);
      expect(combined.windowFocused).toBe(true);
    });
  });
});
