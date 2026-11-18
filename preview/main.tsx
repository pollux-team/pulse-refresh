import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  Bell,
  CheckCircle2,
  Cpu,
  Lock,
  PanelTop,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
} from 'lucide-react';
import '@/src/styles/globals.css';
import { VisualTimerOverlay } from '@/src/components/content/VisualTimerOverlay';
import {
  type DashboardSectionId,
  OptionsApp,
} from '@/src/components/options/OptionsApp';
import { PopupApp } from '@/src/components/popup/PopupApp';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { getBrowser } from '@/src/lib/browser-api';
import {
  autoClickOnKeywordMatch,
  clearHighlights,
  highlightDetectedKeywords,
  startInteractiveElementPicker,
} from '@/src/lib/dom-actions';
import { evaluatePageMonitor } from '@/src/lib/monitor-engine';
import { getTabJob, subscribeStorageChanges } from '@/src/lib/storage';
import type { ExtensionMessage, TabJob } from '@/src/lib/types';
import { detectCaptchaInDocument } from '@/src/lib/url-automation';
import { installPreviewBrowserShim } from './browser-shim';

const bus = installPreviewBrowserShim();

const VALID_SECTIONS = new Set<DashboardSectionId>([
  'refresh',
  'url',
  'monitor',
  'alerts',
  'automation',
  'sync',
  'logs',
]);

function readInitialQuery(): {
  view: 'popup' | 'settings';
  section: DashboardSectionId;
  hideChrome: boolean;
  initialStock: boolean;
  initialPrice: number;
} {
  const params = new URLSearchParams(window.location.search);
  const rawView = params.get('view');
  const rawSection = params.get('section') as DashboardSectionId | null;
  const section: DashboardSectionId =
    rawSection && VALID_SECTIONS.has(rawSection) ? rawSection : 'refresh';
  return {
    view: rawView === 'settings' ? 'settings' : 'popup',
    section,
    hideChrome: params.get('chrome') === 'none',
    initialStock: params.get('stock') === '1',
    initialPrice: Number(params.get('price')) || 999,
  };
}

const STORE_URL = 'https://store.nordicgear.com/products/rtx-5080-founders';
const STORE_TITLE = 'GeForce RTX 5080 Founders Edition — NordicGear';

function PulseRefreshPreview() {
  const query = useMemo(() => readInitialQuery(), []);
  const [view, setView] = useState<'popup' | 'settings'>(query.view);
  const [section] = useState<DashboardSectionId>(query.section);
  const [job, setJob] = useState<TabJob | null>(null);
  const [inStock, setInStock] = useState(query.initialStock);
  const [price, setPrice] = useState(query.initialPrice);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [cartClicks, setCartClicks] = useState(0);
  const [reloads, setReloads] = useState(0);
  const [notifications, setNotifications] = useState(bus.notifications);
  const sandboxRef = useRef<HTMLDivElement | null>(null);
  const pickerReqRef = useRef(0);

  useEffect(() => {
    const syncJob = async () => setJob(await getTabJob(1));
    void syncJob();
    return subscribeStorageChanges(() => void syncJob());
  }, []);

  useEffect(() => {
    return bus.subscribe(() => {
      setReloads(bus.reloads);
      setNotifications([...bus.notifications]);

      if (bus.pickerRequested > pickerReqRef.current && sandboxRef.current) {
        pickerReqRef.current = bus.pickerRequested;
        startInteractiveElementPicker({
          doc: document,
          onSelect: ({ selector, previewText }) => {
            void getBrowser().runtime.sendMessage({
              type: 'ELEMENT_PICKED',
              tabId: 1,
              selector,
              previewText,
            } satisfies ExtensionMessage);
          },
        });
      }
    });
  }, []);

  useEffect(() => {
    if (!job || job.status !== 'running' || !sandboxRef.current) return;
    const wrapperDoc = new DOMParser().parseFromString(
      `<html><head><title>${STORE_TITLE}</title></head><body>${sandboxRef.current.innerHTML}</body></html>`,
      'text/html',
    );
    const captcha = detectCaptchaInDocument(wrapperDoc);
    const monitorRes = job.monitor.enabled
      ? evaluatePageMonitor({
          doc: wrapperDoc,
          config: job.monitor,
          previousSnapshot: job.lastSnapshot,
          previousHash: job.lastSnapshotHash,
          previousNumber: job.lastNumericValue,
        })
      : undefined;

    if (monitorRes?.triggered && sandboxRef.current) {
      let marks: HTMLElement[] = [];
      if (job.monitor.highlightDetected) {
        marks = highlightDetectedKeywords({
          root: sandboxRef.current,
          keywords: monitorRes.matchedKeywords,
          color: job.monitor.highlightColor,
        });
      }
      if (job.monitor.autoClickOnMatch) {
        void autoClickOnKeywordMatch({
          doc: document,
          matchedElements: marks,
          companionSelector: '#store-add-to-cart',
          maxAutoClicks: 1,
        });
      }
    } else if (sandboxRef.current) {
      clearHighlights(sandboxRef.current);
    }

    if (captcha.detected || monitorRes?.triggered) {
      void getBrowser().runtime.sendMessage({
        type: 'PAGE_SCAN_REPORT',
        tabId: 1,
        url: STORE_URL,
        title: STORE_TITLE,
        captcha,
        monitorResult: monitorRes,
        source: job.monitor.refreshType === 'xhr' ? 'xhr' : 'after_load',
      } satisfies ExtensionMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloads, inStock, price, showCaptcha]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {!query.hideChrome && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 text-slate-100 px-5 py-2.5 text-xs border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <img
              src="/icon/32.png"
              alt="PulseRefresh"
              className="h-5 w-5 rounded-md"
            />
            <span className="font-semibold tracking-tight">PulseRefresh</span>
            <span className="hidden sm:inline text-slate-400">
              Auto Refresh &amp; Page Monitor
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setView('popup')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors cursor-pointer ${
                view === 'popup'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              <PanelTop className="h-3.5 w-3.5" /> Extension Popup
            </button>
            <button
              type="button"
              onClick={() => setView('settings')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors cursor-pointer ${
                view === 'settings'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              <Settings className="h-3.5 w-3.5" /> Full Settings
            </button>
          </div>
        </div>
      )}

      {view === 'settings' ? (
        <OptionsApp initialSection={section} embedded={!query.hideChrome} />
      ) : (
        <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 lg:grid-cols-12 gap-6 p-6 items-start">
          {/* Extension Toolbar Popup */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <PopupApp embedded onOpenOptions={() => setView('settings')} />
          </div>

          {/* Monitored Browser Tab */}
          <div className="lg:col-span-7 space-y-4">
            <div className="relative rounded-2xl border border-border bg-card shadow-lg overflow-hidden min-h-[560px] flex flex-col">
              {/* Browser Address Bar */}
              <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-2.5 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400 shrink-0" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shrink-0" />
                  <span className="ml-2 inline-flex items-center gap-1.5 rounded-md bg-background px-2.5 py-1 text-[11px] text-muted-foreground border border-border truncate">
                    <Lock className="h-3 w-3 text-emerald-600 shrink-0" />
                    store.nordicgear.com/products/rtx-5080-founders
                  </span>
                </div>
                <Badge variant="outline" className="tabular-nums shrink-0">
                  Refreshes: {job?.refreshCount ?? reloads}
                </Badge>
              </div>

              {/* Product Listing Content */}
              <div ref={sandboxRef} className="flex-1 p-6 space-y-5">
                {showCaptcha ? (
                  <div className="g-recaptcha rounded-xl border border-amber-400/70 bg-amber-50 dark:bg-amber-950/30 p-6 text-center space-y-2">
                    <ShieldCheck className="h-7 w-7 text-amber-600 mx-auto" />
                    <h3 className="text-base font-bold">Security Verification Required</h3>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto">
                      Automated verification detected. PulseRefresh pauses refreshes
                      automatically until you finish the check.
                    </p>
                  </div>
                ) : (
                  <div id="product-buybox" className="space-y-5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">NordicGear</span>
                      <span>Components / Graphics Cards</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center rounded-xl border border-border bg-muted/20 p-4">
                      <div className="sm:col-span-4 flex h-32 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-emerald-400 shadow-inner">
                        <div className="text-center">
                          <Cpu className="h-10 w-10 mx-auto" />
                          <span className="mt-1.5 block text-[10px] font-semibold tracking-widest uppercase text-slate-300">
                            16GB GDDR7
                          </span>
                        </div>
                      </div>
                      <div className="sm:col-span-8 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant={inStock ? 'success' : 'destructive'}>
                            {inStock ? 'In Stock — Ready to Ship' : 'Out of Stock'}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            SKU: NG-5080-FE
                          </span>
                        </div>
                        <h2 className="text-lg font-bold tracking-tight">
                          GeForce RTX 5080 Founders Edition
                        </h2>
                        <div className="flex items-baseline justify-between gap-3 pt-1">
                          <div className="flex items-baseline gap-2">
                            <span
                              data-testid="product-price"
                              className="text-2xl font-extrabold tabular-nums text-primary"
                            >
                              ${price}.00
                            </span>
                            {price < 999 && (
                              <span className="text-xs text-muted-foreground line-through tabular-nums">
                                $999.00
                              </span>
                            )}
                          </div>
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Truck className="h-3.5 w-3.5" /> Express Delivery
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        id="store-add-to-cart"
                        disabled={!inStock}
                        onClick={() => setCartClicks((c) => c + 1)}
                      >
                        <ShoppingCart className="h-4 w-4" />
                        {inStock ? 'Add to Cart' : 'Sold Out'}
                      </Button>
                      {cartClicks > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                          <CheckCircle2 className="h-4 w-4" /> Added to cart ({cartClicks})
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Interactive Page State Controls */}
                <div
                  data-pulserefresh-ui="page-controls"
                  className="pt-4 border-t border-border space-y-2"
                >
                  <div className="text-[11px] font-medium text-muted-foreground">
                    Test Live Page Changes
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={inStock ? 'default' : 'outline'}
                      onClick={() => {
                        setShowCaptcha(false);
                        setInStock((v) => !v);
                      }}
                    >
                      {inStock ? 'Mark Out of Stock' : 'Restock Item ("In Stock")'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPrice((p) => (p > 900 ? 849 : 999))}
                    >
                      {price > 900 ? 'Drop Price to $849' : 'Reset Price to $999'}
                    </Button>
                    <Button
                      size="sm"
                      variant={showCaptcha ? 'destructive' : 'outline'}
                      onClick={() => setShowCaptcha((c) => !c)}
                    >
                      {showCaptcha ? 'Clear Verification' : 'Show CAPTCHA'}
                    </Button>
                  </div>
                </div>
              </div>

              {/* On-Page Visual Countdown Timer Overlay */}
              {job && (
                <VisualTimerOverlay
                  job={job}
                  contained
                  onPause={() =>
                    void getBrowser().runtime.sendMessage({
                      type: 'PAUSE_JOB',
                      tabId: 1,
                    } satisfies ExtensionMessage)
                  }
                  onResume={() =>
                    void getBrowser().runtime.sendMessage({
                      type: 'RESUME_JOB',
                      tabId: 1,
                    } satisfies ExtensionMessage)
                  }
                  onStop={() =>
                    void getBrowser().runtime.sendMessage({
                      type: 'STOP_JOB',
                      tabId: 1,
                    } satisfies ExtensionMessage)
                  }
                />
              )}
            </div>

            {/* Alert Notifications */}
            {notifications.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-2 shadow-xs">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Bell className="h-3.5 w-3.5 text-primary" /> Desktop Alerts (
                  {notifications.length})
                </div>
                {notifications.slice(0, 3).map((n) => (
                  <div
                    key={n.id}
                    className="rounded-lg bg-accent/60 border border-primary/20 px-3 py-2 text-xs"
                  >
                    <div className="font-semibold">{n.title}</div>
                    <div className="text-muted-foreground whitespace-pre-line">
                      {n.message}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PulseRefreshPreview />
  </React.StrictMode>,
);
