# PulseRefresh — Master Feature To-Do & Test Verification Checklist

> **Framework:** [WXT 0.21](https://wxt.dev) + React 19 + Vite 8 + Tailwind CSS v4 + shadcn/ui + TypeScript  
> **Runtime / Package Manager:** Bun (`bun.lock`, also 100% compatible with `npm`)  
> **Target Browsers:** Chrome / Chromium (Manifest V3) + Firefox (WebExtension)  
> **Plan Policy:** **100% Unlocked** (no paywalls — Full & XHR refresh, Unlimited Emails/day, Marketplace + Custom + AI scripts, Unlimited Synced Devices)  
> **Progress:** **42 / 42 Features Implemented (100%)** · **9 Test Suites · 58 Automated Tests Passing**

> Tip: This checklist is also built **interactively** right inside the extension's **Options Dashboard -> Feature To-Do List** tab, where you can toggle checkboxes during manual QA, filter by category/status, jump directly to each feature's live config panel, or copy the Markdown checklist.

---

## Summary by Category

| # | Category | Done | Total | Status | Automated Test Suite |
|---|----------|------|-------|--------|----------------------|
| 1 | Refresh Controls | 10 | 10 | Completed & Verified | `tests/01-refresh-controls.test.ts` & `tests/09-ui-components.test.tsx` |
| 2 | URL & Tab Automation | 7 | 7 | Completed & Verified | `tests/02-url-tab-automation.test.ts` |
| 3 | Page Monitor | 9 | 9 | Completed & Verified | `tests/03-page-monitor.test.ts` |
| 4 | Advanced Monitoring | 4 | 4 | Completed & Verified | `tests/04-advanced-monitoring.test.ts` |
| 5 | Alerts & Notifications | 4 | 4 | Completed & Verified | `tests/05-alerts-notifications.test.ts` |
| 6 | Automation Tools | 5 | 5 | Completed & Verified | `tests/06-automation-tools.test.ts` |
| 7 | Account & Sync | 3 | 3 | Completed & Verified | `tests/07-account-sync.test.ts` |
| 8 | End-to-End & UI Integration | — | — | Completed & Verified | `tests/08-background-e2e.test.ts` & `tests/09-ui-components.test.tsx` |

---

## 1. Refresh Controls (10 / 10)

- [x] **Predefined Refresh Intervals** — 13 quick-select interval presets (`1s`, `2s`, `5s`, `10s`, `15s`, `30s`, `1m`, `2m`, `5m`, `10m`, `15m`, `30m`, `1h`).
  - Source: `src/lib/defaults.ts`, `src/lib/refresh-engine.ts`, `src/components/popup/PopupApp.tsx`
  - Test: `tests/01-refresh-controls.test.ts` (`1.1 Predefined Refresh Intervals`)
- [x] **Custom Refresh Interval** — Hours, minutes, seconds, and milliseconds builder with round-trip conversion and safety clamping (`500ms`–`24h`).
  - Source: `src/lib/refresh-engine.ts` (`customPartsToMs`, `msToCustomParts`)
  - Test: `tests/01-refresh-controls.test.ts` (`1.2 Custom Refresh Interval`)
- [x] **Random Refresh Interval** — Uniformly randomized `[minSeconds, maxSeconds]` interval re-sampled on each refresh cycle (with automatic reversed-bound normalization).
  - Source: `src/lib/refresh-engine.ts` (`sampleRandomIntervalMs`)
  - Test: `tests/01-refresh-controls.test.ts` (`1.3 Random Refresh Interval`)
- [x] **Countdown Timer** — Schedule refresh after a fixed countdown duration (`HH:MM:SS`) or at a specific target clock timestamp, with single-shot vs repeat support and live toolbar badge (`formatBadgeTime`).
  - Source: `src/lib/refresh-engine.ts` (`computeCountdownDelayMs`, `getCountdownProgress`, `getBadgePresentation`)
  - Test: `tests/01-refresh-controls.test.ts` (`1.4 Countdown Timer`)
- [x] **Visual Timer** — Shadow-DOM isolated floating countdown overlay with SVG circular progress ring, tabular digital readout, refresh counter, 4 corner positions, 3 styles, opacity slider, and inline Pause/Resume/Stop buttons.
  - Source: `src/components/content/VisualTimerOverlay.tsx`, `entrypoints/content.ts`
  - Test: `tests/09-ui-components.test.tsx` (`renders VisualTimerOverlay countdown...`)
- [x] **Hard Refresh** — Bypasses browser HTTP cache via `browser.tabs.reload(tabId, { bypassCache: true })`, cache-buster params, and `Cache-Control: no-store` headers for XHR refreshes.
  - Source: `src/lib/page-guards.ts`, `src/lib/background-controller.ts`
  - Test: `tests/01-refresh-controls.test.ts` (`1.6 Hard Refresh`)
- [x] **Refresh Count Limit** — Automatically transitions job to `completed` and stops scheduling after `maxRefreshes` cycles (`0` = unlimited).
  - Source: `src/lib/refresh-engine.ts` (`hasReachedRefreshLimit`), `src/lib/background-controller.ts`
  - Test: `tests/01-refresh-controls.test.ts` (`1.7 Refresh Count Limit`)
- [x] **Prevent Form Resubmission** — Neutralizes blocking POST confirmation dialogs using `history.replaceState` + clean GET reloads, plus optional dirty-form field protection (`hasDirtyFormFields`).
  - Source: `src/lib/page-guards.ts` (`neutralizeFormResubmission`, `resolveReloadStrategy`)
  - Test: `tests/01-refresh-controls.test.ts` (`1.8 Prevent Form Resubmission`)
- [x] **Keep Page Active in Background** — Spoofs Page Visibility API (`document.hidden = false`, `visibilityState = 'visible'`, `hasFocus() = true`), blocks throttling `visibilitychange`/`blur` events, and sets `autoDiscardable: false` on tabs.
  - Source: `src/lib/page-guards.ts` (`enableKeepPageActive`, `setTabKeepActiveFlag`)
  - Test: `tests/01-refresh-controls.test.ts` (`1.9 Keep Page Active in Background`)
- [x] **Stop on User Interaction** — Detects genuine mouse, keyboard, wheel, and touch input (while ignoring extension overlays and hotkey chords) to immediately stop or pause the refresh job.
  - Source: `src/lib/page-guards.ts` (`attachUserInteractionDetector`), `src/lib/background-controller.ts`
  - Test: `tests/01-refresh-controls.test.ts` (`1.10 Stop on User Interaction`)

---

## 2. URL & Tab Automation (7 / 7)

- [x] **Auto Start URLs** — Automatically launches refresh jobs when tabs load URLs matching `exact`, `prefix`, `wildcard` (`*`, `?`), or `regex` rules (ignoring internal `chrome://` / `about:` pages).
  - Source: `src/lib/url-automation.ts` (`matchesUrlPattern`, `findMatchingAutoStartRule`), `src/lib/background-controller.ts` (`handleTabUpdated`)
  - Test: `tests/02-url-tab-automation.test.ts` (`2.1 Auto Start URLs`)
- [x] **Active Tabs List** — Real-time multi-window active tab aggregator in both Popup and Options Dashboard with status sorting, filters, live countdowns, Focus Tab, Pause/Resume, Stop, and Stop All.
  - Source: `src/lib/url-automation.ts` (`buildActiveTabsSummary`), `src/components/popup/PopupApp.tsx`, `src/components/options/RefreshAndUrlPanels.tsx`
  - Test: `tests/02-url-tab-automation.test.ts` (`2.2 Active Tabs List`)
- [x] **Refresh Predefined URL** — Reloads a pinned canonical target URL or cycles through an ordered multi-URL rotation list on every refresh tick.
  - Source: `src/lib/url-automation.ts` (`resolveTargetRefreshUrl`)
  - Test: `tests/02-url-tab-automation.test.ts` (`2.3 Refresh Predefined URL & Rotation`)
- [x] **URL Changes & Redirection Handling** — Monitors URL changes with 4 policies: `follow`, `stop` (stop & alert), `revert` (navigate back to `initialUrl`), and `allow-same-origin` (block external redirects).
  - Source: `src/lib/url-automation.ts` (`evaluateUrlRedirect`), `src/lib/background-controller.ts`
  - Test: `tests/02-url-tab-automation.test.ts` (`2.4 URL Changes & Redirection Handling`)
- [x] **Captcha Detection** — Detects reCAPTCHA, hCaptcha, Cloudflare Turnstile & interstitials, Arkose FunCaptcha, AWS WAF Captcha, and generic challenges; auto-pauses refreshing and dispatches alerts.
  - Source: `src/lib/url-automation.ts` (`detectCaptchaInDocument`), `src/lib/background-controller.ts`
  - Test: `tests/02-url-tab-automation.test.ts` (`2.5 Captcha Detection`)
- [x] **Error Page Detection** — Detects HTTP 403/404/408/429/500/502/503/504 statuses, gateway/rate-limit bodies, and browser network errors (`ERR_CONNECTION_REFUSED`, etc.) with `alert-and-pause`, `backoff` (`2x`, `4x`, `8x`), `continue`, or `stop`.
  - Source: `src/lib/url-automation.ts` (`detectErrorPage`, `resolveErrorActionDecision`)
  - Test: `tests/02-url-tab-automation.test.ts` (`2.6 Error Page Detection`)
- [x] **Prevent System Sleep While Refreshing** — Keeps display/system awake using `browser.power.requestKeepAwake` on Chromium with automatic `navigator.wakeLock.request('screen')` fallback on Firefox; releases when all jobs pause/stop.
  - Source: `src/lib/sleep-manager.ts` (`SleepManager`)
  - Test: `tests/02-url-tab-automation.test.ts` (`2.7 Prevent System Sleep While Refreshing`)

---

## 3. Page Monitor (9 / 9)

- [x] **Refresh Types (Full Page & XHR Refresh — Unlocked)** — Supports both standard full tab reloads and flicker-free XHR/fetch selective DOM patching (preserving scroll position & extension UI, with configurable fallback to full reload).
  - Source: `src/lib/monitor-engine.ts` (`performXhrRefresh`), `src/lib/background-controller.ts`
  - Test: `tests/03-page-monitor.test.ts` (`3.1 Refresh Types (Full Page & XHR Refresh)`)
- [x] **Monitoring Modes** — Supports `keyword_found` (target appears), `keyword_lost` (target disappears), `any_change` (baseline + diff alert), and `numeric_threshold` (currency/number comparison & `%` change).
  - Source: `src/lib/monitor-engine.ts` (`evaluatePageMonitor`)
  - Test: `tests/03-page-monitor.test.ts` (`3.2 Monitoring Modes`)
- [x] **Change Detection Method** — 4 snapshot engines: `text` (visible text), `html` (structural markup), `dom_hash` (32-bit FNV-1a fingerprint), and `visual_attribute` (tracks `disabled`, `class`, `aria-*`, `data-*`, `style`), plus ignore-whitespace/numbers filters and diff snippet generator.
  - Source: `src/lib/monitor-engine.ts` (`captureContentSnapshot`, `computeTextDiffSnippet`)
  - Test: `tests/03-page-monitor.test.ts` (`3.3 Change Detection Method`)
- [x] **Predefined Target Text / Keyword** — Multi-rule watchlist per profile/tab with enable toggles, case-sensitivity, whole-word matching, `ANY` (OR) / `ALL` (AND) logic, and a live in-dashboard sandbox tester.
  - Source: `src/lib/expression-engine.ts` (`evaluateKeywordRule`, `evaluateKeywordRules`)
  - Test: `tests/03-page-monitor.test.ts` (`3.4 Predefined Target Keywords`)
- [x] **Define Keyword Template** — 5 built-in templates (*E-Commerce Restock*, *Sold-Out Gone*, *Appointment/Ticket Slot*, *Price Drop*, *DevOps Incident*) + custom template creator with `{{variable}}` auto-extraction & interpolation.
  - Source: `src/lib/defaults.ts`, `src/lib/expression-engine.ts` (`instantiateKeywordTemplate`, `createCustomKeywordTemplate`)
  - Test: `tests/03-page-monitor.test.ts` (`3.5 Define Keyword Template`)
- [x] **Supported Expressions** — Full parser/evaluator for `plain`, `wildcard` (`*`, `?`), `regex` (`/.../flags` with validation), `boolean` (`AND`, `OR`, `NOT`, parentheses, quoted phrases), `css` selectors, `xpath`, and `numeric` (`<`, `<=`, `>`, `>=`, `==`, `!=`, `pct_change`).
  - Source: `src/lib/expression-engine.ts`
  - Test: `tests/03-page-monitor.test.ts` (`3.6 Supported Expressions`)
- [x] **Continue Refreshing on Keyword Detection** — Keeps the refresh loop running after a match triggers, honoring configurable `alertCooldownSeconds` to prevent alert spam.
  - Source: `src/lib/monitor-engine.ts` (`shouldFireDetectionAlert`), `src/lib/background-controller.ts`
  - Test: `tests/03-page-monitor.test.ts` (`3.7 Continue Refreshing on Keyword Detection`)
- [x] **Real-Time Detection During Refresh** — Debounced `MutationObserver` inspects live SPA/AJAX/WebSocket DOM changes between scheduled refreshes while ignoring extension UI nodes.
  - Source: `src/lib/monitor-engine.ts` (`attachRealTimeMonitor`), `entrypoints/content.ts`
  - Test: `tests/03-page-monitor.test.ts` (`3.8 Real-Time Detection During Refresh`)
- [x] **Run Detection After Load** — Waits for `document.readyState === 'complete'` plus configurable `postLoadDelayMs` hydration settle time before running the scan.
  - Source: `src/lib/monitor-engine.ts` (`runDetectionAfterLoad`)
  - Test: `tests/03-page-monitor.test.ts` (`3.9 Run Detection After Load`)

---

## 4. Advanced Monitoring (4 / 4)

- [x] **Monitor Custom Page Area** — Scopes monitoring and XHR DOM replacement to a specific CSS selector or XPath element, plus an on-page interactive point-and-click Visual Element Picker (`startInteractiveElementPicker`).
  - Source: `src/lib/dom-actions.ts` (`resolveCustomAreaElement`, `generateUniqueCssSelector`, `startInteractiveElementPicker`)
  - Test: `tests/04-advanced-monitoring.test.ts` (`4.1 Monitor Custom Page Area & Visual Element Picker`)
- [x] **Highlight Detected Keyword** — Wraps matched text nodes in styled `<mark data-pulserefresh-highlight>` tags (with customizable color) and outlines matched CSS/XPath nodes, with lossless DOM cleanup (`clearHighlights`).
  - Source: `src/lib/dom-actions.ts` (`highlightDetectedKeywords`, `clearHighlights`)
  - Test: `tests/04-advanced-monitoring.test.ts` (`4.2 Highlight Detected Keyword`)
- [x] **Scroll to Keyword** — Smoothly centers detected elements in the viewport (`scrollIntoView({ behavior: 'smooth', block: 'center' })`) with match-index cycling.
  - Source: `src/lib/dom-actions.ts` (`scrollToDetectedElement`)
  - Test: `tests/04-advanced-monitoring.test.ts` (`4.3 Scroll to Keyword`)
- [x] **Auto-click on Keyword Match** — Resolves the matched element, nearest clickable ancestor (`button`, `a[href]`, `[role="button"]`), or companion selector and dispatches realistic pointer + mouse + click events with `maxAutoClicks` guard.
  - Source: `src/lib/dom-actions.ts` (`autoClickOnKeywordMatch`, `dispatchRealisticClick`)
  - Test: `tests/04-advanced-monitoring.test.ts` (`4.4 Auto-click on Keyword Match`)

---

## 5. Alerts & Notifications (4 / 4)

- [x] **Push Notifications** — Native desktop notifications (`browser.notifications.create`) with click-to-focus tab routing and 4 Web Audio API synthesized alert chimes (*Chime*, *Radar*, *Bell*, *Urgent*).
  - Source: `src/lib/alerts.ts` (`sendPushNotification`, `parseNotificationTarget`, `playAlertTone`)
  - Test: `tests/05-alerts-notifications.test.ts` (`5.1 Push Notifications`)
- [x] **Email Alerts (Unlimited Emails / Day — Unlocked)** — Self-contained client-side dispatch supporting Resend, SendGrid, EmailJS, and Custom HTTP Relay with HTML/text templates, Unlimited default (plus optional daily safety cap with automatic midnight reset), and Test Email action.
  - Source: `src/lib/alerts.ts` (`sendEmailAlert`, `canSendEmailUnderQuota`, `normalizeEmailQuota`)
  - Test: `tests/05-alerts-notifications.test.ts` (`5.2 Email Alerts`)
- [x] **Webhook Integration** — Multi-endpoint webhooks with **Generic JSON**, **Slack**, **Discord**, and **Telegram** presets, `{{variable}}` payload interpolation, custom headers, HMAC-SHA256 payload signing (`X-PulseRefresh-Signature`), and exponential-backoff retries on 5xx/429.
  - Source: `src/lib/alerts.ts` (`dispatchWebhook`, `buildWebhookBody`, `computeHmacSha256`)
  - Test: `tests/05-alerts-notifications.test.ts` (`5.3 Webhook Integration`)
- [x] **Window Focus on Detection** — Automatically focuses and draws attention to the target browser window and switches to the detected tab.
  - Source: `src/lib/alerts.ts` (`focusTabAndWindow`, `dispatchAllAlerts`)
  - Test: `tests/05-alerts-notifications.test.ts` (`5.4 Window Focus on Detection & Full Alert Pipeline`)

---

## 6. Automation Tools (5 / 5)

- [x] **Execute Custom Scripts & AI Automation (Marketplace + Custom + AI — Unlocked)** — Includes 6 curated Marketplace scripts, a full Custom User Script creator (`before_refresh`, `after_load`, `on_detection`), and a BYO OpenAI-compatible AI Automation Builder with an instant offline prompt-to-script/macro compiler.
  - Source: `src/lib/defaults.ts` (`MARKETPLACE_SCRIPTS`), `src/lib/automation.ts` (`executeMatchingScripts`, `createCustomUserScript`, `generateAiAutomation`, `compilePromptOffline`)
  - Test: `tests/06-automation-tools.test.ts` (`6.1 Execute Custom Scripts & AI Automation`)
- [x] **Hotkeys (Keyboard Shortcuts)** — Cross-browser manifest `commands` (`Alt+Shift+R`, `Alt+Shift+S`, `Alt+Shift+P`, `Alt+Shift+V`) plus 6 customizable in-page keybindings with live key recorder and duplicate-shortcut conflict detection.
  - Source: `wxt.config.ts`, `src/lib/automation.ts` (`matchHotkeyEvent`, `findHotkeyConflicts`), `src/lib/background-controller.ts` (`handleHotkeyCommand`)
  - Test: `tests/06-automation-tools.test.ts` (`6.2 Hotkeys (Keyboard Shortcuts)`)
- [x] **Auto Click Targets** — Ordered CSS/XPath click targets executed on every refresh with configurable delay, async wait-for-selector polling, text substring filter, and retry counter.
  - Source: `src/lib/dom-actions.ts` (`executeAutoClickTargets`, `waitForTargetElement`)
  - Test: `tests/06-automation-tools.test.ts` (`6.3 Auto Click Targets`)
- [x] **Cookie Automation** — Per-domain cookie rules (`clear_all`, `delete_matching` w/ wildcards, `keep_only` allowlist, `set_cookie`) via `browser.cookies` plus Cookie Jar Snapshot & Restore.
  - Source: `src/lib/automation.ts` (`executeCookieAutomationRules`, `captureCookieSnapshot`, `restoreCookieSnapshot`)
  - Test: `tests/06-automation-tools.test.ts` (`6.4 Cookie Automation`)
- [x] **Run Macro After Detection** — Multi-step post-detection macro engine supporting 11 step types (`click`, `fill` w/ React native setter, `select`, `check`, `keypress`, `scroll`, `wait`, `wait_for_selector`, `extract_text`, `navigate`, `webhook`) plus a live DOM Macro Recorder (`startMacroRecorder`).
  - Source: `src/lib/automation.ts` (`executeAutomationMacro`, `startMacroRecorder`)
  - Test: `tests/06-automation-tools.test.ts` (`6.5 Run Macro After Detection (+ Live Macro Recorder)`)

---

## 7. Account & Sync (3 / 3)

- [x] **Sync Settings** — Self-contained cross-device sync over `browser.storage.sync` with automatic `<7KB` chunk splitting (respecting the 8KB per-item WebExtension quota), FNV-1a checksum integrity verification, revision tracking, selective category toggles, and portable JSON Backup Export/Import.
  - Source: `src/lib/sync-manager.ts` (`pushSettingsToSync`, `pullSettingsFromSync`, `splitIntoSyncChunks`, `exportBackupJson`, `importBackupJson`)
  - Test: `tests/07-account-sync.test.ts` (`7.1 Sync Settings`)
- [x] **Devices Management (Unlimited Devices — Unlocked)** — Synced multi-device registry identifying browser (Chrome/Firefox/Edge) & OS, active job count, last sync timestamp, inline device rename, stale device removal, and Unlimited device support (with optional custom cap).
  - Source: `src/lib/sync-manager.ts` (`getSyncedDevices`, `registerOrUpdateDevice`, `renameCurrentDevice`, `removeSyncedDevice`)
  - Test: `tests/07-account-sync.test.ts` (`7.2 Devices Management`)
- [x] **Settings Profiles** — 4 built-in profiles (*Default Balanced*, *Stealth Restock Monitor*, *Live Dashboard Wallboard*, *Docs & Price Change Watcher*) + create, duplicate, edit, delete (with safe default promotion), URL-pattern auto-matching, one-click tab apply, and single-profile JSON export/import.
  - Source: `src/lib/sync-manager.ts` (`createSettingsProfile`, `duplicateSettingsProfile`, `setDefaultProfile`, `deleteSettingsProfile`, `findProfileForUrl`, `applyProfileToJob`)
  - Test: `tests/07-account-sync.test.ts` (`7.3 Settings Profiles`)
