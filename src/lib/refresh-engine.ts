import { PREDEFINED_INTERVALS } from './defaults';
import type {
  CustomIntervalParts,
  JobStatus,
  RefreshControlsConfig,
  TabJob,
} from './types';
import { formatBadgeTime } from './utils';

export const MIN_INTERVAL_MS = 500;
export const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function clampIntervalMs(ms: number): number {
  if (!Number.isFinite(ms) || Number.isNaN(ms)) return 10_000;
  return Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, Math.round(ms)));
}

/**
 * Validate and look up predefined refresh interval presets.
 */
export function getPredefinedIntervalMs(seconds: number): number {
  const exact = PREDEFINED_INTERVALS.find((p) => p.seconds === seconds);
  if (exact) return exact.seconds * 1000;
  return clampIntervalMs(seconds * 1000);
}

/**
 * Convert hours / minutes / seconds / milliseconds parts into clamped milliseconds.
 */
export function customPartsToMs(parts: CustomIntervalParts): number {
  const h = Math.max(0, Number(parts.hours) || 0);
  const m = Math.max(0, Number(parts.minutes) || 0);
  const s = Math.max(0, Number(parts.seconds) || 0);
  const ms = Math.max(0, Number(parts.milliseconds) || 0);
  const total = h * 3_600_000 + m * 60_000 + s * 1_000 + ms;
  return clampIntervalMs(total);
}

/**
 * Decompose milliseconds back into CustomIntervalParts.
 */
export function msToCustomParts(totalMs: number): CustomIntervalParts {
  const safe = Math.max(0, Math.round(totalMs));
  const hours = Math.floor(safe / 3_600_000);
  const rem1 = safe % 3_600_000;
  const minutes = Math.floor(rem1 / 60_000);
  const rem2 = rem1 % 60_000;
  const seconds = Math.floor(rem2 / 1_000);
  const milliseconds = rem2 % 1_000;
  return { hours, minutes, seconds, milliseconds };
}

/**
 * Sample a uniformly distributed random interval between [minSeconds, maxSeconds].
 * Automatically swaps bounds if minSeconds > maxSeconds.
 */
export function sampleRandomIntervalMs(
  minSeconds: number,
  maxSeconds: number,
  rng: () => number = Math.random,
): number {
  const rawMin = Math.max(0.5, Number(minSeconds) || 1);
  const rawMax = Math.max(0.5, Number(maxSeconds) || rawMin);
  const lo = Math.min(rawMin, rawMax) * 1000;
  const hi = Math.max(rawMin, rawMax) * 1000;
  if (lo === hi) return clampIntervalMs(lo);
  const r = Math.max(0, Math.min(1, rng()));
  return clampIntervalMs(lo + r * (hi - lo));
}

/**
 * Compute countdown delay in ms for either a duration or a target clock timestamp.
 */
export function computeCountdownDelayMs(
  config: RefreshControlsConfig,
  now = Date.now(),
): number {
  if (config.countdownMode === 'target_time' && config.countdownTargetTimestamp) {
    const diff = config.countdownTargetTimestamp - now;
    return clampIntervalMs(Math.max(MIN_INTERVAL_MS, diff));
  }
  return clampIntervalMs((Number(config.countdownDurationSeconds) || 60) * 1000);
}

/**
 * Compute the next refresh interval (ms) for a given RefreshControlsConfig.
 */
export function computeNextIntervalMs(
  config: RefreshControlsConfig,
  options: { now?: number; rng?: () => number; backoffAttempt?: number } = {},
): number {
  const { now = Date.now(), rng = Math.random, backoffAttempt = 0 } = options;
  let baseMs: number;

  switch (config.intervalMode) {
    case 'predefined':
      baseMs = getPredefinedIntervalMs(config.predefinedSeconds);
      break;
    case 'custom':
      baseMs = customPartsToMs(config.customInterval);
      break;
    case 'random':
      baseMs = sampleRandomIntervalMs(
        config.randomMinSeconds,
        config.randomMaxSeconds,
        rng,
      );
      break;
    case 'countdown':
      baseMs = computeCountdownDelayMs(config, now);
      break;
    default:
      baseMs = 10_000;
  }

  if (backoffAttempt > 0) {
    const multiplier = Math.pow(2, Math.min(backoffAttempt, 6));
    baseMs = clampIntervalMs(baseMs * multiplier);
  }

  return baseMs;
}

/**
 * Check whether the job has reached its configured refresh count limit or
 * completed a single-shot countdown timer.
 */
export function hasReachedRefreshLimit(
  config: RefreshControlsConfig,
  completedRefreshCount: number,
): boolean {
  if (
    config.intervalMode === 'countdown' &&
    !config.repeatAfterCountdown &&
    completedRefreshCount >= 1
  ) {
    return true;
  }
  if (config.maxRefreshes > 0 && completedRefreshCount >= config.maxRefreshes) {
    return true;
  }
  return false;
}

/**
 * Compute countdown progress (0.0 to 1.0) and remaining ms for visual timers.
 */
export function getCountdownProgress(
  job: Pick<
    TabJob,
    'status' | 'currentIntervalMs' | 'nextRefreshAt' | 'remainingMsOnPause'
  >,
  now = Date.now(),
): { remainingMs: number; elapsedRatio: number; remainingRatio: number } {
  const total = Math.max(MIN_INTERVAL_MS, job.currentIntervalMs || 1000);

  if (job.status === 'paused' && job.remainingMsOnPause != null) {
    const rem = Math.max(0, Math.min(total, job.remainingMsOnPause));
    const remRatio = rem / total;
    return {
      remainingMs: rem,
      remainingRatio: remRatio,
      elapsedRatio: 1 - remRatio,
    };
  }

  if (job.status !== 'running' || !job.nextRefreshAt) {
    return { remainingMs: 0, elapsedRatio: 0, remainingRatio: 0 };
  }

  const remainingMs = Math.max(0, job.nextRefreshAt - now);
  const remainingRatio = Math.max(0, Math.min(1, remainingMs / total));
  return {
    remainingMs,
    remainingRatio,
    elapsedRatio: 1 - remainingRatio,
  };
}

/**
 * Compute toolbar badge label & background color for a tab job.
 */
export function getBadgePresentation(
  job: Pick<
    TabJob,
    'status' | 'nextRefreshAt' | 'remainingMsOnPause' | 'currentIntervalMs'
  > | null,
  now = Date.now(),
): { text: string; color: string } {
  if (!job || job.status === 'idle' || job.status === 'stopped') {
    return { text: '', color: '#64748b' };
  }
  const statusMap: Partial<Record<JobStatus, { text: string; color: string }>> = {
    paused: { text: 'II', color: '#f59e0b' },
    completed: { text: 'DONE', color: '#0ea5e9' },
    detected: { text: 'HIT!', color: '#10b981' },
    captcha_paused: { text: 'CAP', color: '#ef4444' },
    error_paused: { text: 'ERR', color: '#ef4444' },
    redirect_stopped: { text: 'URL', color: '#f97316' },
  };
  if (statusMap[job.status]) {
    return statusMap[job.status]!;
  }
  const rem = job.nextRefreshAt ? Math.max(0, job.nextRefreshAt - now) : 0;
  return {
    text: formatBadgeTime(rem),
    color: '#059669',
  };
}
