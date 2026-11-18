import {
  dispatchAllAlerts,
  dispatchWebhook,
  focusTabAndWindow,
  parseNotificationTarget,
  sendEmailAlert,
  sendPushNotification,
} from './alerts';
import { executeCookieAutomationRules } from './automation';
import { getBrowser } from './browser-api';
import { createDefaultTabJob } from './defaults';
import { shouldFireDetectionAlert } from './monitor-engine';
import { resolveReloadStrategy, setTabKeepActiveFlag } from './page-guards';
import {
  computeNextIntervalMs,
  getBadgePresentation,
  hasReachedRefreshLimit,
} from './refresh-engine';
import { globalSleepManager } from './sleep-manager';
import {
  appendActivityLog,
  deleteTabJob,
  getAllTabJobs,
  getGlobalState,
  getTabJob,
  saveTabJob,
  updateGlobalState,
} from './storage';
import {
  applyProfileToJob,
  findProfileForUrl,
  pullSettingsFromSync,
  pushSettingsToSync,
  registerOrUpdateDevice,
} from './sync-manager';
import type {
  AlertEventPayload,
  ExtensionMessage,
  HotkeyCommandId,
  TabJob,
} from './types';
import {
  evaluateUrlRedirect,
  findMatchingAutoStartRule,
  getAllowedRedirectUrls,
  resolveErrorActionDecision,
  resolveTargetRefreshUrl,
} from './url-automation';
import { formatDuration } from './utils';

export const ALARM_PREFIX = 'pulserefresh_tab_';
export const BADGE_TICK_ALARM = 'pulserefresh_badge_tick';

// For sub-30s intervals in MV3/Firefox, maintain precise in-memory timers backed by browser.alarms
const precisionTimers = new Map<number, ReturnType<typeof setTimeout>>();
let badgeInterval: ReturnType<typeof setInterval> | null = null;

function alarmNameForTab(tabId: number): string {
  return `${ALARM_PREFIX}${tabId}`;
}

export function clearTabSchedule(tabId: number): void {
  const existing = precisionTimers.get(tabId);
  if (existing) {
    clearTimeout(existing);
    precisionTimers.delete(tabId);
  }
  try {
    void getBrowser().alarms?.clear?.(alarmNameForTab(tabId));
  } catch {
    // Ignore alarm clear errors
  }
}

export function clearAllInMemorySchedules(): void {
  for (const timer of precisionTimers.values()) {
    clearTimeout(timer);
  }
  precisionTimers.clear();
  if (badgeInterval) {
    clearInterval(badgeInterval);
    badgeInterval = null;
  }
}

async function scheduleTabExecution(
  tabId: number,
  delayMs: number,
  enablePrecisionTimer = true,
): Promise<void> {
  clearTabSchedule(tabId);
  const when = Date.now() + delayMs;

  // Always schedule durable browser.alarms entry (survives MV3 service worker suspension)
  try {
    await getBrowser().alarms?.create?.(alarmNameForTab(tabId), { when });
  } catch {
    // Fallback if alarms unavailable
  }

  // For sub-minute intervals, pair with exact setTimeout so 1s / 5s / 10s intervals fire right on time
  if (enablePrecisionTimer && delayMs < 60_000) {
    const t = setTimeout(() => {
      precisionTimers.delete(tabId);
      void executeTabRefreshTick(tabId);
    }, delayMs);
    precisionTimers.set(tabId, t);
  }
}

export async function updateTabBadge(job: TabJob | null, tabId?: number): Promise<void> {
  const b = getBrowser() as unknown as {
    action?: {
      setBadgeText: (d: { text: string; tabId?: number }) => Promise<void>;
      setBadgeBackgroundColor: (d: { color: string; tabId?: number }) => Promise<void>;
    };
    browserAction?: {
      setBadgeText: (d: { text: string; tabId?: number }) => Promise<void>;
      setBadgeBackgroundColor: (d: { color: string; tabId?: number }) => Promise<void>;
    };
  };
  const actionApi = b.action ?? b.browserAction;
  if (!actionApi) return;

  const id = job?.tabId ?? tabId;
  const { text, color } = getBadgePresentation(job);
  try {
    await actionApi.setBadgeText({ text, ...(id ? { tabId: id } : {}) });
    if (text) {
      await actionApi.setBadgeBackgroundColor({
        color,
        ...(id ? { tabId: id } : {}),
      });
    }
  } catch {
    // Tab may have closed
  }
}

async function notifyContentScriptOfJob(
  tabId: number,
  job: TabJob | null,
): Promise<void> {
  try {
    await getBrowser().tabs.sendMessage(tabId, {
      type: 'SYNC_JOB_TO_CONTENT',
      job,
    } satisfies ExtensionMessage);
  } catch {
    // Content script not attached on restricted page or still loading
  }
}

async function reconcileSleepLock(): Promise<void> {
  const allJobs = await getAllTabJobs();
  await globalSleepManager.syncWithJobs(Object.values(allJobs));
}

/**
 * Start (or restart) an auto-refresh / monitoring job on a tab.
 */
export async function startTabJob(
  params: {
    tabId: number;
    windowId?: number;
    url?: string;
    title?: string;
    overrides?: Extract<ExtensionMessage, { type: 'START_JOB' }>['overrides'];
  },
  options: { enablePrecisionTimer?: boolean } = {},
): Promise<TabJob> {
  const b = getBrowser();
  const globalState = await getGlobalState();
  const existing = await getTabJob(params.tabId);

  let tabUrl = params.url || existing?.url || '';
  let tabTitle = params.title || existing?.title || '';
  let winId = params.windowId ?? existing?.windowId ?? 1;

  if (!tabUrl) {
    try {
      const tab = await b.tabs.get(params.tabId);
      tabUrl = tab.url || '';
      tabTitle = tab.title || tabUrl;
      winId = tab.windowId ?? winId;
    } catch {
      tabUrl = 'https://example.com';
    }
  }

  let base =
    existing ??
    createDefaultTabJob({
      tabId: params.tabId,
      windowId: winId,
      url: tabUrl,
      title: tabTitle,
    });

  // Apply chosen profile (or auto-matched URL profile for brand new jobs)
  const requestedProfileId = params.overrides?.profileId;
  if (requestedProfileId) {
    const prof = globalState.profiles.find((p) => p.id === requestedProfileId);
    if (prof) {
      base = applyProfileToJob(base, prof, globalState.autoClickTargets);
    }
  } else if (!existing && globalState.profiles.length > 0) {
    const matchedProf = findProfileForUrl(tabUrl, globalState.profiles);
    if (matchedProf) {
      base = applyProfileToJob(base, matchedProf, globalState.autoClickTargets);
    }
  }

  const mergedRefresh = {
    ...base.refresh,
    ...(params.overrides?.refresh ?? {}),
    visualTimer: {
      ...base.refresh.visualTimer,
      ...(params.overrides?.refresh?.visualTimer ?? {}),
    },
    customInterval: {
      ...base.refresh.customInterval,
      ...(params.overrides?.refresh?.customInterval ?? {}),
    },
  };

  const mergedUrl = {
    ...base.urlConfig,
    ...(params.overrides?.urlConfig ?? {}),
  };

  const mergedMonitor = {
    ...base.monitor,
    ...(params.overrides?.monitor ?? {}),
    numericThreshold: {
      ...base.monitor.numericThreshold,
      ...(params.overrides?.monitor?.numericThreshold ?? {}),
    },
  };

  const now = Date.now();
  const intervalMs = computeNextIntervalMs(mergedRefresh, { now });

  const job: TabJob = {
    ...base,
    tabId: params.tabId,
    windowId: winId,
    url: tabUrl,
    initialUrl: tabUrl,
    title: tabTitle || tabUrl,
    status: 'running',
    refresh: mergedRefresh,
    urlConfig: mergedUrl,
    monitor: mergedMonitor,
    autoClickTargets: globalState.autoClickTargets.filter((t) => t.enabled),
    macroId:
      params.overrides?.macroId !== undefined
        ? params.overrides.macroId
        : base.macroId,
    refreshCount: 0,
    detectionCount: 0,
    autoClickCount: 0,
    rotationIndex: 0,
    backoffAttempt: 0,
    currentIntervalMs: intervalMs,
    nextRefreshAt: now + intervalMs,
    remainingMsOnPause: null,
    startedAt: now,
    lastError: null,
  };

  await saveTabJob(job);
  await setTabKeepActiveFlag(job.tabId, job.refresh.keepPageActive);
  await scheduleTabExecution(
    job.tabId,
    intervalMs,
    options.enablePrecisionTimer !== false,
  );
  await reconcileSleepLock();
  await updateTabBadge(job);
  await notifyContentScriptOfJob(job.tabId, job);

  await appendActivityLog({
    level: 'info',
    category: 'refresh',
    tabId: job.tabId,
    url: job.url,
    message: `Started ${job.monitor.refreshType.toUpperCase()} refresh every ${formatDuration(intervalMs)} (${job.refresh.intervalMode})`,
  });

  return job;
}

export async function pauseTabJob(
  tabId: number,
  reason = 'Paused by user',
): Promise<TabJob | null> {
  const job = await getTabJob(tabId);
  if (!job || job.status !== 'running') return job;

  clearTabSchedule(tabId);
  const remaining = job.nextRefreshAt
    ? Math.max(500, job.nextRefreshAt - Date.now())
    : job.currentIntervalMs;

  const updated: TabJob = {
    ...job,
    status: 'paused',
    nextRefreshAt: null,
    remainingMsOnPause: remaining,
  };

  await saveTabJob(updated);
  await reconcileSleepLock();
  await updateTabBadge(updated);
  await notifyContentScriptOfJob(tabId, updated);
  await appendActivityLog({
    level: 'info',
    category: 'refresh',
    tabId,
    url: job.url,
    message: reason,
  });
  return updated;
}

export async function resumeTabJob(
  tabId: number,
  options: { enablePrecisionTimer?: boolean } = {},
): Promise<TabJob | null> {
  const job = await getTabJob(tabId);
  if (!job) return null;

  const delayMs =
    job.remainingMsOnPause ?? computeNextIntervalMs(job.refresh);
  const updated: TabJob = {
    ...job,
    status: 'running',
    backoffAttempt: 0,
    nextRefreshAt: Date.now() + delayMs,
    remainingMsOnPause: null,
    lastError: null,
  };

  await saveTabJob(updated);
  await scheduleTabExecution(
    tabId,
    delayMs,
    options.enablePrecisionTimer !== false,
  );
  await reconcileSleepLock();
  await updateTabBadge(updated);
  await notifyContentScriptOfJob(tabId, updated);
  await appendActivityLog({
    level: 'info',
    category: 'refresh',
    tabId,
    url: job.url,
    message: `Resumed refresh (next in ${formatDuration(delayMs)})`,
  });
  return updated;
}

export async function stopTabJob(
  tabId: number,
  reason = 'Stopped by user',
): Promise<TabJob | null> {
  const job = await getTabJob(tabId);
  clearTabSchedule(tabId);
  if (!job) return null;

  const updated: TabJob = {
    ...job,
    status: 'stopped',
    nextRefreshAt: null,
    remainingMsOnPause: null,
  };

  await saveTabJob(updated);
  await setTabKeepActiveFlag(tabId, false);
  await reconcileSleepLock();
  await updateTabBadge(null, tabId);
  await notifyContentScriptOfJob(tabId, null);
  await appendActivityLog({
    level: 'info',
    category: 'refresh',
    tabId,
    url: job.url,
    message: reason,
  });
  return updated;
}

export async function stopAllTabJobs(): Promise<number> {
  const jobs = await getAllTabJobs();
  let stopped = 0;
  for (const job of Object.values(jobs)) {
    if (job.status === 'running' || job.status === 'paused') {
      await stopTabJob(job.tabId, 'Stopped via Stop All');
      stopped++;
    }
  }
  await reconcileSleepLock();
  return stopped;
}

/**
 * Execute one scheduled refresh tick for a tab.
 */
export async function executeTabRefreshTick(
  tabId: number,
  options: { enablePrecisionTimer?: boolean } = {},
): Promise<TabJob | null> {
  const b = getBrowser();
  const job = await getTabJob(tabId);
  if (!job || job.status !== 'running') return job;

  clearTabSchedule(tabId);
  const globalState = await getGlobalState();

  // Determine destination URL (current tab URL vs Predefined URL vs URL Rotation list)
  const { targetUrl, nextRotationIndex, usedPredefined } =
    resolveTargetRefreshUrl(job);

  // Execute before_refresh Cookie Automation rules
  if (globalState.cookieRules.length > 0) {
    await executeCookieAutomationRules({
      url: targetUrl,
      timing: 'before_refresh',
      rules: globalState.cookieRules,
    });
  }

  // Perform refresh (XHR background swap vs Full Page reload)
  if (job.monitor.refreshType === 'xhr' && !usedPredefined) {
    try {
      await b.tabs.sendMessage(tabId, {
        type: 'EXECUTE_XHR_REFRESH',
        job,
      } satisfies ExtensionMessage);
    } catch {
      if (job.monitor.xhrFallbackToFull) {
        await performFullBrowserReload(tabId, job.url, targetUrl, job);
      }
    }
  } else {
    await performFullBrowserReload(tabId, job.url, targetUrl, job);
  }

  const newCount = job.refreshCount + 1;
  const now = Date.now();
  const limitHit = hasReachedRefreshLimit(job.refresh, newCount);

  if (limitHit) {
    const completedJob: TabJob = {
      ...job,
      url: targetUrl,
      rotationIndex: nextRotationIndex,
      refreshCount: newCount,
      lastRefreshAt: now,
      status: 'completed',
      nextRefreshAt: null,
    };
    await saveTabJob(completedJob);
    await reconcileSleepLock();
    await updateTabBadge(completedJob);
    await notifyContentScriptOfJob(tabId, completedJob);
    await appendActivityLog({
      level: 'success',
      category: 'refresh',
      tabId,
      url: targetUrl,
      message: `Completed refresh limit (${newCount} refreshes)`,
    });
    return completedJob;
  }

  const nextIntervalMs = computeNextIntervalMs(job.refresh, {
    now,
    backoffAttempt: job.backoffAttempt,
  });

  const updatedJob: TabJob = {
    ...job,
    url: targetUrl,
    rotationIndex: nextRotationIndex,
    refreshCount: newCount,
    lastRefreshAt: now,
    currentIntervalMs: nextIntervalMs,
    nextRefreshAt: now + nextIntervalMs,
  };

  await saveTabJob(updatedJob);
  await scheduleTabExecution(
    tabId,
    nextIntervalMs,
    options.enablePrecisionTimer !== false,
  );
  await updateTabBadge(updatedJob);
  await notifyContentScriptOfJob(tabId, updatedJob);

  return updatedJob;
}

async function performFullBrowserReload(
  tabId: number,
  currentUrl: string,
  targetUrl: string,
  job: TabJob,
): Promise<void> {
  const b = getBrowser();
  const strategy = resolveReloadStrategy({
    currentUrl,
    targetUrl,
    hardRefresh: job.refresh.hardRefresh,
    preventFormResubmission: job.refresh.preventFormResubmission,
  });

  if (strategy.method === 'reload') {
    await b.tabs.reload(tabId, { bypassCache: strategy.bypassCache });
  } else if (job.refresh.hardRefresh && targetUrl === currentUrl && !job.refresh.preventFormResubmission) {
    await b.tabs.reload(tabId, { bypassCache: true });
  } else {
    await b.tabs.update(tabId, { url: strategy.url });
  }
}

/**
 * Handle tab URL changes & Auto Start URLs on browser.tabs.onUpdated.
 */
export async function handleTabUpdated(
  tabId: number,
  changeInfo: { status?: string; url?: string },
  tab: { id?: number; windowId?: number; url?: string; title?: string },
  options: { enablePrecisionTimer?: boolean } = {},
): Promise<void> {
  const newUrl = changeInfo.url || tab.url;
  if (!newUrl) return;

  const job = await getTabJob(tabId);
  const globalState = await getGlobalState();

  // Case A: Active running job — apply URL Change & Redirection Handling policy
  if (job && job.status === 'running') {
    const decision = evaluateUrlRedirect({
      initialUrl: job.initialUrl,
      previousUrl: job.url,
      newUrl,
      policy: job.urlConfig.redirectPolicy,
      allowedUrls: getAllowedRedirectUrls(job.urlConfig),
    });

    if (decision.changed) {
      if (decision.action === 'stop') {
        clearTabSchedule(tabId);
        const stoppedJob: TabJob = {
          ...job,
          url: newUrl,
          title: tab.title || job.title,
          status: 'redirect_stopped',
          nextRefreshAt: null,
          lastError: decision.reason ?? 'Redirect detected',
        };
        await saveTabJob(stoppedJob);
        await reconcileSleepLock();
        await updateTabBadge(stoppedJob);
        await appendActivityLog({
          level: 'warning',
          category: 'url',
          tabId,
          url: newUrl,
          message: decision.reason || 'Stopped due to URL redirection',
        });
        await triggerAlertPipeline({
          tabId,
          windowId: job.windowId,
          url: newUrl,
          title: tab.title || job.title,
          reason: 'redirect',
          keyword: 'URL Redirected',
          snippet: decision.reason || newUrl,
          timestamp: Date.now(),
        });
        return;
      }

      if (decision.action === 'revert' && decision.revertUrl) {
        await getBrowser().tabs.update(tabId, { url: decision.revertUrl });
        await appendActivityLog({
          level: 'info',
          category: 'url',
          tabId,
          url: decision.revertUrl,
          message: `Reverted redirect from ${newUrl} back to ${decision.revertUrl}`,
        });
        return;
      }

      // Policy 'follow' or allowed same-origin
      await saveTabJob({
        ...job,
        url: newUrl,
        title: tab.title || job.title,
      });
    }

    if (changeInfo.status === 'complete' && globalState.cookieRules.length > 0) {
      await executeCookieAutomationRules({
        url: newUrl,
        timing: 'after_load',
        rules: globalState.cookieRules,
      });
    }
    return;
  }

  // Case B: No running job — check Auto Start URLs when page finishes loading
  if (changeInfo.status === 'complete' && (!job || job.status === 'idle')) {
    const matchedRule = findMatchingAutoStartRule(
      newUrl,
      globalState.autoStartRules,
    );
    if (matchedRule) {
      await startTabJob(
        {
          tabId,
          windowId: tab.windowId ?? 1,
          url: newUrl,
          title: tab.title || newUrl,
          overrides: {
            profileId: matchedRule.profileId,
            refresh: {
              intervalMode: 'predefined',
              predefinedSeconds: matchedRule.intervalSeconds,
            },
          },
        },
        options,
      );
      await appendActivityLog({
        level: 'success',
        category: 'url',
        tabId,
        url: newUrl,
        message: `Auto-started via rule "${matchedRule.name}" (${matchedRule.intervalSeconds}s)`,
      });
    }
  }
}

async function triggerAlertPipeline(
  payload: AlertEventPayload,
  fetcher?: typeof fetch,
): Promise<void> {
  const state = await getGlobalState();
  const result = await dispatchAllAlerts({
    alerts: state.alerts,
    emailQuota: state.emailQuota,
    payload,
    fetcher,
  });

  if (result.updatedEmailQuota.sentCount !== state.emailQuota.sentCount ||
      result.updatedEmailQuota.dateKey !== state.emailQuota.dateKey) {
    await updateGlobalState((prev) => ({
      ...prev,
      emailQuota: result.updatedEmailQuota,
    }));
  }
}

/**
 * Process a PAGE_SCAN_REPORT sent from the content script (after_load, realtime, xhr, or manual).
 */
export async function handlePageScanReport(
  tabId: number,
  report: Extract<ExtensionMessage, { type: 'PAGE_SCAN_REPORT' }>,
  options: { enablePrecisionTimer?: boolean; fetcher?: typeof fetch } = {},
): Promise<TabJob | null> {
  const job = await getTabJob(tabId);
  if (!job) return null;

  const now = Date.now();

  // 1. Captcha Detection
  if (job.urlConfig.detectCaptcha && report.captcha?.detected) {
    clearTabSchedule(tabId);
    const paused: TabJob = {
      ...job,
      status: 'captcha_paused',
      nextRefreshAt: null,
      lastError: `CAPTCHA detected (${report.captcha.provider || 'Challenge'})`,
    };
    await saveTabJob(paused);
    await reconcileSleepLock();
    await updateTabBadge(paused);
    await notifyContentScriptOfJob(tabId, paused);
    await appendActivityLog({
      level: 'warning',
      category: 'url',
      tabId,
      url: report.url,
      message: `Auto-paused: ${report.captcha.provider || 'CAPTCHA'} detected`,
    });
    await triggerAlertPipeline(
      {
        tabId,
        windowId: job.windowId,
        url: report.url,
        title: report.title,
        reason: 'captcha',
        keyword: report.captcha.provider || 'CAPTCHA',
        snippet: 'Verification required — auto-refresh paused to protect your session.',
        timestamp: now,
      },
      options.fetcher,
    );
    return paused;
  }

  // 2. Error Page Detection
  if (job.urlConfig.detectErrorPage && report.errorPage?.detected) {
    const decision = resolveErrorActionDecision(
      job.urlConfig.errorAction,
      job.backoffAttempt,
    );

    if (!decision.shouldReschedule) {
      clearTabSchedule(tabId);
    }

    const nextInterval = decision.shouldReschedule
      ? computeNextIntervalMs(job.refresh, {
          now,
          backoffAttempt: decision.nextBackoffAttempt,
        })
      : job.currentIntervalMs;

    const updated: TabJob = {
      ...job,
      status: decision.nextStatus,
      backoffAttempt: decision.nextBackoffAttempt,
      currentIntervalMs: nextInterval,
      nextRefreshAt: decision.shouldReschedule ? now + nextInterval : null,
      lastError: report.errorPage.reason || 'Error page detected',
    };
    await saveTabJob(updated);

    if (decision.shouldReschedule) {
      await scheduleTabExecution(
        tabId,
        nextInterval,
        options.enablePrecisionTimer !== false,
      );
    }
    await reconcileSleepLock();
    await updateTabBadge(updated);
    await notifyContentScriptOfJob(tabId, updated);
    await appendActivityLog({
      level: 'error',
      category: 'url',
      tabId,
      url: report.url,
      message: `Error page detected (${report.errorPage.reason}) — action: ${job.urlConfig.errorAction}`,
    });

    if (decision.shouldAlert) {
      await triggerAlertPipeline(
        {
          tabId,
          windowId: job.windowId,
          url: report.url,
          title: report.title,
          reason: 'error_page',
          keyword: report.errorPage.reason || 'HTTP Error',
          snippet: `Action applied: ${job.urlConfig.errorAction}`,
          timestamp: now,
        },
        options.fetcher,
      );
    }
    return updated;
  }

  // 3. Page Monitor Result
  const m = report.monitorResult;
  if (!m) {
    if (job.backoffAttempt > 0) {
      const recovered = { ...job, backoffAttempt: 0, lastError: null };
      await saveTabJob(recovered);
      return recovered;
    }
    return job;
  }

  if (!m.triggered) {
    const quietJob: TabJob = {
      ...job,
      backoffAttempt: 0,
      lastSnapshot: m.snapshot,
      lastSnapshotHash: m.snapshotHash,
      lastNumericValue: m.extractedNumber ?? job.lastNumericValue,
      lastError: null,
    };
    await saveTabJob(quietJob);
    return quietJob;
  }

  // Triggered! Honor continueOnDetection + cooldown
  const continueRefreshing = job.monitor.continueOnDetection;
  const fireAlert = shouldFireDetectionAlert({
    lastAlertAt: job.lastAlertAt,
    cooldownSeconds: job.monitor.alertCooldownSeconds,
    continueOnDetection: continueRefreshing,
    now,
  });

  if (!continueRefreshing) {
    clearTabSchedule(tabId);
  }

  const primaryKeyword = m.matchedKeywords[0] || 'Change detected';
  const detectedJob: TabJob = {
    ...job,
    status: continueRefreshing ? 'running' : 'detected',
    detectionCount: job.detectionCount + 1,
    nextRefreshAt: continueRefreshing ? job.nextRefreshAt : null,
    lastAlertAt: fireAlert ? now : job.lastAlertAt,
    lastSnapshot: m.snapshot,
    lastSnapshotHash: m.snapshotHash,
    lastNumericValue: m.extractedNumber ?? job.lastNumericValue,
    lastMatchedKeyword: primaryKeyword,
    lastDiffSnippet: m.snippet,
    lastError: null,
  };

  await saveTabJob(detectedJob);
  await reconcileSleepLock();
  await updateTabBadge(detectedJob);
  await notifyContentScriptOfJob(tabId, detectedJob);

  await appendActivityLog({
    level: 'success',
    category: 'monitor',
    tabId,
    url: report.url,
    message: `Detected "${primaryKeyword}" via ${report.source}`,
    details: m.snippet,
  });

  if (fireAlert) {
    await triggerAlertPipeline(
      {
        tabId,
        windowId: job.windowId,
        url: report.url,
        title: report.title,
        reason: m.reason ?? 'keyword_found',
        keyword: primaryKeyword,
        snippet: m.snippet,
        timestamp: now,
      },
      options.fetcher,
    );
  }

  // Trigger Run Macro After Detection if bound to job or globally flagged
  const globalState = await getGlobalState();
  const macroToRun = detectedJob.macroId
    ? globalState.macros.find((mc) => mc.id === detectedJob.macroId && mc.enabled)
    : globalState.macros.find((mc) => mc.enabled && mc.runOnDetection);

  if (macroToRun) {
    try {
      await getBrowser().tabs.sendMessage(tabId, {
        type: 'RUN_MACRO_ON_TAB',
        tabId,
        macroId: macroToRun.id,
      } satisfies ExtensionMessage);
      await appendActivityLog({
        level: 'info',
        category: 'automation',
        tabId,
        url: report.url,
        message: `Triggered macro "${macroToRun.name}" after detection`,
      });
    } catch {
      // Content script unavailable
    }
  }

  return detectedJob;
}

/**
 * Execute a Hotkey Command on the active or specified tab.
 */
export async function handleHotkeyCommand(
  command: HotkeyCommandId,
  explicitTabId?: number,
): Promise<{ handled: boolean; action: string }> {
  const b = getBrowser();
  let tabId = explicitTabId;
  let tabUrl = '';
  let tabTitle = '';
  let windowId = 1;

  if (!tabId) {
    const activeTabs = await b.tabs.query({ active: true, currentWindow: true });
    const active = activeTabs[0];
    if (active?.id) {
      tabId = active.id;
      tabUrl = active.url || '';
      tabTitle = active.title || '';
      windowId = active.windowId ?? 1;
    }
  }

  switch (command) {
    case 'stop-all-refreshes': {
      const count = await stopAllTabJobs();
      return { handled: true, action: `stopped_${count}` };
    }

    case 'toggle-refresh': {
      if (!tabId) return { handled: false, action: 'no_active_tab' };
      const existing = await getTabJob(tabId);
      if (existing && (existing.status === 'running' || existing.status === 'paused')) {
        await stopTabJob(tabId, 'Stopped via keyboard shortcut');
        return { handled: true, action: 'stopped' };
      }
      await startTabJob({ tabId, windowId, url: tabUrl, title: tabTitle });
      return { handled: true, action: 'started' };
    }

    case 'pause-resume-refresh': {
      if (!tabId) return { handled: false, action: 'no_active_tab' };
      const existing = await getTabJob(tabId);
      if (existing?.status === 'running') {
        await pauseTabJob(tabId, 'Paused via keyboard shortcut');
        return { handled: true, action: 'paused' };
      }
      if (existing?.status === 'paused') {
        await resumeTabJob(tabId);
        return { handled: true, action: 'resumed' };
      }
      return { handled: false, action: 'not_running' };
    }

    case 'pick-monitor-area': {
      if (!tabId) return { handled: false, action: 'no_active_tab' };
      try {
        await b.tabs.sendMessage(tabId, {
          type: 'START_ELEMENT_PICKER',
          tabId,
        } satisfies ExtensionMessage);
        return { handled: true, action: 'picker_started' };
      } catch {
        return { handled: false, action: 'content_unreachable' };
      }
    }

    case 'toggle-visual-timer': {
      if (!tabId) return { handled: false, action: 'no_active_tab' };
      const job = await getTabJob(tabId);
      if (!job) return { handled: false, action: 'no_job' };
      const toggled: TabJob = {
        ...job,
        refresh: {
          ...job.refresh,
          visualTimer: {
            ...job.refresh.visualTimer,
            enabled: !job.refresh.visualTimer.enabled,
          },
        },
      };
      await saveTabJob(toggled);
      await notifyContentScriptOfJob(tabId, toggled);
      return {
        handled: true,
        action: toggled.refresh.visualTimer.enabled ? 'timer_shown' : 'timer_hidden',
      };
    }

    case 'run-monitor-now': {
      if (!tabId) return { handled: false, action: 'no_active_tab' };
      const job = await getTabJob(tabId);
      if (!job) return { handled: false, action: 'no_job' };
      await executeTabRefreshTick(tabId);
      return { handled: true, action: 'refreshed_now' };
    }

    default:
      return { handled: false, action: 'unknown_command' };
  }
}

/**
 * Central Runtime Message Dispatcher (Popup / Options / Content -> Background).
 */
export async function handleRuntimeMessage(
  message: ExtensionMessage,
  sender?: { tab?: { id?: number; windowId?: number; url?: string; title?: string } },
): Promise<unknown> {
  const senderTabId = sender?.tab?.id;

  switch (message.type) {
    case 'START_JOB':
      return {
        ok: true,
        job: await startTabJob({
          tabId: message.tabId,
          windowId: message.windowId,
          url: message.url,
          title: message.title,
          overrides: message.overrides,
        }),
      };

    case 'STOP_JOB':
      return {
        ok: true,
        job: await stopTabJob(message.tabId, message.reason),
      };

    case 'PAUSE_JOB':
      return {
        ok: true,
        job: await pauseTabJob(message.tabId, message.reason),
      };

    case 'RESUME_JOB':
      return {
        ok: true,
        job: await resumeTabJob(message.tabId),
      };

    case 'STOP_ALL_JOBS':
      return { ok: true, stoppedCount: await stopAllTabJobs() };

    case 'GET_JOB': {
      const id = message.tabId || senderTabId;
      return { ok: true, job: id ? await getTabJob(id) : null };
    }

    case 'GET_ALL_JOBS':
      return { ok: true, jobs: await getAllTabJobs() };

    case 'FOCUS_TAB':
      return {
        ok: await focusTabAndWindow(message.tabId, message.windowId),
      };

    case 'USER_INTERACTION': {
      const id = message.tabId ?? senderTabId;
      if (!id) return { ok: false };
      const job = await getTabJob(id);
      if (!job || job.status !== 'running' || !job.refresh.stopOnInteraction) {
        return { ok: false };
      }
      if (job.refresh.interactionAction === 'pause') {
        return {
          ok: true,
          job: await pauseTabJob(
            id,
            `Paused on user interaction (${message.eventType})`,
          ),
        };
      }
      return {
        ok: true,
        job: await stopTabJob(
          id,
          `Stopped on user interaction (${message.eventType})`,
        ),
      };
    }

    case 'PAGE_SCAN_REPORT': {
      const id = message.tabId ?? senderTabId;
      if (!id) return { ok: false };
      return {
        ok: true,
        job: await handlePageScanReport(id, message),
      };
    }

    case 'START_ELEMENT_PICKER': {
      try {
        await getBrowser().tabs.sendMessage(message.tabId, message);
        return { ok: true };
      } catch {
        return {
          ok: false,
          error: 'Reload this tab once so the element picker can attach.',
        };
      }
    }

    case 'ELEMENT_PICKED': {
      const id = message.tabId ?? senderTabId;
      if (!id) return { ok: false };
      const existing =
        (await getTabJob(id)) ??
        createDefaultTabJob({
          tabId: id,
          windowId: sender?.tab?.windowId ?? 1,
          url: sender?.tab?.url ?? '',
          title: sender?.tab?.title ?? '',
        });
      const updated: TabJob = {
        ...existing,
        monitor: {
          ...existing.monitor,
          enabled: true,
          customAreaEnabled: true,
          customAreaSelector: message.selector,
          customAreaSelectorType: 'css',
        },
      };
      await saveTabJob(updated);
      await appendActivityLog({
        level: 'info',
        category: 'monitor',
        tabId: id,
        url: existing.url,
        message: `Selected custom page area: ${message.selector}`,
        details: message.previewText,
      });
      return { ok: true, job: updated };
    }

    case 'TOGGLE_VISUAL_TIMER':
      return handleHotkeyCommand('toggle-visual-timer', message.tabId);

    case 'APPLY_PROFILE': {
      const state = await getGlobalState();
      const profile = state.profiles.find((p) => p.id === message.profileId);
      if (!profile) return { ok: false, error: 'Profile not found' };
      const existing =
        (await getTabJob(message.tabId)) ??
        createDefaultTabJob({
          tabId: message.tabId,
          url: '',
        });
      const updated = applyProfileToJob(
        existing,
        profile,
        state.autoClickTargets,
      );
      await saveTabJob(updated);
      await notifyContentScriptOfJob(message.tabId, updated);
      return { ok: true, job: updated };
    }

    case 'SYNC_NOW':
      if (message.direction === 'pull') {
        return pullSettingsFromSync({ force: true });
      }
      return pushSettingsToSync();

    case 'TEST_NOTIFICATION': {
      const res = await sendPushNotification({
        tabId: 0,
        windowId: 1,
        url: 'https://pulserefresh.extension/test',
        title: 'Test Alert Notification',
        reason: 'keyword_found',
        keyword: 'In Stock',
        snippet: 'Desktop push notifications are configured and working!',
        timestamp: Date.now(),
      });
      return { ok: res.sent, notificationId: res.notificationId };
    }

    case 'TEST_WEBHOOK': {
      return dispatchWebhook({
        webhook: message.webhook,
        payload: {
          tabId: 1,
          windowId: 1,
          url: 'https://example.com/product',
          title: 'PulseRefresh Webhook Test',
          reason: 'keyword_found',
          keyword: 'Add to Cart',
          snippet: 'Sample webhook test payload from PulseRefresh.',
          timestamp: Date.now(),
        },
      });
    }

    case 'TEST_EMAIL': {
      const state = await getGlobalState();
      const res = await sendEmailAlert({
        config: { ...message.email, enabled: true },
        quota: state.emailQuota,
        payload: {
          tabId: 1,
          windowId: 1,
          url: 'https://example.com/monitored-page',
          title: 'PulseRefresh Email Test',
          reason: 'keyword_found',
          keyword: 'Available Now',
          snippet: 'Email alert delivery is verified and ready.',
          timestamp: Date.now(),
        },
      });
      if (res.sent) {
        await updateGlobalState((prev) => ({
          ...prev,
          emailQuota: res.updatedQuota,
        }));
      }
      return res;
    }

    case 'TRIGGER_HOTKEY':
      return handleHotkeyCommand(message.command, message.tabId ?? senderTabId);

    case 'RUN_MACRO_ON_TAB': {
      try {
        const resp = await getBrowser().tabs.sendMessage(message.tabId, message);
        return { ok: true, result: resp };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Unable to reach tab content script',
        };
      }
    }

    default:
      return { ok: false, error: 'Unsupported message' };
  }
}

/**
 * Initialize all WebExtension background listeners (Chrome MV3 & Firefox compatible).
 */
export function initializeBackgroundController(): void {
  const b = getBrowser();

  // Bootstrap default state & register current device in storage.sync
  void (async () => {
    const state = await getGlobalState();
    await registerOrUpdateDevice(state.currentDevice, state.sync.maxDevices);
    if (state.sync.enabled && state.sync.autoSync) {
      await pullSettingsFromSync();
    }
  })();

  // Durable alarm listener
  b.alarms?.onAlarm?.addListener((alarm) => {
    if (alarm.name.startsWith(ALARM_PREFIX)) {
      const tabId = Number(alarm.name.slice(ALARM_PREFIX.length));
      if (Number.isFinite(tabId)) {
        void executeTabRefreshTick(tabId);
      }
    }
  });

  // Live toolbar countdown badge refresh every 1s for running jobs
  if (!badgeInterval) {
    badgeInterval = setInterval(() => {
      void (async () => {
        const jobs = await getAllTabJobs();
        for (const job of Object.values(jobs)) {
          if (job.status === 'running') {
            await updateTabBadge(job);
          }
        }
      })();
    }, 1000);
  }

  // Tab URL change, redirect guard, cookie hook, and Auto Start URLs
  b.tabs?.onUpdated?.addListener((tabId, changeInfo, tab) => {
    void handleTabUpdated(tabId, changeInfo, tab);
  });

  // Clean up closed tabs & release sleep lock if needed
  b.tabs?.onRemoved?.addListener((tabId) => {
    clearTabSchedule(tabId);
    void deleteTabJob(tabId).then(() => reconcileSleepLock());
  });

  // Keyboard shortcut commands (manifest commands)
  b.commands?.onCommand?.addListener((command) => {
    void handleHotkeyCommand(command as HotkeyCommandId);
  });

  // Desktop notification click -> focus the detected tab & window
  b.notifications?.onClicked?.addListener((notificationId) => {
    const target = parseNotificationTarget(notificationId);
    if (target && target.tabId > 0) {
      void focusTabAndWindow(target.tabId, target.windowId);
    }
  });

  // Message bus
  b.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object' || !('type' in message)) {
      return undefined;
    }
    handleRuntimeMessage(message as ExtensionMessage, sender)
      .then((res) => sendResponse(res))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : 'Internal error',
        }),
      );
    return true; // keep async response channel open across Chrome & Firefox
  });
}
