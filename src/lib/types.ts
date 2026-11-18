// ============================================================================
// PulseRefresh — Complete Domain & Messaging Types
// ============================================================================

export type IntervalMode = 'predefined' | 'custom' | 'random' | 'countdown';
export type CountdownMode = 'duration' | 'target_time';
export type VisualTimerPosition =
  | 'top-right'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-left';
export type VisualTimerStyle = 'ring' | 'pill' | 'minimal';
export type InteractionAction = 'stop' | 'pause';

export type UrlMatchType = 'exact' | 'prefix' | 'wildcard' | 'regex';
export type RedirectPolicy =
  | 'follow'
  | 'stop'
  | 'revert'
  | 'allow-same-origin';
export type ErrorAction = 'stop' | 'continue' | 'backoff' | 'alert-and-pause';
export type SleepLevel = 'system' | 'display';

export type RefreshType = 'full' | 'xhr';
export type MonitoringMode =
  | 'keyword_found'
  | 'keyword_lost'
  | 'any_change'
  | 'numeric_threshold';
export type ChangeDetectionMethod =
  | 'text'
  | 'html'
  | 'dom_hash'
  | 'visual_attribute';
export type ExpressionType =
  | 'plain'
  | 'wildcard'
  | 'regex'
  | 'css'
  | 'xpath'
  | 'boolean'
  | 'numeric';
export type NumericOperator = '<' | '<=' | '>' | '>=' | '==' | '!=' | 'pct_change';
export type KeywordMatchLogic = 'any' | 'all';

export type JobStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'detected'
  | 'captcha_paused'
  | 'error_paused'
  | 'redirect_stopped'
  | 'stopped';

export interface CustomIntervalParts {
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

export interface VisualTimerConfig {
  enabled: boolean;
  position: VisualTimerPosition;
  style: VisualTimerStyle;
  opacity: number; // 0.3 - 1.0
  showProgressRing: boolean;
  showControls: boolean;
}

export interface RefreshControlsConfig {
  intervalMode: IntervalMode;
  predefinedSeconds: number;
  customInterval: CustomIntervalParts;
  randomMinSeconds: number;
  randomMaxSeconds: number;
  countdownMode: CountdownMode;
  countdownDurationSeconds: number;
  countdownTargetTimestamp: number | null;
  repeatAfterCountdown: boolean;
  visualTimer: VisualTimerConfig;
  hardRefresh: boolean;
  maxRefreshes: number; // 0 = unlimited
  preventFormResubmission: boolean;
  protectDirtyForms: boolean;
  keepPageActive: boolean;
  stopOnInteraction: boolean;
  interactionAction: InteractionAction;
}

export interface UrlJobConfig {
  usePredefinedUrl: boolean;
  predefinedUrl: string;
  rotationUrls: string[];
  redirectPolicy: RedirectPolicy;
  detectCaptcha: boolean;
  detectErrorPage: boolean;
  errorAction: ErrorAction;
  errorStatusCodes: number[];
  preventSystemSleep: boolean;
  sleepLevel: SleepLevel;
}

export interface TargetKeywordRule {
  id: string;
  expression: string;
  type: ExpressionType;
  caseSensitive: boolean;
  wholeWord: boolean;
  enabled: boolean;
  label?: string;
}

export interface NumericThresholdConfig {
  operator: NumericOperator;
  value: number;
  baselineValue?: number | null;
}

export interface KeywordTemplate {
  id: string;
  name: string;
  description: string;
  category: 'ecommerce' | 'booking' | 'pricing' | 'devops' | 'custom';
  mode: MonitoringMode;
  matchLogic: KeywordMatchLogic;
  variables: string[];
  rules: Omit<TargetKeywordRule, 'id'>[];
  builtIn?: boolean;
}

export interface PageMonitorConfig {
  enabled: boolean;
  refreshType: RefreshType;
  xhrFallbackToFull: boolean;
  mode: MonitoringMode;
  changeDetectionMethod: ChangeDetectionMethod;
  ignoreNumbersInDiff: boolean;
  ignoreWhitespaceInDiff: boolean;
  keywords: TargetKeywordRule[];
  matchLogic: KeywordMatchLogic;
  activeTemplateId: string | null;
  numericThreshold: NumericThresholdConfig;
  continueOnDetection: boolean;
  alertCooldownSeconds: number;
  realTimeMutationObserver: boolean;
  mutationDebounceMs: number;
  runAfterLoad: boolean;
  postLoadDelayMs: number;
  // Advanced Monitoring
  customAreaEnabled: boolean;
  customAreaSelector: string;
  customAreaSelectorType: 'css' | 'xpath';
  highlightDetected: boolean;
  highlightColor: string;
  scrollToDetected: boolean;
  autoClickOnMatch: boolean;
  autoClickCompanionSelector: string;
  autoClickDelayMs: number;
  maxAutoClicks: number;
}

export type AlertSoundTone = 'none' | 'chime' | 'radar' | 'bell' | 'urgent';
export type EmailProvider = 'resend' | 'sendgrid' | 'emailjs' | 'custom_http';
export type WebhookPreset = 'generic' | 'slack' | 'discord' | 'telegram';

export interface EmailAlertConfig {
  enabled: boolean;
  provider: EmailProvider;
  toEmail: string;
  fromEmail: string;
  apiKey: string;
  customEndpointUrl: string;
  emailJsServiceId: string;
  emailJsTemplateId: string;
  subjectTemplate: string;
  dailyLimit: number | null; // null = unlimited (unlocked default)
}

export interface EmailQuotaState {
  dateKey: string;
  sentCount: number;
  lastSentAt: number | null;
}

export interface WebhookEndpoint {
  id: string;
  name: string;
  enabled: boolean;
  preset: WebhookPreset;
  url: string;
  secret: string; // optional HMAC-SHA256 signing secret
  headers: Record<string, string>;
  payloadTemplate: string; // optional custom template with {{url}}, {{keyword}}, etc.
  telegramChatId?: string;
  maxRetries: number;
}

export interface AlertsConfig {
  pushNotifications: boolean;
  soundTone: AlertSoundTone;
  soundVolume: number; // 0.0 - 1.0
  focusWindowOnDetection: boolean;
  email: EmailAlertConfig;
  webhooks: WebhookEndpoint[];
}

export interface AutoClickTarget {
  id: string;
  label: string;
  selector: string;
  selectorType: 'css' | 'xpath';
  textFilter?: string;
  delayMs: number;
  waitTimeoutMs: number;
  maxRetries: number;
  enabled: boolean;
}

export type ScriptRunTiming = 'before_refresh' | 'after_load' | 'on_detection';

export type ScriptActionType =
  | 'click_selector'
  | 'remove_selector'
  | 'scroll_bottom'
  | 'check_input'
  | 'fill_input'
  | 'extract_text'
  | 'custom_js';

export interface CustomScript {
  id: string;
  name: string;
  description: string;
  source: 'marketplace' | 'custom' | 'ai';
  category: string;
  enabled: boolean;
  urlPattern: string;
  timing: ScriptRunTiming;
  code: string;
  actions: Array<{
    type: ScriptActionType;
    selector?: string;
    value?: string;
  }>;
  installedAt: number;
}

export interface AiAutomationConfig {
  providerName: string;
  endpointUrl: string; // e.g. https://api.openai.com/v1/chat/completions
  apiKey: string;
  model: string;
}

export type HotkeyCommandId =
  | 'toggle-refresh'
  | 'stop-all-refreshes'
  | 'pick-monitor-area'
  | 'toggle-visual-timer'
  | 'pause-resume-refresh'
  | 'run-monitor-now';

export interface HotkeyBinding {
  id: HotkeyCommandId;
  label: string;
  combo: string; // e.g. "Alt+Shift+R"
  enabled: boolean;
  inPageEnabled: boolean;
}

export type CookieRuleAction =
  | 'clear_all'
  | 'delete_matching'
  | 'set_cookie'
  | 'keep_only';

export interface CookieAutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  domainPattern: string;
  timing: 'before_refresh' | 'after_load';
  action: CookieRuleAction;
  cookieNames: string[]; // for delete_matching or keep_only
  cookieToSet?: {
    name: string;
    value: string;
    path?: string;
    secure?: boolean;
    sameSite?: 'no_restriction' | 'lax' | 'strict';
    expirationSeconds?: number;
  };
}

export interface CookieSnapshot {
  id: string;
  name: string;
  domain: string;
  createdAt: number;
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite?: 'no_restriction' | 'lax' | 'strict' | 'unspecified';
    expirationDate?: number;
  }>;
}

export type MacroStepType =
  | 'click'
  | 'fill'
  | 'select'
  | 'check'
  | 'keypress'
  | 'scroll'
  | 'wait'
  | 'wait_for_selector'
  | 'extract_text'
  | 'navigate'
  | 'webhook';

export interface MacroStep {
  id: string;
  type: MacroStepType;
  label?: string;
  selector?: string;
  value?: string;
  delayMs?: number;
  timeoutMs?: number;
  continueOnError?: boolean;
}

export interface AutomationMacro {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  runOnDetection: boolean;
  steps: MacroStep[];
  createdAt: number;
}

export interface AutoStartRule {
  id: string;
  name: string;
  pattern: string;
  matchType: UrlMatchType;
  intervalSeconds: number;
  profileId: string | null;
  enabled: boolean;
}

export interface SettingsProfile {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  urlPattern?: string;
  refresh: RefreshControlsConfig;
  urlConfig: UrlJobConfig;
  monitor: PageMonitorConfig;
  autoClickTargetIds: string[];
  macroId: string | null;
  updatedAt: number;
}

export interface DeviceInfo {
  id: string;
  name: string;
  browser: 'chrome' | 'firefox' | 'edge' | 'safari' | 'other';
  platform: string;
  extensionVersion: string;
  lastSyncedAt: number;
  createdAt: number;
  activeJobsCount: number;
}

export interface SyncSettingsConfig {
  enabled: boolean;
  autoSync: boolean;
  syncProfiles: boolean;
  syncAutoStartRules: boolean;
  syncTemplates: boolean;
  syncScriptsAndMacros: boolean;
  syncAlerts: boolean;
  maxDevices: number | null; // null = unlimited (unlocked default)
  lastSyncedAt: number | null;
  revision: number;
}

export interface TabJob {
  tabId: number;
  windowId: number;
  url: string;
  initialUrl: string;
  title: string;
  status: JobStatus;
  profileId: string | null;
  refresh: RefreshControlsConfig;
  urlConfig: UrlJobConfig;
  monitor: PageMonitorConfig;
  autoClickTargets: AutoClickTarget[];
  macroId: string | null;
  // Runtime telemetry
  refreshCount: number;
  detectionCount: number;
  autoClickCount: number;
  rotationIndex: number;
  backoffAttempt: number;
  currentIntervalMs: number;
  nextRefreshAt: number | null;
  remainingMsOnPause: number | null;
  startedAt: number;
  lastRefreshAt: number | null;
  lastAlertAt: number | null;
  lastSnapshot: string | null;
  lastSnapshotHash: string | null;
  lastNumericValue: number | null;
  lastMatchedKeyword: string | null;
  lastDiffSnippet: string | null;
  lastError: string | null;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'success' | 'warning' | 'error';
  category:
    | 'refresh'
    | 'url'
    | 'monitor'
    | 'alert'
    | 'automation'
    | 'sync';
  tabId?: number;
  url?: string;
  message: string;
  details?: string;
}

export interface FeatureChecklistItem {
  id: string;
  category:
    | 'Refresh Controls'
    | 'URL & Tab Automation'
    | 'Page Monitor'
    | 'Advanced Monitoring'
    | 'Alerts & Notifications'
    | 'Automation Tools'
    | 'Account & Sync';
  title: string;
  description: string;
  implemented: boolean;
  verified: boolean;
  tierNote: string;
  sourceFile: string;
  testFile: string;
  notes?: string;
}

export interface GlobalExtensionState {
  alerts: AlertsConfig;
  emailQuota: EmailQuotaState;
  autoStartRules: AutoStartRule[];
  templates: KeywordTemplate[];
  scripts: CustomScript[];
  aiConfig: AiAutomationConfig;
  hotkeys: HotkeyBinding[];
  autoClickTargets: AutoClickTarget[];
  cookieRules: CookieAutomationRule[];
  cookieSnapshots: CookieSnapshot[];
  macros: AutomationMacro[];
  profiles: SettingsProfile[];
  sync: SyncSettingsConfig;
  currentDevice: DeviceInfo;
  featureOverrides: Record<string, { checked: boolean; note?: string }>;
}

export interface AlertEventPayload {
  tabId: number;
  windowId: number;
  url: string;
  title: string;
  reason: 'keyword_found' | 'keyword_lost' | 'content_changed' | 'numeric_threshold' | 'captcha' | 'error_page' | 'redirect';
  keyword: string;
  snippet: string;
  timestamp: number;
}

export interface MonitorEvaluationResult {
  triggered: boolean;
  reason?: AlertEventPayload['reason'];
  matchedKeywords: string[];
  snippet: string;
  diffSummary?: string;
  snapshot: string;
  snapshotHash: string;
  extractedNumber?: number | null;
  matchCount: number;
}

// Runtime Message Protocol between Popup / Options / Content / Background
export type ExtensionMessage =
  | {
      type: 'START_JOB';
      tabId: number;
      windowId?: number;
      url?: string;
      title?: string;
      overrides?: {
        refresh?: Partial<RefreshControlsConfig>;
        urlConfig?: Partial<UrlJobConfig>;
        monitor?: Partial<PageMonitorConfig>;
        profileId?: string | null;
        macroId?: string | null;
      };
    }
  | { type: 'STOP_JOB'; tabId: number; reason?: string }
  | { type: 'PAUSE_JOB'; tabId: number; reason?: string }
  | { type: 'RESUME_JOB'; tabId: number }
  | { type: 'STOP_ALL_JOBS' }
  | { type: 'GET_JOB'; tabId: number }
  | { type: 'GET_ALL_JOBS' }
  | { type: 'FOCUS_TAB'; tabId: number; windowId: number }
  | { type: 'USER_INTERACTION'; tabId?: number; eventType: string }
  | {
      type: 'PAGE_SCAN_REPORT';
      tabId?: number;
      url: string;
      title: string;
      captcha?: { detected: boolean; provider?: string };
      errorPage?: { detected: boolean; statusCode?: number; reason?: string };
      monitorResult?: MonitorEvaluationResult;
      source: 'after_load' | 'realtime' | 'xhr' | 'manual';
    }
  | { type: 'START_ELEMENT_PICKER'; tabId: number }
  | { type: 'ELEMENT_PICKED'; tabId?: number; selector: string; previewText: string }
  | { type: 'TOGGLE_VISUAL_TIMER'; tabId: number }
  | { type: 'APPLY_PROFILE'; tabId: number; profileId: string }
  | { type: 'SYNC_NOW'; direction?: 'push' | 'pull' }
  | { type: 'TEST_WEBHOOK'; webhook: WebhookEndpoint }
  | { type: 'TEST_EMAIL'; email: EmailAlertConfig }
  | { type: 'TEST_NOTIFICATION' }
  | { type: 'TRIGGER_HOTKEY'; command: HotkeyCommandId; tabId?: number }
  | { type: 'RUN_MACRO_ON_TAB'; tabId: number; macroId: string }
  | { type: 'EXECUTE_XHR_REFRESH'; job: TabJob }
  | { type: 'SYNC_JOB_TO_CONTENT'; job: TabJob | null };
