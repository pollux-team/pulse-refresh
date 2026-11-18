# Web Store Publishing Checklist

Step-by-step launch checklist for **Chrome Web Store**, **Firefox Add-ons (AMO)**, and **Microsoft Edge Add-ons**. Every asset in `store-listing/` has already been built and verified to exact specification.

---

## Pre-Flight Verification (Already Completed)

- [x] TypeScript strict check (`bun run compile`): **0 errors**
- [x] Automated test suite (`bun run test`): **9/9 suites, 59/59 tests passing**
- [x] Manifest `name`: `PulseRefresh - Auto Refresh & Page Monitor` (**42 / 45 chars**)
- [x] Manifest `short_name`: `PulseRefresh` (**12 / 12 chars**)
- [x] Manifest `description`: **122 / 132 chars** (within Chrome Web Store's strict 132-char limit)
- [x] Static CSP audit: **zero** `eval()`, **zero** `new Function()`, **zero** remote scripts
- [x] UI copy audit: **zero** development, framework, or placeholder text across Popup, Settings, Manifest, and Device strings
- [x] Extension icons (`16`, `32`, `48`, `96`, `128` px): anti-aliased RGBA PNG bundled inside both Chrome/Edge and Firefox zips
- [x] Store icons: Chrome Web Store (`128×128` with 96×96 artwork + 16 px margin), Firefox AMO (`128×128`), Edge Add-ons (`300×300`), High-res (`512×512`)
- [x] Screenshots (5×): exact **1280×800 px, 24-bit RGB PNG (no alpha channel)**
- [x] Promotional tiles: Small (**440×280 px, 24-bit RGB PNG**) and Marquee (**1400×560 px, 24-bit RGB PNG**)

---

## Before Uploading to Any Store (2 Minutes)

- [ ] Host `store-listing/privacy-policy.html` on a public HTTPS URL (e.g., GitHub Pages, Cloudflare Pages, Vercel, or your domain `/privacy`) and update the contact email inside it.
- [ ] Prepare a public Support URL (your website support page or GitHub Issues page).

---

## 1. Chrome Web Store Submission

**Portal:** `https://chrome.google.com/webstore/devconsole` *(one-time $5 developer registration fee)*

1. [ ] Click **New Item** and upload `store-listing/packages/pulserefresh-1.0.0-chrome-edge-mv3.zip`.
2. [ ] **Store Listing tab:**
   - Language: `English`
   - Description: paste Section 3 from `STORE_LISTING.md`
   - Category: `Productivity → Workflow & Planning`
   - Store icon: upload `store-listing/icons/chrome-web-store-icon-128x128.png`
   - Screenshots: upload all 5 PNGs from `store-listing/screenshots/` in order (`01` through `05`)
   - Small promo tile: upload `store-listing/promo/small-promo-tile-440x280.png`
   - Marquee promo tile: upload `store-listing/promo/marquee-promo-tile-1400x560.png`
   - Homepage URL & Support URL: fill in your live HTTPS links
   - Mature content: select **No**
3. [ ] **Privacy Practices tab:**
   - Single Purpose: paste Section 1 from `PERMISSIONS_AND_DISCLOSURES.md`
   - Permission Justifications (`storage`, `tabs`, `alarms`, `notifications`, `cookies`, `scripting`, `activeTab`, `power`, `Host permission`): paste each matching block from Section 2 of `PERMISSIONS_AND_DISCLOSURES.md`
   - Remote Code: select **No, I am not using Remote code**
   - Data Usage: leave all collection boxes unchecked (per Section 4) and check all 3 Developer Policy certifications
   - Privacy Policy URL: paste your hosted `privacy-policy.html` HTTPS URL
4. [ ] **Distribution tab:** select **Free**, **Public**, **All regions**.
5. [ ] Click **Save Draft → Submit for Review** *(typical review: 1–3 business days)*.

---

## 2. Mozilla Firefox Add-ons (AMO) Submission

**Portal:** `https://addons.mozilla.org/developers/addon/submit/distribution` *(free developer account)*

1. [ ] Select **On this site** (public AMO listing) and upload `store-listing/packages/pulserefresh-1.0.0-firefox.zip`.
2. [ ] When asked **"Do you need to submit source code?"**, select **Yes** (since WXT/Vite bundles TypeScript + React) and upload `store-listing/packages/pulserefresh-1.0.0-firefox-sources.zip`.
3. [ ] **Notes to Reviewer:** paste Section 7 from `STORE_LISTING.md` (exact `bun install && bun run zip:firefox` reproduction steps).
4. [ ] **Listing Details:**
   - Name: `PulseRefresh - Auto Refresh & Page Monitor`
   - Summary (≤250 chars): paste Firefox AMO Summary from Section 2 of `STORE_LISTING.md`
   - Description: paste Section 3 from `STORE_LISTING.md`
   - Categories: `Tabs` and `Alerts & Updates`
   - Add-on icon: upload `store-listing/icons/firefox-amo-icon-128x128.png`
   - Screenshots: upload all 5 PNGs from `store-listing/screenshots/` with captions from Section 5 of `STORE_LISTING.md`
   - Privacy Policy: paste the text of `PRIVACY_POLICY.md`
   - License: choose your preferred license (e.g., MIT or All Rights Reserved)
   - Support email / website: enter your published support link
5. [ ] Click **Submit Version**. *(Note: `data_collection_permissions: { required: ["none"] }` is already declared in the Firefox manifest.)*

---

## 3. Microsoft Edge Add-ons Submission

**Portal:** `https://partner.microsoft.com/dashboard/microsoftedge/overview` *(free developer registration)*

1. [ ] Click **Create new extension** and upload `store-listing/packages/pulserefresh-1.0.0-chrome-edge-mv3.zip` *(Edge natively runs the identical Chromium MV3 package)*.
2. [ ] **Availability:** select **Public** and **All markets**.
3. [ ] **Properties:**
   - Category: `Productivity`
   - Privacy Policy URL, Website URL, Support contact: paste your live links
   - Mature content: **No**
4. [ ] **Store listings (English):**
   - Short description: paste Edge Short Description from Section 2 of `STORE_LISTING.md`
   - Description: paste Section 3 from `STORE_LISTING.md`
   - Search terms (max 7): add the 7 terms from Section 4 of `STORE_LISTING.md`
   - Extension logo (**300×300** required): upload `store-listing/icons/edge-store-icon-300x300.png`
   - Screenshots: upload all 5 PNGs from `store-listing/screenshots/`
   - Small promotional tile (`440×280`): upload `store-listing/promo/small-promo-tile-440x280.png`
   - Large promotional tile (`1400×560`): upload `store-listing/promo/marquee-promo-tile-1400x560.png`
5. [ ] **Submit your extension → Notes for certification:** summarize single purpose and zero-telemetry local architecture from `PERMISSIONS_AND_DISCLOSURES.md`, then click **Publish**.
