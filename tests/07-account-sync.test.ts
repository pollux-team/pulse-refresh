import { describe, expect, it } from 'vitest';
import { createDefaultTabJob } from '@/src/lib/defaults';
import { getGlobalState, updateGlobalState } from '@/src/lib/storage';
import {
  applyProfileToJob,
  createSettingsProfile,
  deleteSettingsProfile,
  duplicateSettingsProfile,
  exportBackupJson,
  exportSingleProfileJson,
  findProfileForUrl,
  getSyncedDevices,
  importBackupJson,
  importSingleProfileJson,
  MAX_SYNC_CHUNK_CHARS,
  pullSettingsFromSync,
  pushSettingsToSync,
  registerOrUpdateDevice,
  removeSyncedDevice,
  renameCurrentDevice,
  setDefaultProfile,
  splitIntoSyncChunks,
} from '@/src/lib/sync-manager';
import type { DeviceInfo } from '@/src/lib/types';

describe('Category 7 — Account & Sync', () => {
  describe('7.1 Sync Settings (Chunked browser.storage.sync + JSON Export/Import)', () => {
    it('chunks large configs under 8KB per item, pushes to storage.sync, verifies checksum, and pulls onto another device', async () => {
      const largeStr = 'x'.repeat(MAX_SYNC_CHUNK_CHARS * 2 + 500);
      const chunks = splitIntoSyncChunks(largeStr);
      expect(chunks).toHaveLength(3);
      expect(chunks.every((c) => c.length <= MAX_SYNC_CHUNK_CHARS)).toBe(true);

      // Modify local state and push to sync
      await updateGlobalState((s) => ({
        ...s,
        autoStartRules: [
          {
            id: 'sync_rule_1',
            name: 'Synced Ticket Rule',
            pattern: 'https://tickets.example.com/*',
            matchType: 'wildcard',
            intervalSeconds: 20,
            profileId: 'profile_default',
            enabled: true,
          },
        ],
      }));

      const pushRes = await pushSettingsToSync();
      expect(pushRes.ok).toBe(true);
      expect(pushRes.revision).toBe(1);
      expect(pushRes.chunkCount).toBeGreaterThanOrEqual(1);

      // Simulate a fresh second device with revision 0 and empty autoStartRules
      await updateGlobalState((s) => ({
        ...s,
        autoStartRules: [],
        sync: { ...s.sync, revision: 0 },
      }));

      const pullRes = await pullSettingsFromSync();
      expect(pullRes).toEqual({ ok: true, applied: true, revision: 1 });

      const restoredState = await getGlobalState();
      expect(restoredState.autoStartRules).toHaveLength(1);
      expect(restoredState.autoStartRules[0]?.name).toBe('Synced Ticket Rule');
    });

    it('exports and re-imports full portable JSON backups safely', async () => {
      const state = await getGlobalState();
      const backup = exportBackupJson(state);

      await updateGlobalState((s) => ({ ...s, templates: [] }));
      expect((await getGlobalState()).templates).toHaveLength(0);

      const imported = await importBackupJson(backup);
      expect(imported.ok).toBe(true);
      expect((await getGlobalState()).templates.length).toBeGreaterThanOrEqual(5);

      expect((await importBackupJson('{"invalid":true}')).ok).toBe(false);
    });
  });

  describe('7.2 Devices Management (Unlimited Devices Unlocked)', () => {
    it('registers unlimited Chrome & Firefox devices, renames current device, removes stale devices, and supports optional cap', async () => {
      // Register 12 distinct devices to verify no arbitrary 3-device restriction exists
      for (let i = 1; i <= 12; i++) {
        const dev: DeviceInfo = {
          id: `dev_${i}`,
          name: `Workstation #${i}`,
          browser: i % 2 === 0 ? 'firefox' : 'chrome',
          platform: 'Linux',
          extensionVersion: '1.0.0',
          createdAt: 1000 + i,
          lastSyncedAt: 2000 + i,
          activeJobsCount: i % 3,
        };
        const r = await registerOrUpdateDevice(dev, null);
        expect(r.registered).toBe(true);
      }

      expect(await getSyncedDevices()).toHaveLength(12);

      // Rename current device and confirm it enters synced registry
      const renamed = await renameCurrentDevice('MacBook Pro — Chrome');
      expect(renamed.name).toBe('MacBook Pro — Chrome');
      const afterRename = await getSyncedDevices();
      expect(afterRename.some((d) => d.name === 'MacBook Pro — Chrome')).toBe(true);

      // Remove a stale device
      const afterRemove = await removeSyncedDevice('dev_1');
      expect(afterRemove.some((d) => d.id === 'dev_1')).toBe(false);

      // Verify optional user-configured maxDevices guard works if ever explicitly set
      const capped = await registerOrUpdateDevice(
        {
          id: 'dev_extra',
          name: 'Extra',
          browser: 'chrome',
          platform: 'Windows',
          extensionVersion: '1.0.0',
          createdAt: 9999,
          lastSyncedAt: 9999,
          activeJobsCount: 0,
        },
        3,
      );
      expect(capped.registered).toBe(false);
    });
  });

  describe('7.3 Settings Profiles', () => {
    it('creates, duplicates, sets default, deletes safely, auto-matches URLs, applies to jobs, and exports/imports', async () => {
      const state = await getGlobalState();
      expect(state.profiles.length).toBeGreaterThanOrEqual(4);

      const custom = createSettingsProfile({
        name: 'GitHub PR Watcher',
        urlPattern: 'https://github.com/*/pulls*',
      });
      custom.refresh.predefinedSeconds = 45;
      custom.monitor.refreshType = 'xhr';

      const dup = duplicateSettingsProfile(custom);
      expect(dup.name).toBe('GitHub PR Watcher (Copy)');
      expect(dup.id).not.toBe(custom.id);

      let list = [...state.profiles, custom, dup];
      list = setDefaultProfile(list, custom.id);
      expect(list.find((p) => p.isDefault)?.id).toBe(custom.id);

      // Auto-match by URL pattern
      expect(
        findProfileForUrl('https://github.com/wxt-dev/wxt/pulls', list)?.id,
      ).toBe(custom.id);

      // Apply profile onto a TabJob
      const job = createDefaultTabJob({
        tabId: 10,
        url: 'https://github.com/wxt-dev/wxt/pulls',
      });
      const applied = applyProfileToJob(job, custom);
      expect(applied.profileId).toBe(custom.id);
      expect(applied.refresh.predefinedSeconds).toBe(45);
      expect(applied.monitor.refreshType).toBe('xhr');

      // Export & import single profile JSON
      const exported = exportSingleProfileJson(custom);
      const reimported = importSingleProfileJson(exported);
      expect(reimported.name).toBe('GitHub PR Watcher');

      // Deleting the default profile promotes another profile to default automatically
      const afterDelete = deleteSettingsProfile(list, custom.id);
      expect(afterDelete.some((p) => p.isDefault)).toBe(true);
    });
  });
});
