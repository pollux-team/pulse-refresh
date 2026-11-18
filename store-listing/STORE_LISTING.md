# PulseRefresh — Store Listing Copy & Metadata

Everything below is formatted for direct copy-paste into the **Chrome Web Store Developer Dashboard**, **Mozilla Firefox Add-on Developer Hub (AMO)**, and **Microsoft Edge Partner Center**. All character limits have been verified against official store rules.

---

## 1. Core Identity & Titles

| Field | Value | Length / Limit |
|---|---|---|
| **Extension Name** | `PulseRefresh - Auto Refresh & Page Monitor` | 42 / 45 chars |
| **Short Name** | `PulseRefresh` | 12 / 12 chars |
| **Version** | `1.0.0` | SemVer |
| **Firefox Add-on ID** | `pulserefresh@pulserefresh.app` | Manifest `gecko.id` |
| **Default Language** | English (`en`) | — |
| **Pricing / Distribution** | Free · Public · All Regions | — |
| **Mature Content** | No | — |

---

## 2. Short Summary / Tagline

### Chrome Web Store & Manifest Description (122 / 132 characters)
```text
Auto-refresh tabs on custom, random, or scheduled timers with silent XHR reload, page change alerts, webhooks, and macros.
```

### Firefox Add-ons (AMO) Summary (214 / 250 characters)
```text
Automatically refresh tabs on preset, custom, randomized, or scheduled timers. Monitor pages with full reload or silent XHR checks, track keywords, regex, CSS & prices, and trigger sound, push, email, or webhooks.
```

### Microsoft Edge Add-ons Short Description (214 / 250 characters)
```text
Automatically refresh tabs on preset, custom, randomized, or scheduled timers. Monitor pages with full reload or silent XHR checks, track keywords, regex, CSS & prices, and trigger sound, push, email, or webhooks.
```

---

## 3. Full Store Description (Chrome Web Store, Firefox AMO & Edge)

> Validated well within Chrome Web Store's 16,000-character limit, Edge's 10,000-character limit, and Firefox AMO's description guidelines, with clean structure and zero keyword stuffing.

```text
PulseRefresh automates tab reloading, webpage change detection, instant multi-channel alerts, and post-refresh page actions in one fast, privacy-first browser extension.

Whether you are keeping live operational dashboards up to date, monitoring product restocks and price drops, waiting for appointment slots, tracking documentation updates, or running QA checks across multiple URLs, PulseRefresh gives you precise control over every tab.


FLEXIBLE REFRESH TIMERS
• One-click preset intervals from 1 second to 1 hour
• Custom intervals down to hours, minutes, seconds, and milliseconds
• Randomized intervals (min–max range) for natural reload pacing
• Countdown duration timer and exact clock-time scheduled reloads
• On-page visual countdown badge (Shadow DOM isolated so it never breaks site styles) with inline Pause and Stop buttons
• Configurable refresh count limits and cache-bypassing hard refresh
• Form resubmission guard, unsaved input protection, background tab keep-alive, and automatic stop or pause when you click, scroll, or type


URL & MULTI-TAB AUTOMATION
• Manage concurrent refresh jobs across multiple tabs and windows from one panel
• Auto-start URL rules using exact, prefix, wildcard, or regex matching
• URL list rotation (sequential or shuffle) inside a single tab
• Open and refresh predefined URL batches automatically
• Automatic pause on CAPTCHA or security verification challenges
• Smart retry and exponential backoff on HTTP 4xx/5xx or offline errors
• Prevent system or display sleep during active monitoring sessions


PAGE MONITOR & ADVANCED CHANGE DETECTION
• Full page reload or flicker-free background XHR content checks
• Alert when keywords appear, disappear, or when any page change occurs
• Point-and-click visual element picker to monitor only a specific area of a page
• Full expression engine: plain text, wildcards (*, ?), regular expressions, boolean logic (AND / OR / NOT), CSS selectors, XPath, and numeric thresholds (such as price drops below a target)
• Reusable keyword templates with custom variables
• Automatic on-page highlighting of matched keywords and optional auto-click on match
• Full-page or partial diff comparison with minimum change threshold controls


INSTANT ALERTS & INTEGRATIONS
• Desktop notifications with one-click tab focus and optional window bring-to-front
• Built-in alert chimes with independent volume control and custom sound URL support
• Configurable alert cooldown windows to prevent notification fatigue
• Direct email notifications via your own Resend, SendGrid, EmailJS, or custom HTTPS endpoint
• Outbound webhooks with Slack, Discord, Telegram, and signed JSON payload support plus automatic retry backoff


POST-REFRESH AUTOMATION & KEYBOARD SHORTCUTS
• Multi-step macros (click, fill input, select, scroll, wait, extract) triggered on reload or change detection
• Curated script library (such as dismissing cookie banners or session timeout dialogs), custom user scripts, and a natural-language script builder (works offline or with an optional OpenAI API key)
• Customizable global and in-page keyboard shortcuts (Alt+Shift+R to start/stop, Alt+Shift+S to stop all, Alt+Shift+P to pick an area, Alt+Shift+V to toggle the timer overlay)
• Scoped cookie rules (clear before reload, preserve across refreshes, inject, or snapshot/restore)


PROFILES, CROSS-DEVICE SYNC & PRIVACY
• Save reusable profiles for different sites and workflows (restock tracking, live dashboards, price watching)
• Sync profiles, URL rules, templates, and macros across signed-in browsers, or export and import portable JSON backups
• Light and dark interface themes
• 100% local and self-contained: no account required, no analytics, no telemetry, no ads, and no data collection servers. Outbound requests go only to the pages you monitor and any email, webhook, or AI endpoints you explicitly configure.
```

---

## 4. Store Categories & Search Metadata

| Store | Primary Category | Secondary Category |
|---|---|---|
| **Chrome Web Store** | `Workflow & Planning` (under Productivity) | — *(single category)* |
| **Firefox Add-ons (AMO)** | `Tabs` | `Alerts & Updates` |
| **Microsoft Edge Add-ons** | `Productivity` | — |

### Search Terms / Tags (Edge Add-ons allows up to 7 · Firefox AMO allows up to 20)
1. `auto refresh`
2. `page monitor`
3. `tab reloader`
4. `change detection`
5. `restock alert`
6. `price tracker`
7. `webhook alerts`

### Store Listing URLs
- **Homepage URL:** `https://pulserefresh.app` *(or your GitHub repository URL)*
- **Support URL:** `https://pulserefresh.app/support` *(or your GitHub Issues URL)*
- **Privacy Policy URL:** `https://pulserefresh.pages.dev/privacy-policy` *(live — keep `store-listing/privacy-policy.html` in sync with this page)*

---

## 5. Screenshot Order & Captions

All 5 screenshots in `store-listing/screenshots/` are verified **1280×800 px, 24-bit RGB PNG (no alpha channel)**.

1. **`01-popup-and-live-restock-alert.png`**
   *Caption:* Quick-action toolbar popup with live status banner, on-page keyword highlight, floating countdown badge, and instant desktop alert.
2. **`02-refresh-controls-and-visual-timer.png`**
   *Caption:* Configure preset, millisecond-precise custom, randomized, or countdown intervals and customize the Shadow DOM on-page visual timer.
3. **`03-page-monitor-and-expressions.png`**
   *Caption:* Monitor pages via full reload or silent background XHR using plain text, wildcards, regex, boolean logic, CSS/XPath, numeric rules, and templates.
4. **`04-alerts-email-and-webhooks.png`**
   *Caption:* Receive desktop notifications, alert chimes, automatic tab focus, direct email alerts, and signed Slack, Discord, Telegram, or JSON webhooks.
5. **`05-automation-ai-dark-mode.png`**
   *Caption:* Build post-refresh macros, run curated or custom automation scripts, bind keyboard shortcuts, and switch seamlessly to dark mode.

---

## 6. Version 1.0.0 Release Notes

```text
Initial 1.0.0 release of PulseRefresh:
• Preset, custom (H:M:S:ms), random range, countdown, and scheduled auto-refresh timers
• Shadow DOM on-page visual countdown overlay with pause/stop controls
• Silent background XHR and full-page monitoring with visual area selector
• Plain text, wildcard, regex, boolean, CSS selector, XPath, and numeric threshold expressions
• Desktop push notifications, alert chimes, email relay support, and Slack/Discord/Telegram/JSON webhooks
• Multi-step macros, script library, cookie management rules, and keyboard shortcuts
• Multi-profile management, browser storage sync, portable JSON backup/restore, and dark mode
```

---

## 7. Notes for Firefox Add-ons (AMO) Code Reviewers

Paste this block into the **"Notes to Reviewer"** box when uploading `packages/pulserefresh-1.0.0-firefox.zip` alongside `packages/pulserefresh-1.0.0-firefox-sources.zip`:

```text
Build environment:
- OS: Linux / macOS / Windows (x64)
- Runtime & package manager: Bun 1.4.4 (or Node.js 20+ with npm)
- Framework: WXT 0.21.5 + React 19 + Vite 8 + TypeScript 5.9

Exact steps to reproduce pulserefresh-1.0.0-firefox.zip from the uploaded sources archive:
1. Unzip pulserefresh-1.0.0-firefox-sources.zip and cd into the extracted folder.
2. Run: bun install
3. Run: bun run zip:firefox
4. Output bundle is written to: .output/pulserefresh-1.0.0-firefox.zip

Security & privacy notes:
- Zero telemetry, analytics, or developer-operated backend servers (data_collection_permissions.required = ["none"]).
- No remote code execution, no eval(), and no new Function().
- External network requests are made only to user-monitored page URLs (when XHR monitoring is enabled) and optional user-configured webhook, email API, or OpenAI API endpoints.
```
