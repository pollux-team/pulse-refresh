# Permissions Justifications & Store Privacy Disclosures

Copy-paste answers for the **Chrome Web Store → Privacy Practices** tab, **Microsoft Edge Partner Center → Notes for Certification**, and **Mozilla AMO → Data Collection**.

---

## 1. Single Purpose Description (Chrome Web Store)

```text
PulseRefresh automatically refreshes user-selected browser tabs on configurable schedules and monitors those pages for user-specified content changes, triggering local or user-configured alerts and post-refresh page actions.
```

---

## 2. Permission-by-Permission Justifications

### `storage`
```text
Required to save the user's refresh intervals, monitoring profiles, keyword rules, auto-start URL patterns, alert settings, activity log, and cross-device synced preferences locally in browser.storage.local and browser.storage.sync.
```

### `tabs`
```text
Required to reload monitored tabs on schedule, list and stop active refresh jobs across open tabs, rotate or open user-configured URL lists, prevent automatic discarding of actively refreshed tabs, and bring a tab to focus when a monitored keyword is detected.
```

### `alarms`
```text
Required in Manifest V3 service workers to reliably schedule recurring, randomized, countdown, and clock-time tab refresh ticks even when the background service worker goes idle between intervals.
```

### `notifications`
```text
Required to display desktop alert notifications when a monitored keyword appears, disappears, a price/content diff threshold is met, or a CAPTCHA challenge pauses an active refresh job, allowing one-click navigation to the alerting tab.
```

### `cookies`
```text
Required solely for the optional user-configured Cookie Automation feature, which lets users clear site cookies before a clean reload, preserve login session cookies across refreshes, or snapshot and restore cookies for specific domains they explicitly specify. Cookies are never transmitted externally.
```

### `scripting`
```text
Required to render the isolated Shadow DOM visual countdown badge, launch the interactive page-area selector, inspect page text/elements for user-defined change monitoring rules, highlight matched keywords, pause on user interaction or unsaved form input, and run user-enabled post-refresh automation steps.
```

### `activeTab`
```text
Required to immediately inspect the current tab's URL and title and start, pause, or stop auto-refresh and visual element picking when the user opens the PulseRefresh toolbar popup or presses a keyboard shortcut.
```

### `power` *(Chrome & Edge MV3 only)*
```text
Required solely for the optional "Prevent System Sleep" toggle so a user's computer or wallboard display does not enter sleep mode while an active refresh or monitoring job is running. The keep-awake request is released immediately as soon as all jobs stop or the toggle is disabled.
```

### Host Permissions — `<all_urls>`
```text
Required because users can enable auto-refresh, visual countdown overlays, auto-start URL rules, silent XHR change checks, visual area selection, and keyword monitoring on any website, internal dashboard, e-commerce page, or status portal of their choice, as well as deliver alerts to any custom webhook or email relay endpoint they configure.
```

---

## 3. Remote Code Declaration (Chrome Web Store)

- **Are you using remote code?** → Select **`No, I am not using Remote code`**
- **Justification (if prompted):**
  ```text
  All executable extension code is bundled inside the submitted package. PulseRefresh does not download or execute external JavaScript files, and does not use eval() or new Function().
  ```

---

## 4. Data Usage Questionnaire (Chrome Web Store)

PulseRefresh has **no developer backend, no analytics, no crash reporter, and no telemetry**. Check the boxes below on the Chrome Web Store Privacy tab:

| Data Category | Collect / Transmit? | Explanation |
|---|---|---|
| Personally identifiable information | **No** | Optional recipient email stays in local storage and is sent only to the email API configured directly by the user. |
| Health information | **No** | Not collected or accessed. |
| Financial and payment information | **No** | No payments, billing, or financial data collection. |
| Authentication information | **No** | User-supplied optional API keys/webhook URLs remain strictly in the user's browser storage and are never sent to the developer. |
| Personal communications | **No** | Not collected or accessed. |
| Location | **No** | Not collected or accessed. |
| Web history | **No** | Active refresh job URLs remain exclusively in the user's browser storage (`storage.local` / `storage.sync`). |
| User activity | **No** | Interaction listeners (click/scroll/key) run strictly in-memory on the page solely to pause/stop a timer when "Stop on Interaction" is turned on; nothing is logged or sent anywhere. |
| Website content | **No** | Page text comparison and keyword matching happen strictly locally inside the user's browser. Matched alert snippets are sent externally only if the user explicitly configures their own webhook or email alert destination. |

### Mandatory Developer Certifications (Check all 3)
- [x] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

---

## 5. Firefox Add-ons (AMO) Data Collection Declaration

Already embedded directly in `manifest.json` (`wxt.config.ts`) for Firefox builds:

```json
"browser_specific_settings": {
  "gecko": {
    "id": "pulserefresh@pulserefresh.app",
    "strict_min_version": "109.0",
    "data_collection_permissions": {
      "required": ["none"]
    }
  }
}
```
