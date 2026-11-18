import { describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  handlePageScanReport,
  handleRuntimeMessage,
  pauseTabJob,
  resumeTabJob,
  stopAllTabJobs,
} from '@/src/lib/background-controller';
import { FEATURE_CHECKLIST } from '@/src/lib/feature-registry';
import { getActivityLogs, getTabJob, updateGlobalState } from '@/src/lib/storage';

describe('End-to-End Integration — Full Detection -> Alert -> Macro -> Log Pipeline', () => {
  it('tracks all 42 features across all 7 requested categories in FEATURE_CHECKLIST', () => {
    expect(FEATURE_CHECKLIST).toHaveLength(42);
    expect(FEATURE_CHECKLIST.every((f) => f.implemented && f.verified)).toBe(true);
  });

  it('runs a full job lifecycle: START_JOB -> PAUSE -> RESUME -> USER_INTERACTION -> DETECTION -> PUSH + EMAIL + WEBHOOK + FOCUS + MACRO', async () => {
    const notifSpy = vi.spyOn(fakeBrowser.notifications, 'create');
    const winSpy = vi
      .spyOn(fakeBrowser.windows, 'update')
      .mockResolvedValue({} as never);
    const tabUpdateSpy = vi
      .spyOn(fakeBrowser.tabs, 'update')
      .mockResolvedValue({} as never);
    const tabMsgSpy = vi
      .spyOn(fakeBrowser.tabs, 'sendMessage')
      .mockResolvedValue({ ok: true } as never);

    const externalFetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response('{"ok":true}', { status: 200 })));

    // Configure Email + Webhook + Run-on-Detection Macro
    await updateGlobalState((s) => ({
      ...s,
      alerts: {
        ...s.alerts,
        pushNotifications: true,
        focusWindowOnDetection: true,
        email: {
          ...s.alerts.email,
          enabled: true,
          provider: 'resend',
          toEmail: 'ops@example.com',
          apiKey: 're_live_demo',
        },
        webhooks: [
          {
            id: 'wh_e2e',
            name: 'E2E Webhook',
            enabled: true,
            preset: 'generic',
            url: 'https://webhook.example.com/hit',
            secret: 'e2e_secret',
            headers: {},
            payloadTemplate: '',
            maxRetries: 1,
          },
        ],
      },
      macros: s.macros.map((m, i) =>
        i === 0 ? { ...m, enabled: true, runOnDetection: true } : m,
      ),
    }));

    // 1. Start Job via runtime message protocol
    const startResp = (await handleRuntimeMessage({
      type: 'START_JOB',
      tabId: 101,
      windowId: 5,
      url: 'https://store.example.com/limited-edition',
      title: 'Limited Drop',
      overrides: {
        refresh: {
          intervalMode: 'random',
          randomMinSeconds: 8,
          randomMaxSeconds: 15,
          stopOnInteraction: true,
          interactionAction: 'pause',
        },
        monitor: {
          enabled: true,
          refreshType: 'xhr',
          mode: 'keyword_found',
          continueOnDetection: false,
        },
      },
    })) as { ok: boolean };
    expect(startResp.ok).toBe(true);

    // 2. Pause & Resume
    const paused = await pauseTabJob(101);
    expect(paused?.status).toBe('paused');
    const resumed = await resumeTabJob(101, { enablePrecisionTimer: false });
    expect(resumed?.status).toBe('running');

    // 3. User interaction pauses job, then user resumes
    await handleRuntimeMessage({
      type: 'USER_INTERACTION',
      tabId: 101,
      eventType: 'wheel',
    });
    expect((await getTabJob(101))?.status).toBe('paused');
    await resumeTabJob(101, { enablePrecisionTimer: false });

    // 4. Content script reports keyword detection -> triggers full pipeline
    const detected = await handlePageScanReport(
      101,
      {
        type: 'PAGE_SCAN_REPORT',
        url: 'https://store.example.com/limited-edition',
        title: 'Limited Drop',
        source: 'xhr',
        monitorResult: {
          triggered: true,
          reason: 'keyword_found',
          matchedKeywords: ['Add to Cart'],
          snippet: 'Add to Cart — Only 2 left!',
          snapshot: 'Add to Cart — Only 2 left!',
          snapshotHash: 'ff00aa11',
          matchCount: 1,
        },
      },
      { enablePrecisionTimer: false, fetcher: externalFetch as unknown as typeof fetch },
    );

    expect(detected?.status).toBe('detected');
    expect(detected?.detectionCount).toBe(1);
    expect(notifSpy).toHaveBeenCalledTimes(1);
    expect(winSpy).toHaveBeenCalledWith(5, { focused: true, drawAttention: true });
    expect(tabUpdateSpy).toHaveBeenCalledWith(101, { active: true });
    // Both Resend Email API and Signed Webhook called
    expect(externalFetch).toHaveBeenCalledTimes(2);
    // Run Macro After Detection sent to tab 101
    expect(tabMsgSpy).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ type: 'RUN_MACRO_ON_TAB', tabId: 101 }),
    );

    // 5. Activity log recorded the whole trace
    const logs = await getActivityLogs();
    expect(logs.some((l) => l.message.includes('Detected "Add to Cart"'))).toBe(true);
    expect(logs.some((l) => l.message.includes('Triggered macro'))).toBe(true);

    // 6. Stop All cleans up any other running jobs
    await handleRuntimeMessage({
      type: 'START_JOB',
      tabId: 102,
      url: 'https://b.example.com',
    });
    expect(await stopAllTabJobs()).toBe(1);
  });
});
