import React from 'react';
import ReactDOM from 'react-dom/client';
import { VisualTimerOverlay } from '@/src/components/content/VisualTimerOverlay';
import {
  executeAutomationMacro,
  executeMatchingScripts,
  matchHotkeyEvent,
} from '@/src/lib/automation';
import { getBrowser } from '@/src/lib/browser-api';
import {
  autoClickOnKeywordMatch,
  clearHighlights,
  executeAutoClickTargets,
  highlightDetectedKeywords,
  resolveCustomAreaElement,
  scrollToDetectedElement,
  startInteractiveElementPicker,
} from '@/src/lib/dom-actions';
import {
  attachRealTimeMonitor,
  evaluatePageMonitor,
  performXhrRefresh,
  runDetectionAfterLoad,
} from '@/src/lib/monitor-engine';
import {
  attachUserInteractionDetector,
  enableKeepPageActive,
  EXTENSION_UI_ATTR,
  neutralizeFormResubmission,
} from '@/src/lib/page-guards';
import { getGlobalState } from '@/src/lib/storage';
import type { ExtensionMessage, TabJob } from '@/src/lib/types';
import {
  detectCaptchaInDocument,
  detectErrorPage,
} from '@/src/lib/url-automation';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    const b = getBrowser();
    let currentJob: TabJob | null = null;
    let cleanupKeepActive: (() => void) | null = null;
    let cleanupInteraction: (() => void) | null = null;
    let cleanupMutation: (() => void) | null = null;
    let cleanupPicker: (() => void) | null = null;
    let shadowHost: HTMLElement | null = null;
    let reactRoot: ReactDOM.Root | null = null;

    function ensureTimerRoot(): ReactDOM.Root {
      if (reactRoot && shadowHost?.isConnected) return reactRoot;
      shadowHost = document.createElement('pulserefresh-timer');
      shadowHost.setAttribute(EXTENSION_UI_ATTR, 'timer-host');
      const shadow = shadowHost.attachShadow({ mode: 'open' });
      const mount = document.createElement('div');
      shadow.appendChild(mount);
      document.documentElement.appendChild(shadowHost);
      reactRoot = ReactDOM.createRoot(mount);
      return reactRoot;
    }

    function unmountTimer(): void {
      if (reactRoot) {
        reactRoot.unmount();
        reactRoot = null;
      }
      if (shadowHost) {
        shadowHost.remove();
        shadowHost = null;
      }
    }

    function renderVisualTimer(job: TabJob | null): void {
      if (
        !job ||
        !job.refresh.visualTimer.enabled ||
        job.status === 'idle' ||
        job.status === 'stopped'
      ) {
        unmountTimer();
        return;
      }
      const root = ensureTimerRoot();
      root.render(
        React.createElement(VisualTimerOverlay, {
          job,
          onPause: () => {
            void b.runtime.sendMessage({
              type: 'PAUSE_JOB',
              tabId: job.tabId,
            } satisfies ExtensionMessage);
          },
          onResume: () => {
            void b.runtime.sendMessage({
              type: 'RESUME_JOB',
              tabId: job.tabId,
            } satisfies ExtensionMessage);
          },
          onStop: () => {
            void b.runtime.sendMessage({
              type: 'STOP_JOB',
              tabId: job.tabId,
            } satisfies ExtensionMessage);
          },
        }),
      );
    }

    async function executeScanAndEffects(
      job: TabJob,
      source: 'after_load' | 'realtime' | 'xhr' | 'manual',
    ): Promise<void> {
      const captcha = job.urlConfig.detectCaptcha
        ? detectCaptchaInDocument(document)
        : { detected: false };
      const errorPage = job.urlConfig.detectErrorPage
        ? detectErrorPage({
            doc: document,
            url: window.location.href,
            monitoredCodes: job.urlConfig.errorStatusCodes,
          })
        : { detected: false };

      const monitorResult = job.monitor.enabled
        ? evaluatePageMonitor({
            doc: document,
            config: job.monitor,
            previousSnapshot: job.lastSnapshot,
            previousHash: job.lastSnapshotHash,
            previousNumber: job.lastNumericValue,
          })
        : undefined;

      // Apply on-page visual & click effects when keyword/change matched
      if (monitorResult?.triggered && job.monitor.enabled) {
        const container =
          (job.monitor.customAreaEnabled && job.monitor.customAreaSelector
            ? resolveCustomAreaElement(
                document,
                job.monitor.customAreaSelector,
                job.monitor.customAreaSelectorType,
              )
            : null) ?? document.body;

        let highlighted: HTMLElement[] = [];
        if (job.monitor.highlightDetected && container) {
          highlighted = highlightDetectedKeywords({
            root: container,
            keywords: monitorResult.matchedKeywords,
            color: job.monitor.highlightColor,
          });
        }
        if (job.monitor.scrollToDetected && highlighted.length > 0) {
          scrollToDetectedElement(highlighted, 0);
        }
        if (job.monitor.autoClickOnMatch) {
          await autoClickOnKeywordMatch({
            doc: document,
            matchedElements: highlighted,
            companionSelector: job.monitor.autoClickCompanionSelector,
            delayMs: job.monitor.autoClickDelayMs,
            alreadyClickedCount: job.autoClickCount,
            maxAutoClicks: job.monitor.maxAutoClicks,
          });
        }

        // Run matching on_detection scripts
        const state = await getGlobalState();
        await executeMatchingScripts({
          scripts: state.scripts,
          url: window.location.href,
          timing: 'on_detection',
          doc: document,
          win: window,
        });
      }

      if (captcha.detected || errorPage.detected || monitorResult) {
        await b.runtime.sendMessage({
          type: 'PAGE_SCAN_REPORT',
          tabId: job.tabId,
          url: window.location.href,
          title: document.title,
          captcha,
          errorPage,
          monitorResult,
          source,
        } satisfies ExtensionMessage);
      }
    }

    function applyJobGuards(job: TabJob | null): void {
      cleanupKeepActive?.();
      cleanupKeepActive = null;
      cleanupInteraction?.();
      cleanupInteraction = null;
      cleanupMutation?.();
      cleanupMutation = null;

      currentJob = job;
      renderVisualTimer(job);

      if (!job) {
        clearHighlights(document);
        return;
      }

      if (job.status !== 'running') return;

      // Prevent Form Resubmission
      if (job.refresh.preventFormResubmission) {
        neutralizeFormResubmission(window, document, {
          protectDirtyForms: job.refresh.protectDirtyForms,
        });
      }

      // Keep Page Active in Background
      if (job.refresh.keepPageActive) {
        cleanupKeepActive = enableKeepPageActive(document, window);
      }

      // Stop on User Interaction
      if (job.refresh.stopOnInteraction) {
        cleanupInteraction = attachUserInteractionDetector((eventType) => {
          void b.runtime.sendMessage({
            type: 'USER_INTERACTION',
            tabId: job.tabId,
            eventType,
          } satisfies ExtensionMessage);
        });
      }

      // Real-Time Detection During Refresh (MutationObserver)
      if (job.monitor.enabled && job.monitor.realTimeMutationObserver && document.body) {
        const area =
          (job.monitor.customAreaEnabled && job.monitor.customAreaSelector
            ? resolveCustomAreaElement(
                document,
                job.monitor.customAreaSelector,
                job.monitor.customAreaSelectorType,
              )
            : null) ?? document.body;

        cleanupMutation = attachRealTimeMonitor({
          root: area,
          debounceMs: job.monitor.mutationDebounceMs,
          onMutate: () => {
            if (currentJob?.status === 'running') {
              void executeScanAndEffects(currentJob, 'realtime');
            }
          },
        });
      }
    }

    // In-page keyboard shortcut listener (for custom user-defined hotkeys)
    document.addEventListener('keydown', (event) => {
      if (!event.altKey && !event.ctrlKey && !event.metaKey) return;
      void getGlobalState().then((state) => {
        const matched = matchHotkeyEvent(event, state.hotkeys);
        if (matched) {
          event.preventDefault();
          void b.runtime.sendMessage({
            type: 'TRIGGER_HOTKEY',
            command: matched,
          } satisfies ExtensionMessage);
        }
      });
    });

    // Listen for messages from background / popup / options
    b.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || typeof msg !== 'object' || !('type' in msg)) return undefined;
      const message = msg as ExtensionMessage;

      if (message.type === 'SYNC_JOB_TO_CONTENT') {
        applyJobGuards(message.job);
        sendResponse({ ok: true });
        return undefined;
      }

      if (message.type === 'START_ELEMENT_PICKER') {
        cleanupPicker?.();
        cleanupPicker = startInteractiveElementPicker({
          doc: document,
          onSelect: ({ selector, previewText }) => {
            cleanupPicker = null;
            void b.runtime.sendMessage({
              type: 'ELEMENT_PICKED',
              tabId: message.tabId,
              selector,
              previewText,
            } satisfies ExtensionMessage);
          },
          onCancel: () => {
            cleanupPicker = null;
          },
        });
        sendResponse({ ok: true });
        return undefined;
      }

      if (message.type === 'EXECUTE_XHR_REFRESH') {
        void (async () => {
          const outcome = await performXhrRefresh({
            url: window.location.href,
            doc: document,
            win: window,
            hardRefresh: message.job.refresh.hardRefresh,
            customAreaEnabled: message.job.monitor.customAreaEnabled,
            customAreaSelector: message.job.monitor.customAreaSelector,
            customAreaSelectorType: message.job.monitor.customAreaSelectorType,
            xhrFallbackToFull: message.job.monitor.xhrFallbackToFull,
            monitoredErrorCodes: message.job.urlConfig.errorStatusCodes,
          });
          if (!outcome.ok && outcome.shouldFallbackToFull) {
            window.location.reload();
            sendResponse({ ok: true, fallback: true });
            return;
          }
          if (outcome.captcha.detected || outcome.errorPage.detected) {
            await b.runtime.sendMessage({
              type: 'PAGE_SCAN_REPORT',
              tabId: message.job.tabId,
              url: window.location.href,
              title: document.title,
              captcha: outcome.captcha,
              errorPage: outcome.errorPage,
              source: 'xhr',
            } satisfies ExtensionMessage);
          } else {
            const state = await getGlobalState();
            await executeMatchingScripts({
              scripts: state.scripts,
              url: window.location.href,
              timing: 'after_load',
              doc: document,
              win: window,
            });
            if (message.job.autoClickTargets.length > 0) {
              await executeAutoClickTargets(document, message.job.autoClickTargets);
            }
            await executeScanAndEffects(message.job, 'xhr');
          }
          sendResponse({ ok: outcome.ok });
        })();
        return true;
      }

      if (message.type === 'RUN_MACRO_ON_TAB') {
        void (async () => {
          const state = await getGlobalState();
          const macro = state.macros.find((m) => m.id === message.macroId);
          if (!macro) {
            sendResponse({ ok: false, error: 'Macro not found' });
            return;
          }
          const report = await executeAutomationMacro({
            macro,
            doc: document,
            win: window,
          });
          sendResponse(report);
        })();
        return true;
      }

      return undefined;
    });

    // Initial bootstrap when page loads: fetch job for this tab, run after_load hooks & scan
    void (async () => {
      try {
        const res = (await b.runtime.sendMessage({
          type: 'GET_JOB',
          tabId: 0,
        } satisfies ExtensionMessage)) as { ok?: boolean; job?: TabJob | null };
        const job = res?.job ?? null;
        if (!job) return;
        applyJobGuards(job);

        if (job.status === 'running') {
          const state = await getGlobalState();
          await runDetectionAfterLoad({
            doc: document,
            win: window,
            postLoadDelayMs: job.monitor.runAfterLoad
              ? job.monitor.postLoadDelayMs
              : 0,
            task: async () => {
              await executeMatchingScripts({
                scripts: state.scripts,
                url: window.location.href,
                timing: 'after_load',
                doc: document,
                win: window,
              });
              if (job.autoClickTargets.length > 0) {
                await executeAutoClickTargets(document, job.autoClickTargets);
              }
              await executeScanAndEffects(job, 'after_load');
            },
          });
        }
      } catch {
        // Extension context invalidated or background waking up
      }
    })();
  },
});
