import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  Cloud,
  Eye,
  Globe,
  Moon,
  RefreshCw,
  Sun,
  Trash2,
  Workflow,
} from 'lucide-react';
import {
  AutomationPanel,
  SyncProfilesPanel,
} from './AutomationAndSyncPanels';
import { AlertsPanel, PageMonitorPanel } from './MonitorAndAlertsPanels';
import {
  RefreshControlsPanel,
  UrlAutomationPanel,
} from './RefreshAndUrlPanels';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import { Select } from '@/src/components/ui/select';
import {
  clearActivityLogs,
  getActivityLogs,
  getAllTabJobs,
  getGlobalState,
  subscribeStorageChanges,
  updateGlobalState,
} from '@/src/lib/storage';
import type {
  ActivityLogEntry,
  GlobalExtensionState,
  SettingsProfile,
  TabJob,
} from '@/src/lib/types';
import { cn, formatTimestamp } from '@/src/lib/utils';

export type DashboardSectionId =
  | 'refresh'
  | 'url'
  | 'monitor'
  | 'alerts'
  | 'automation'
  | 'sync'
  | 'logs';

const NAV_ITEMS: Array<{
  id: DashboardSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'refresh', label: 'Refresh Controls', icon: RefreshCw },
  { id: 'url', label: 'URL & Tabs', icon: Globe },
  { id: 'monitor', label: 'Page Monitor', icon: Eye },
  { id: 'alerts', label: 'Alerts & Webhooks', icon: Bell },
  { id: 'automation', label: 'Automation & AI', icon: Workflow },
  { id: 'sync', label: 'Profiles & Sync', icon: Cloud },
  { id: 'logs', label: 'Activity Log', icon: Activity },
];

export interface OptionsAppProps {
  initialSection?: DashboardSectionId;
  embedded?: boolean;
}

export function OptionsApp({
  initialSection = 'refresh',
  embedded = false,
}: OptionsAppProps) {
  const [section, setSection] = useState<DashboardSectionId>(initialSection);
  const [state, setState] = useState<GlobalExtensionState | null>(null);
  const [jobs, setJobs] = useState<Record<number, TabJob>>({});
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>('profile_default');
  const [dark, setDark] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  const loadAll = useCallback(async () => {
    const [gs, jb, lg] = await Promise.all([
      getGlobalState(),
      getAllTabJobs(),
      getActivityLogs(),
    ]);
    setState(gs);
    setJobs(jb);
    setLogs(lg);
    setActiveProfileId((prev) =>
      gs.profiles.some((p) => p.id === prev)
        ? prev
        : (gs.profiles.find((p) => p.isDefault)?.id ??
            gs.profiles[0]?.id ??
            'profile_default'),
    );
  }, []);

  useEffect(() => {
    void loadAll();
    return subscribeStorageChanges(() => {
      void loadAll();
    });
  }, [loadAll]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 3200);
  }, []);

  const handleUpdateState = async (
    updater: (prev: GlobalExtensionState) => GlobalExtensionState,
  ) => {
    const next = await updateGlobalState(updater);
    setState(next);
  };

  const handleUpdateProfile = async (
    updater: (prof: SettingsProfile) => SettingsProfile,
  ) => {
    await handleUpdateState((prev) => ({
      ...prev,
      profiles: prev.profiles.map((p) =>
        p.id === activeProfileId
          ? { ...updater(p), updatedAt: Date.now() }
          : p,
      ),
    }));
  };

  if (!state) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
        Loading settings...
      </div>
    );
  }

  const activeProfile =
    state.profiles.find((p) => p.id === activeProfileId) ?? state.profiles[0];

  if (!activeProfile) {
    return null;
  }

  const runningTabsCount = Object.values(jobs).filter(
    (j) => j.status === 'running',
  ).length;

  return (
    <div
      className={cn(
        'bg-background text-foreground flex flex-col',
        embedded ? 'min-h-[680px]' : 'min-h-screen',
      )}
    >
      {/* Header */}
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 backdrop-blur px-6 py-3.5">
        <div className="flex items-center gap-3">
          <img
            src="/icon/48.png"
            alt="PulseRefresh logo"
            className="h-9 w-9 rounded-xl shadow-xs"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight">PulseRefresh</h1>
              <Badge variant="secondary" className="text-[11px] font-mono">
                v1.0.0
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Auto Refresh, Page Monitor & Browser Automation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Profile
            </span>
            <Select
              aria-label="Active editing profile"
              value={activeProfile.id}
              onChange={(e) => setActiveProfileId(e.target.value)}
              className="h-8 text-xs w-56"
            >
              {state.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isDefault ? ' (Default)' : ''}
                </option>
              ))}
            </Select>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDark((d) => !d)}
            aria-label="Toggle dark mode"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {/* Body Layout */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col md:flex-row gap-6 px-4 sm:px-6 py-6">
        {/* Sidebar Navigation */}
        <aside className="w-full md:w-56 shrink-0 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer',
                  active
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </span>
                {item.id === 'url' && runningTabsCount > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums',
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                    )}
                  >
                    {runningTabsCount}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Main Panel Content */}
        <main className="flex-1 min-w-0">
          {section === 'refresh' && (
            <RefreshControlsPanel
              profile={activeProfile}
              onUpdateProfile={handleUpdateProfile}
              onNotify={showToast}
            />
          )}
          {section === 'url' && (
            <UrlAutomationPanel
              profile={activeProfile}
              onUpdateProfile={handleUpdateProfile}
              state={state}
              onUpdateState={handleUpdateState}
              jobs={jobs}
              onNotify={showToast}
            />
          )}
          {section === 'monitor' && (
            <PageMonitorPanel
              profile={activeProfile}
              onUpdateProfile={handleUpdateProfile}
              state={state}
              onUpdateState={handleUpdateState}
              onNotify={showToast}
            />
          )}
          {section === 'alerts' && (
            <AlertsPanel
              state={state}
              onUpdateState={handleUpdateState}
              onNotify={showToast}
            />
          )}
          {section === 'automation' && (
            <AutomationPanel
              state={state}
              onUpdateState={handleUpdateState}
              onNotify={showToast}
            />
          )}
          {section === 'sync' && (
            <SyncProfilesPanel
              state={state}
              activeProfileId={activeProfile.id}
              onSelectProfile={setActiveProfileId}
              onUpdateState={handleUpdateState}
              onReloadState={loadAll}
              onNotify={showToast}
            />
          )}
          {section === 'logs' && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Activity Log</CardTitle>
                    <CardDescription>
                      Recent refreshes, keyword matches, alerts, CAPTCHA pauses, and macro
                      runs.
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await clearActivityLogs();
                      setLogs([]);
                      showToast('Activity log cleared.');
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Clear Log
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {logs.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border py-10 text-center text-xs text-muted-foreground">
                    No events recorded yet. Activity appears automatically as tabs refresh
                    and alerts fire.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[520px] overflow-y-auto">
                    {logs.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5 text-xs"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                entry.level === 'success'
                                  ? 'success'
                                  : entry.level === 'warning'
                                    ? 'warning'
                                    : entry.level === 'error'
                                      ? 'destructive'
                                      : 'secondary'
                              }
                            >
                              {entry.category}
                            </Badge>
                            <span className="font-medium">{entry.message}</span>
                          </div>
                          {entry.details && (
                            <p className="text-muted-foreground truncate">
                              {entry.details}
                            </p>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                          {formatTimestamp(entry.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </main>
      </div>

      {toast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 rounded-xl border border-primary/30 bg-slate-900 text-white px-4 py-2.5 text-xs font-medium shadow-xl"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
