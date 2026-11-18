import { getBrowser } from './browser-api';
import {
  createDefaultMonitorConfig,
  createDefaultRefreshConfig,
  createDefaultUrlConfig,
} from './defaults';
import {
  getAllTabJobs,
  getGlobalState,
  saveGlobalState,
  STORAGE_KEYS,
} from './storage';
import type {
  AlertsConfig,
  AutomationMacro,
  AutoStartRule,
  CookieAutomationRule,
  CustomScript,
  DeviceInfo,
  GlobalExtensionState,
  HotkeyBinding,
  KeywordTemplate,
  SettingsProfile,
  TabJob,
} from './types';
import { matchesUrlPattern } from './url-automation';
import { fnv1aHash, generateId } from './utils';

// Keep each browser.storage.sync chunk well under Chrome/Firefox's 8,192-byte per-item cap.
export const MAX_SYNC_CHUNK_CHARS = 6500;

export interface SyncPayload {
  schemaVersion: 1;
  revision: number;
  syncedAt: number;
  sourceDeviceId: string;
  profiles?: SettingsProfile[];
  autoStartRules?: AutoStartRule[];
  templates?: KeywordTemplate[];
  scripts?: CustomScript[];
  macros?: AutomationMacro[];
  cookieRules?: CookieAutomationRule[];
  hotkeys?: HotkeyBinding[];
  alerts?: AlertsConfig;
}

interface SyncMetaRecord {
  schemaVersion: 1;
  revision: number;
  syncedAt: number;
  sourceDeviceId: string;
  chunkCount: number;
  checksum: string;
}

// ============================================================================
// 1. Sync Settings (Chunked browser.storage.sync + JSON Export/Import)
// ============================================================================

export function splitIntoSyncChunks(
  serialized: string,
  chunkSize = MAX_SYNC_CHUNK_CHARS,
): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < serialized.length; i += chunkSize) {
    chunks.push(serialized.slice(i, i + chunkSize));
  }
  return chunks.length > 0 ? chunks : [''];
}

export function buildSyncPayload(
  state: GlobalExtensionState,
  nextRevision: number,
  now = Date.now(),
): SyncPayload {
  const payload: SyncPayload = {
    schemaVersion: 1,
    revision: nextRevision,
    syncedAt: now,
    sourceDeviceId: state.currentDevice.id,
    hotkeys: state.hotkeys,
    cookieRules: state.cookieRules,
  };
  if (state.sync.syncProfiles) payload.profiles = state.profiles;
  if (state.sync.syncAutoStartRules) payload.autoStartRules = state.autoStartRules;
  if (state.sync.syncTemplates) payload.templates = state.templates;
  if (state.sync.syncScriptsAndMacros) {
    payload.scripts = state.scripts;
    payload.macros = state.macros;
  }
  if (state.sync.syncAlerts) {
    // Sync alert preferences while omitting sensitive provider secrets if desired — keep full self-contained state
    payload.alerts = state.alerts;
  }
  return payload;
}

/**
 * Push current extension settings to browser.storage.sync using chunked storage
 * and update the current device's heartbeat in the synced device registry.
 */
export async function pushSettingsToSync(): Promise<{
  ok: boolean;
  revision: number;
  chunkCount: number;
  syncedAt: number;
  error?: string;
}> {
  const b = getBrowser();
  const state = await getGlobalState();

  if (!state.sync.enabled) {
    return {
      ok: false,
      revision: state.sync.revision,
      chunkCount: 0,
      syncedAt: state.sync.lastSyncedAt ?? 0,
      error: 'Sync is disabled',
    };
  }

  const prevMetaRaw = await b.storage.sync.get(STORAGE_KEYS.SYNC_META);
  const prevMeta = prevMetaRaw[STORAGE_KEYS.SYNC_META] as
    | SyncMetaRecord
    | undefined;
  const nextRevision =
    Math.max(state.sync.revision, prevMeta?.revision ?? 0) + 1;
  const syncedAt = Date.now();

  const payload = buildSyncPayload(state, nextRevision, syncedAt);
  const serialized = JSON.stringify(payload);
  const checksum = fnv1aHash(serialized);
  const chunks = splitIntoSyncChunks(serialized);

  const itemsToSet: Record<string, unknown> = {
    [STORAGE_KEYS.SYNC_META]: {
      schemaVersion: 1,
      revision: nextRevision,
      syncedAt,
      sourceDeviceId: state.currentDevice.id,
      chunkCount: chunks.length,
      checksum,
    } satisfies SyncMetaRecord,
  };

  chunks.forEach((chunk, idx) => {
    itemsToSet[`${STORAGE_KEYS.SYNC_CHUNK_PREFIX}${idx}`] = chunk;
  });

  await b.storage.sync.set(itemsToSet);

  // Clean up leftover trailing chunks if previous payload was larger
  if (prevMeta && prevMeta.chunkCount > chunks.length) {
    const staleKeys: string[] = [];
    for (let i = chunks.length; i < prevMeta.chunkCount; i++) {
      staleKeys.push(`${STORAGE_KEYS.SYNC_CHUNK_PREFIX}${i}`);
    }
    await b.storage.sync.remove(staleKeys);
  }

  // Count active running jobs for device telemetry
  const jobs = await getAllTabJobs();
  const activeCount = Object.values(jobs).filter(
    (j) => j.status === 'running',
  ).length;

  const updatedDevice: DeviceInfo = {
    ...state.currentDevice,
    lastSyncedAt: syncedAt,
    activeJobsCount: activeCount,
  };

  const updatedState: GlobalExtensionState = {
    ...state,
    currentDevice: updatedDevice,
    sync: {
      ...state.sync,
      revision: nextRevision,
      lastSyncedAt: syncedAt,
    },
  };
  await saveGlobalState(updatedState);
  await registerOrUpdateDevice(updatedDevice, state.sync.maxDevices);

  return {
    ok: true,
    revision: nextRevision,
    chunkCount: chunks.length,
    syncedAt,
  };
}

/**
 * Pull settings from browser.storage.sync, verify FNV-1a checksum integrity,
 * and apply them into local state (with optional force flag bypassing revision check).
 */
export async function pullSettingsFromSync(options: {
  force?: boolean;
} = {}): Promise<{
  ok: boolean;
  applied: boolean;
  revision: number;
  error?: string;
}> {
  const b = getBrowser();
  const state = await getGlobalState();
  const metaRes = await b.storage.sync.get(STORAGE_KEYS.SYNC_META);
  const meta = metaRes[STORAGE_KEYS.SYNC_META] as SyncMetaRecord | undefined;

  if (!meta) {
    return { ok: true, applied: false, revision: state.sync.revision };
  }

  if (!options.force && meta.revision <= state.sync.revision) {
    return { ok: true, applied: false, revision: state.sync.revision };
  }

  const chunkKeys = Array.from(
    { length: meta.chunkCount },
    (_, i) => `${STORAGE_KEYS.SYNC_CHUNK_PREFIX}${i}`,
  );
  const chunkRes = await b.storage.sync.get(chunkKeys);
  const serialized = chunkKeys
    .map((k) => (chunkRes[k] as string) ?? '')
    .join('');

  if (fnv1aHash(serialized) !== meta.checksum) {
    return {
      ok: false,
      applied: false,
      revision: state.sync.revision,
      error: 'Sync payload checksum mismatch',
    };
  }

  const payload = JSON.parse(serialized) as SyncPayload;
  const merged: GlobalExtensionState = {
    ...state,
    profiles: payload.profiles ?? state.profiles,
    autoStartRules: payload.autoStartRules ?? state.autoStartRules,
    templates: payload.templates ?? state.templates,
    scripts: payload.scripts ?? state.scripts,
    macros: payload.macros ?? state.macros,
    cookieRules: payload.cookieRules ?? state.cookieRules,
    hotkeys: payload.hotkeys ?? state.hotkeys,
    alerts: payload.alerts ?? state.alerts,
    sync: {
      ...state.sync,
      revision: payload.revision,
      lastSyncedAt: payload.syncedAt,
    },
  };

  await saveGlobalState(merged);
  return { ok: true, applied: true, revision: payload.revision };
}

/**
 * Portable JSON backup export & import for offline / cross-browser backup.
 */
export function exportBackupJson(state: GlobalExtensionState): string {
  const bundle = {
    app: 'PulseRefresh',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    payload: buildSyncPayload(state, state.sync.revision),
    autoClickTargets: state.autoClickTargets,
    featureOverrides: state.featureOverrides,
  };
  return JSON.stringify(bundle, null, 2);
}

export async function importBackupJson(
  jsonText: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const parsed = JSON.parse(jsonText) as {
      app?: string;
      payload?: SyncPayload;
      autoClickTargets?: GlobalExtensionState['autoClickTargets'];
      featureOverrides?: GlobalExtensionState['featureOverrides'];
    };
    if (parsed.app !== 'PulseRefresh' || !parsed.payload) {
      return { ok: false, error: 'Invalid PulseRefresh backup file' };
    }
    const current = await getGlobalState();
    const p = parsed.payload;
    const next: GlobalExtensionState = {
      ...current,
      profiles: p.profiles ?? current.profiles,
      autoStartRules: p.autoStartRules ?? current.autoStartRules,
      templates: p.templates ?? current.templates,
      scripts: p.scripts ?? current.scripts,
      macros: p.macros ?? current.macros,
      cookieRules: p.cookieRules ?? current.cookieRules,
      hotkeys: p.hotkeys ?? current.hotkeys,
      alerts: p.alerts ?? current.alerts,
      autoClickTargets: parsed.autoClickTargets ?? current.autoClickTargets,
      featureOverrides: parsed.featureOverrides ?? current.featureOverrides,
    };
    await saveGlobalState(next);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to parse JSON backup',
    };
  }
}

// ============================================================================
// 2. Devices Management (Unlimited devices unlocked by default)
// ============================================================================

export async function getSyncedDevices(): Promise<DeviceInfo[]> {
  const b = getBrowser();
  const res = await b.storage.sync.get(STORAGE_KEYS.SYNC_DEVICES);
  const list = (res[STORAGE_KEYS.SYNC_DEVICES] as DeviceInfo[]) ?? [];
  return [...list].sort((a, bDev) => bDev.lastSyncedAt - a.lastSyncedAt);
}

export async function registerOrUpdateDevice(
  device: DeviceInfo,
  maxDevices: number | null = null,
): Promise<{ registered: boolean; devices: DeviceInfo[]; error?: string }> {
  const b = getBrowser();
  const existing = await getSyncedDevices();
  const idx = existing.findIndex((d) => d.id === device.id);

  if (idx === -1 && maxDevices != null && maxDevices > 0 && existing.length >= maxDevices) {
    return {
      registered: false,
      devices: existing,
      error: `Maximum device limit (${maxDevices}) reached. Remove an old device or set limit to Unlimited.`,
    };
  }

  const next = [...existing];
  if (idx >= 0) {
    next[idx] = { ...device };
  } else {
    next.push({ ...device });
  }

  next.sort((a, bDev) => bDev.lastSyncedAt - a.lastSyncedAt);
  await b.storage.sync.set({ [STORAGE_KEYS.SYNC_DEVICES]: next });
  return { registered: true, devices: next };
}

export async function renameCurrentDevice(
  newName: string,
): Promise<DeviceInfo> {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error('Device name cannot be empty');

  const state = await getGlobalState();
  const updated: DeviceInfo = {
    ...state.currentDevice,
    name: trimmed,
    lastSyncedAt: Date.now(),
  };
  await saveGlobalState({ ...state, currentDevice: updated });
  await registerOrUpdateDevice(updated, state.sync.maxDevices);
  return updated;
}

export async function removeSyncedDevice(
  deviceId: string,
): Promise<DeviceInfo[]> {
  const b = getBrowser();
  const existing = await getSyncedDevices();
  const filtered = existing.filter((d) => d.id !== deviceId);
  await b.storage.sync.set({ [STORAGE_KEYS.SYNC_DEVICES]: filtered });
  return filtered;
}

// ============================================================================
// 3. Settings Profiles
// ============================================================================

export function createSettingsProfile(params: {
  name: string;
  description?: string;
  urlPattern?: string;
  isDefault?: boolean;
  fromJob?: Pick<TabJob, 'refresh' | 'urlConfig' | 'monitor' | 'macroId'>;
  baseProfile?: SettingsProfile;
}): SettingsProfile {
  const source = params.fromJob ?? params.baseProfile;
  return {
    id: generateId('profile'),
    name: params.name.trim() || 'Custom Profile',
    description: params.description?.trim() || 'Saved PulseRefresh configuration profile',
    isDefault: Boolean(params.isDefault),
    urlPattern: params.urlPattern?.trim() || undefined,
    refresh: structuredClone(source?.refresh ?? createDefaultRefreshConfig()),
    urlConfig: structuredClone(source?.urlConfig ?? createDefaultUrlConfig()),
    monitor: structuredClone(source?.monitor ?? createDefaultMonitorConfig()),
    autoClickTargetIds: params.baseProfile
      ? [...params.baseProfile.autoClickTargetIds]
      : [],
    macroId: source?.macroId ?? null,
    updatedAt: Date.now(),
  };
}

export function duplicateSettingsProfile(
  profile: SettingsProfile,
): SettingsProfile {
  return createSettingsProfile({
    name: `${profile.name} (Copy)`,
    description: profile.description,
    urlPattern: profile.urlPattern,
    isDefault: false,
    baseProfile: profile,
  });
}

export function setDefaultProfile(
  profiles: SettingsProfile[],
  profileId: string,
): SettingsProfile[] {
  return profiles.map((p) => ({
    ...p,
    isDefault: p.id === profileId,
  }));
}

export function deleteSettingsProfile(
  profiles: SettingsProfile[],
  profileId: string,
): SettingsProfile[] {
  if (profiles.length <= 1) return profiles; // Always retain at least one profile
  const remaining = profiles.filter((p) => p.id !== profileId);
  const firstRemaining = remaining[0];
  if (!remaining.some((p) => p.isDefault) && firstRemaining) {
    remaining[0] = { ...firstRemaining, isDefault: true };
  }
  return remaining;
}

export function findProfileForUrl(
  url: string,
  profiles: SettingsProfile[],
): SettingsProfile | undefined {
  const urlMatched = profiles.find(
    (p) => p.urlPattern && matchesUrlPattern(url, p.urlPattern, 'wildcard'),
  );
  if (urlMatched) return urlMatched;
  return profiles.find((p) => p.isDefault) ?? profiles[0];
}

export function applyProfileToJob(
  job: TabJob,
  profile: SettingsProfile,
  allClickTargets: TabJob['autoClickTargets'] = [],
): TabJob {
  const linkedTargets =
    profile.autoClickTargetIds.length > 0
      ? allClickTargets.filter((t) => profile.autoClickTargetIds.includes(t.id))
      : job.autoClickTargets;

  return {
    ...job,
    profileId: profile.id,
    refresh: structuredClone(profile.refresh),
    urlConfig: structuredClone(profile.urlConfig),
    monitor: structuredClone(profile.monitor),
    autoClickTargets: structuredClone(linkedTargets),
    macroId: profile.macroId,
  };
}

export function exportSingleProfileJson(profile: SettingsProfile): string {
  return JSON.stringify(
    {
      app: 'PulseRefreshProfile',
      version: '1.0.0',
      profile,
    },
    null,
    2,
  );
}

export function importSingleProfileJson(jsonText: string): SettingsProfile {
  const parsed = JSON.parse(jsonText) as {
    app?: string;
    profile?: SettingsProfile;
  };
  if (parsed.app !== 'PulseRefreshProfile' || !parsed.profile?.name) {
    throw new Error('Invalid profile JSON format');
  }
  return {
    ...parsed.profile,
    id: generateId('profile'),
    isDefault: false,
    updatedAt: Date.now(),
  };
}
