import { describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  handlePageScanReport,
  handleTabUpdated,
  startTabJob,
  stopTabJob,
} from '@/src/lib/background-controller';
import { setBrowserOverride } from '@/src/lib/browser-api';
import { createDefaultTabJob, createDefaultUrlConfig } from '@/src/lib/defaults';
import { SleepManager } from '@/src/lib/sleep-manager';
import { getTabJob, updateGlobalState } from '@/src/lib/storage';
import {
  buildActiveTabsSummary,
  detectCaptchaInDocument,
  detectErrorPage,
  evaluateUrlRedirect,
  findMatchingAutoStartRule,
  matchesUrlPattern,
  resolveErrorActionDecision,
  resolveTargetRefreshUrl,
} from '@/src/lib/url-automation';

describe('Category 2 — URL & Tab Automation', () => {
  describe('2.1 Auto Start URLs', () => {
    it('matches exact, prefix, wildcard, and regex patterns while rejecting internal browser URLs', () => {
      expect(
        matchesUrlPattern('https://shop.com/drop/', 'https://shop.com/drop', 'exact'),
      ).toBe(true);
      expect(
        matchesUrlPattern('https://shop.com/drop/2', 'https://shop.com/drop', 'prefix'),
      ).toBe(true);
      expect(
        matchesUrlPattern(
          'https://tickets.io/events/2026/vip',
          'https://tickets.io/events/*/vip',
          'wildcard',
        ),
      ).toBe(true);
      expect(
        matchesUrlPattern(
          'https://status.example.org/incidents/42',
          '/incidents\\/\\d+$/',
          'regex',
        ),
      ).toBe(true);
      expect(matchesUrlPattern('chrome://extensions', '*', 'wildcard')).toBe(false);
    });

    it('automatically starts refreshing a tab when tabs.onUpdated completes on a matching AutoStartRule', async () => {
      await updateGlobalState((s) => ({
        ...s,
        autoStartRules: [
          {
            id: 'r1',
            name: 'Flash Sale Auto',
            pattern: 'https://store.example.com/flash/*',
            matchType: 'wildcard',
            intervalSeconds: 12,
            profileId: 'profile_default',
            enabled: true,
          },
        ],
      }));

      expect(
        findMatchingAutoStartRule('https://store.example.com/flash/gpu', [
          {
            id: 'r1',
            name: 'Flash Sale Auto',
            pattern: 'https://store.example.com/flash/*',
            matchType: 'wildcard',
            intervalSeconds: 12,
            profileId: null,
            enabled: true,
          },
        ])?.id,
      ).toBe('r1');

      await handleTabUpdated(
        25,
        { status: 'complete' },
        { id: 25, windowId: 1, url: 'https://store.example.com/flash/gpu', title: 'GPU Sale' },
        { enablePrecisionTimer: false },
      );

      const job = await getTabJob(25);
      expect(job?.status).toBe('running');
      expect(job?.currentIntervalMs).toBe(12_000);
    });
  });

  describe('2.2 Active Tabs List', () => {
    it('aggregates, filters, and prioritizes running, paused, detected, and captcha tabs', () => {
      const j1 = {
        ...createDefaultTabJob({ tabId: 1, url: 'https://a.com' }),
        status: 'paused' as const,
        refreshCount: 4,
      };
      const j2 = {
        ...createDefaultTabJob({ tabId: 2, url: 'https://b.com' }),
        status: 'running' as const,
        refreshCount: 10,
        nextRefreshAt: 2000,
      };
      const j3 = {
        ...createDefaultTabJob({ tabId: 3, url: 'https://c.com' }),
        status: 'captcha_paused' as const,
        refreshCount: 3,
      };
      const j4 = {
        ...createDefaultTabJob({ tabId: 4, url: 'https://d.com' }),
        status: 'stopped' as const,
        refreshCount: 99,
      };

      const summary = buildActiveTabsSummary({ 1: j1, 2: j2, 3: j3, 4: j4 });
      expect(summary.jobs.map((j) => j.tabId)).toEqual([2, 3, 1]);
      expect(summary.runningCount).toBe(1);
      expect(summary.pausedCount).toBe(1);
      expect(summary.alertedCount).toBe(1);
      expect(summary.totalRefreshes).toBe(17);

      const issuesOnly = buildActiveTabsSummary(
        { 1: j1, 2: j2, 3: j3 },
        'issues',
      );
      expect(issuesOnly.jobs.map((j) => j.tabId)).toEqual([3]);
    });
  });

  describe('2.3 Refresh Predefined URL & Rotation', () => {
    it('uses pinned predefinedUrl or cycles sequentially through rotationUrls', () => {
      const cfg = createDefaultUrlConfig();
      cfg.usePredefinedUrl = true;
      cfg.predefinedUrl = 'https://portal.example.com/home';

      const single = resolveTargetRefreshUrl({
        url: 'https://portal.example.com/session-expired',
        rotationIndex: 0,
        urlConfig: cfg,
      });
      expect(single.targetUrl).toBe('https://portal.example.com/home');
      expect(single.usedPredefined).toBe(true);

      cfg.rotationUrls = [
        'https://dash.example.com/kpi-1',
        'https://dash.example.com/kpi-2',
      ];
      const step0 = resolveTargetRefreshUrl({
        url: 'https://dash.example.com/start',
        rotationIndex: 0,
        urlConfig: cfg,
      });
      const step1 = resolveTargetRefreshUrl({
        url: step0.targetUrl,
        rotationIndex: step0.nextRotationIndex,
        urlConfig: cfg,
      });
      const step2 = resolveTargetRefreshUrl({
        url: step1.targetUrl,
        rotationIndex: step1.nextRotationIndex,
        urlConfig: cfg,
      });
      expect(step0.targetUrl).toBe('https://dash.example.com/kpi-1');
      expect(step1.targetUrl).toBe('https://dash.example.com/kpi-2');
      expect(step2.targetUrl).toBe('https://dash.example.com/kpi-1');
    });
  });

  describe('2.4 URL Changes & Redirection Handling', () => {
    it('evaluates follow, stop, revert, and allow-same-origin policies properly', () => {
      expect(
        evaluateUrlRedirect({
          initialUrl: 'https://app.com/items',
          previousUrl: 'https://app.com/items',
          newUrl: 'https://app.com/items?_pr_cb=12345',
          policy: 'stop',
        }).changed,
      ).toBe(false);

      expect(
        evaluateUrlRedirect({
          initialUrl: 'https://app.com/items',
          previousUrl: 'https://app.com/items',
          newUrl: 'https://app.com/login',
          policy: 'stop',
        }).action,
      ).toBe('stop');

      const rev = evaluateUrlRedirect({
        initialUrl: 'https://app.com/items',
        previousUrl: 'https://app.com/items',
        newUrl: 'https://app.com/promo',
        policy: 'revert',
      });
      expect(rev.action).toBe('revert');
      expect(rev.revertUrl).toBe('https://app.com/items');

      expect(
        evaluateUrlRedirect({
          initialUrl: 'https://app.com/a',
          previousUrl: 'https://app.com/a',
          newUrl: 'https://app.com/b',
          policy: 'allow-same-origin',
        }).action,
      ).toBe('continue');

      expect(
        evaluateUrlRedirect({
          initialUrl: 'https://app.com/a',
          previousUrl: 'https://app.com/a',
          newUrl: 'https://auth.external.com/sso',
          policy: 'allow-same-origin',
        }).action,
      ).toBe('stop');
    });
  });

  describe('2.5 Captcha Detection', () => {
    it('detects reCAPTCHA, hCaptcha, Cloudflare Turnstile, and interstitial pages, and pauses active job', async () => {
      const parser = new DOMParser();

      const recaptchaDoc = parser.parseFromString(
        `<html><body><div class="g-recaptcha" data-sitekey="abc"></div></body></html>`,
        'text/html',
      );
      expect(detectCaptchaInDocument(recaptchaDoc)).toMatchObject({
        detected: true,
        provider: 'reCAPTCHA',
      });

      const hcaptchaDoc = parser.parseFromString(
        `<html><body><iframe src="https://newassets.hcaptcha.com/captcha/v1/xyz"></iframe></body></html>`,
        'text/html',
      );
      expect(detectCaptchaInDocument(hcaptchaDoc)).toMatchObject({
        detected: true,
        provider: 'hCaptcha',
      });

      const cfDoc = parser.parseFromString(
        `<html><head><title>Just a moment...</title></head><body>Verify you are human — Cloudflare</body></html>`,
        'text/html',
      );
      expect(detectCaptchaInDocument(cfDoc)).toMatchObject({
        detected: true,
        provider: 'Cloudflare Turnstile',
      });

      const cleanDoc = parser.parseFromString(
        `<html><head><title>Product Page</title></head><body><h1>Headphones $199</h1></body></html>`,
        'text/html',
      );
      expect(detectCaptchaInDocument(cleanDoc).detected).toBe(false);

      // Verify background auto-pauses tab on captcha report
      await startTabJob(
        { tabId: 31, url: 'https://shop.com/item' },
        { enablePrecisionTimer: false },
      );
      const updated = await handlePageScanReport(
        31,
        {
          type: 'PAGE_SCAN_REPORT',
          url: 'https://shop.com/item',
          title: 'Just a moment...',
          captcha: { detected: true, provider: 'Cloudflare Turnstile' },
          source: 'after_load',
        },
        { enablePrecisionTimer: false },
      );
      expect(updated?.status).toBe('captcha_paused');
    });
  });

  describe('2.6 Error Page Detection', () => {
    it('detects HTTP error statuses, 502/429 error bodies, network errors, and applies exponential backoff', async () => {
      const parser = new DOMParser();

      expect(detectErrorPage({ httpStatus: 503 })).toMatchObject({
        detected: true,
        statusCode: 503,
      });

      const gwDoc = parser.parseFromString(
        `<html><head><title>502 Bad Gateway</title></head><body><h1>502 Bad Gateway</h1>nginx</body></html>`,
        'text/html',
      );
      expect(detectErrorPage({ doc: gwDoc })).toMatchObject({
        detected: true,
        statusCode: 502,
      });

      const netDoc = parser.parseFromString(
        `<html><body>This site can't be reached. ERR_CONNECTION_REFUSED</body></html>`,
        'text/html',
      );
      expect(detectErrorPage({ doc: netDoc }).detected).toBe(true);

      // Verify exponential backoff doubles refresh interval
      expect(resolveErrorActionDecision('backoff', 0).nextBackoffAttempt).toBe(1);

      await startTabJob(
        {
          tabId: 32,
          url: 'https://api.example.com/status',
          overrides: {
            refresh: { intervalMode: 'predefined', predefinedSeconds: 10 },
            urlConfig: { detectErrorPage: true, errorAction: 'backoff' },
          },
        },
        { enablePrecisionTimer: false },
      );

      const backedOff = await handlePageScanReport(
        32,
        {
          type: 'PAGE_SCAN_REPORT',
          url: 'https://api.example.com/status',
          title: '503',
          errorPage: { detected: true, statusCode: 503, reason: 'HTTP 503' },
          source: 'after_load',
        },
        { enablePrecisionTimer: false },
      );
      expect(backedOff?.status).toBe('running');
      expect(backedOff?.backoffAttempt).toBe(1);
      expect(backedOff?.currentIntervalMs).toBe(20_000);
    });
  });

  describe('2.7 Prevent System Sleep While Refreshing', () => {
    it('uses browser.power on Chromium and falls back to navigator.wakeLock on Firefox, releasing on stop', async () => {
      const requestKeepAwake = vi.fn();
      const releaseKeepAwake = vi.fn();

      setBrowserOverride({
        ...fakeBrowser,
        power: { requestKeepAwake, releaseKeepAwake },
      } as unknown as typeof fakeBrowser);

      await startTabJob(
        {
          tabId: 40,
          url: 'https://wallboard.example.com',
          overrides: {
            urlConfig: { preventSystemSleep: true, sleepLevel: 'display' },
          },
        },
        { enablePrecisionTimer: false },
      );
      expect(requestKeepAwake).toHaveBeenCalledWith('display');

      await stopTabJob(40);
      expect(releaseKeepAwake).toHaveBeenCalled();

      // Firefox Screen Wake Lock fallback test
      setBrowserOverride(null);
      const releaseSentinel = vi.fn().mockResolvedValue(undefined);
      const wakeRequest = vi.fn().mockResolvedValue({
        released: false,
        release: releaseSentinel,
      });
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: { request: wakeRequest },
      });

      const mgr = new SleepManager();
      const acquired = await mgr.acquire('display');
      expect(acquired).toBe(true);
      expect(mgr.getState()).toEqual({ state: 'display', mechanism: 'wake_lock' });
      await mgr.release();
      expect(releaseSentinel).toHaveBeenCalledTimes(1);
      expect(mgr.getState()).toEqual({ state: 'released', mechanism: 'none' });
    });
  });
});
