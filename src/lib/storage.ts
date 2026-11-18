import { getBrowser } from './browser-api';
import { createDefaultGlobalState } from './defaults';
import type {
  ActivityLogEntry,
  GlobalExtensionState,
  TabJob,
} from './types';
import { generateId } from './utils';

export const STORAGE_KEYS = {
  GLOBAL_STATE: 'pulserefresh_global_state_v1',
  TAB_JOBS: 'pulserefresh_tab_jobs_v1',
  ACTIVITY_LOGS: 'pulserefresh_activity_logs_v1',
  SYNC_META: 'pr_sync_meta_v1',
  SYNC_CHUNK_PREFIX: 'pr_sync_chunk_',
  SYNC_DEVICES: 'pr_sync_devices_v1',
} as const;

const MAX_LOG_ENTRIES = 250;

// Serialize storage mutations to avoid lost concurrent read-modify-write races.
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(fn, fn);
  writeQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export async function getGlobalState(): Promise<GlobalExtensionState> {
  const b = getBrowser();
  const res = await b.storage.local.get(STORAGE_KEYS.GLOBAL_STATE);
  const raw = res[STORAGE_KEYS.GLOBAL_STATE] as
    | Partial<GlobalExtensionState>
    | undefined;
  const defaults = createDefaultGlobalState();
  if (!raw) {
    await b.storage.local.set({ [STORAGE_KEYS.GLOBAL_STATE]: defaults });
    return defaults;
  }
  return {
    ...defaults,
    ...raw,
    alerts: {
      ...defaults.alerts,
      ...(raw.alerts ?? {}),
      email: {
        ...defaults.alerts.email,
        ...(raw.alerts?.email ?? {}),
      },
    },
    sync: {
      ...defaults.sync,
      ...(raw.sync ?? {}),
    },
    currentDevice: {
      ...defaults.currentDevice,
      ...(raw.currentDevice ?? {}),
    },
    aiConfig: {
      ...defaults.aiConfig,
      ...(raw.aiConfig ?? {}),
    },
  };
}

export async function saveGlobalState(
  state: GlobalExtensionState,
): Promise<GlobalExtensionState> {
  return enqueueWrite(async () => {
    const b = getBrowser();
    await b.storage.local.set({ [STORAGE_KEYS.GLOBAL_STATE]: state });
    return state;
  });
}

export async function updateGlobalState(
  updater: (prev: GlobalExtensionState) => GlobalExtensionState,
): Promise<GlobalExtensionState> {
  return enqueueWrite(async () => {
    const b = getBrowser();
    const current = await getGlobalState();
    const next = updater(current);
    await b.storage.local.set({ [STORAGE_KEYS.GLOBAL_STATE]: next });
    return next;
  });
}

export async function getAllTabJobs(): Promise<Record<number, TabJob>> {
  const b = getBrowser();
  const res = await b.storage.local.get(STORAGE_KEYS.TAB_JOBS);
  const raw = res[STORAGE_KEYS.TAB_JOBS] as Record<string, TabJob> | undefined;
  if (!raw) return {};
  const mapped: Record<number, TabJob> = {};
  for (const [k, v] of Object.entries(raw)) {
    const num = Number(k);
    if (Number.isFinite(num) && v) {
      mapped[num] = v;
    }
  }
  return mapped;
}

export async function getTabJob(tabId: number): Promise<TabJob | null> {
  const all = await getAllTabJobs();
  return all[tabId] ?? null;
}

export async function saveTabJob(job: TabJob): Promise<TabJob> {
  return enqueueWrite(async () => {
    const b = getBrowser();
    const res = await b.storage.local.get(STORAGE_KEYS.TAB_JOBS);
    const current = (res[STORAGE_KEYS.TAB_JOBS] as Record<string, TabJob>) ?? {};
    const next = { ...current, [String(job.tabId)]: job };
    await b.storage.local.set({ [STORAGE_KEYS.TAB_JOBS]: next });
    return job;
  });
}

export async function deleteTabJob(tabId: number): Promise<void> {
  return enqueueWrite(async () => {
    const b = getBrowser();
    const res = await b.storage.local.get(STORAGE_KEYS.TAB_JOBS);
    const current = (res[STORAGE_KEYS.TAB_JOBS] as Record<string, TabJob>) ?? {};
    if (String(tabId) in current) {
      const next = { ...current };
      delete next[String(tabId)];
      await b.storage.local.set({ [STORAGE_KEYS.TAB_JOBS]: next });
    }
  });
}

export async function getActivityLogs(): Promise<ActivityLogEntry[]> {
  const b = getBrowser();
  const res = await b.storage.local.get(STORAGE_KEYS.ACTIVITY_LOGS);
  return (res[STORAGE_KEYS.ACTIVITY_LOGS] as ActivityLogEntry[]) ?? [];
}

export async function appendActivityLog(
  entry: Omit<ActivityLogEntry, 'id' | 'timestamp'> & { timestamp?: number },
): Promise<ActivityLogEntry> {
  return enqueueWrite(async () => {
    const b = getBrowser();
    const res = await b.storage.local.get(STORAGE_KEYS.ACTIVITY_LOGS);
    const current = (res[STORAGE_KEYS.ACTIVITY_LOGS] as ActivityLogEntry[]) ?? [];
    const created: ActivityLogEntry = {
      id: generateId('log'),
      timestamp: entry.timestamp ?? Date.now(),
      level: entry.level,
      category: entry.category,
      tabId: entry.tabId,
      url: entry.url,
      message: entry.message,
      details: entry.details,
    };
    const next = [created, ...current].slice(0, MAX_LOG_ENTRIES);
    await b.storage.local.set({ [STORAGE_KEYS.ACTIVITY_LOGS]: next });
    return created;
  });
}

export async function clearActivityLogs(): Promise<void> {
  return enqueueWrite(async () => {
    const b = getBrowser();
    await b.storage.local.set({ [STORAGE_KEYS.ACTIVITY_LOGS]: [] });
  });
}

export function subscribeStorageChanges(
  callback: () => void,
): () => void {
  const b = getBrowser();
  const listener = () => callback();
  b.storage.onChanged.addListener(listener);
  return () => {
    b.storage.onChanged.removeListener(listener);
  };
}
