import { getBrowser } from './browser-api';
import type { SleepLevel, TabJob } from './types';

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
}

/**
 * Feature: Prevent System Sleep While Refreshing
 * Cross-browser manager:
 *  - Chromium (MV3): uses browser.power.requestKeepAwake('display' | 'system')
 *  - Firefox / Web: falls back to navigator.wakeLock.request('screen')
 * Automatically releases wake lock when all active sleep-preventing jobs pause or stop.
 */
export class SleepManager {
  private currentState: 'released' | SleepLevel = 'released';
  private activeMechanism: 'none' | 'power_api' | 'wake_lock' = 'none';
  private wakeSentinel: WakeLockSentinelLike | null = null;

  getState(): { state: 'released' | SleepLevel; mechanism: 'none' | 'power_api' | 'wake_lock' } {
    return {
      state: this.currentState,
      mechanism: this.activeMechanism,
    };
  }

  /**
   * Reconcile desired keep-awake level across all active jobs.
   * 'display' takes precedence over 'system' because display also prevents system sleep.
   */
  async syncWithJobs(jobs: TabJob[]): Promise<{
    state: 'released' | SleepLevel;
    mechanism: 'none' | 'power_api' | 'wake_lock';
  }> {
    const activeSleepJobs = jobs.filter(
      (j) => j.status === 'running' && j.urlConfig.preventSystemSleep,
    );

    if (activeSleepJobs.length === 0) {
      await this.release();
      return this.getState();
    }

    const desiredLevel: SleepLevel = activeSleepJobs.some(
      (j) => j.urlConfig.sleepLevel === 'display',
    )
      ? 'display'
      : 'system';

    await this.acquire(desiredLevel);
    return this.getState();
  }

  async acquire(level: SleepLevel): Promise<boolean> {
    if (this.currentState === level && this.activeMechanism !== 'none') {
      return true;
    }

    const b = getBrowser() as unknown as {
      power?: {
        requestKeepAwake: (level: SleepLevel) => void | Promise<void>;
        releaseKeepAwake: () => void | Promise<void>;
      };
    };

    // Prefer WebExtension power API (Chrome, Edge, Brave, Opera)
    if (b?.power && typeof b.power.requestKeepAwake === 'function') {
      try {
        await b.power.requestKeepAwake(level);
        this.currentState = level;
        this.activeMechanism = 'power_api';
        return true;
      } catch {
        // Fall through to Screen Wake Lock API
      }
    }

    // Fallback: Standard Screen Wake Lock API (Firefox 126+, content/extension docs)
    const nav =
      typeof navigator !== 'undefined'
        ? (navigator as unknown as {
            wakeLock?: {
              request: (type: 'screen') => Promise<WakeLockSentinelLike>;
            };
          })
        : null;

    if (nav?.wakeLock && typeof nav.wakeLock.request === 'function') {
      try {
        if (this.wakeSentinel && !this.wakeSentinel.released) {
          await this.wakeSentinel.release();
        }
        this.wakeSentinel = await nav.wakeLock.request('screen');
        this.currentState = level;
        this.activeMechanism = 'wake_lock';
        return true;
      } catch {
        // Wake lock unavailable in headless/background context
      }
    }

    return false;
  }

  async release(): Promise<void> {
    if (this.activeMechanism === 'power_api') {
      const b = getBrowser() as unknown as {
        power?: { releaseKeepAwake: () => void | Promise<void> };
      };
      try {
        await b.power?.releaseKeepAwake();
      } catch {
        // Ignore release errors
      }
    }

    if (this.wakeSentinel && !this.wakeSentinel.released) {
      try {
        await this.wakeSentinel.release();
      } catch {
        // Ignore release errors
      }
    }

    this.wakeSentinel = null;
    this.currentState = 'released';
    this.activeMechanism = 'none';
  }
}

export const globalSleepManager = new SleepManager();
