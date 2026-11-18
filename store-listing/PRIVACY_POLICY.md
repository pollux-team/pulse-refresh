# Privacy Policy — PulseRefresh

**Effective Date:** November 17, 2026  
**Extension:** PulseRefresh – Auto Refresh & Page Monitor  

## Summary

PulseRefresh is a self-contained, local-first browser extension. **We do not collect, store, sell, rent, or transmit any personal data, browsing history, cookies, page content, analytics, or telemetry to any developer-owned or third-party tracking server.**

## 1. Data Stored Locally on Your Device

To perform auto-refresh, page monitoring, and automation functions that you configure, PulseRefresh stores the following settings exclusively in your browser's built-in extension storage (`storage.local` and, when enabled by you, `storage.sync`):

- Refresh interval settings, timer overlay preferences, and saved configuration profiles
- Active refresh task state, monitored page snapshots/hashes used for local diff detection, and a local activity log (which you can clear at any time)
- Auto-start URL patterns, URL rotation lists, keyword/expression rules, and templates
- Automation macros, custom scripts, keyboard shortcut bindings, and domain-scoped cookie rules
- Optional alert and integration settings you explicitly enter (webhook URLs, email API credentials, custom sound URLs, or an optional AI provider API key)
- Browser type and operating system label (for example, `Chrome · macOS`) solely to distinguish your own synced browser instances inside your `storage.sync` storage area

If Browser Sync is enabled, your browser vendor (such as Google Chrome Sync, Mozilla Sync, or Microsoft Edge Sync) synchronizes selected preferences across devices signed into your browser account under that browser vendor's own privacy policy. PulseRefresh has no access to your browser account.

## 2. How Permissions & Page Data Are Used

- **Page Content & Monitoring:** When you enable Page Monitor on a tab, PulseRefresh reads the target page (or selected element) locally in your browser to check for your configured keywords, expressions, or content differences. When Silent XHR mode is selected, your browser fetches the monitored URL directly to compare updated HTML without reloading the visible tab.
- **User Interaction Detection:** When "Stop on Interaction" or form protection is enabled, PulseRefresh listens locally for clicks, scrolling, or form edits solely to pause or skip a scheduled reload. Keystrokes and interaction events are never recorded or transmitted.
- **Cookies:** When you create a Cookie Automation rule for a specific domain, PulseRefresh reads, clears, sets, or locally snapshots only the cookies matching your rule. Cookie data is never sent to any external server.
- **System Sleep Prevention:** When "Prevent System Sleep" is turned on, PulseRefresh uses the browser's power API to keep the system or display awake only while active refresh jobs are running.

## 3. Optional User-Configured Outbound Connections

PulseRefresh makes outbound network calls **only** when initiated by your configuration:

1. **Monitored Webpages:** Requests to reload or fetch the specific URLs you choose to monitor.
2. **Webhooks (Optional):** If you add a Slack, Discord, Telegram, or custom HTTPS webhook URL, alert payloads (page URL, title, matched keyword, snippet, and timestamp) are sent directly from your browser to that URL.
3. **Email Alerts (Optional):** If you configure Resend, SendGrid, EmailJS, or a custom HTTPS email relay with your own credentials, alert emails are dispatched directly from your browser to that provider.
4. **AI Script Generation (Optional):** If you enter an OpenAI-compatible endpoint and API key and click Generate, the automation prompt you type is sent directly from your browser to that API endpoint. Without an API key, prompt parsing runs completely offline.
5. **Custom Alert Audio (Optional):** If you supply a custom audio URL, your browser loads that audio file locally when playing an alert.

All optional third-party services you choose to connect are governed by their respective privacy policies.

## 4. No Analytics, Ads, or Data Sharing

- No third-party analytics SDKs (no Google Analytics, Sentry, Mixpanel, or tracking pixels)
- No advertisements, affiliate link injection, or monetization scripts
- No sale, licensing, or transfer of user data to any third party
- No remote code execution

## 5. Data Control, Export & Deletion

You have complete control over all extension data at all times:

- Export or back up your configuration as a JSON file from **Settings → Profiles & Sync**
- Clear your activity log with one click from **Settings → Activity Log**
- Remove individual profiles, rules, cookies snapshots, webhooks, or API keys from **Settings**
- Uninstalling PulseRefresh automatically and permanently deletes all local extension storage from your browser

## 6. Children's Privacy

PulseRefresh is a general-purpose productivity utility and does not knowingly collect any personal information from anyone, including children under 13.

## 7. Changes to This Policy

If this privacy policy is updated to reflect new extension functionality, the revised policy and updated effective date will be published at the same URL before the corresponding extension update takes effect.

## 8. Contact

For privacy questions or support inquiries, please contact: **nomandhoni@blinkeye.app**.
