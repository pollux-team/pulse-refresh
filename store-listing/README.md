# PulseRefresh — Complete Web Store Publishing Kit

This directory contains every verified package, icon, screenshot, promotional graphic, listing description, permission justification, privacy policy, and checklist required to publish **PulseRefresh v1.0.0** to the **Chrome Web Store**, **Mozilla Firefox Add-ons (AMO)**, and **Microsoft Edge Add-ons**.

---

## Directory Contents & Verified Specifications

### 1. Ready-to-Upload Extension Packages (`packages/`)
| File | Target Store | Notes |
|---|---|---|
| `packages/pulserefresh-1.0.0-chrome-edge-mv3.zip` | Chrome Web Store & Microsoft Edge Add-ons | Production Manifest V3 bundle · zero `eval`/`new Function` · description 122/132 chars |
| `packages/pulserefresh-1.0.0-firefox.zip` | Mozilla Firefox Add-ons (AMO) | Production Firefox bundle · `pulserefresh@pulserefresh.app` · `data_collection_permissions: ["none"]` |
| `packages/pulserefresh-1.0.0-firefox-sources.zip` | Mozilla Firefox Add-ons (AMO) | Clean reproducible source archive for AMO code review |

### 2. Brand Logo & Store Icons (`icons/`)
| File | Dimensions | Color Mode | Target Use |
|---|---|---|---|
| `icons/logo-master.png` | `1600 × 1600` px | RGB PNG | High-resolution master brand artwork |
| `icons/logo-512x512.png` | `512 × 512` px | RGBA PNG (transparent) | Website, press kit, GitHub & directory icon |
| `icons/chrome-web-store-icon-128x128.png` | `128 × 128` px | RGBA PNG (96×96 + 16 px margin) | Chrome Web Store Developer Dashboard icon |
| `icons/firefox-amo-icon-128x128.png` | `128 × 128` px | RGBA PNG (transparent) | Firefox Add-ons listing icon |
| `icons/edge-store-icon-300x300.png` | `300 × 300` px | RGBA PNG (transparent) | Microsoft Edge Partner Center store logo |
| `icons/extension-icons/{16,32,48,96,128}.png` | `16`–`128` px | RGBA PNG (transparent) | Toolbar & manifest icons (also installed in `/public/icon/`) |

### 3. Web Store Screenshots (`screenshots/`)
All 5 screenshots meet the exact Chrome Web Store, Firefox AMO, and Edge Add-ons spec: **`1280 × 800` px (16:10), 24-bit RGB PNG, no alpha channel**.

| Order | File | Featured Capability |
|---|---|---|
| 1 | `screenshots/01-popup-and-live-restock-alert.png` | Toolbar popup, highlighted keyword detection, on-page visual timer badge & desktop alert |
| 2 | `screenshots/02-refresh-controls-and-visual-timer.png` | Preset, custom (HR/MIN/SEC/MS), random & countdown timers + live visual timer customizer |
| 3 | `screenshots/03-page-monitor-and-expressions.png` | Full/silent XHR monitor modes, boolean/regex/CSS/numeric expression builder & keyword templates |
| 4 | `screenshots/04-alerts-email-and-webhooks.png` | Push notifications, window focus, alert chimes, email alerts & Slack/Discord/JSON webhooks |
| 5 | `screenshots/05-automation-ai-dark-mode.png` | AI automation builder, custom user scripts, marketplace scripts, macros & native dark theme |

### 4. Promotional Tiles (`promo/`)
| File | Dimensions | Color Mode | Target Use |
|---|---|---|---|
| `promo/small-promo-tile-440x280.png` | `440 × 280` px | 24-bit RGB PNG (no alpha) | Chrome Web Store & Edge Small Promo Tile (required for featured/category cards) |
| `promo/marquee-promo-tile-1400x560.png` | `1400 × 560` px | 24-bit RGB PNG (no alpha) | Chrome Web Store Marquee & Edge Large Promo Tile |

### 5. Submission Documents
| File | Purpose |
|---|---|
| `STORE_LISTING.md` | Copy-paste titles, short summaries (122 ch & 214 ch), full description, categories, tags, screenshot captions, v1.0.0 release notes & AMO reviewer build notes |
| `PERMISSIONS_AND_DISCLOSURES.md` | Single-purpose statement, per-permission justifications (`storage`, `tabs`, `alarms`, `notifications`, `cookies`, `scripting`, `activeTab`, `power`, `<all_urls>`), remote-code answer & data-usage disclosures |
| `PRIVACY_POLICY.md` | Complete privacy policy in Markdown (ready for Firefox AMO & GitHub) |
| `privacy-policy.html` | Self-contained, dark-mode-ready HTML privacy policy ready to deploy at your public privacy URL |
| `PUBLISHING_CHECKLIST.md` | Step-by-step upload walkthrough for Chrome Web Store, Firefox AMO, and Microsoft Edge Add-ons |
