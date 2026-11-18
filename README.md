# PulseRefresh — Auto Refresh, Page Monitor & Browser Automation

**PulseRefresh** is a cross-browser extension for **Chrome / Edge / Brave (Manifest V3)** and **Firefox**, combining customizable tab refresh timers, flicker-free XHR page monitoring, expression-based change detection, multi-channel alerts (sound, desktop push, email, and webhooks), post-refresh automation macros, keyboard shortcuts, and cross-device profile sync.

- **Web Store Publishing Kit:** [`store-listing/`](./store-listing/README.md) (brand logos & icons, 5× `1280×800` screenshots, `440×280` & `1400×560` promo tiles, store copy, permission justifications, privacy policy, checklist, and upload-ready `.zip` packages)
- **Feature & Verification Checklist:** [`TODO.md`](./TODO.md) (42/42 features implemented & verified across 9 Vitest suites / 59 automated tests)
- **Packaged Extension Zips:** [`releases/`](./releases/) and [`store-listing/packages/`](./store-listing/packages/)

---

## Quick Start

```bash
# Install dependencies
bun install

# Type-check & run all 59 automated tests
bun run compile
bun run test

# Develop with live reload in Chrome or Firefox
bun run dev
bun run dev:firefox

# Build & package production web store archives
bun run zip:all

# Launch interactive browser preview on port 5173
bun run preview:ui
```

---

## Load Locally in Your Browser

### Chrome / Edge / Brave / Arc (Manifest V3)
1. Run `bun run build` (or unzip `store-listing/packages/pulserefresh-1.0.0-chrome-edge-mv3.zip`).
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select `.output/chrome-mv3`.

### Firefox
1. Run `bun run build:firefox` (or use `store-listing/packages/pulserefresh-1.0.0-firefox.zip`).
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...** and select `.output/firefox-mv2/manifest.json`.

---

## Project Structure

```text
├── entrypoints/
│   ├── background.ts                 # Alarm scheduler, tab manager & runtime controller
│   ├── content.ts                    # Shadow DOM countdown badge, picker, monitor & macros
│   ├── popup/                        # Toolbar popup UI
│   └── options/                      # Full settings interface
├── public/icon/                      # Production extension icons (16, 32, 48, 96, 128 px)
├── src/
│   ├── lib/                          # Typed refresh, monitor, expression, alert, macro & sync engines
│   ├── components/                   # Popup, settings panels, visual timer & UI primitives
│   └── styles/globals.css            # Light & dark theme tokens
├── preview/                          # Live browser preview harness
├── tests/                            # 9 Vitest suites (59 automated tests)
├── releases/                         # Latest Chrome MV3 & Firefox distribution zips
└── store-listing/                    # Complete Chrome, Firefox & Edge publishing package
```
