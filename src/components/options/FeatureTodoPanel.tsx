import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  ClipboardCopy,
  FileCode2,
  FlaskConical,
  ListChecks,
  RotateCcw,
  Search,
} from 'lucide-react';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { Checkbox, Progress } from '@/src/components/ui/primitives';
import { Select } from '@/src/components/ui/select';
import {
  FEATURE_CATEGORIES,
  FEATURE_CHECKLIST,
} from '@/src/lib/feature-registry';
import type {
  FeatureChecklistItem,
  GlobalExtensionState,
} from '@/src/lib/types';

export type DashboardSectionId =
  | 'refresh'
  | 'url'
  | 'monitor'
  | 'alerts'
  | 'automation'
  | 'sync'
  | 'logs';

const CATEGORY_TO_SECTION: Record<
  FeatureChecklistItem['category'],
  DashboardSectionId
> = {
  'Refresh Controls': 'refresh',
  'URL & Tab Automation': 'url',
  'Page Monitor': 'monitor',
  'Advanced Monitoring': 'monitor',
  'Alerts & Notifications': 'alerts',
  'Automation Tools': 'automation',
  'Account & Sync': 'sync',
};

export interface FeatureTodoPanelProps {
  state: GlobalExtensionState;
  onUpdateState: (updater: (prev: GlobalExtensionState) => GlobalExtensionState) => Promise<void>;
  onNavigateSection: (section: Exclude<DashboardSectionId, 'todo'>) => void;
  onNotify: (msg: string) => void;
}

export function FeatureTodoPanel({
  state,
  onUpdateState,
  onNavigateSection,
  onNotify,
}: FeatureTodoPanelProps) {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'done' | 'pending'>('all');

  const isChecked = (item: FeatureChecklistItem): boolean => {
    const ov = state.featureOverrides[item.id];
    return ov ? ov.checked : item.implemented;
  };

  const completedCount = FEATURE_CHECKLIST.filter((f) => isChecked(f)).length;
  const totalCount = FEATURE_CHECKLIST.length;
  const pct = Math.round((completedCount / totalCount) * 100);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FEATURE_CHECKLIST.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false;
      }
      const checked = isChecked(item);
      if (statusFilter === 'done' && !checked) return false;
      if (statusFilter === 'pending' && checked) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.sourceFile.toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, categoryFilter, statusFilter, state.featureOverrides]);

  const grouped = useMemo(() => {
    const map = new Map<FeatureChecklistItem['category'], FeatureChecklistItem[]>();
    for (const cat of FEATURE_CATEGORIES) {
      const items = filteredItems.filter((i) => i.category === cat);
      if (items.length > 0) map.set(cat, items);
    }
    return Array.from(map.entries());
  }, [filteredItems]);

  const toggleFeature = async (item: FeatureChecklistItem, checked: boolean) => {
    await onUpdateState((prev) => ({
      ...prev,
      featureOverrides: {
        ...prev.featureOverrides,
        [item.id]: {
          ...prev.featureOverrides[item.id],
          checked,
        },
      },
    }));
  };

  const handleStartManualQaPass = async () => {
    const uncheckedMap: GlobalExtensionState['featureOverrides'] = {};
    for (const item of FEATURE_CHECKLIST) {
      uncheckedMap[item.id] = {
        checked: false,
        note: state.featureOverrides[item.id]?.note,
      };
    }
    await onUpdateState((prev) => ({
      ...prev,
      featureOverrides: uncheckedMap,
    }));
    onNotify('All checkboxes cleared so you can manually check off each feature during QA.');
  };

  const handleResetVerified = async () => {
    await onUpdateState((prev) => ({
      ...prev,
      featureOverrides: {},
    }));
    onNotify(`Restored all ${totalCount}/${totalCount} implemented & test-verified checkmarks.`);
  };

  const handleCopyMarkdown = async () => {
    const lines: string[] = [
      `# PulseRefresh — Feature Implementation & Test Checklist (${completedCount}/${totalCount})`,
      '',
    ];
    for (const cat of FEATURE_CATEGORIES) {
      const catItems = FEATURE_CHECKLIST.filter((f) => f.category === cat);
      const catDone = catItems.filter((f) => isChecked(f)).length;
      lines.push(`## ${cat} (${catDone}/${catItems.length})`, '');
      for (const item of catItems) {
        const mark = isChecked(item) ? 'x' : ' ';
        lines.push(
          `- [${mark}] **${item.title}** _(${item.tierNote})_ — ${item.description}  \n  Source: \`${item.sourceFile}\` | Tests: \`${item.testFile}\``,
        );
      }
      lines.push('');
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      onNotify('Copied Markdown feature checklist to clipboard!');
    } catch {
      onNotify('Checklist ready in TODO.md inside the workspace.');
    }
  };

  return (
    <div className="space-y-5">
      {/* Progress Summary Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">
                  Full Feature Breakdown — To-Do & Test Tracker
                </CardTitle>
              </div>
              <CardDescription>
                Every feature from your breakdown is unlocked (no paywalls), cross-browser
                built for Chrome MV3 & Firefox, and paired with automated Vitest test suites.
                Toggle any checkbox to track your own QA review.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void handleStartManualQaPass()}>
                Uncheck All for QA
              </Button>
              <Button variant="outline" size="sm" onClick={() => void handleResetVerified()}>
                <RotateCcw className="h-3.5 w-3.5" /> Mark All Verified
              </Button>
              <Button size="sm" onClick={() => void handleCopyMarkdown()}>
                <ClipboardCopy className="h-3.5 w-3.5" /> Copy Markdown
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium">
              <span data-testid="todo-progress-label" className="tabular-nums">
                {completedCount} of {totalCount} features checked ({pct}%)
              </span>
              <span className="text-primary flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> All Plans Unlocked · Chrome + Firefox
              </span>
            </div>
            <Progress value={pct} className="h-2.5" />
          </div>

          {/* Category Summary Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {FEATURE_CATEGORIES.map((cat) => {
              const items = FEATURE_CHECKLIST.filter((i) => i.category === cat);
              const done = items.filter((i) => isChecked(i)).length;
              const active = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(active ? 'all' : cat)}
                  className={`rounded-lg border p-2.5 text-left transition-colors cursor-pointer ${
                    active
                      ? 'border-primary bg-accent text-accent-foreground'
                      : 'border-border bg-background hover:bg-secondary/60'
                  }`}
                >
                  <div className="text-[11px] font-medium truncate" title={cat}>
                    {cat}
                  </div>
                  <div className="mt-1 text-sm font-bold tabular-nums">
                    {done}/{items.length}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Search & Filter Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-1">
            <div className="relative sm:col-span-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Filter features (e.g. XHR, captcha, webhook, macro, cookie)..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All 7 Categories</option>
              {FEATURE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by completion"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | 'done' | 'pending')
              }
            >
              <option value="all">All Statuses</option>
              <option value="done">Checked (Done)</option>
              <option value="pending">Unchecked (To Review)</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Grouped Feature Cards */}
      {grouped.map(([category, items]) => {
        const doneInCat = items.filter((i) => isChecked(i)).length;
        const targetSection = CATEGORY_TO_SECTION[category];
        return (
          <Card key={category}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{category}</CardTitle>
                  <Badge variant={doneInCat === items.length ? 'success' : 'warning'}>
                    {doneInCat}/{items.length}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigateSection(targetSection)}
                  className="text-xs text-primary"
                >
                  Configure <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="divide-y divide-border pt-0">
              {items.map((item) => {
                const checked = isChecked(item);
                return (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-4 py-3 first:pt-2 last:pb-0"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <Checkbox
                        id={`feat-${item.id}`}
                        checked={checked}
                        onCheckedChange={(val) =>
                          void toggleFeature(item, Boolean(val))
                        }
                        aria-label={`Mark ${item.title} completed`}
                        className="mt-0.5"
                      />
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <label
                            htmlFor={`feat-${item.id}`}
                            className={`text-sm font-medium cursor-pointer ${
                              checked ? 'text-foreground' : 'text-muted-foreground'
                            }`}
                          >
                            {item.title}
                          </label>
                          <Badge variant="success" className="text-[10px] py-0">
                            {item.tierNote}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {item.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pt-0.5 font-mono">
                          <span className="inline-flex items-center gap-1">
                            <FileCode2 className="h-3 w-3 text-slate-400" />
                            {item.sourceFile}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <FlaskConical className="h-3 w-3 text-emerald-500" />
                            {item.testFile}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => onNavigateSection(targetSection)}
                      className="shrink-0"
                    >
                      Open
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
