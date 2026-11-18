import React, { useState } from 'react';
import {
  ExternalLink,
  Globe,
  Pause,
  Play,
  Plus,
  ShieldAlert,
  Square,
  Timer,
  Trash2,
} from 'lucide-react';
import { VisualTimerOverlay } from '@/src/components/content/VisualTimerOverlay';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import { Input, Textarea } from '@/src/components/ui/input';
import { Label, Slider, Switch } from '@/src/components/ui/primitives';
import { Select } from '@/src/components/ui/select';
import { getBrowser } from '@/src/lib/browser-api';
import {
  createDefaultTabJob,
  DEFAULT_ERROR_STATUS_CODES,
  PREDEFINED_INTERVALS,
} from '@/src/lib/defaults';
import { customPartsToMs } from '@/src/lib/refresh-engine';
import type {
  ExtensionMessage,
  GlobalExtensionState,
  SettingsProfile,
  TabJob,
  UrlMatchType,
  VisualTimerPosition,
  VisualTimerStyle,
} from '@/src/lib/types';
import {
  buildActiveTabsSummary,
  matchesUrlPattern,
} from '@/src/lib/url-automation';
import { formatDuration, generateId } from '@/src/lib/utils';

interface PanelProps {
  profile: SettingsProfile;
  onUpdateProfile: (updater: (p: SettingsProfile) => SettingsProfile) => Promise<void>;
  state: GlobalExtensionState;
  onUpdateState: (updater: (s: GlobalExtensionState) => GlobalExtensionState) => Promise<void>;
  jobs: Record<number, TabJob>;
  onNotify: (msg: string) => void;
}

// ============================================================================
// 1. Refresh Controls Configuration Panel
// ============================================================================

export function RefreshControlsPanel({
  profile,
  onUpdateProfile,
  onNotify,
}: Pick<PanelProps, 'profile' | 'onUpdateProfile' | 'onNotify'>) {
  const r = profile.refresh;
  const [demoPaused, setDemoPaused] = useState(false);

  const demoJob: TabJob = {
    ...createDefaultTabJob({
      tabId: 999,
      url: 'https://store.example.com/item',
      title: 'Visual Timer Preview',
    }),
    status: demoPaused ? 'paused' : 'running',
    refresh: r,
    monitor: profile.monitor,
    refreshCount: 4,
    currentIntervalMs: 30_000,
    nextRefreshAt: Date.now() + 21_000,
    remainingMsOnPause: 21_000,
  };

  return (
    <div className="space-y-5">
      {/* Interval Strategies */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Interval & Countdown Controls</CardTitle>
              <CardDescription>
                Configure preset, custom, randomized, or scheduled refresh timers for{' '}
                <strong>{profile.name}</strong>.
              </CardDescription>
            </div>
            <Badge variant="outline">{r.intervalMode.toUpperCase()}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                ['predefined', 'Predefined Presets'],
                ['custom', 'Custom H:M:S:ms'],
                ['random', 'Random Range'],
                ['countdown', 'Countdown Timer'],
              ] as const
            ).map(([mode, title]) => (
              <Button
                key={mode}
                variant={r.intervalMode === mode ? 'default' : 'outline'}
                size="sm"
                onClick={() =>
                  void onUpdateProfile((p) => ({
                    ...p,
                    refresh: { ...p.refresh, intervalMode: mode },
                  }))
                }
              >
                {title}
              </Button>
            ))}
          </div>

          {/* Predefined Intervals */}
          <div className="space-y-2">
            <Label>Predefined Refresh Intervals</Label>
            <div className="flex flex-wrap gap-1.5">
              {PREDEFINED_INTERVALS.map((opt) => (
                <Button
                  key={opt.seconds}
                  size="sm"
                  variant={
                    r.intervalMode === 'predefined' &&
                    r.predefinedSeconds === opt.seconds
                      ? 'default'
                      : 'outline'
                  }
                  onClick={() =>
                    void onUpdateProfile((p) => ({
                      ...p,
                      refresh: {
                        ...p.refresh,
                        intervalMode: 'predefined',
                        predefinedSeconds: opt.seconds,
                      },
                    }))
                  }
                  className="tabular-nums"
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom + Random + Countdown Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-lg border border-border p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">Custom Refresh Interval</Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  = {formatDuration(customPartsToMs(r.customInterval))}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    ['hours', 'HR'],
                    ['minutes', 'MIN'],
                    ['seconds', 'SEC'],
                    ['milliseconds', 'MS'],
                  ] as const
                ).map(([key, shortLabel]) => (
                    <div key={key} className="space-y-1">
                      <span className="text-[10px] text-muted-foreground uppercase">
                        {shortLabel}
                      </span>
                      <Input
                        type="number"
                        min={0}
                        value={r.customInterval[key]}
                        onChange={(e) =>
                          void onUpdateProfile((p) => ({
                            ...p,
                            refresh: {
                              ...p.refresh,
                              intervalMode: 'custom',
                              customInterval: {
                                ...p.refresh.customInterval,
                                [key]: Math.max(0, Number(e.target.value) || 0),
                              },
                            },
                          }))
                        }
                        className="h-8 px-2 text-xs tabular-nums"
                      />
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">Random Refresh Interval</Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {r.randomMinSeconds}s – {r.randomMaxSeconds}s
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase">
                    Min (sec)
                  </span>
                  <Input
                    type="number"
                    min={1}
                    value={r.randomMinSeconds}
                    onChange={(e) =>
                      void onUpdateProfile((p) => ({
                        ...p,
                        refresh: {
                          ...p.refresh,
                          intervalMode: 'random',
                          randomMinSeconds: Math.max(1, Number(e.target.value) || 1),
                        },
                      }))
                    }
                    className="h-8 text-xs tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase">
                    Max (sec)
                  </span>
                  <Input
                    type="number"
                    min={1}
                    value={r.randomMaxSeconds}
                    onChange={(e) =>
                      void onUpdateProfile((p) => ({
                        ...p,
                        refresh: {
                          ...p.refresh,
                          intervalMode: 'random',
                          randomMaxSeconds: Math.max(1, Number(e.target.value) || 1),
                        },
                      }))
                    }
                    className="h-8 text-xs tabular-nums"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">Countdown & Count Limit</Label>
                <Timer className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase">
                    Countdown (s)
                  </span>
                  <Input
                    type="number"
                    min={1}
                    value={r.countdownDurationSeconds}
                    onChange={(e) =>
                      void onUpdateProfile((p) => ({
                        ...p,
                        refresh: {
                          ...p.refresh,
                          countdownDurationSeconds: Math.max(
                            1,
                            Number(e.target.value) || 1,
                          ),
                        },
                      }))
                    }
                    className="h-8 text-xs tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase">
                    Max Count (0=∞)
                  </span>
                  <Input
                    type="number"
                    min={0}
                    value={r.maxRefreshes}
                    onChange={(e) =>
                      void onUpdateProfile((p) => ({
                        ...p,
                        refresh: {
                          ...p.refresh,
                          maxRefreshes: Math.max(0, Number(e.target.value) || 0),
                        },
                      }))
                    }
                    className="h-8 text-xs tabular-nums"
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Visual Timer + Live Preview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>On-Page Visual Timer</CardTitle>
              <CardDescription>
                Shadow-DOM isolated countdown badge overlaid on refreshed tabs without
                affecting page CSS.
              </CardDescription>
            </div>
            <Switch
              checked={r.visualTimer.enabled}
              onCheckedChange={(v) =>
                void onUpdateProfile((p) => ({
                  ...p,
                  refresh: {
                    ...p.refresh,
                    visualTimer: { ...p.refresh.visualTimer, enabled: v },
                  },
                }))
              }
            />
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Corner Position</Label>
                <Select
                  value={r.visualTimer.position}
                  onChange={(e) =>
                    void onUpdateProfile((p) => ({
                      ...p,
                      refresh: {
                        ...p.refresh,
                        visualTimer: {
                          ...p.refresh.visualTimer,
                          position: e.target.value as VisualTimerPosition,
                        },
                      },
                    }))
                  }
                >
                  <option value="bottom-right">Bottom Right</option>
                  <option value="bottom-left">Bottom Left</option>
                  <option value="top-right">Top Right</option>
                  <option value="top-left">Top Left</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Display Style</Label>
                <Select
                  value={r.visualTimer.style}
                  onChange={(e) =>
                    void onUpdateProfile((p) => ({
                      ...p,
                      refresh: {
                        ...p.refresh,
                        visualTimer: {
                          ...p.refresh.visualTimer,
                          style: e.target.value as VisualTimerStyle,
                        },
                      },
                    }))
                  }
                >
                  <option value="ring">Ring + Digital</option>
                  <option value="pill">Compact Pill</option>
                  <option value="minimal">Minimal Clock</option>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <Label>Overlay Opacity</Label>
                <span className="tabular-nums text-muted-foreground">
                  {Math.round(r.visualTimer.opacity * 100)}%
                </span>
              </div>
              <Slider
                min={35}
                max={100}
                step={5}
                value={[Math.round(r.visualTimer.opacity * 100)]}
                onValueChange={([val]) =>
                  void onUpdateProfile((p) => ({
                    ...p,
                    refresh: {
                      ...p.refresh,
                      visualTimer: {
                        ...p.refresh.visualTimer,
                        opacity: (val ?? 90) / 100,
                      },
                    },
                  }))
                }
              />
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span>Show Inline Pause / Stop Buttons</span>
              <Switch
                checked={r.visualTimer.showControls}
                onCheckedChange={(v) =>
                  void onUpdateProfile((p) => ({
                    ...p,
                    refresh: {
                      ...p.refresh,
                      visualTimer: { ...p.refresh.visualTimer, showControls: v },
                    },
                  }))
                }
              />
            </div>
          </div>

          {/* Interactive Live Preview Stage */}
          <div className="relative h-40 rounded-xl border border-border bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800/70 p-4 overflow-hidden">
            <div className="text-[11px] font-medium text-muted-foreground">
              Overlay Position Preview
            </div>
            <div className="mt-3 space-y-2 max-w-[180px] opacity-50">
              <div className="h-2.5 w-28 rounded bg-slate-300 dark:bg-slate-700" />
              <div className="h-2 w-40 rounded bg-slate-200 dark:bg-slate-700/70" />
              <div className="h-2 w-32 rounded bg-slate-200 dark:bg-slate-700/70" />
            </div>
            <VisualTimerOverlay
              job={demoJob}
              contained
              onPause={() => setDemoPaused(true)}
              onResume={() => setDemoPaused(false)}
              onStop={() => onNotify('Timer preview stopped.')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Browser & Page Behavior Guards */}
      <Card>
        <CardHeader>
          <CardTitle>Reload Behavior & Page Guards</CardTitle>
          <CardDescription>
            Hard refresh, form resubmission shield, background tab keep-alive, and user
            interaction auto-stop.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              title: 'Hard Refresh (Bypass Cache)',
              desc: 'Forces fresh server fetch by bypassing disk/memory HTTP cache.',
              checked: r.hardRefresh,
              onChange: (v: boolean) =>
                onUpdateProfile((p) => ({
                  ...p,
                  refresh: { ...p.refresh, hardRefresh: v },
                })),
            },
            {
              title: 'Prevent Form Resubmission',
              desc: 'Replaces POST state with clean GET reloads so browser confirmation modals never block.',
              checked: r.preventFormResubmission,
              onChange: (v: boolean) =>
                onUpdateProfile((p) => ({
                  ...p,
                  refresh: { ...p.refresh, preventFormResubmission: v },
                })),
            },
            {
              title: 'Keep Page Active in Background',
              desc: 'Prevents background tab throttling and automatic tab discarding during active sessions.',
              checked: r.keepPageActive,
              onChange: (v: boolean) =>
                onUpdateProfile((p) => ({
                  ...p,
                  refresh: { ...p.refresh, keepPageActive: v },
                })),
            },
            {
              title: 'Stop on User Interaction',
              desc: `Automatically ${r.interactionAction}s refresh when you click, scroll, touch, or type.`,
              checked: r.stopOnInteraction,
              onChange: (v: boolean) =>
                onUpdateProfile((p) => ({
                  ...p,
                  refresh: { ...p.refresh, stopOnInteraction: v },
                })),
            },
          ].map((item) => (
            <div
              key={item.title}
              className="flex items-start justify-between gap-3 rounded-lg border border-border p-3.5"
            >
              <div className="space-y-0.5">
                <div className="text-sm font-medium">{item.title}</div>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Switch
                checked={item.checked}
                onCheckedChange={(v) => void item.onChange(v)}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// 2. URL & Tab Automation Configuration Panel
// ============================================================================

export function UrlAutomationPanel({
  profile,
  onUpdateProfile,
  state,
  onUpdateState,
  jobs,
  onNotify,
}: PanelProps) {
  const u = profile.urlConfig;
  const [ruleName, setRuleName] = useState('');
  const [rulePattern, setRulePattern] = useState('');
  const [ruleMatchType, setRuleMatchType] = useState<UrlMatchType>('wildcard');
  const [ruleInterval, setRuleInterval] = useState(15);
  const [testUrl, setTestUrl] = useState('');
  const [rotationDraft, setRotationDraft] = useState(() =>
    u.rotationUrls.join('\n'),
  );

  const summary = buildActiveTabsSummary(jobs);

  const sendMsg = (msg: ExtensionMessage) => getBrowser().runtime.sendMessage(msg);

  const handleAddAutoStart = async () => {
    if (!rulePattern.trim()) return;
    await onUpdateState((prev) => ({
      ...prev,
      autoStartRules: [
        ...prev.autoStartRules,
        {
          id: generateId('asr'),
          name: ruleName.trim() || rulePattern.trim(),
          pattern: rulePattern.trim(),
          matchType: ruleMatchType,
          intervalSeconds: Math.max(1, ruleInterval),
          profileId: profile.id,
          enabled: true,
        },
      ],
    }));
    setRuleName('');
    setRulePattern('');
    onNotify('Added Auto Start URL rule.');
  };

  return (
    <div className="space-y-5">
      {/* Active Tabs Manager */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Active Tabs List</CardTitle>
              <CardDescription>
                Live control across all browser windows ({summary.runningCount} running,{' '}
                {summary.pausedCount} paused, {summary.totalRefreshes} total refreshes).
              </CardDescription>
            </div>
            {summary.jobs.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void sendMsg({ type: 'STOP_ALL_JOBS' })}
              >
                <Square className="h-3.5 w-3.5" /> Stop All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {summary.jobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
              No active tabs refreshing right now. Start one from the toolbar Popup or via
              an Auto Start URL rule below.
            </div>
          ) : (
            <div className="space-y-2">
              {summary.jobs.map((job) => (
                <div
                  key={job.tabId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {job.title || job.url}
                      </span>
                      <Badge
                        variant={
                          job.status === 'running'
                            ? 'success'
                            : job.status === 'paused'
                              ? 'warning'
                              : 'destructive'
                        }
                      >
                        {job.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      Tab #{job.tabId} · {job.url} · Refreshed {job.refreshCount}× (
                      {job.monitor.refreshType.toUpperCase()})
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void sendMsg({
                          type: 'FOCUS_TAB',
                          tabId: job.tabId,
                          windowId: job.windowId,
                        })
                      }
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Focus
                    </Button>
                    {(job.status === 'running' || job.status === 'paused') && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void sendMsg({
                            type:
                              job.status === 'running' ? 'PAUSE_JOB' : 'RESUME_JOB',
                            tabId: job.tabId,
                          })
                        }
                      >
                        {job.status === 'running' ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        void sendMsg({ type: 'STOP_JOB', tabId: job.tabId })
                      }
                    >
                      Stop
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto Start URLs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" /> Auto Start URLs
          </CardTitle>
          <CardDescription>
            Automatically begin refreshing whenever a browser tab opens a matching URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <Input
              placeholder="Rule name (e.g. Ticket Queue)"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              className="sm:col-span-3"
            />
            <Input
              placeholder="https://shop.example.com/drop/*"
              value={rulePattern}
              onChange={(e) => setRulePattern(e.target.value)}
              className="sm:col-span-4 font-mono text-xs"
            />
            <Select
              value={ruleMatchType}
              onChange={(e) => setRuleMatchType(e.target.value as UrlMatchType)}
              className="sm:col-span-2"
            >
              <option value="wildcard">Wildcard (*)</option>
              <option value="prefix">Prefix</option>
              <option value="exact">Exact</option>
              <option value="regex">Regex</option>
            </Select>
            <Input
              type="number"
              min={1}
              value={ruleInterval}
              onChange={(e) => setRuleInterval(Number(e.target.value) || 10)}
              className="sm:col-span-1 tabular-nums"
              title="Interval seconds"
            />
            <Button onClick={() => void handleAddAutoStart()} className="sm:col-span-2">
              <Plus className="h-4 w-4" /> Add Rule
            </Button>
          </div>

          {rulePattern && (
            <div className="flex items-center gap-2 text-xs">
              <Input
                placeholder="Paste a sample URL here to test pattern match..."
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                className="h-8 text-xs"
              />
              {testUrl && (
                <Badge
                  variant={
                    matchesUrlPattern(testUrl, rulePattern, ruleMatchType)
                      ? 'success'
                      : 'destructive'
                  }
                >
                  {matchesUrlPattern(testUrl, rulePattern, ruleMatchType)
                    ? 'Matches'
                    : 'No match'}
                </Badge>
              )}
            </div>
          )}

          {state.autoStartRules.length > 0 && (
            <div className="space-y-2">
              {state.autoStartRules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={(v) =>
                        void onUpdateState((s) => ({
                          ...s,
                          autoStartRules: s.autoStartRules.map((r) =>
                            r.id === rule.id ? { ...r, enabled: v } : r,
                          ),
                        }))
                      }
                    />
                    <span className="font-medium">{rule.name}</span>
                    <Badge variant="outline">{rule.matchType}</Badge>
                    <code className="truncate text-muted-foreground">{rule.pattern}</code>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary">{rule.intervalSeconds}s</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        void onUpdateState((s) => ({
                          ...s,
                          autoStartRules: s.autoStartRules.filter(
                            (r) => r.id !== rule.id,
                          ),
                        }))
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Predefined URL + Redirection + Captcha + Error + Sleep */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" /> Predefined URL, Redirects,
            Captcha, Error & Sleep Guards
          </CardTitle>
          <CardDescription>
            Fine-grained resilience controls for unattended long-running sessions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">Refresh Predefined URL / Rotation</Label>
                <Switch
                  checked={u.usePredefinedUrl}
                  onCheckedChange={(v) =>
                    void onUpdateProfile((p) => ({
                      ...p,
                      urlConfig: { ...p.urlConfig, usePredefinedUrl: v },
                    }))
                  }
                />
              </div>
              <Input
                placeholder="https://example.com/canonical-url"
                value={u.predefinedUrl}
                onChange={(e) =>
                  void onUpdateProfile((p) => ({
                    ...p,
                    urlConfig: { ...p.urlConfig, predefinedUrl: e.target.value },
                  }))
                }
                className="text-xs font-mono"
              />
              <Textarea
                placeholder="Optional multi-URL rotation list (one https:// URL per line)"
                value={rotationDraft}
                onChange={(e) => {
                  setRotationDraft(e.target.value);
                  const urls = e.target.value
                    .split('\n')
                    .map((l) => l.trim())
                    .filter(Boolean);
                  void onUpdateProfile((p) => ({
                    ...p,
                    urlConfig: { ...p.urlConfig, rotationUrls: urls },
                  }));
                }}
                className="text-xs font-mono min-h-[68px]"
              />
            </div>

            <div className="rounded-lg border border-border p-3.5 space-y-3">
              <div className="space-y-1.5">
                <Label>URL Changes & Redirection Handling</Label>
                <Select
                  value={u.redirectPolicy}
                  onChange={(e) =>
                    void onUpdateProfile((p) => ({
                      ...p,
                      urlConfig: {
                        ...p.urlConfig,
                        redirectPolicy: e.target
                          .value as typeof u.redirectPolicy,
                      },
                    }))
                  }
                >
                  <option value="follow">Follow redirects & continue</option>
                  <option value="allow-same-origin">
                    Allow same-origin, stop on external redirect
                  </option>
                  <option value="stop">Stop & alert on any URL change</option>
                  <option value="revert">Revert back to initial URL</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Error Page Action ({DEFAULT_ERROR_STATUS_CODES.join(', ')})</Label>
                <Select
                  value={u.errorAction}
                  onChange={(e) =>
                    void onUpdateProfile((p) => ({
                      ...p,
                      urlConfig: {
                        ...p.urlConfig,
                        errorAction: e.target.value as typeof u.errorAction,
                      },
                    }))
                  }
                >
                  <option value="alert-and-pause">Alert & Pause refresh</option>
                  <option value="backoff">Exponential retry backoff (2×, 4×, 8×...)</option>
                  <option value="continue">Ignore & keep refreshing</option>
                  <option value="stop">Stop silently</option>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-2 pt-1 text-xs">
                <label className="flex items-center justify-between cursor-pointer">
                  <span>Auto-Pause on CAPTCHA (reCAPTCHA, hCaptcha, Turnstile)</span>
                  <Switch
                    checked={u.detectCaptcha}
                    onCheckedChange={(v) =>
                      void onUpdateProfile((p) => ({
                        ...p,
                        urlConfig: { ...p.urlConfig, detectCaptcha: v },
                      }))
                    }
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span>Error Page Detection (HTTP 4xx/5xx & Net Errors)</span>
                  <Switch
                    checked={u.detectErrorPage}
                    onCheckedChange={(v) =>
                      void onUpdateProfile((p) => ({
                        ...p,
                        urlConfig: { ...p.urlConfig, detectErrorPage: v },
                      }))
                    }
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span>Prevent System Sleep While Refreshing</span>
                  <Switch
                    checked={u.preventSystemSleep}
                    onCheckedChange={(v) =>
                      void onUpdateProfile((p) => ({
                        ...p,
                        urlConfig: { ...p.urlConfig, preventSystemSleep: v },
                      }))
                    }
                  />
                </label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
