import React, { useState } from 'react';
import {
  Bell,
  BookTemplate,
  Crosshair,
  Mail,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  Webhook,
} from 'lucide-react';
import { playAlertTone } from '@/src/lib/alerts';
import { getBrowser } from '@/src/lib/browser-api';
import {
  createCustomKeywordTemplate,
  evaluateKeywordRules,
  instantiateKeywordTemplate,
  validateExpression,
} from '@/src/lib/expression-engine';
import type {
  AlertSoundTone,
  ChangeDetectionMethod,
  EmailProvider,
  ExpressionType,
  ExtensionMessage,
  GlobalExtensionState,
  MonitoringMode,
  NumericOperator,
  SettingsProfile,
  WebhookPreset,
} from '@/src/lib/types';
import { generateId } from '@/src/lib/utils';
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
import { Label, Switch } from '@/src/components/ui/primitives';
import { Select } from '@/src/components/ui/select';

// ============================================================================
// 3 & 4. Page Monitor + Advanced Monitoring Panel
// ============================================================================

export function PageMonitorPanel({
  profile,
  onUpdateProfile,
  state,
  onUpdateState,
  onNotify,
}: {
  profile: SettingsProfile;
  onUpdateProfile: (u: (p: SettingsProfile) => SettingsProfile) => Promise<void>;
  state: GlobalExtensionState;
  onUpdateState: (u: (s: GlobalExtensionState) => GlobalExtensionState) => Promise<void>;
  onNotify: (msg: string) => void;
}) {
  const m = profile.monitor;
  const [expr, setExpr] = useState('');
  const [exprType, setExprType] = useState<ExpressionType>('plain');
  const [caseSens, setCaseSens] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [sampleText, setSampleText] = useState(
    'Limited Edition GPU — $449.00 — In Stock! Click Add to Cart before midnight.',
  );
  const [tplName, setTplName] = useState('');
  const [tplExpr, setTplExpr] = useState('');
  const [tplVars, setTplVars] = useState<Record<string, string>>({});

  const liveEval = evaluateKeywordRules(m.keywords, sampleText, m.matchLogic);

  const handleAddRule = async () => {
    const check = validateExpression(expr, exprType);
    if (!check.valid) {
      onNotify(check.error || 'Invalid expression');
      return;
    }
    await onUpdateProfile((p) => ({
      ...p,
      monitor: {
        ...p.monitor,
        enabled: true,
        keywords: [
          ...p.monitor.keywords,
          {
            id: generateId('kw'),
            expression: expr.trim(),
            type: exprType,
            caseSensitive: caseSens,
            wholeWord,
            enabled: true,
          },
        ],
      },
    }));
    setExpr('');
    onNotify('Added target keyword expression.');
  };

  const handleCreateTemplate = async () => {
    if (!tplName.trim() || !tplExpr.trim()) return;
    const created = createCustomKeywordTemplate({
      name: tplName,
      mode: m.mode,
      matchLogic: m.matchLogic,
      rules: [
        {
          expression: tplExpr.trim(),
          type: tplExpr.startsWith('/') ? 'regex' : tplExpr.includes('*') ? 'wildcard' : 'plain',
          caseSensitive: false,
          wholeWord: false,
          enabled: true,
          label: tplName.trim(),
        },
      ],
    });
    await onUpdateState((s) => ({
      ...s,
      templates: [...s.templates, created],
    }));
    setTplName('');
    setTplExpr('');
    onNotify(`Saved keyword template "${created.name}".`);
  };

  return (
    <div className="space-y-5">
      {/* Refresh Types, Monitoring Modes & Change Detection */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Refresh Types, Monitoring Mode & Change Detection</CardTitle>
              <CardDescription>
                Choose between a full tab reload or flicker-free background XHR checks to
                detect content changes instantly.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Monitor Active</Label>
              <Switch
                checked={m.enabled}
                onCheckedChange={(v) =>
                  void onUpdateProfile((p) => ({
                    ...p,
                    monitor: { ...p.monitor, enabled: v },
                  }))
                }
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="space-y-1.5">
            <Label>Refresh Type</Label>
            <Select
              value={m.refreshType}
              onChange={(e) =>
                void onUpdateProfile((p) => ({
                  ...p,
                  monitor: {
                    ...p.monitor,
                    refreshType: e.target.value as 'full' | 'xhr',
                  },
                }))
              }
            >
              <option value="full">Full Page Refresh</option>
              <option value="xhr">XHR Silent Background Refresh</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Monitoring Mode</Label>
            <Select
              value={m.mode}
              onChange={(e) =>
                void onUpdateProfile((p) => ({
                  ...p,
                  monitor: {
                    ...p.monitor,
                    mode: e.target.value as MonitoringMode,
                  },
                }))
              }
            >
              <option value="keyword_found">Keyword Appears (Found)</option>
              <option value="keyword_lost">Keyword Disappears (Lost)</option>
              <option value="any_change">Any Content Change (Diff)</option>
              <option value="numeric_threshold">Price / Number Threshold</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Change Detection Method</Label>
            <Select
              value={m.changeDetectionMethod}
              onChange={(e) =>
                void onUpdateProfile((p) => ({
                  ...p,
                  monitor: {
                    ...p.monitor,
                    changeDetectionMethod: e.target.value as ChangeDetectionMethod,
                  },
                }))
              }
            >
              <option value="text">Visible Text Diff</option>
              <option value="html">Structural HTML Diff</option>
              <option value="dom_hash">FNV-1a DOM Fingerprint</option>
              <option value="visual_attribute">Visual & Attribute State</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Keyword Match Logic</Label>
            <Select
              value={m.matchLogic}
              onChange={(e) =>
                void onUpdateProfile((p) => ({
                  ...p,
                  monitor: {
                    ...p.monitor,
                    matchLogic: e.target.value as 'any' | 'all',
                  },
                }))
              }
            >
              <option value="any">Match ANY Rule (OR)</option>
              <option value="all">Match ALL Rules (AND)</option>
            </Select>
          </div>

          {m.mode === 'numeric_threshold' && (
            <div className="sm:col-span-2 flex items-end gap-2">
              <div className="space-y-1 w-36">
                <Label>Numeric Operator</Label>
                <Select
                  value={m.numericThreshold.operator}
                  onChange={(e) =>
                    void onUpdateProfile((p) => ({
                      ...p,
                      monitor: {
                        ...p.monitor,
                        numericThreshold: {
                          ...p.monitor.numericThreshold,
                          operator: e.target.value as NumericOperator,
                        },
                      },
                    }))
                  }
                >
                  <option value="<">Less than (&lt;)</option>
                  <option value="<=">At most (&lt;=)</option>
                  <option value=">">Greater than (&gt;)</option>
                  <option value=">=">At least (&gt;=)</option>
                  <option value="==">Equals (==)</option>
                  <option value="!=">Not equal (!=)</option>
                  <option value="pct_change">% Change (&gt;= %)</option>
                </Select>
              </div>
              <div className="space-y-1 flex-1">
                <Label>Target Value</Label>
                <Input
                  type="number"
                  value={m.numericThreshold.value}
                  onChange={(e) =>
                    void onUpdateProfile((p) => ({
                      ...p,
                      monitor: {
                        ...p.monitor,
                        numericThreshold: {
                          ...p.monitor.numericThreshold,
                          value: Number(e.target.value) || 0,
                        },
                      },
                    }))
                  }
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Predefined Keywords + Supported Expressions + Live Tester */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Target Keywords & Supported
            Expressions
          </CardTitle>
          <CardDescription>
            Supports Plain text, Wildcards (<code>*</code>, <code>?</code>), Regex (
            <code>/pattern/i</code>), Boolean (<code>("A" OR "B") AND NOT "C"</code>),
            CSS selectors, XPath, and Numeric rules (<code>&lt; 499</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <Select
              value={exprType}
              onChange={(e) => setExprType(e.target.value as ExpressionType)}
              className="sm:col-span-2"
            >
              <option value="plain">Plain Text</option>
              <option value="wildcard">Wildcard</option>
              <option value="regex">Regex</option>
              <option value="boolean">Boolean</option>
              <option value="css">CSS Selector</option>
              <option value="xpath">XPath</option>
              <option value="numeric">Numeric</option>
            </Select>
            <Input
              placeholder='e.g. ("In Stock" OR "Buy Now") AND NOT "Sold Out"'
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleAddRule()}
              className="sm:col-span-6 font-mono text-xs"
            />
            <div className="sm:col-span-2 flex items-center gap-3 text-xs px-1">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={caseSens}
                  onChange={(e) => setCaseSens(e.target.checked)}
                />
                Aa
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wholeWord}
                  onChange={(e) => setWholeWord(e.target.checked)}
                />
                Word
              </label>
            </div>
            <Button onClick={() => void handleAddRule()} className="sm:col-span-2">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>

          {m.keywords.length > 0 && (
            <div className="space-y-1.5">
              {m.keywords.map((kw) => (
                <div
                  key={kw.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Switch
                      checked={kw.enabled}
                      onCheckedChange={(v) =>
                        void onUpdateProfile((p) => ({
                          ...p,
                          monitor: {
                            ...p.monitor,
                            keywords: p.monitor.keywords.map((k) =>
                              k.id === kw.id ? { ...k, enabled: v } : k,
                            ),
                          },
                        }))
                      }
                    />
                    <Badge variant="outline">{kw.type}</Badge>
                    <code className="truncate">{kw.expression}</code>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      void onUpdateProfile((p) => ({
                        ...p,
                        monitor: {
                          ...p.monitor,
                          keywords: p.monitor.keywords.filter((k) => k.id !== kw.id),
                        },
                      }))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Live Expression Sandbox */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">Live Expression Sandbox</span>
              <Badge variant={liveEval.matched ? 'success' : 'secondary'}>
                {liveEval.matched
                  ? `Matched (${liveEval.matchedKeywords.join(', ')})`
                  : 'No Match'}
              </Badge>
            </div>
            <Input
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value)}
              className="text-xs bg-card"
            />
          </div>
        </CardContent>
      </Card>

      {/* Keyword Templates Library + Creator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookTemplate className="h-4 w-4 text-primary" /> Keyword Templates
          </CardTitle>
          <CardDescription>
            Apply ready-made templates or define reusable templates with{' '}
            <code>{'{{variable}}'}</code> placeholders.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {state.templates.map((tpl) => (
              <div
                key={tpl.id}
                className="rounded-lg border border-border p-3 flex flex-col justify-between gap-2.5"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{tpl.name}</span>
                    <Badge variant="secondary">{tpl.category}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {tpl.description}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {tpl.variables.map((v) => (
                    <Input
                      key={v}
                      placeholder={`{{${v}}}`}
                      value={tplVars[`${tpl.id}_${v}`] ?? ''}
                      onChange={(e) =>
                        setTplVars((prev) => ({
                          ...prev,
                          [`${tpl.id}_${v}`]: e.target.value,
                        }))
                      }
                      className="h-7 text-xs w-32"
                    />
                  ))}
                  <Button
                    size="xs"
                    onClick={() => {
                      const values: Record<string, string> = {};
                      tpl.variables.forEach((v) => {
                        values[v] = tplVars[`${tpl.id}_${v}`] ?? '';
                      });
                      const rules = instantiateKeywordTemplate(tpl, values).filter(
                        (r) => r.enabled,
                      );
                      void onUpdateProfile((p) => ({
                        ...p,
                        monitor: {
                          ...p.monitor,
                          enabled: true,
                          mode: tpl.mode,
                          keywords: [...p.monitor.keywords, ...rules],
                        },
                      }));
                      onNotify(`Applied template "${tpl.name}" (${rules.length} rules).`);
                    }}
                  >
                    Apply
                  </Button>
                  {!tpl.builtIn && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        void onUpdateState((s) => ({
                          ...s,
                          templates: s.templates.filter((x) => x.id !== tpl.id),
                        }))
                      }
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-2 border-t border-border">
            <Input
              placeholder="New template name..."
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              className="sm:col-span-4"
            />
            <Input
              placeholder="Pattern with {{variable}}, e.g. {{item}} * in stock"
              value={tplExpr}
              onChange={(e) => setTplExpr(e.target.value)}
              className="sm:col-span-6 font-mono text-xs"
            />
            <Button
              variant="outline"
              onClick={() => void handleCreateTemplate()}
              className="sm:col-span-2"
            >
              Save Template
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Advanced Monitoring & Timing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-primary" /> Advanced Monitoring & Timing
          </CardTitle>
          <CardDescription>
            Custom Page Area, Highlight, Scroll, Auto-Click on Match, Continue on
            Detection, Real-Time MutationObserver, and Post-Load Delay.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <Select
              value={m.customAreaSelectorType}
              onChange={(e) =>
                void onUpdateProfile((p) => ({
                  ...p,
                  monitor: {
                    ...p.monitor,
                    customAreaSelectorType: e.target.value as 'css' | 'xpath',
                  },
                }))
              }
              className="sm:col-span-2"
            >
              <option value="css">CSS Selector</option>
              <option value="xpath">XPath</option>
            </Select>
            <Input
              placeholder="#product-buybox, [data-testid='inventory'], or //div[@id='price']"
              value={m.customAreaSelector}
              onChange={(e) =>
                void onUpdateProfile((p) => ({
                  ...p,
                  monitor: {
                    ...p.monitor,
                    customAreaEnabled: e.target.value.trim().length > 0,
                    customAreaSelector: e.target.value,
                  },
                }))
              }
              className="sm:col-span-7 font-mono text-xs"
            />
            <div className="sm:col-span-3 flex items-center gap-2">
              <Label className="text-xs shrink-0">Highlight</Label>
              <input
                type="color"
                value={m.highlightColor}
                onChange={(e) =>
                  void onUpdateProfile((p) => ({
                    ...p,
                    monitor: { ...p.monitor, highlightColor: e.target.value },
                  }))
                }
                className="h-8 w-12 rounded border border-border cursor-pointer"
              />
              <Input
                type="number"
                min={0}
                value={m.postLoadDelayMs}
                onChange={(e) =>
                  void onUpdateProfile((p) => ({
                    ...p,
                    monitor: {
                      ...p.monitor,
                      postLoadDelayMs: Math.max(0, Number(e.target.value) || 0),
                    },
                  }))
                }
                title="Post-load settle delay (ms)"
                className="h-8 text-xs tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {[
              {
                label: 'Continue Refreshing on Detection',
                checked: m.continueOnDetection,
                set: (v: boolean) =>
                  onUpdateProfile((p) => ({
                    ...p,
                    monitor: { ...p.monitor, continueOnDetection: v },
                  })),
              },
              {
                label: 'Real-Time Detection (MutationObserver)',
                checked: m.realTimeMutationObserver,
                set: (v: boolean) =>
                  onUpdateProfile((p) => ({
                    ...p,
                    monitor: { ...p.monitor, realTimeMutationObserver: v },
                  })),
              },
              {
                label: 'Run Detection After Full Load',
                checked: m.runAfterLoad,
                set: (v: boolean) =>
                  onUpdateProfile((p) => ({
                    ...p,
                    monitor: { ...p.monitor, runAfterLoad: v },
                  })),
              },
              {
                label: 'Highlight Detected Keyword',
                checked: m.highlightDetected,
                set: (v: boolean) =>
                  onUpdateProfile((p) => ({
                    ...p,
                    monitor: { ...p.monitor, highlightDetected: v },
                  })),
              },
              {
                label: 'Smooth Scroll to Keyword',
                checked: m.scrollToDetected,
                set: (v: boolean) =>
                  onUpdateProfile((p) => ({
                    ...p,
                    monitor: { ...p.monitor, scrollToDetected: v },
                  })),
              },
              {
                label: 'Auto-Click on Keyword Match',
                checked: m.autoClickOnMatch,
                set: (v: boolean) =>
                  onUpdateProfile((p) => ({
                    ...p,
                    monitor: { ...p.monitor, autoClickOnMatch: v },
                  })),
              },
            ].map((item) => (
              <label
                key={item.label}
                className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 cursor-pointer"
              >
                <span className="font-medium">{item.label}</span>
                <Switch
                  checked={item.checked}
                  onCheckedChange={(v) => void item.set(v)}
                />
              </label>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// 5. Alerts & Notifications Panel
// ============================================================================

export function AlertsPanel({
  state,
  onUpdateState,
  onNotify,
}: {
  state: GlobalExtensionState;
  onUpdateState: (u: (s: GlobalExtensionState) => GlobalExtensionState) => Promise<void>;
  onNotify: (msg: string) => void;
}) {
  const { alerts, emailQuota } = state;
  const [whName, setWhName] = useState('');
  const [whPreset, setWhPreset] = useState<WebhookPreset>('generic');
  const [whUrl, setWhUrl] = useState('');
  const [whSecret, setWhSecret] = useState('');

  const handleAddWebhook = async () => {
    if (!whUrl.trim()) return;
    await onUpdateState((s) => ({
      ...s,
      alerts: {
        ...s.alerts,
        webhooks: [
          ...s.alerts.webhooks,
          {
            id: generateId('wh'),
            name: whName.trim() || `${whPreset.toUpperCase()} Webhook`,
            enabled: true,
            preset: whPreset,
            url: whUrl.trim(),
            secret: whSecret.trim(),
            headers: {},
            payloadTemplate: '',
            maxRetries: 2,
          },
        ],
      },
    }));
    setWhName('');
    setWhUrl('');
    setWhSecret('');
    onNotify('Added webhook endpoint.');
  };

  return (
    <div className="space-y-5">
      {/* Push Notifications & Window Focus */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" /> Push Notifications & Window Focus
              </CardTitle>
              <CardDescription>
                Desktop notifications, synthesized Web Audio alert chimes, and automatic
                browser window focus.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                playAlertTone(alerts.soundTone, alerts.soundVolume);
                await getBrowser().runtime.sendMessage({
                  type: 'TEST_NOTIFICATION',
                } satisfies ExtensionMessage);
                onNotify('Sent test desktop notification!');
              }}
            >
              <Send className="h-3.5 w-3.5" /> Test Push
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex items-center justify-between rounded-lg border border-border p-3.5 cursor-pointer">
            <div>
              <div className="text-sm font-medium">Push Notifications</div>
              <div className="text-xs text-muted-foreground">
                Click notification to jump to tab
              </div>
            </div>
            <Switch
              checked={alerts.pushNotifications}
              onCheckedChange={(v) =>
                void onUpdateState((s) => ({
                  ...s,
                  alerts: { ...s.alerts, pushNotifications: v },
                }))
              }
            />
          </label>

          <label className="flex items-center justify-between rounded-lg border border-border p-3.5 cursor-pointer">
            <div>
              <div className="text-sm font-medium">Window Focus on Detection</div>
              <div className="text-xs text-muted-foreground">
                Brings window & tab to front
              </div>
            </div>
            <Switch
              checked={alerts.focusWindowOnDetection}
              onCheckedChange={(v) =>
                void onUpdateState((s) => ({
                  ...s,
                  alerts: { ...s.alerts, focusWindowOnDetection: v },
                }))
              }
            />
          </label>

          <div className="flex items-center gap-2 rounded-lg border border-border p-3.5">
            <div className="flex-1 space-y-1">
              <Label>Alert Sound Chime</Label>
              <Select
                value={alerts.soundTone}
                onChange={(e) =>
                  void onUpdateState((s) => ({
                    ...s,
                    alerts: {
                      ...s.alerts,
                      soundTone: e.target.value as AlertSoundTone,
                    },
                  }))
                }
                className="h-8 text-xs"
              >
                <option value="chime">Chime (Melodic)</option>
                <option value="radar">Radar Ping</option>
                <option value="bell">Crystal Bell</option>
                <option value="urgent">Urgent Alert</option>
                <option value="none">Muted</option>
              </Select>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => playAlertTone(alerts.soundTone, alerts.soundVolume)}
              title="Preview chime"
            >
              <Volume2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Self-Contained Email Alerts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" /> Email Alerts
              </CardTitle>
              <CardDescription>
                Send direct email notifications via Resend, SendGrid, EmailJS, or a custom
                HTTPS relay. Sent today: <strong>{emailQuota.sentCount}</strong>
                {alerts.email.dailyLimit ? ` / ${alerts.email.dailyLimit}` : ''}.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={alerts.email.enabled}
                onCheckedChange={(v) =>
                  void onUpdateState((s) => ({
                    ...s,
                    alerts: {
                      ...s.alerts,
                      email: { ...s.alerts.email, enabled: v },
                    },
                  }))
                }
              />
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const res = (await getBrowser().runtime.sendMessage({
                    type: 'TEST_EMAIL',
                    email: alerts.email,
                  } satisfies ExtensionMessage)) as { sent?: boolean; error?: string };
                  onNotify(
                    res?.sent
                      ? 'Test email dispatched successfully!'
                      : `Email test: ${res?.error || 'Check API key & recipient'}`,
                  );
                }}
              >
                Test Email
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label>Provider</Label>
            <Select
              value={alerts.email.provider}
              onChange={(e) =>
                void onUpdateState((s) => ({
                  ...s,
                  alerts: {
                    ...s.alerts,
                    email: {
                      ...s.alerts.email,
                      provider: e.target.value as EmailProvider,
                    },
                  },
                }))
              }
            >
              <option value="resend">Resend API</option>
              <option value="sendgrid">SendGrid API</option>
              <option value="emailjs">EmailJS</option>
              <option value="custom_http">Custom HTTP Relay</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Recipient Email</Label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={alerts.email.toEmail}
              onChange={(e) =>
                void onUpdateState((s) => ({
                  ...s,
                  alerts: {
                    ...s.alerts,
                    email: { ...s.alerts.email, toEmail: e.target.value },
                  },
                }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>Provider API Key</Label>
            <Input
              type="password"
              placeholder="re_... / SG...."
              value={alerts.email.apiKey}
              onChange={(e) =>
                void onUpdateState((s) => ({
                  ...s,
                  alerts: {
                    ...s.alerts,
                    email: { ...s.alerts.email, apiKey: e.target.value },
                  },
                }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>Daily Safety Cap</Label>
            <Select
              value={
                alerts.email.dailyLimit == null
                  ? 'unlimited'
                  : String(alerts.email.dailyLimit)
              }
              onChange={(e) =>
                void onUpdateState((s) => ({
                  ...s,
                  alerts: {
                    ...s.alerts,
                    email: {
                      ...s.alerts.email,
                      dailyLimit:
                        e.target.value === 'unlimited'
                          ? null
                          : Number(e.target.value),
                    },
                  },
                }))
              }
            >
              <option value="unlimited">No Daily Cap</option>
              <option value="1000">1,000 / day</option>
              <option value="200">200 / day</option>
              <option value="10">10 / day</option>
            </Select>
          </div>
          {alerts.email.provider === 'custom_http' && (
            <div className="sm:col-span-4 space-y-1">
              <Label>Custom HTTP Relay Endpoint</Label>
              <Input
                placeholder="https://your-worker.example.com/send-email"
                value={alerts.email.customEndpointUrl}
                onChange={(e) =>
                  void onUpdateState((s) => ({
                    ...s,
                    alerts: {
                      ...s.alerts,
                      email: {
                        ...s.alerts.email,
                        customEndpointUrl: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Webhook Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-primary" /> Webhook Integration
          </CardTitle>
          <CardDescription>
            Deliver signed JSON, Slack, Discord, or Telegram webhooks with automatic retry
            backoff and <code>{'{{keyword}}'}</code> / <code>{'{{url}}'}</code> variables.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <Input
              placeholder="Name (e.g. Ops Slack)"
              value={whName}
              onChange={(e) => setWhName(e.target.value)}
              className="sm:col-span-2"
            />
            <Select
              value={whPreset}
              onChange={(e) => setWhPreset(e.target.value as WebhookPreset)}
              className="sm:col-span-2"
            >
              <option value="generic">Generic JSON</option>
              <option value="slack">Slack</option>
              <option value="discord">Discord</option>
              <option value="telegram">Telegram</option>
            </Select>
            <Input
              placeholder="https://hooks.slack.com/services/..."
              value={whUrl}
              onChange={(e) => setWhUrl(e.target.value)}
              className="sm:col-span-4 font-mono text-xs"
            />
            <Input
              placeholder="HMAC secret (optional)"
              value={whSecret}
              onChange={(e) => setWhSecret(e.target.value)}
              className="sm:col-span-2 text-xs"
            />
            <Button onClick={() => void handleAddWebhook()} className="sm:col-span-2">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>

          {alerts.webhooks.length > 0 && (
            <div className="space-y-2">
              {alerts.webhooks.map((wh) => (
                <div
                  key={wh.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Switch
                      checked={wh.enabled}
                      onCheckedChange={(v) =>
                        void onUpdateState((s) => ({
                          ...s,
                          alerts: {
                            ...s.alerts,
                            webhooks: s.alerts.webhooks.map((x) =>
                              x.id === wh.id ? { ...x, enabled: v } : x,
                            ),
                          },
                        }))
                      }
                    />
                    <span className="font-medium">{wh.name}</span>
                    <Badge variant="outline">{wh.preset}</Badge>
                    {wh.secret && <Badge variant="success">HMAC-SHA256</Badge>}
                    <code className="truncate text-muted-foreground max-w-[260px]">
                      {wh.url}
                    </code>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={async () => {
                        const r = (await getBrowser().runtime.sendMessage({
                          type: 'TEST_WEBHOOK',
                          webhook: wh,
                        } satisfies ExtensionMessage)) as {
                          ok?: boolean;
                          error?: string;
                        };
                        onNotify(
                          r?.ok
                            ? `Webhook "${wh.name}" delivered!`
                            : `Webhook test failed: ${r?.error || 'Network error'}`,
                        );
                      }}
                    >
                      Test
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        void onUpdateState((s) => ({
                          ...s,
                          alerts: {
                            ...s.alerts,
                            webhooks: s.alerts.webhooks.filter((x) => x.id !== wh.id),
                          },
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
    </div>
  );
}
