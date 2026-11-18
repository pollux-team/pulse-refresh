import { describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  executeTabRefreshTick,
  startTabJob,
} from '@/src/lib/background-controller';
import {
  createDefaultRefreshConfig,
  PREDEFINED_INTERVALS,
} from '@/src/lib/defaults';
import {
  attachUserInteractionDetector,
  enableKeepPageActive,
  hasDirtyFormFields,
  neutralizeFormResubmission,
  resolveReloadStrategy,
  setTabKeepActiveFlag,
} from '@/src/lib/page-guards';
import {
  computeCountdownDelayMs,
  computeNextIntervalMs,
  customPartsToMs,
  getBadgePresentation,
  getCountdownProgress,
  getPredefinedIntervalMs,
  hasReachedRefreshLimit,
  MAX_INTERVAL_MS,
  MIN_INTERVAL_MS,
  msToCustomParts,
  sampleRandomIntervalMs,
} from '@/src/lib/refresh-engine';

describe('Category 1 — Refresh Controls', () => {
  describe('1.1 Predefined Refresh Intervals', () => {
    it('provides all standard presets from 1s up to 1h and resolves exact ms', () => {
      expect(PREDEFINED_INTERVALS.length).toBeGreaterThanOrEqual(12);
      expect(getPredefinedIntervalMs(1)).toBe(1_000);
      expect(getPredefinedIntervalMs(5)).toBe(5_000);
      expect(getPredefinedIntervalMs(30)).toBe(30_000);
      expect(getPredefinedIntervalMs(300)).toBe(300_000);
      expect(getPredefinedIntervalMs(3600)).toBe(3_600_000);
    });

    it('computes next interval in predefined mode', () => {
      const cfg = createDefaultRefreshConfig();
      cfg.intervalMode = 'predefined';
      cfg.predefinedSeconds = 15;
      expect(computeNextIntervalMs(cfg)).toBe(15_000);
    });
  });

  describe('1.2 Custom Refresh Interval', () => {
    it('converts hours, minutes, seconds, and milliseconds accurately and round-trips', () => {
      const ms = customPartsToMs({
        hours: 1,
        minutes: 2,
        seconds: 30,
        milliseconds: 500,
      });
      expect(ms).toBe(3_750_500);
      expect(msToCustomParts(ms)).toEqual({
        hours: 1,
        minutes: 2,
        seconds: 30,
        milliseconds: 500,
      });
    });

    it('clamps sub-minimum and excessive custom intervals into safe bounds [500ms, 24h]', () => {
      expect(
        customPartsToMs({ hours: 0, minutes: 0, seconds: 0, milliseconds: 50 }),
      ).toBe(MIN_INTERVAL_MS);
      expect(
        customPartsToMs({ hours: 99, minutes: 0, seconds: 0, milliseconds: 0 }),
      ).toBe(MAX_INTERVAL_MS);
    });
  });

  describe('1.3 Random Refresh Interval', () => {
    it('samples strictly within [minSeconds, maxSeconds] across RNG draws', () => {
      expect(sampleRandomIntervalMs(10, 30, () => 0)).toBe(10_000);
      expect(sampleRandomIntervalMs(10, 30, () => 0.5)).toBe(20_000);
      expect(sampleRandomIntervalMs(10, 30, () => 1)).toBe(30_000);
    });

    it('automatically normalizes reversed bounds when minSeconds > maxSeconds', () => {
      const val = sampleRandomIntervalMs(40, 10, () => 0.5);
      expect(val).toBe(25_000);
    });
  });

  describe('1.4 Countdown Timer', () => {
    it('supports both fixed countdown duration and exact future clock timestamp', () => {
      const cfg = createDefaultRefreshConfig();
      cfg.intervalMode = 'countdown';
      cfg.countdownMode = 'duration';
      cfg.countdownDurationSeconds = 90;
      expect(computeCountdownDelayMs(cfg)).toBe(90_000);

      const now = 1_700_000_000_000;
      cfg.countdownMode = 'target_time';
      cfg.countdownTargetTimestamp = now + 42_000;
      expect(computeCountdownDelayMs(cfg, now)).toBe(42_000);
    });

    it('stops after single-shot countdown unless repeatAfterCountdown is enabled', () => {
      const cfg = createDefaultRefreshConfig();
      cfg.intervalMode = 'countdown';
      cfg.repeatAfterCountdown = false;
      expect(hasReachedRefreshLimit(cfg, 0)).toBe(false);
      expect(hasReachedRefreshLimit(cfg, 1)).toBe(true);

      cfg.repeatAfterCountdown = true;
      expect(hasReachedRefreshLimit(cfg, 1)).toBe(false);
    });

    it('computes accurate live countdown progress and toolbar badge presentation', () => {
      const now = 100_000;
      const prog = getCountdownProgress(
        {
          status: 'running',
          currentIntervalMs: 20_000,
          nextRefreshAt: now + 5_000,
          remainingMsOnPause: null,
        },
        now,
      );
      expect(prog.remainingMs).toBe(5_000);
      expect(prog.remainingRatio).toBeCloseTo(0.25);
      expect(prog.elapsedRatio).toBeCloseTo(0.75);

      const badge = getBadgePresentation(
        {
          status: 'running',
          currentIntervalMs: 20_000,
          nextRefreshAt: now + 45_000,
          remainingMsOnPause: null,
        },
        now,
      );
      expect(badge.text).toBe('45s');
      expect(
        getBadgePresentation({
          status: 'paused',
          currentIntervalMs: 20_000,
          nextRefreshAt: null,
          remainingMsOnPause: 8_000,
        }).text,
      ).toBe('II');
    });
  });

  describe('1.6 Hard Refresh', () => {
    it('executes bypassCache reload when hardRefresh is enabled without form-resubmit override', async () => {
      const strategy = resolveReloadStrategy({
        currentUrl: 'https://example.com/app',
        hardRefresh: true,
        preventFormResubmission: false,
      });
      expect(strategy).toEqual({ method: 'reload', bypassCache: true });

      const reloadSpy = vi
        .spyOn(fakeBrowser.tabs, 'reload')
        .mockResolvedValue(undefined);

      await startTabJob(
        {
          tabId: 11,
          url: 'https://example.com/app',
          title: 'App',
          overrides: {
            refresh: {
              hardRefresh: true,
              preventFormResubmission: false,
              predefinedSeconds: 10,
            },
          },
        },
        { enablePrecisionTimer: false },
      );

      await executeTabRefreshTick(11, { enablePrecisionTimer: false });
      expect(reloadSpy).toHaveBeenCalledWith(11, { bypassCache: true });
    });

    it('appends a cache-buster parameter when combining hardRefresh + preventFormResubmission', () => {
      const strategy = resolveReloadStrategy({
        currentUrl: 'https://example.com/checkout',
        hardRefresh: true,
        preventFormResubmission: true,
      });
      expect(strategy.method).toBe('clean_get');
      if (strategy.method === 'clean_get') {
        expect(strategy.url).toContain('_pr_cb=');
        expect(strategy.bypassCache).toBe(true);
      }
    });
  });

  describe('1.7 Refresh Count Limit', () => {
    it('transitions job status to completed after hitting maxRefreshes', async () => {
      vi.spyOn(fakeBrowser.tabs, 'update').mockResolvedValue({} as never);

      await startTabJob(
        {
          tabId: 12,
          url: 'https://example.com/feed',
          overrides: {
            refresh: {
              intervalMode: 'predefined',
              predefinedSeconds: 5,
              maxRefreshes: 2,
            },
          },
        },
        { enablePrecisionTimer: false },
      );

      const afterFirst = await executeTabRefreshTick(12, {
        enablePrecisionTimer: false,
      });
      expect(afterFirst?.refreshCount).toBe(1);
      expect(afterFirst?.status).toBe('running');

      const afterSecond = await executeTabRefreshTick(12, {
        enablePrecisionTimer: false,
      });
      expect(afterSecond?.refreshCount).toBe(2);
      expect(afterSecond?.status).toBe('completed');
      expect(afterSecond?.nextRefreshAt).toBeNull();
    });
  });

  describe('1.8 Prevent Form Resubmission', () => {
    it('calls history.replaceState and performs clean GET navigation', () => {
      const replaceSpy = vi.spyOn(window.history, 'replaceState');
      const res = neutralizeFormResubmission(window, document);
      expect(res.safeToReload).toBe(true);
      expect(replaceSpy).toHaveBeenCalled();

      const strategy = resolveReloadStrategy({
        currentUrl: 'https://example.com/form-result',
        hardRefresh: false,
        preventFormResubmission: true,
      });
      expect(strategy).toEqual({
        method: 'clean_get',
        url: 'https://example.com/form-result',
        bypassCache: false,
      });
    });

    it('detects dirty user-modified form fields and blocks reload when protectDirtyForms is true', () => {
      document.body.innerHTML = `<form><input name="email" value="" /></form>`;
      const input = document.querySelector('input')!;
      expect(hasDirtyFormFields(document)).toBe(false);

      input.value = 'alice@example.com';
      expect(hasDirtyFormFields(document)).toBe(true);

      const res = neutralizeFormResubmission(window, document, {
        protectDirtyForms: true,
      });
      expect(res.safeToReload).toBe(false);
      expect(res.reason).toBe('dirty_form_protected');
    });
  });

  describe('1.9 Keep Page Active in Background', () => {
    it('overrides document.hidden, visibilityState, hasFocus, and blocks visibilitychange throttling', () => {
      const cleanup = enableKeepPageActive(document, window);

      expect(document.hidden).toBe(false);
      expect(document.visibilityState).toBe('visible');
      expect(document.hasFocus()).toBe(true);

      const pageThrottleListener = vi.fn();
      document.addEventListener('visibilitychange', pageThrottleListener);
      document.dispatchEvent(new Event('visibilitychange'));
      expect(pageThrottleListener).not.toHaveBeenCalled();

      cleanup();
      document.dispatchEvent(new Event('visibilitychange'));
      expect(pageThrottleListener).toHaveBeenCalledTimes(1);
    });

    it('updates tab autoDiscardable flag cleanly', async () => {
      const updateSpy = vi
        .spyOn(fakeBrowser.tabs, 'update')
        .mockResolvedValue({} as never);
      const ok = await setTabKeepActiveFlag(7, true);
      expect(ok).toBe(true);
      expect(updateSpy).toHaveBeenCalledWith(7, { autoDiscardable: false });
    });
  });

  describe('1.10 Stop on User Interaction', () => {
    it('fires on genuine page interactions while ignoring PulseRefresh UI elements and Alt+Shift hotkeys', () => {
      document.body.innerHTML = `
        <div data-pulserefresh-ui="timer"><button id="ext-btn">Pause</button></div>
        <button id="page-btn">Buy Item</button>
      `;

      const onInteract = vi.fn();
      attachUserInteractionDetector(onInteract, { target: document });

      // Clicking extension overlay must NOT trigger stop
      document
        .getElementById('ext-btn')!
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      expect(onInteract).not.toHaveBeenCalled();

      // Pressing Alt+Shift+R hotkey must NOT trigger stop
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'R',
          altKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
      expect(onInteract).not.toHaveBeenCalled();

      // Genuine user interaction on page button triggers once and detaches
      document
        .getElementById('page-btn')!
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      document
        .getElementById('page-btn')!
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      expect(onInteract).toHaveBeenCalledTimes(1);
      expect(onInteract).toHaveBeenCalledWith('mousedown');
    });
  });
});
