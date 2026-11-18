import type {
  AlertsConfig,
  AutomationMacro,
  CustomScript,
  DeviceInfo,
  GlobalExtensionState,
  HotkeyBinding,
  KeywordTemplate,
  PageMonitorConfig,
  RefreshControlsConfig,
  SettingsProfile,
  SyncSettingsConfig,
  TabJob,
  UrlJobConfig,
} from './types';
import { generateId, todayDateKey } from './utils';

export interface PredefinedIntervalOption {
  label: string;
  seconds: number;
}

export const PREDEFINED_INTERVALS: PredefinedIntervalOption[] = [
  { label: '1s', seconds: 1 },
  { label: '2s', seconds: 2 },
  { label: '5s', seconds: 5 },
  { label: '10s', seconds: 10 },
  { label: '15s', seconds: 15 },
  { label: '30s', seconds: 30 },
  { label: '1m', seconds: 60 },
  { label: '2m', seconds: 120 },
  { label: '5m', seconds: 300 },
  { label: '10m', seconds: 600 },
  { label: '15m', seconds: 900 },
  { label: '30m', seconds: 1800 },
  { label: '1h', seconds: 3600 },
];

export const DEFAULT_ERROR_STATUS_CODES = [403, 404, 408, 429, 500, 502, 503, 504];

export function createDefaultRefreshConfig(): RefreshControlsConfig {
  return {
    intervalMode: 'predefined',
    predefinedSeconds: 10,
    customInterval: { hours: 0, minutes: 0, seconds: 15, milliseconds: 0 },
    randomMinSeconds: 5,
    randomMaxSeconds: 20,
    countdownMode: 'duration',
    countdownDurationSeconds: 60,
    countdownTargetTimestamp: null,
    repeatAfterCountdown: false,
    visualTimer: {
      enabled: true,
      position: 'bottom-right',
      style: 'ring',
      opacity: 0.92,
      showProgressRing: true,
      showControls: true,
    },
    hardRefresh: false,
    maxRefreshes: 0,
    preventFormResubmission: true,
    protectDirtyForms: false,
    keepPageActive: true,
    stopOnInteraction: false,
    interactionAction: 'stop',
  };
}

export function createDefaultUrlConfig(): UrlJobConfig {
  return {
    usePredefinedUrl: false,
    predefinedUrl: '',
    rotationUrls: [],
    redirectPolicy: 'follow',
    detectCaptcha: true,
    detectErrorPage: true,
    errorAction: 'alert-and-pause',
    errorStatusCodes: [...DEFAULT_ERROR_STATUS_CODES],
    preventSystemSleep: false,
    sleepLevel: 'display',
  };
}

export function createDefaultMonitorConfig(): PageMonitorConfig {
  return {
    enabled: false,
    refreshType: 'full',
    xhrFallbackToFull: true,
    mode: 'keyword_found',
    changeDetectionMethod: 'text',
    ignoreNumbersInDiff: false,
    ignoreWhitespaceInDiff: true,
    keywords: [],
    matchLogic: 'any',
    activeTemplateId: null,
    numericThreshold: {
      operator: '<',
      value: 100,
      baselineValue: null,
    },
    continueOnDetection: false,
    alertCooldownSeconds: 30,
    realTimeMutationObserver: true,
    mutationDebounceMs: 250,
    runAfterLoad: true,
    postLoadDelayMs: 300,
    customAreaEnabled: false,
    customAreaSelector: '',
    customAreaSelectorType: 'css',
    highlightDetected: true,
    highlightColor: '#fde047',
    scrollToDetected: true,
    autoClickOnMatch: false,
    autoClickCompanionSelector: '',
    autoClickDelayMs: 150,
    maxAutoClicks: 1,
  };
}

export function createDefaultAlertsConfig(): AlertsConfig {
  return {
    pushNotifications: true,
    soundTone: 'chime',
    soundVolume: 0.7,
    focusWindowOnDetection: true,
    email: {
      enabled: false,
      provider: 'resend',
      toEmail: '',
      fromEmail: 'alerts@yourdomain.com',
      apiKey: '',
      customEndpointUrl: '',
      emailJsServiceId: '',
      emailJsTemplateId: '',
      subjectTemplate: '[PulseRefresh] {{reason}} on {{title}}',
      dailyLimit: null, // Unlimited by default
    },
    webhooks: [],
  };
}

export const BUILTIN_KEYWORD_TEMPLATES: KeywordTemplate[] = [
  {
    id: 'tpl_ecommerce_restock',
    name: 'E-Commerce Restock Alert',
    description: 'Detects when {{product}} returns in stock or shows a purchase button.',
    category: 'ecommerce',
    mode: 'keyword_found',
    matchLogic: 'any',
    variables: ['product'],
    builtIn: true,
    rules: [
      {
        expression: '("Add to Cart" OR "Buy Now" OR "In Stock") AND NOT "Out of Stock"',
        type: 'boolean',
        caseSensitive: false,
        wholeWord: false,
        enabled: true,
        label: 'Buy CTA active',
      },
      {
        expression: '{{product}} * available',
        type: 'wildcard',
        caseSensitive: false,
        wholeWord: false,
        enabled: true,
        label: 'Product availability',
      },
    ],
  },
  {
    id: 'tpl_soldout_gone',
    name: 'Sold-Out Banner Disappeared',
    description: 'Alerts the moment "Out of Stock" or "Sold Out" leaves the page.',
    category: 'ecommerce',
    mode: 'keyword_lost',
    matchLogic: 'any',
    variables: [],
    builtIn: true,
    rules: [
      {
        expression: '/(out of stock|sold out|currently unavailable)/i',
        type: 'regex',
        caseSensitive: false,
        wholeWord: false,
        enabled: true,
        label: 'Out-of-stock regex',
      },
    ],
  },
  {
    id: 'tpl_appointment_slot',
    name: 'Appointment / Ticket Slot Finder',
    description: 'Watches booking portals for open slots on {{date}}.',
    category: 'booking',
    mode: 'keyword_found',
    matchLogic: 'any',
    variables: ['date'],
    builtIn: true,
    rules: [
      {
        expression: '/(\\d+)\\s+(slots?|seats?|tickets?)\\s+(available|left)/i',
        type: 'regex',
        caseSensitive: false,
        wholeWord: false,
        enabled: true,
        label: 'Slot count regex',
      },
      {
        expression: '{{date}}',
        type: 'plain',
        caseSensitive: false,
        wholeWord: false,
        enabled: true,
        label: 'Target date',
      },
    ],
  },
  {
    id: 'tpl_price_drop',
    name: 'Price Drop Under Target',
    description: 'Extracts live currency price and alerts when below {{maxPrice}}.',
    category: 'pricing',
    mode: 'keyword_found',
    matchLogic: 'any',
    variables: ['maxPrice'],
    builtIn: true,
    rules: [
      {
        expression: '< {{maxPrice}}',
        type: 'numeric',
        caseSensitive: false,
        wholeWord: false,
        enabled: true,
        label: 'Price threshold',
      },
    ],
  },
  {
    id: 'tpl_devops_health',
    name: 'Service Incident & Degraded Status',
    description: 'Monitors status dashboards and CI pipelines for failures or incidents.',
    category: 'devops',
    mode: 'keyword_found',
    matchLogic: 'any',
    variables: ['service'],
    builtIn: true,
    rules: [
      {
        expression: '/(degraded performance|major outage|build failed|incident)/i',
        type: 'regex',
        caseSensitive: false,
        wholeWord: false,
        enabled: true,
        label: 'Incident regex',
      },
      {
        expression: '{{service}}',
        type: 'plain',
        caseSensitive: false,
        wholeWord: false,
        enabled: false,
        label: 'Specific service filter',
      },
    ],
  },
];

export const MARKETPLACE_SCRIPTS: CustomScript[] = [
  {
    id: 'mkt_dismiss_cookies',
    name: 'Auto-Dismiss Cookie Consent Banners',
    description: 'Automatically clicks common Accept/Close buttons on GDPR/cookie banners after refresh.',
    source: 'marketplace',
    category: 'UX Cleanup',
    enabled: false,
    urlPattern: '*',
    timing: 'after_load',
    code: `document.querySelectorAll('#onetrust-accept-btn-handler, [data-testid="cookie-accept"], .cc-allow, button[aria-label*="Accept cookies" i]').forEach(el => el.click());`,
    actions: [
      {
        type: 'click_selector',
        selector:
          '#onetrust-accept-btn-handler, [data-testid="cookie-accept"], .cc-allow, [data-cookie-accept]',
      },
    ],
    installedAt: 1700000000000,
  },
  {
    id: 'mkt_keep_session_alive',
    name: 'Dismiss "Are You Still There?" Modals',
    description: 'Clicks Continue / Stay Signed In buttons on banking, portal, and media dashboards.',
    source: 'marketplace',
    category: 'Session',
    enabled: false,
    urlPattern: '*',
    timing: 'after_load',
    code: `document.querySelectorAll('[data-session-extend], button.stay-signed-in, [aria-label*="continue session" i]').forEach(el => el.click());`,
    actions: [
      {
        type: 'click_selector',
        selector: '[data-session-extend], button.stay-signed-in, .keep-alive-btn',
      },
    ],
    installedAt: 1700000000000,
  },
  {
    id: 'mkt_lazy_load_scroll',
    name: 'Smooth Lazy-Load Scroller',
    description: 'Scrolls to the bottom of the page after refresh so lazy-rendered listings mount before scanning.',
    source: 'marketplace',
    category: 'Scraping & Monitor',
    enabled: false,
    urlPattern: '*',
    timing: 'after_load',
    code: `window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });`,
    actions: [{ type: 'scroll_bottom' }],
    installedAt: 1700000000000,
  },
  {
    id: 'mkt_remove_popups',
    name: 'Newsletter & Overlay Remover',
    description: 'Strips intrusive newsletter modal overlays so keyword highlights and clicks never get blocked.',
    source: 'marketplace',
    category: 'UX Cleanup',
    enabled: false,
    urlPattern: '*',
    timing: 'after_load',
    code: `document.querySelectorAll('[data-newsletter-modal], .popup-backdrop, .modal-overlay-promo').forEach(el => el.remove());`,
    actions: [
      {
        type: 'remove_selector',
        selector: '[data-newsletter-modal], .popup-backdrop, .modal-overlay-promo',
      },
    ],
    installedAt: 1700000000000,
  },
  {
    id: 'mkt_auto_accept_terms',
    name: 'Auto-Check Terms & Agreement Box',
    description: 'Checks terms-and-conditions checkboxes automatically once a checkout/booking slot triggers.',
    source: 'marketplace',
    category: 'Checkout',
    enabled: false,
    urlPattern: '*',
    timing: 'on_detection',
    code: `document.querySelectorAll('input[type="checkbox"][name*="terms" i], input[type="checkbox"][id*="agree" i]').forEach(el => { if (!el.checked) el.click(); });`,
    actions: [
      {
        type: 'check_input',
        selector:
          'input[type="checkbox"][name*="terms"], input[type="checkbox"][id*="agree"]',
      },
    ],
    installedAt: 1700000000000,
  },
  {
    id: 'mkt_auto_click_retry',
    name: 'Auto-Click In-App Retry / Refresh Data',
    description: 'Clicks SPA table refresh buttons automatically after load to pull the newest rows.',
    source: 'marketplace',
    category: 'Dashboards',
    enabled: false,
    urlPattern: '*',
    timing: 'after_load',
    code: `document.querySelectorAll('button[data-action="refresh"], button[aria-label="Refresh"]').forEach(el => el.click());`,
    actions: [
      {
        type: 'click_selector',
        selector: 'button[data-action="refresh"], button[aria-label="Refresh"]',
      },
    ],
    installedAt: 1700000000000,
  },
];

export const DEFAULT_HOTKEYS: HotkeyBinding[] = [
  {
    id: 'toggle-refresh',
    label: 'Start / Stop Refresh on Active Tab',
    combo: 'Alt+Shift+R',
    enabled: true,
    inPageEnabled: true,
  },
  {
    id: 'stop-all-refreshes',
    label: 'Stop All Refreshing Tabs',
    combo: 'Alt+Shift+S',
    enabled: true,
    inPageEnabled: true,
  },
  {
    id: 'pick-monitor-area',
    label: 'Pick Custom Page Area',
    combo: 'Alt+Shift+P',
    enabled: true,
    inPageEnabled: true,
  },
  {
    id: 'toggle-visual-timer',
    label: 'Toggle Visual Countdown Timer',
    combo: 'Alt+Shift+V',
    enabled: true,
    inPageEnabled: true,
  },
  {
    id: 'pause-resume-refresh',
    label: 'Pause / Resume Active Refresh',
    combo: 'Alt+Shift+Space',
    enabled: true,
    inPageEnabled: true,
  },
  {
    id: 'run-monitor-now',
    label: 'Run Page Monitor Scan Immediately',
    combo: 'Alt+Shift+M',
    enabled: true,
    inPageEnabled: true,
  },
];

export function createStarterProfiles(): SettingsProfile[] {
  const baseRefresh = createDefaultRefreshConfig();
  const baseUrl = createDefaultUrlConfig();
  const baseMonitor = createDefaultMonitorConfig();

  return [
    {
      id: 'profile_default',
      name: 'Default Balanced',
      description: 'Clean 10-second refresh with visual countdown, captcha guard, and form-resubmit protection.',
      isDefault: true,
      refresh: { ...baseRefresh },
      urlConfig: { ...baseUrl },
      monitor: { ...baseMonitor },
      autoClickTargetIds: [],
      macroId: null,
      updatedAt: 1700000000000,
    },
    {
      id: 'profile_stealth_stock',
      name: 'Stealth Restock Monitor',
      description: 'Randomized 12–35s XHR background refresh with keyword highlight, scroll, auto-click, and captcha pause.',
      isDefault: false,
      refresh: {
        ...baseRefresh,
        intervalMode: 'random',
        randomMinSeconds: 12,
        randomMaxSeconds: 35,
        keepPageActive: true,
      },
      urlConfig: {
        ...baseUrl,
        detectCaptcha: true,
        detectErrorPage: true,
        errorAction: 'backoff',
        preventSystemSleep: true,
        redirectPolicy: 'allow-same-origin',
      },
      monitor: {
        ...baseMonitor,
        enabled: true,
        refreshType: 'xhr',
        mode: 'keyword_found',
        keywords: [
          {
            id: 'kw_stock_default',
            expression: '("In Stock" OR "Add to Cart") AND NOT "Sold Out"',
            type: 'boolean',
            caseSensitive: false,
            wholeWord: false,
            enabled: true,
            label: 'Stock availability',
          },
        ],
        highlightDetected: true,
        scrollToDetected: true,
        autoClickOnMatch: false,
        realTimeMutationObserver: true,
      },
      autoClickTargetIds: [],
      macroId: null,
      updatedAt: 1700000000000,
    },
    {
      id: 'profile_live_dashboard',
      name: 'Live Dashboard Wallboard',
      description: '30-second silent XHR refresh, keeps screen awake, keeps background tab active, stops on interaction.',
      isDefault: false,
      refresh: {
        ...baseRefresh,
        intervalMode: 'predefined',
        predefinedSeconds: 30,
        stopOnInteraction: true,
        interactionAction: 'pause',
        keepPageActive: true,
      },
      urlConfig: {
        ...baseUrl,
        preventSystemSleep: true,
        sleepLevel: 'display',
        errorAction: 'backoff',
      },
      monitor: {
        ...baseMonitor,
        enabled: false,
        refreshType: 'xhr',
      },
      autoClickTargetIds: [],
      macroId: null,
      updatedAt: 1700000000000,
    },
    {
      id: 'profile_content_diff',
      name: 'Docs & Price Change Watcher',
      description: 'Monitors any visible content change every 2 minutes using hash + snippet diff and continues monitoring.',
      isDefault: false,
      refresh: {
        ...baseRefresh,
        intervalMode: 'predefined',
        predefinedSeconds: 120,
        hardRefresh: true,
      },
      urlConfig: { ...baseUrl },
      monitor: {
        ...baseMonitor,
        enabled: true,
        refreshType: 'xhr',
        mode: 'any_change',
        changeDetectionMethod: 'text',
        continueOnDetection: true,
        alertCooldownSeconds: 60,
      },
      autoClickTargetIds: [],
      macroId: null,
      updatedAt: 1700000000000,
    },
  ];
}

export function createStarterMacros(): AutomationMacro[] {
  return [
    {
      id: 'macro_quick_reserve',
      name: 'Add to Cart & Proceed',
      description: 'Clicks the purchase button, waits for the cart drawer, and clicks Checkout.',
      enabled: true,
      runOnDetection: false,
      createdAt: 1700000000000,
      steps: [
        {
          id: 'step_1',
          type: 'click',
          label: 'Click Add to Cart',
          selector: '[data-add-to-cart], button.add-to-cart',
          delayMs: 100,
        },
        {
          id: 'step_2',
          type: 'wait',
          label: 'Wait for cart update',
          delayMs: 500,
        },
        {
          id: 'step_3',
          type: 'click',
          label: 'Proceed to Checkout',
          selector: '[data-checkout], a[href*="/checkout"]',
          continueOnError: true,
        },
      ],
    },
  ];
}

export function detectBrowserEnvironment(): Pick<DeviceInfo, 'browser' | 'platform'> {
  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
  let browserName: DeviceInfo['browser'] = 'chrome';
  if (/\bFirefox\//i.test(ua)) browserName = 'firefox';
  else if (/\bEdg\//i.test(ua)) browserName = 'edge';
  else if (/\bSafari\//i.test(ua) && !/\b(?:Chrome|Chromium|HeadlessChrome)\//i.test(ua)) {
    browserName = 'safari';
  }

  let platform = 'Desktop';
  if (/\bCrOS\b/i.test(ua)) platform = 'ChromeOS';
  else if (/\bAndroid\b/i.test(ua)) platform = 'Android';
  else if (/\b(?:iPhone|iPad|iPod)\b/i.test(ua)) platform = 'iOS';
  else if (/\bMac(?:intosh| OS X)\b/i.test(ua)) platform = 'macOS';
  else if (/\bWin(?:dows|32|64)\b/i.test(ua)) platform = 'Windows';
  else if (/\bLinux\b/i.test(ua)) platform = 'Linux';

  return { browser: browserName, platform };
}

const BROWSER_DISPLAY_NAMES: Record<DeviceInfo['browser'], string> = {
  chrome: 'Chrome',
  firefox: 'Firefox',
  edge: 'Edge',
  safari: 'Safari',
  other: 'Browser',
};

export function createDefaultDevice(): DeviceInfo {
  const env = detectBrowserEnvironment();
  const now = Date.now();
  const browserTitle = BROWSER_DISPLAY_NAMES[env.browser] ?? 'Browser';
  return {
    id: generateId('dev'),
    name: `${browserTitle} · ${env.platform}`,
    browser: env.browser,
    platform: env.platform,
    extensionVersion: '1.0.0',
    createdAt: now,
    lastSyncedAt: now,
    activeJobsCount: 0,
  };
}

export function createDefaultSyncConfig(): SyncSettingsConfig {
  return {
    enabled: true,
    autoSync: true,
    syncProfiles: true,
    syncAutoStartRules: true,
    syncTemplates: true,
    syncScriptsAndMacros: true,
    syncAlerts: true,
    maxDevices: null, // Unlimited devices unlocked
    lastSyncedAt: null,
    revision: 0,
  };
}

export function createDefaultGlobalState(): GlobalExtensionState {
  return {
    alerts: createDefaultAlertsConfig(),
    emailQuota: {
      dateKey: todayDateKey(),
      sentCount: 0,
      lastSentAt: null,
    },
    autoStartRules: [],
    templates: BUILTIN_KEYWORD_TEMPLATES.map((t) => ({ ...t })),
    scripts: MARKETPLACE_SCRIPTS.map((s) => ({ ...s })),
    aiConfig: {
      providerName: 'OpenAI-Compatible',
      endpointUrl: 'https://api.openai.com/v1/chat/completions',
      apiKey: '',
      model: 'gpt-4o-mini',
    },
    hotkeys: DEFAULT_HOTKEYS.map((h) => ({ ...h })),
    autoClickTargets: [],
    cookieRules: [],
    cookieSnapshots: [],
    macros: createStarterMacros(),
    profiles: createStarterProfiles(),
    sync: createDefaultSyncConfig(),
    currentDevice: createDefaultDevice(),
    featureOverrides: {},
  };
}

export function createDefaultTabJob(params: {
  tabId: number;
  windowId?: number;
  url: string;
  title?: string;
}): TabJob {
  const now = Date.now();
  return {
    tabId: params.tabId,
    windowId: params.windowId ?? 1,
    url: params.url,
    initialUrl: params.url,
    title: params.title || params.url,
    status: 'idle',
    profileId: 'profile_default',
    refresh: createDefaultRefreshConfig(),
    urlConfig: createDefaultUrlConfig(),
    monitor: createDefaultMonitorConfig(),
    autoClickTargets: [],
    macroId: null,
    refreshCount: 0,
    detectionCount: 0,
    autoClickCount: 0,
    rotationIndex: 0,
    backoffAttempt: 0,
    currentIntervalMs: 10_000,
    nextRefreshAt: null,
    remainingMsOnPause: null,
    startedAt: now,
    lastRefreshAt: null,
    lastAlertAt: null,
    lastSnapshot: null,
    lastSnapshotHash: null,
    lastNumericValue: null,
    lastMatchedKeyword: null,
    lastDiffSnippet: null,
    lastError: null,
  };
}
