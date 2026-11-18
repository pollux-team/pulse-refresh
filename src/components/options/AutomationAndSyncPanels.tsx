import React, { useEffect, useState } from 'react';
import {
  Bot,
  Cloud,
  Code2,
  Cookie,
  Copy,
  Download,
  FolderKanban,
  Keyboard,
  Laptop,
  MousePointerClick,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Workflow,
} from 'lucide-react';
import {
  createCustomUserScript,
  findHotkeyConflicts,
  generateAiAutomation,
  keyboardEventToCombo,
} from '@/src/lib/automation';
import { getBrowser } from '@/src/lib/browser-api';
import {
  createSettingsProfile,
  deleteSettingsProfile,
  duplicateSettingsProfile,
  exportBackupJson,
  getSyncedDevices,
  importBackupJson,
  removeSyncedDevice,
  renameCurrentDevice,
  setDefaultProfile,
} from '@/src/lib/sync-manager';
import type {
  CookieRuleAction,
  DeviceInfo,
  ExtensionMessage,
  GlobalExtensionState,
  MacroStepType,
  ScriptRunTiming,
} from '@/src/lib/types';
import { formatTimestamp, generateId } from '@/src/lib/utils';
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
import {
  Label,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/src/components/ui/primitives';
import { Select } from '@/src/components/ui/select';

// ============================================================================
// 6. Automation Tools Panel (Scripts & AI, Hotkeys, Click Targets, Cookies, Macros)
// ============================================================================

export function AutomationPanel({
  state,
  onUpdateState,
  onNotify,
}: {
  state: GlobalExtensionState;
  onUpdateState: (u: (s: GlobalExtensionState) => GlobalExtensionState) => Promise<void>;
  onNotify: (msg: string) => void;
}) {
  // Custom script form
  const [scrName, setScrName] = useState('');
  const [scrUrl, setScrUrl] = useState('*');
  const [scrTiming, setScrTiming] = useState<ScriptRunTiming>('after_load');
  const [scrSelector, setScrSelector] = useState('');
  const [scrCode, setScrCode] = useState('');

  // AI prompt
  const [aiPrompt, setAiPrompt] = useState(
    'Click #reserve-slot then fill "SAVE20" into #promo-code then wait 1 second then click .confirm-btn',
  );
  const [aiBusy, setAiBusy] = useState(false);

  // Hotkey recording
  const [recordingId, setRecordingId] = useState<string | null>(null);

  // Auto Click Targets
  const [ctLabel, setCtLabel] = useState('');
  const [ctSelector, setCtSelector] = useState('');
  const [ctDelay, setCtDelay] = useState(200);

  // Cookie Automation
  const [ckDomain, setCkDomain] = useState('');
  const [ckAction, setCkAction] = useState<CookieRuleAction>('clear_all');
  const [ckNames, setCkNames] = useState('');
  const [ckValue, setCkValue] = useState('');

  // Macro builder
  const [macroName, setMacroName] = useState('');
  const [stepType, setStepType] = useState<MacroStepType>('click');
  const [stepSelector, setStepSelector] = useState('');
  const [stepValue, setStepValue] = useState('');
  const [selectedMacroId, setSelectedMacroId] = useState(
    () => state.macros[0]?.id ?? '',
  );

  const conflicts = findHotkeyConflicts(state.hotkeys);

  const handleGenerateAi = async () => {
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    try {
      const res = await generateAiAutomation({
        prompt: aiPrompt,
        aiConfig: state.aiConfig,
      });
      await onUpdateState((s) => ({
        ...s,
        scripts: [res.script, ...s.scripts],
        macros: [res.macro, ...s.macros],
      }));
      setSelectedMacroId(res.macro.id);
      onNotify(
        `Generated "${res.script.name}" (${res.macro.steps.length} macro steps) via ${
          res.usedAiApi ? 'AI API' : 'built-in smart compiler'
        }!`,
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'AI generation failed');
    } finally {
      setAiBusy(false);
    }
  };

  const handleAddCustomScript = async () => {
    if (!scrName.trim()) return;
    const script = createCustomUserScript({
      name: scrName,
      urlPattern: scrUrl,
      timing: scrTiming,
      code: scrCode,
      actions: scrSelector.trim()
        ? [{ type: 'click_selector', selector: scrSelector.trim() }]
        : [],
    });
    await onUpdateState((s) => ({ ...s, scripts: [script, ...s.scripts] }));
    setScrName('');
    setScrSelector('');
    setScrCode('');
    onNotify(`Created custom script "${script.name}".`);
  };

  return (
    <Tabs defaultValue="scripts" className="space-y-4">
      <TabsList className="flex flex-wrap h-auto gap-1 p-1">
        <TabsTrigger value="scripts" className="gap-1.5">
          <Code2 className="h-3.5 w-3.5" /> Scripts & AI ({state.scripts.length})
        </TabsTrigger>
        <TabsTrigger value="hotkeys" className="gap-1.5">
          <Keyboard className="h-3.5 w-3.5" /> Hotkeys ({state.hotkeys.length})
        </TabsTrigger>
        <TabsTrigger value="clicks" className="gap-1.5">
          <MousePointerClick className="h-3.5 w-3.5" /> Auto Click Targets
        </TabsTrigger>
        <TabsTrigger value="cookies" className="gap-1.5">
          <Cookie className="h-3.5 w-3.5" /> Cookie Automation
        </TabsTrigger>
        <TabsTrigger value="macros" className="gap-1.5">
          <Workflow className="h-3.5 w-3.5" /> Macros ({state.macros.length})
        </TabsTrigger>
      </TabsList>

      {/* 1. Scripts & AI */}
      <TabsContent value="scripts" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" /> AI Automation Builder
            </CardTitle>
            <CardDescription>
              Describe what should happen on the page in plain English to generate a custom
              script and multi-step macro — instantly offline or with your OpenAI API key.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Input
                placeholder="https://api.openai.com/v1/chat/completions"
                value={state.aiConfig.endpointUrl}
                onChange={(e) =>
                  void onUpdateState((s) => ({
                    ...s,
                    aiConfig: { ...s.aiConfig, endpointUrl: e.target.value },
                  }))
                }
                className="text-xs font-mono"
              />
              <Input
                placeholder="Model (e.g. gpt-4o-mini)"
                value={state.aiConfig.model}
                onChange={(e) =>
                  void onUpdateState((s) => ({
                    ...s,
                    aiConfig: { ...s.aiConfig, model: e.target.value },
                  }))
                }
                className="text-xs"
              />
              <Input
                type="password"
                placeholder="OpenAI API key (optional, sk-...)"
                value={state.aiConfig.apiKey}
                onChange={(e) =>
                  void onUpdateState((s) => ({
                    ...s,
                    aiConfig: { ...s.aiConfig, apiKey: e.target.value },
                  }))
                }
                className="text-xs"
              />
            </div>
            <div className="flex gap-2">
              <Input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Describe automation steps..."
                className="text-xs"
              />
              <Button disabled={aiBusy} onClick={() => void handleGenerateAi()}>
                <Bot className="h-4 w-4" /> Generate
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Custom Script Editor */}
        <Card>
          <CardHeader>
            <CardTitle>Create Custom User Script</CardTitle>
            <CardDescription>
              Author custom page rules that run before reload, after page load, or when a
              monitored keyword triggers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <Input
                placeholder="Script title"
                value={scrName}
                onChange={(e) => setScrName(e.target.value)}
              />
              <Input
                placeholder="URL wildcard (* or https://site.com/*)"
                value={scrUrl}
                onChange={(e) => setScrUrl(e.target.value)}
                className="font-mono text-xs"
              />
              <Select
                value={scrTiming}
                onChange={(e) => setScrTiming(e.target.value as ScriptRunTiming)}
              >
                <option value="after_load">Run After Load</option>
                <option value="on_detection">Run On Keyword Detection</option>
                <option value="before_refresh">Run Before Refresh</option>
              </Select>
              <Input
                placeholder="Optional quick-click selector"
                value={scrSelector}
                onChange={(e) => setScrSelector(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <Textarea
              placeholder="// Custom JavaScript executed on matching tabs&#10;document.querySelector('.accept-btn')?.click();"
              value={scrCode}
              onChange={(e) => setScrCode(e.target.value)}
              className="font-mono text-xs"
            />
            <Button size="sm" onClick={() => void handleAddCustomScript()}>
              <Plus className="h-3.5 w-3.5" /> Save Custom Script
            </Button>
          </CardContent>
        </Card>

        {/* Installed Marketplace + Custom + AI Scripts */}
        <Card>
          <CardHeader>
            <CardTitle>Marketplace & Installed Scripts</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {state.scripts.map((scr) => (
              <div
                key={scr.id}
                className="rounded-lg border border-border p-3.5 flex flex-col justify-between gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{scr.name}</span>
                      <Badge
                        variant={
                          scr.source === 'ai'
                            ? 'success'
                            : scr.source === 'custom'
                              ? 'default'
                              : 'secondary'
                        }
                        className="text-[10px]"
                      >
                        {scr.source}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {scr.timing}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{scr.description}</p>
                  </div>
                  <Switch
                    checked={scr.enabled}
                    onCheckedChange={(v) =>
                      void onUpdateState((s) => ({
                        ...s,
                        scripts: s.scripts.map((x) =>
                          x.id === scr.id ? { ...x, enabled: v } : x,
                        ),
                      }))
                    }
                  />
                </div>
                {scr.source !== 'marketplace' && (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        void onUpdateState((s) => ({
                          ...s,
                          scripts: s.scripts.filter((x) => x.id !== scr.id),
                        }))
                      }
                    >
                      <Trash2 className="h-3 w-3" /> Remove
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </TabsContent>

      {/* 2. Hotkeys */}
      <TabsContent value="hotkeys">
        <Card>
          <CardHeader>
            <CardTitle>Keyboard Shortcuts (Hotkeys)</CardTitle>
            <CardDescription>
              Global WebExtension shortcuts plus customizable in-page key combos. Click
              any shortcut box and press a key chord to rebind.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {conflicts.length > 0 && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">
                Duplicate shortcut detected: {conflicts.map((c) => c.combo).join(', ')}
              </div>
            )}
            {state.hotkeys.map((hk) => (
              <div
                key={hk.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5"
              >
                <div>
                  <div className="text-sm font-medium">{hk.label}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {hk.id}
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setRecordingId(hk.id)}
                    onKeyDown={(e) => {
                      if (recordingId !== hk.id) return;
                      e.preventDefault();
                      const combo = keyboardEventToCombo(e.nativeEvent);
                      if (!combo) return;
                      setRecordingId(null);
                      void onUpdateState((s) => ({
                        ...s,
                        hotkeys: s.hotkeys.map((x) =>
                          x.id === hk.id ? { ...x, combo } : x,
                        ),
                      }));
                      onNotify(`Updated shortcut to ${combo}`);
                    }}
                    className="rounded-md border border-border bg-secondary px-3 py-1 font-mono text-xs font-semibold cursor-pointer hover:border-primary"
                  >
                    {recordingId === hk.id ? 'Press keys...' : hk.combo}
                  </button>
                  <Switch
                    checked={hk.enabled}
                    onCheckedChange={(v) =>
                      void onUpdateState((s) => ({
                        ...s,
                        hotkeys: s.hotkeys.map((x) =>
                          x.id === hk.id ? { ...x, enabled: v } : x,
                        ),
                      }))
                    }
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </TabsContent>

      {/* 3. Auto Click Targets */}
      <TabsContent value="clicks">
        <Card>
          <CardHeader>
            <CardTitle>Auto Click Targets</CardTitle>
            <CardDescription>
              Ordered CSS or XPath selectors automatically clicked after each refresh with
              delay, wait-for-selector timeout, and retry guards.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <Input
                placeholder="Label (e.g. Expand Price Tab)"
                value={ctLabel}
                onChange={(e) => setCtLabel(e.target.value)}
                className="sm:col-span-3"
              />
              <Input
                placeholder="CSS selector, e.g. button[data-tab='live']"
                value={ctSelector}
                onChange={(e) => setCtSelector(e.target.value)}
                className="sm:col-span-5 font-mono text-xs"
              />
              <Input
                type="number"
                min={0}
                value={ctDelay}
                onChange={(e) => setCtDelay(Number(e.target.value) || 0)}
                placeholder="Delay ms"
                className="sm:col-span-2 tabular-nums"
              />
              <Button
                className="sm:col-span-2"
                onClick={async () => {
                  if (!ctSelector.trim()) return;
                  await onUpdateState((s) => ({
                    ...s,
                    autoClickTargets: [
                      ...s.autoClickTargets,
                      {
                        id: generateId('act'),
                        label: ctLabel.trim() || ctSelector.trim(),
                        selector: ctSelector.trim(),
                        selectorType: ctSelector.startsWith('//') ? 'xpath' : 'css',
                        delayMs: Math.max(0, ctDelay),
                        waitTimeoutMs: 2000,
                        maxRetries: 1,
                        enabled: true,
                      },
                    ],
                  }));
                  setCtLabel('');
                  setCtSelector('');
                  onNotify('Added auto-click target.');
                }}
              >
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
            {state.autoClickTargets.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Switch
                    checked={t.enabled}
                    onCheckedChange={(v) =>
                      void onUpdateState((s) => ({
                        ...s,
                        autoClickTargets: s.autoClickTargets.map((x) =>
                          x.id === t.id ? { ...x, enabled: v } : x,
                        ),
                      }))
                    }
                  />
                  <span className="font-medium">{t.label}</span>
                  <code className="text-muted-foreground">{t.selector}</code>
                  <Badge variant="secondary">{t.delayMs}ms delay</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    void onUpdateState((s) => ({
                      ...s,
                      autoClickTargets: s.autoClickTargets.filter((x) => x.id !== t.id),
                    }))
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </TabsContent>

      {/* 4. Cookie Automation */}
      <TabsContent value="cookies">
        <Card>
          <CardHeader>
            <CardTitle>Cookie Automation Rules</CardTitle>
            <CardDescription>
              Automatically clear, prune, allowlist, or inject cookies per domain before
              every refresh or after page load.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <Input
                placeholder="Domain (e.g. shop.example.com)"
                value={ckDomain}
                onChange={(e) => setCkDomain(e.target.value)}
                className="sm:col-span-3 font-mono text-xs"
              />
              <Select
                value={ckAction}
                onChange={(e) => setCkAction(e.target.value as CookieRuleAction)}
                className="sm:col-span-3"
              >
                <option value="clear_all">Clear All Cookies</option>
                <option value="delete_matching">Delete Named Cookies</option>
                <option value="keep_only">Keep Only Allowlist</option>
                <option value="set_cookie">Set / Inject Cookie</option>
              </Select>
              <Input
                placeholder={
                  ckAction === 'set_cookie'
                    ? 'Cookie name'
                    : 'Cookie names (comma-separated)'
                }
                value={ckNames}
                onChange={(e) => setCkNames(e.target.value)}
                className="sm:col-span-2 text-xs"
              />
              <Input
                placeholder="Value (for Set Cookie)"
                value={ckValue}
                onChange={(e) => setCkValue(e.target.value)}
                disabled={ckAction !== 'set_cookie'}
                className="sm:col-span-2 text-xs"
              />
              <Button
                className="sm:col-span-2"
                onClick={async () => {
                  if (!ckDomain.trim()) return;
                  const names = ckNames
                    .split(',')
                    .map((n) => n.trim())
                    .filter(Boolean);
                  await onUpdateState((s) => ({
                    ...s,
                    cookieRules: [
                      ...s.cookieRules,
                      {
                        id: generateId('ck'),
                        name: `${ckAction} on ${ckDomain.trim()}`,
                        enabled: true,
                        domainPattern: ckDomain.trim(),
                        timing: 'before_refresh',
                        action: ckAction,
                        cookieNames: names,
                        ...(ckAction === 'set_cookie' && names[0]
                          ? { cookieToSet: { name: names[0], value: ckValue } }
                          : {}),
                      },
                    ],
                  }));
                  setCkDomain('');
                  setCkNames('');
                  setCkValue('');
                  onNotify('Added cookie automation rule.');
                }}
              >
                <Plus className="h-4 w-4" /> Add Rule
              </Button>
            </div>
            {state.cookieRules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(v) =>
                      void onUpdateState((s) => ({
                        ...s,
                        cookieRules: s.cookieRules.map((x) =>
                          x.id === rule.id ? { ...x, enabled: v } : x,
                        ),
                      }))
                    }
                  />
                  <Badge variant="outline">{rule.action}</Badge>
                  <code>{rule.domainPattern}</code>
                  {rule.cookieNames.length > 0 && (
                    <span className="text-muted-foreground">
                      ({rule.cookieNames.join(', ')})
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    void onUpdateState((s) => ({
                      ...s,
                      cookieRules: s.cookieRules.filter((x) => x.id !== rule.id),
                    }))
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </TabsContent>

      {/* 5. Run Macro After Detection */}
      <TabsContent value="macros">
        <Card>
          <CardHeader>
            <CardTitle>Run Macro After Detection</CardTitle>
            <CardDescription>
              Chain multi-step browser actions (click, fill, select, check, keypress,
              scroll, wait, wait_for_selector, extract_text, navigate, webhook) once a
              monitored keyword triggers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="New macro name..."
                value={macroName}
                onChange={(e) => setMacroName(e.target.value)}
                className="max-w-xs"
              />
              <Button
                variant="outline"
                onClick={async () => {
                  if (!macroName.trim()) return;
                  const created = {
                    id: generateId('macro'),
                    name: macroName.trim(),
                    description: 'Custom post-detection macro',
                    enabled: true,
                    runOnDetection: true,
                    steps: [],
                    createdAt: Date.now(),
                  };
                  await onUpdateState((s) => ({
                    ...s,
                    macros: [...s.macros, created],
                  }));
                  setSelectedMacroId(created.id);
                  setMacroName('');
                  onNotify(`Created macro "${created.name}".`);
                }}
              >
                <Plus className="h-4 w-4" /> New Macro
              </Button>
            </div>

            {state.macros.map((macro) => (
              <div
                key={macro.id}
                className="rounded-xl border border-border p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{macro.name}</span>
                      <Badge variant="secondary">{macro.steps.length} steps</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{macro.description}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <span>Run on Detection</span>
                      <Switch
                        checked={macro.runOnDetection}
                        onCheckedChange={(v) =>
                          void onUpdateState((s) => ({
                            ...s,
                            macros: s.macros.map((m) =>
                              m.id === macro.id ? { ...m, runOnDetection: v } : m,
                            ),
                          }))
                        }
                      />
                    </label>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => setSelectedMacroId(macro.id)}
                    >
                      + Step
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {macro.steps.map((step, i) => (
                    <div
                      key={step.id}
                      className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-1.5 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-muted-foreground">#{i + 1}</span>
                        <Badge variant="outline">{step.type}</Badge>
                        {step.selector && <code>{step.selector}</code>}
                        {step.value && (
                          <span className="text-primary font-medium">
                            = "{step.value}"
                          </span>
                        )}
                        {step.delayMs != null && step.type === 'wait' && (
                          <span>{step.delayMs}ms</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void onUpdateState((s) => ({
                            ...s,
                            macros: s.macros.map((m) =>
                              m.id === macro.id
                                ? {
                                    ...m,
                                    steps: m.steps.filter((st) => st.id !== step.id),
                                  }
                                : m,
                            ),
                          }))
                        }
                        className="text-muted-foreground hover:text-destructive cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {selectedMacroId === macro.id && (
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-2 border-t border-border">
                    <Select
                      value={stepType}
                      onChange={(e) => setStepType(e.target.value as MacroStepType)}
                      className="sm:col-span-3"
                    >
                      <option value="click">click</option>
                      <option value="fill">fill</option>
                      <option value="select">select</option>
                      <option value="check">check</option>
                      <option value="keypress">keypress</option>
                      <option value="scroll">scroll</option>
                      <option value="wait">wait</option>
                      <option value="wait_for_selector">wait_for_selector</option>
                      <option value="extract_text">extract_text</option>
                      <option value="navigate">navigate</option>
                      <option value="webhook">webhook</option>
                    </Select>
                    <Input
                      placeholder="CSS selector (if applicable)"
                      value={stepSelector}
                      onChange={(e) => setStepSelector(e.target.value)}
                      className="sm:col-span-4 font-mono text-xs"
                    />
                    <Input
                      placeholder="Value / URL / wait ms"
                      value={stepValue}
                      onChange={(e) => setStepValue(e.target.value)}
                      className="sm:col-span-3 text-xs"
                    />
                    <Button
                      size="sm"
                      className="sm:col-span-2"
                      onClick={async () => {
                        await onUpdateState((s) => ({
                          ...s,
                          macros: s.macros.map((m) =>
                            m.id === macro.id
                              ? {
                                  ...m,
                                  steps: [
                                    ...m.steps,
                                    {
                                      id: generateId('step'),
                                      type: stepType,
                                      selector: stepSelector.trim() || undefined,
                                      value: stepValue.trim() || undefined,
                                      delayMs:
                                        stepType === 'wait'
                                          ? Number(stepValue) || 500
                                          : undefined,
                                    },
                                  ],
                                }
                              : m,
                          ),
                        }));
                        setStepSelector('');
                        setStepValue('');
                      }}
                    >
                      Add Step
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

// ============================================================================
// 7. Account & Sync Panel (Settings Profiles, Sync Settings, Devices Management)
// ============================================================================

export function SyncProfilesPanel({
  state,
  activeProfileId,
  onSelectProfile,
  onUpdateState,
  onReloadState,
  onNotify,
}: {
  state: GlobalExtensionState;
  activeProfileId: string;
  onSelectProfile: (id: string) => void;
  onUpdateState: (u: (s: GlobalExtensionState) => GlobalExtensionState) => Promise<void>;
  onReloadState: () => Promise<void>;
  onNotify: (msg: string) => void;
}) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [deviceNameDraft, setDeviceNameDraft] = useState(state.currentDevice.name);
  const [newProfName, setNewProfName] = useState('');
  const [newProfUrl, setNewProfUrl] = useState('');
  const [importJsonText, setImportJsonText] = useState('');

  const refreshDevices = async () => {
    const list = await getSyncedDevices();
    setDevices(list);
  };

  useEffect(() => {
    void refreshDevices();
  }, [state.sync.lastSyncedAt, state.currentDevice.name]);

  const handleSync = async (direction: 'push' | 'pull') => {
    const res = (await getBrowser().runtime.sendMessage({
      type: 'SYNC_NOW',
      direction,
    } satisfies ExtensionMessage)) as { ok?: boolean; revision?: number; error?: string };
    await onReloadState();
    await refreshDevices();
    onNotify(
      res?.ok
        ? `Sync ${direction} complete (revision #${res.revision ?? 0}).`
        : `Sync error: ${res?.error || 'Failed'}`,
    );
  };

  const handleExportJson = () => {
    const json = exportBackupJson(state);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pulserefresh-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('Downloaded full PulseRefresh JSON backup.');
  };

  return (
    <div className="space-y-5">
      {/* Settings Profiles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-primary" /> Settings Profiles
          </CardTitle>
          <CardDescription>
            Create reusable refresh & monitor presets, auto-bind them to URL patterns, and
            switch in one click.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {state.profiles.map((prof) => (
              <div
                key={prof.id}
                className={`rounded-xl border p-3.5 space-y-2 transition-colors ${
                  prof.id === activeProfileId
                    ? 'border-primary bg-accent/40'
                    : 'border-border'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{prof.name}</span>
                      {prof.isDefault && <Badge variant="success">Default</Badge>}
                      <Badge variant="outline">
                        {prof.monitor.refreshType.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {prof.description}
                    </p>
                    {prof.urlPattern && (
                      <code className="text-[11px] text-primary">
                        Auto-URL: {prof.urlPattern}
                      </code>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <Button
                    size="xs"
                    variant={prof.id === activeProfileId ? 'default' : 'outline'}
                    onClick={() => onSelectProfile(prof.id)}
                  >
                    {prof.id === activeProfileId ? 'Editing' : 'Edit'}
                  </Button>
                  {!prof.isDefault && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        void onUpdateState((s) => ({
                          ...s,
                          profiles: setDefaultProfile(s.profiles, prof.id),
                        }))
                      }
                    >
                      Set Default
                    </Button>
                  )}
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      void onUpdateState((s) => ({
                        ...s,
                        profiles: [...s.profiles, duplicateSettingsProfile(prof)],
                      }))
                    }
                  >
                    <Copy className="h-3 w-3" /> Duplicate
                  </Button>
                  {state.profiles.length > 1 && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() =>
                        void onUpdateState((s) => ({
                          ...s,
                          profiles: deleteSettingsProfile(s.profiles, prof.id),
                        }))
                      }
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-2 border-t border-border">
            <Input
              placeholder="New profile name..."
              value={newProfName}
              onChange={(e) => setNewProfName(e.target.value)}
              className="sm:col-span-5"
            />
            <Input
              placeholder="Optional auto-apply URL pattern (e.g. https://amazon.com/*)"
              value={newProfUrl}
              onChange={(e) => setNewProfUrl(e.target.value)}
              className="sm:col-span-5 font-mono text-xs"
            />
            <Button
              className="sm:col-span-2"
              onClick={async () => {
                if (!newProfName.trim()) return;
                const created = createSettingsProfile({
                  name: newProfName,
                  urlPattern: newProfUrl,
                });
                await onUpdateState((s) => ({
                  ...s,
                  profiles: [...s.profiles, created],
                }));
                onSelectProfile(created.id);
                setNewProfName('');
                setNewProfUrl('');
                onNotify(`Created profile "${created.name}".`);
              }}
            >
              <Plus className="h-4 w-4" /> Create
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sync Settings */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-4 w-4 text-primary" /> Browser Sync & Backup
              </CardTitle>
              <CardDescription>
                {state.sync.lastSyncedAt
                  ? `Revision #${state.sync.revision} · Last synced ${formatTimestamp(state.sync.lastSyncedAt)}`
                  : 'Sync across signed-in browsers or export a portable JSON backup.'}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void handleSync('push')}>
                <RefreshCw className="h-3.5 w-3.5" /> Push to Sync
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleSync('pull')}
              >
                Pull from Sync
              </Button>
              <Button size="sm" variant="outline" onClick={handleExportJson}>
                <Download className="h-3.5 w-3.5" /> Export JSON
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            {(
              [
                ['enabled', 'Enable Browser Sync'],
                ['autoSync', 'Auto-Sync on Startup'],
                ['syncProfiles', 'Sync Settings Profiles'],
                ['syncAutoStartRules', 'Sync Auto-Start URLs'],
                ['syncTemplates', 'Sync Keyword Templates'],
                ['syncScriptsAndMacros', 'Sync Scripts & Macros'],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer"
              >
                <span className="font-medium">{label}</span>
                <Switch
                  checked={state.sync[key]}
                  onCheckedChange={(v) =>
                    void onUpdateState((s) => ({
                      ...s,
                      sync: { ...s.sync, [key]: v },
                    }))
                  }
                />
              </label>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Paste exported PulseRefresh JSON backup to import..."
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              className="text-xs font-mono"
            />
            <Button
              variant="outline"
              onClick={async () => {
                if (!importJsonText.trim()) return;
                const r = await importBackupJson(importJsonText);
                if (r.ok) {
                  setImportJsonText('');
                  await onReloadState();
                  onNotify('Backup imported successfully!');
                } else {
                  onNotify(r.error || 'Import failed');
                }
              }}
            >
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Devices Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Laptop className="h-4 w-4 text-primary" /> Synced Devices
              </CardTitle>
              <CardDescription>
                View, rename, or remove browsers connected to your synced PulseRefresh
                settings.
              </CardDescription>
            </div>
            <Badge variant="success">
              {devices.length} {devices.length === 1 ? 'Device' : 'Devices'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={deviceNameDraft}
              onChange={(e) => setDeviceNameDraft(e.target.value)}
              placeholder="Rename this device..."
              className="max-w-sm"
            />
            <Button
              variant="outline"
              onClick={async () => {
                await renameCurrentDevice(deviceNameDraft);
                await onReloadState();
                await refreshDevices();
                onNotify('Updated current device name.');
              }}
            >
              Rename This Device
            </Button>
          </div>

          <div className="space-y-2">
            {(devices.length > 0 ? devices : [state.currentDevice]).map((dev) => {
              const isSelf = dev.id === state.currentDevice.id;
              return (
                <div
                  key={dev.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3.5 py-2.5 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{dev.name}</span>
                      {isSelf && <Badge variant="success">This Device</Badge>}
                      <Badge variant="outline">
                        {dev.browser} · {dev.platform}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground mt-0.5">
                      v{dev.extensionVersion} · Active jobs: {dev.activeJobsCount} · Last
                      sync: {formatTimestamp(dev.lastSyncedAt)}
                    </div>
                  </div>
                  {!isSelf && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const updated = await removeSyncedDevice(dev.id);
                        setDevices(updated);
                        onNotify(`Removed device "${dev.name}".`);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
