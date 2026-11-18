import React, { useCallback, useEffect, useState } from 'react';
import {
  Crosshair,
  ExternalLink,
  Eye,
  Layers,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Square,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import {
  Label,
  Progress,
  Separator,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/src/components/ui/primitives';
import { Select } from '@/src/components/ui/select';
import { getBrowser } from '@/src/lib/browser-api';
import {
  createDefaultMonitorConfig,
  createDefaultRefreshConfig,
  createDefaultUrlConfig,
  PREDEFINED_INTERVALS,
} from '@/src/lib/defaults';
import { instantiateKeywordTemplate, validateExpression } from '@/src/lib/expression-engine';
import { getCountdownProgress } from '@/src/lib/refresh-engine';
import {
  getAllTabJobs,
  getGlobalState,
  subscribeStorageChanges,
} from '@/src/lib/storage';
import type {
  ExpressionType,
  ExtensionMessage,
  GlobalExtensionState,
  IntervalMode,
  PageMonitorConfig,
  RefreshControlsConfig,
  TabJob,
  UrlJobConfig,
} from '@/src/lib/types';
import { buildActiveTabsSummary } from '@/src/lib/url-automation';
import { cn, formatCountdown, formatDuration, generateId } from '@/src/lib/utils';

export interface PopupAppProps {
  onOpenOptions?: () => void;
  embedded?: boolean;
}

export function PopupApp({ onOpenOptions, embedded = false }: PopupAppProps) {
  const [activeTabInfo, setActiveTabInfo] = useState<{
    id: number;
    windowId: number;
    url: string;
    title: string;
  }>({
    id: 1,
    windowId: 1,
    url: 'https://example.com',
    title: 'Current Tab',
  });

  const [globalState, setGlobalState] = useState<GlobalExtensionState | null>(null);
  const [allJobs, setAllJobs] = useState<Record<number, TabJob>>({});
  const [refresh, setRefresh] = useState<RefreshControlsConfig>(() =>
    createDefaultRefreshConfig(),
  );
  const [urlConfig, setUrlConfig] = useState<UrlJobConfig>(() =>
    createDefaultUrlConfig(),
  );
  const [monitor, setMonitor] = useState<PageMonitorConfig>(() =>
    createDefaultMonitorConfig(),
  );
  const [selectedProfileId, setSelectedProfileId] = useState<string>('profile_default');
  const [newKeyword, setNewKeyword] = useState('');
  const [newExprType, setNewExprType] = useState<ExpressionType>('plain');
  const [kwError, setKwError] = useState<string | null>(null);
  const [targetClock, setTargetClock] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [hydratedTabId, setHydratedTabId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    const b = getBrowser();
    const [state, jobs, tabs] = await Promise.all([
      getGlobalState(),
      getAllTabJobs(),
      b.tabs.query({ active: true, currentWindow: true }).catch(() => []),
    ]);

    setGlobalState(state);
    setAllJobs(jobs);

    const currentTab = tabs[0];
    const tabId = currentTab?.id ?? 1;
    setActiveTabInfo({
      id: tabId,
      windowId: currentTab?.windowId ?? 1,
      url: currentTab?.url || 'https://example.com',
      title: currentTab?.title || 'Active Tab',
    });

    const job = jobs[tabId];
    if (job && hydratedTabId !== tabId) {
      setRefresh(job.refresh);
      setUrlConfig(job.urlConfig);
      setMonitor(job.monitor);
      setSelectedProfileId(job.profileId || 'profile_default');
      setHydratedTabId(tabId);
    } else if (!job && hydratedTabId !== tabId) {
      const defProfile =
        state.profiles.find((p) => p.isDefault) ?? state.profiles[0];
      if (defProfile) {
        setRefresh(defProfile.refresh);
        setUrlConfig(defProfile.urlConfig);
        setMonitor(defProfile.monitor);
        setSelectedProfileId(defProfile.id);
      }
      setHydratedTabId(tabId);
    }
  }, [hydratedTabId]);

  useEffect(() => {
    void loadData();
    return subscribeStorageChanges(() => {
      void loadData();
    });
  }, [loadData]);

  const currentJob = allJobs[activeTabInfo.id] ?? null;
  const isRunning = currentJob?.status === 'running';
  const isPaused = currentJob?.status === 'paused';

  useEffect(() => {
    const hasAnyRunning = Object.values(allJobs).some((j) => j.status === 'running');
    if (!hasAnyRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [allJobs]);

  const sendMessage = async (msg: ExtensionMessage) => {
    return getBrowser().runtime.sendMessage(msg);
  };

  const handleStart = async () => {
    const finalRefresh: RefreshControlsConfig = { ...refresh };
    if (
      finalRefresh.intervalMode === 'countdown' &&
      finalRefresh.countdownMode === 'target_time' &&
      targetClock
    ) {
      const [hh, mm, ss = '0'] = targetClock.split(':');
      const d = new Date();
      d.setHours(Number(hh) || 0, Number(mm) || 0, Number(ss) || 0, 0);
      if (d.getTime() <= Date.now()) {
        d.setDate(d.getDate() + 1);
      }
      finalRefresh.countdownTargetTimestamp = d.getTime();
    }

    await sendMessage({
      type: 'START_JOB',
      tabId: activeTabInfo.id,
      windowId: activeTabInfo.windowId,
      url: activeTabInfo.url,
      title: activeTabInfo.title,
      overrides: {
        profileId: selectedProfileId,
        refresh: finalRefresh,
        urlConfig,
        monitor,
      },
    });
  };

  const handleProfileSwitch = (profileId: string) => {
    setSelectedProfileId(profileId);
    const prof = globalState?.profiles.find((p) => p.id === profileId);
    if (prof) {
      setRefresh(structuredClone(prof.refresh));
      setUrlConfig(structuredClone(prof.urlConfig));
      setMonitor(structuredClone(prof.monitor));
      void sendMessage({
        type: 'APPLY_PROFILE',
        tabId: activeTabInfo.id,
        profileId,
      });
    }
  };

  const handleAddKeyword = () => {
    const check = validateExpression(newKeyword, newExprType);
    if (!check.valid) {
      setKwError(check.error || 'Invalid expression');
      return;
    }
    setKwError(null);
    setMonitor((prev) => ({
      ...prev,
      enabled: true,
      keywords: [
        ...prev.keywords,
        {
          id: generateId('kw'),
          expression: newKeyword.trim(),
          type: newExprType,
          caseSensitive: false,
          wholeWord: false,
          enabled: true,
        },
      ],
    }));
    setNewKeyword('');
  };

  const handleApplyTemplate = (templateId: string) => {
    if (!templateId || !globalState) return;
    const tpl = globalState.templates.find((t) => t.id === templateId);
    if (!tpl) return;
    const defaults: Record<string, string> = {};
    tpl.variables.forEach((v) => {
      defaults[v] = v === 'maxPrice' ? '99' : '';
    });
    const rules = instantiateKeywordTemplate(tpl, defaults).filter((r) => r.enabled);
    setMonitor((prev) => ({
      ...prev,
      enabled: true,
      mode: tpl.mode,
      matchLogic: tpl.matchLogic,
      activeTemplateId: tpl.id,
      keywords: [...prev.keywords, ...rules],
    }));
  };

  const handleOpenDashboard = () => {
    if (onOpenOptions) {
      onOpenOptions();
      return;
    }
    const b = getBrowser();
    if (b.runtime?.openOptionsPage) {
      void b.runtime.openOptionsPage();
    }
  };

  const activeSummary = buildActiveTabsSummary(allJobs);
  const progress = currentJob
    ? getCountdownProgress(currentJob, now)
    : { remainingMs: 0, elapsedRatio: 0, remainingRatio: 0 };

  return (
    <div
      className={cn(
        'w-[400px] bg-background text-foreground flex flex-col select-none',
        embedded
          ? 'rounded-2xl border border-border shadow-xl overflow-hidden'
          : 'min-h-[540px]',
      )}
    >
      {/* Top Bar */}
      <header className="flex items-center justify-between gap-2 px-4 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/icon/48.png"
            alt="PulseRefresh"
            className="h-8 w-8 shrink-0 rounded-lg shadow-xs"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold tracking-tight">PulseRefresh</span>
              <Badge
                variant={
                  isRunning
                    ? 'success'
                    : isPaused
                      ? 'warning'
                      : currentJob?.status === 'captcha_paused' ||
                          currentJob?.status === 'error_paused'
                        ? 'destructive'
                        : 'secondary'
                }
                className="text-[10px] px-1.5 py-0 capitalize"
              >
                {currentJob && currentJob.status !== 'stopped'
                  ? currentJob.status.replace('_', ' ')
                  : 'Idle'}
              </Badge>
            </div>
            <p
              className="text-[11px] text-muted-foreground truncate max-w-[215px]"
              title={activeTabInfo.url}
            >
              {activeTabInfo.title || activeTabInfo.url}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={handleOpenDashboard}
          aria-label="Open settings"
          title="Open Settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </header>

      {/* Profile Selector Bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 border-b border-border">
        <Label htmlFor="popup-profile-select" className="text-[11px] text-muted-foreground shrink-0">
          Profile
        </Label>
        <Select
          id="popup-profile-select"
          value={selectedProfileId}
          onChange={(e) => handleProfileSwitch(e.target.value)}
          className="h-7 text-xs py-0"
        >
          {(globalState?.profiles ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.isDefault ? ' (Default)' : ''}
            </option>
          ))}
        </Select>
      </div>

      {/* Live Countdown Banner */}
      {currentJob &&
        !['idle', 'stopped'].includes(currentJob.status) && (
          <div
            data-testid="popup-live-banner"
            className="mx-4 mt-3 rounded-xl border border-primary/25 bg-accent/60 p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {isRunning
                    ? 'Next refresh in'
                    : currentJob.status === 'detected'
                      ? `Matched: ${currentJob.lastMatchedKeyword || 'Change'}`
                      : currentJob.lastError || currentJob.status}
                </div>
                <div className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
                  {isRunning || isPaused
                    ? formatCountdown(progress.remainingMs)
                    : `#${currentJob.refreshCount}`}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {(isRunning || isPaused) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void sendMessage({
                        type: isRunning ? 'PAUSE_JOB' : 'RESUME_JOB',
                        tabId: currentJob.tabId,
                      })
                    }
                  >
                    {isRunning ? (
                      <>
                        <Pause className="h-3.5 w-3.5" /> Pause
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" /> Resume
                      </>
                    )}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    void sendMessage({ type: 'STOP_JOB', tabId: currentJob.tabId })
                  }
                >
                  <Square className="h-3.5 w-3.5" /> Stop
                </Button>
              </div>
            </div>
            <Progress value={progress.remainingRatio * 100} className="h-1.5" />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
              <span>
                Refreshes: {currentJob.refreshCount}
                {currentJob.refresh.maxRefreshes > 0
                  ? ` / ${currentJob.refresh.maxRefreshes}`
                  : ''}
              </span>
              <span>
                {currentJob.monitor.refreshType.toUpperCase()} ·{' '}
                {formatDuration(currentJob.currentIntervalMs)}
              </span>
            </div>
          </div>
        )}

      {/* Main Popup Tabs */}
      <div className="flex-1 px-4 py-3">
        <Tabs defaultValue="refresh">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="refresh" className="gap-1">
              <RefreshCw className="h-3 w-3" /> Refresh
            </TabsTrigger>
            <TabsTrigger value="monitor" className="gap-1">
              <Eye className="h-3 w-3" /> Monitor
            </TabsTrigger>
            <TabsTrigger value="tabs" className="gap-1">
              <Layers className="h-3 w-3" /> Tabs ({activeSummary.jobs.length})
            </TabsTrigger>
          </TabsList>

          {/* ── TAB 1: REFRESH CONTROLS ─────────────────────────────── */}
          <TabsContent value="refresh" className="space-y-3">
            {/* Interval Mode Pills */}
            <div className="grid grid-cols-4 gap-1 rounded-lg border border-border bg-card p-1">
              {(
                [
                  ['predefined', 'Presets'],
                  ['custom', 'Custom'],
                  ['random', 'Random'],
                  ['countdown', 'Timer'],
                ] as Array<[IntervalMode, string]>
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() =>
                    setRefresh((prev) => ({ ...prev, intervalMode: mode }))
                  }
                  className={cn(
                    'rounded-md py-1 text-xs font-medium transition-colors cursor-pointer',
                    refresh.intervalMode === mode
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {refresh.intervalMode === 'predefined' && (
              <div className="grid grid-cols-5 gap-1.5">
                {PREDEFINED_INTERVALS.slice(0, 10).map((opt) => (
                  <button
                    key={opt.seconds}
                    type="button"
                    onClick={() =>
                      setRefresh((prev) => ({
                        ...prev,
                        predefinedSeconds: opt.seconds,
                      }))
                    }
                    className={cn(
                      'h-8 rounded-md border text-xs font-medium tabular-nums transition-colors cursor-pointer',
                      refresh.predefinedSeconds === opt.seconds
                        ? 'border-primary bg-accent text-accent-foreground font-semibold'
                        : 'border-border bg-card hover:bg-secondary',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {refresh.intervalMode === 'custom' && (
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    ['hours', 'Hours'],
                    ['minutes', 'Min'],
                    ['seconds', 'Sec'],
                    ['milliseconds', 'ms'],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field} className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">{label}</Label>
                    <Input
                      type="number"
                      min={0}
                      aria-label={`Custom ${label}`}
                      value={refresh.customInterval[field]}
                      onChange={(e) =>
                        setRefresh((prev) => ({
                          ...prev,
                          customInterval: {
                            ...prev.customInterval,
                            [field]: Math.max(0, Number(e.target.value) || 0),
                          },
                        }))
                      }
                      className="h-8 px-2 text-xs tabular-nums"
                    />
                  </div>
                ))}
              </div>
            )}

            {refresh.intervalMode === 'random' && (
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Min (sec)</Label>
                  <Input
                    type="number"
                    min={1}
                    aria-label="Random Min Seconds"
                    value={refresh.randomMinSeconds}
                    onChange={(e) =>
                      setRefresh((prev) => ({
                        ...prev,
                        randomMinSeconds: Math.max(1, Number(e.target.value) || 1),
                      }))
                    }
                    className="h-8 text-xs tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Max (sec)</Label>
                  <Input
                    type="number"
                    min={1}
                    aria-label="Random Max Seconds"
                    value={refresh.randomMaxSeconds}
                    onChange={(e) =>
                      setRefresh((prev) => ({
                        ...prev,
                        randomMaxSeconds: Math.max(1, Number(e.target.value) || 1),
                      }))
                    }
                    className="h-8 text-xs tabular-nums"
                  />
                </div>
              </div>
            )}

            {refresh.intervalMode === 'countdown' && (
              <div className="space-y-2 rounded-lg border border-border bg-card p-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    aria-label="Countdown Mode"
                    value={refresh.countdownMode}
                    onChange={(e) =>
                      setRefresh((prev) => ({
                        ...prev,
                        countdownMode: e.target.value as 'duration' | 'target_time',
                      }))
                    }
                    className="h-8 text-xs"
                  >
                    <option value="duration">After Duration (sec)</option>
                    <option value="target_time">At Clock Time</option>
                  </Select>
                  {refresh.countdownMode === 'duration' ? (
                    <Input
                      type="number"
                      min={1}
                      aria-label="Countdown Duration Seconds"
                      value={refresh.countdownDurationSeconds}
                      onChange={(e) =>
                        setRefresh((prev) => ({
                          ...prev,
                          countdownDurationSeconds: Math.max(
                            1,
                            Number(e.target.value) || 1,
                          ),
                        }))
                      }
                      className="h-8 text-xs tabular-nums"
                    />
                  ) : (
                    <Input
                      type="time"
                      step={1}
                      aria-label="Countdown Clock Time"
                      value={targetClock}
                      onChange={(e) => setTargetClock(e.target.value)}
                      className="h-8 text-xs tabular-nums"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Refresh Type + Count Limit */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Refresh Type</Label>
                <Select
                  aria-label="Refresh Type"
                  value={monitor.refreshType}
                  onChange={(e) =>
                    setMonitor((prev) => ({
                      ...prev,
                      refreshType: e.target.value as 'full' | 'xhr',
                    }))
                  }
                  className="h-8 text-xs"
                >
                  <option value="full">Full Page Reload</option>
                  <option value="xhr">XHR Silent Refresh</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Count Limit (0 = ∞)
                </Label>
                <Input
                  type="number"
                  min={0}
                  aria-label="Refresh Count Limit"
                  value={refresh.maxRefreshes}
                  onChange={(e) =>
                    setRefresh((prev) => ({
                      ...prev,
                      maxRefreshes: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                  className="h-8 text-xs tabular-nums"
                />
              </div>
            </div>

            <Separator />

            {/* Compact Toggle Grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span>Visual Timer</span>
                <Switch
                  checked={refresh.visualTimer.enabled}
                  onCheckedChange={(v) =>
                    setRefresh((p) => ({
                      ...p,
                      visualTimer: { ...p.visualTimer, enabled: v },
                    }))
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span>Hard Refresh</span>
                <Switch
                  checked={refresh.hardRefresh}
                  onCheckedChange={(v) =>
                    setRefresh((p) => ({ ...p, hardRefresh: v }))
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span>No Form Resubmit</span>
                <Switch
                  checked={refresh.preventFormResubmission}
                  onCheckedChange={(v) =>
                    setRefresh((p) => ({ ...p, preventFormResubmission: v }))
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span>Keep Tab Active</span>
                <Switch
                  checked={refresh.keepPageActive}
                  onCheckedChange={(v) =>
                    setRefresh((p) => ({ ...p, keepPageActive: v }))
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span>Stop on Click/Key</span>
                <Switch
                  checked={refresh.stopOnInteraction}
                  onCheckedChange={(v) =>
                    setRefresh((p) => ({ ...p, stopOnInteraction: v }))
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span>Prevent Sleep</span>
                <Switch
                  checked={urlConfig.preventSystemSleep}
                  onCheckedChange={(v) =>
                    setUrlConfig((p) => ({ ...p, preventSystemSleep: v }))
                  }
                />
              </label>
            </div>

            <Button className="w-full" onClick={() => void handleStart()}>
              <Play className="h-4 w-4" />
              {isRunning ? 'Update & Restart Refresh' : 'Start Auto Refresh'}
            </Button>
          </TabsContent>

          {/* ── TAB 2: PAGE MONITOR QUICK SETUP ─────────────────────── */}
          <TabsContent value="monitor" className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
              <div>
                <div className="text-xs font-semibold">Enable Page Monitor</div>
                <div className="text-[11px] text-muted-foreground">
                  Keywords, DOM diff, highlight & auto-click
                </div>
              </div>
              <Switch
                aria-label="Enable Page Monitor"
                checked={monitor.enabled}
                onCheckedChange={(v) => setMonitor((p) => ({ ...p, enabled: v }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Mode</Label>
                <Select
                  value={monitor.mode}
                  onChange={(e) =>
                    setMonitor((p) => ({
                      ...p,
                      mode: e.target.value as PageMonitorConfig['mode'],
                    }))
                  }
                  className="h-8 text-xs"
                >
                  <option value="keyword_found">Keyword Found</option>
                  <option value="keyword_lost">Keyword Lost</option>
                  <option value="any_change">Any Change</option>
                  <option value="numeric_threshold">Price / Number</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Template</Label>
                <Select
                  value=""
                  onChange={(e) => handleApplyTemplate(e.target.value)}
                  className="h-8 text-xs"
                >
                  <option value="">+ Apply Template...</option>
                  {(globalState?.templates ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {/* Add Keyword / Expression */}
            <div className="space-y-1.5">
              <div className="flex gap-1.5">
                <Select
                  value={newExprType}
                  onChange={(e) => setNewExprType(e.target.value as ExpressionType)}
                  className="h-8 text-xs w-[96px] shrink-0"
                >
                  <option value="plain">Text</option>
                  <option value="wildcard">Wildcard</option>
                  <option value="regex">Regex</option>
                  <option value="boolean">Boolean</option>
                  <option value="css">CSS</option>
                  <option value="xpath">XPath</option>
                  <option value="numeric">Number</option>
                </Select>
                <Input
                  placeholder="In Stock, /avail/i, < 50..."
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword()}
                  className="h-8 text-xs"
                />
                <Button size="icon" onClick={handleAddKeyword} aria-label="Add keyword">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {kwError && <p className="text-[11px] text-destructive">{kwError}</p>}
            </div>

            {monitor.keywords.length > 0 && (
              <div className="max-h-24 overflow-y-auto space-y-1 pr-0.5">
                {monitor.keywords.map((kw) => (
                  <div
                    key={kw.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2 py-1 text-xs"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {kw.type}
                      </Badge>
                      <span className="truncate font-mono text-[11px]">
                        {kw.expression}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setMonitor((p) => ({
                          ...p,
                          keywords: p.keywords.filter((x) => x.id !== kw.id),
                        }))
                      }
                      className="text-muted-foreground hover:text-destructive cursor-pointer"
                      aria-label="Remove keyword"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Custom Area Selector + Element Picker */}
            <div className="flex gap-1.5">
              <Input
                placeholder="Custom area CSS selector (optional)"
                value={monitor.customAreaSelector}
                onChange={(e) =>
                  setMonitor((p) => ({
                    ...p,
                    customAreaEnabled: e.target.value.trim().length > 0,
                    customAreaSelector: e.target.value,
                  }))
                }
                className="h-8 text-xs font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void sendMessage({
                    type: 'START_ELEMENT_PICKER',
                    tabId: activeTabInfo.id,
                  })
                }
                title="Pick page element visually"
              >
                <Crosshair className="h-3.5 w-3.5" /> Pick
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <label className="flex items-center justify-between cursor-pointer">
                <span>Highlight Match</span>
                <Switch
                  checked={monitor.highlightDetected}
                  onCheckedChange={(v) =>
                    setMonitor((p) => ({ ...p, highlightDetected: v }))
                  }
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span>Scroll to Match</span>
                <Switch
                  checked={monitor.scrollToDetected}
                  onCheckedChange={(v) =>
                    setMonitor((p) => ({ ...p, scrollToDetected: v }))
                  }
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span>Auto-Click Match</span>
                <Switch
                  checked={monitor.autoClickOnMatch}
                  onCheckedChange={(v) =>
                    setMonitor((p) => ({ ...p, autoClickOnMatch: v }))
                  }
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span>Keep Refreshing</span>
                <Switch
                  checked={monitor.continueOnDetection}
                  onCheckedChange={(v) =>
                    setMonitor((p) => ({ ...p, continueOnDetection: v }))
                  }
                />
              </label>
            </div>

            <Button className="w-full" onClick={() => void handleStart()}>
              <Eye className="h-4 w-4" /> Start Refresh & Monitor
            </Button>
          </TabsContent>

          {/* ── TAB 3: ACTIVE TABS LIST ─────────────────────────────── */}
          <TabsContent value="tabs" className="space-y-2.5">
            {activeSummary.jobs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border py-10 text-center text-xs text-muted-foreground">
                No active refreshing tabs right now.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {activeSummary.runningCount} running · {activeSummary.pausedCount} paused
                  </span>
                  <Button
                    variant="destructive"
                    size="xs"
                    onClick={() => void sendMessage({ type: 'STOP_ALL_JOBS' })}
                  >
                    Stop All
                  </Button>
                </div>
                <div className="max-h-[280px] overflow-y-auto space-y-2">
                  {activeSummary.jobs.map((job) => {
                    const p = getCountdownProgress(job, now);
                    return (
                      <div
                        key={job.tabId}
                        className="rounded-lg border border-border bg-card p-2.5 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-medium truncate">
                              {job.title || job.url}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {job.url}
                            </div>
                          </div>
                          <Badge
                            variant={
                              job.status === 'running'
                                ? 'success'
                                : job.status === 'paused'
                                  ? 'warning'
                                  : 'destructive'
                            }
                            className="text-[10px] shrink-0"
                          >
                            {job.status === 'running'
                              ? formatCountdown(p.remainingMs)
                              : job.status}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            #{job.refreshCount} · {job.monitor.refreshType.toUpperCase()}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() =>
                                void sendMessage({
                                  type: 'FOCUS_TAB',
                                  tabId: job.tabId,
                                  windowId: job.windowId,
                                })
                              }
                              title="Focus tab"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                            {(job.status === 'running' || job.status === 'paused') && (
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() =>
                                  void sendMessage({
                                    type:
                                      job.status === 'running'
                                        ? 'PAUSE_JOB'
                                        : 'RESUME_JOB',
                                    tabId: job.tabId,
                                  })
                                }
                              >
                                {job.status === 'running' ? 'Pause' : 'Resume'}
                              </Button>
                            )}
                            <Button
                              variant="destructive"
                              size="xs"
                              onClick={() =>
                                void sendMessage({
                                  type: 'STOP_JOB',
                                  tabId: job.tabId,
                                })
                              }
                            >
                              Stop
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-between px-4 py-2 border-t border-border bg-card text-[11px] text-muted-foreground">
        <span>Shortcut: Alt+Shift+R</span>
        <button
          type="button"
          onClick={handleOpenDashboard}
          className="font-medium text-primary hover:underline cursor-pointer"
        >
          Settings →
        </button>
      </footer>
    </div>
  );
}
