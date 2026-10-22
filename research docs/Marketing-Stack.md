# RawDrop: Master Marketing Stack & Go-To-Market Strategy

**Product:** RawDrop (formerly PocketVault)  
**Positioning:** The Private, Full-Quality Folder & Photo Mirroring Suite for iPhone, Android, Windows, Mac & Linux  
**Status:** Approved Commercial & Go-To-Market Blueprint  
**Date:** October 2026

---

## 1. Brand Identity & The "RawDrop" Positioning

- **Official Product Name:** **RawDrop**
- **Primary Tagline:** _"Transfer original 4K photos and folders from iPhone to PC without losing quality."_
- **Core Value Proposition:** Fast, uncompressed, peer-to-peer device-to-device mirroring with zero cloud servers, zero monthly storage fees, and zero compression.

### Why "RawDrop" Wins Over Competitors

1. **The "AirDrop for Everyone" Mental Model:** Instant cognitive recognition. Users immediately understand: _"It is like AirDrop, but it works on Windows and Android."_
2. **Direct Alignment with Search Intent:** Captures the massive search volume for _"transfer iphone photos without losing quality"_ and Apple's native _"Keep Originals"_ setting.
3. **No "Password Vault" Confusion:** Eliminates the risk of users mistaking the app for a password manager (like 1Password) or a photo-hiding calculator app.
4. **Verb-Ready:** Naturally works as an active verb: _"Just RawDrop it to your PC."_

---

## 2. Product Editions & Feature Gating

RawDrop is segmented into two editions to solve both viral distribution and high-margin monetization:

```
┌──────────────────────────────────────────────┬──────────────────────────────────────────────┐
│             RAWDROP BASIC (FREE)             │              RAWDROP PRO (PAID)              │
│        "The Cross-OS AirDrop for All"        │        "The Autonomous Storage Engine"       │
├──────────────────────────────────────────────┼──────────────────────────────────────────────┤
│ 🎯 FOR: Casual users sending occasional files│ 🎯 FOR: Creators, Note-Takers, Power Users   │
│ 💰 PRICE: €0 Forever                         │ 💰 PRICING: €29.99/yr or €79.99/€99.99 Life  │
├──────────────────────────────────────────────┼──────────────────────────────────────────────┤
│ • Ad-hoc file and photo dropping             │ • EVERYTHING IN BASIC, PLUS:                 │
│ • Blazing 10–25 MB/s P2P wire speed          │ • 🔄 Full Background Auto-Sync (4-Layer)     │
│ • Works over local Wi-Fi and 5G cellular     │ • 🎬 "Shoot & Sync" Mode (Live Ingest)       │
│ • Up to 2 paired devices                     │ • 💾 "Zero-Byte Phone Disk" (Smart Offload)  │
│ • Zero accounts / Zero cloud servers         │ • 📁 Continuous Folder Watching (Obsidian)   │
│                                              │ • 🪟 Floating PiP HUD & Live Activities      │
│ ⚠️ RULE: Keep the app open until completion  │ • 📱 Multi-Device Bonding (3 to 10 Devices)  │
└──────────────────────────────────────────────┴──────────────────────────────────────────────┘
```

### The 3 Core Pro Super-Features

1. **"Shoot & Sync" Mode:** Real-time ingest. As a creator shoots 4K video or ProRAW photos on an iPhone, RawDrop monitors the Camera Roll and streams the files to the PC hard drive the second the shutter stops. Footage is waiting on the editing timeline upon returning to the desk.
2. **"Zero-Byte Phone Disk" (Storage Liberator):** Eliminates "iPhone Storage Full" warnings. Once a 4K video is received and checksum-verified (BLAKE3) on the PC, RawDrop safely offloads the local copy from the Camera Roll, freeing up tens of gigabytes safely.
3. **Continuous Background Sync (4-Layer Cascade):** Features Foreground Auto Keep-Awake, 30-Second Background Bursts (`bypassSuspend = true`), Gentle Local Notification Handoffs, and Nightstand / Charger Automations (`BGProcessingTask`).

---

## 3. Monetization & Pricing Architecture

### 3.1 The "Local App Subscription Penalty" Reality

Market research confirms that users aggressively reject pure subscriptions for local/P2P utilities because there are no ongoing server hosting costs (_"Why pay monthly for my own hard drive and Wi-Fi?"_).

To maximize revenue while capturing both markets, RawDrop utilizes the **Subscription + High-Priced Lifetime Anchor** model:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        UPGRADE TO RAWDROP PRO                          │
│        Continuous Background Sync · Zero-Byte Offload · Shoot & Sync   │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌─────────────┐ │
│  │       MONTHLY         │  │   ANNUAL (POPULAR)    │  │  LIFETIME   │ │
│  │   €4.99 / month       │  │   €29.99 / year       │  │   €79.99    │ │
│  │                       │  │   (Just €2.49/mo)     │  │  Pay Once,  │ │
│  │  • Cancel anytime     │  │  • 7-Day Free Trial   │  │ Own Forever │ │
│  │  • Pay-as-you-go      │  │  • SAVE 50% vs Monthly│  │             │ │
│  └───────────────────────┘  └───────────────────────┘  └─────────────┘ │
│                               ▲                                        │
│                      (THE NUDGE TARGET)                                │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Pricing Tiers & Packaging

| Tier                |        Price        |      Devices Supported       | Target Audience & Psychology                                                              |
| :------------------ | :-----------------: | :--------------------------: | :---------------------------------------------------------------------------------------- |
| **Basic (Free)**    |       **€0**        |  2 Devices (1 Phone + 1 PC)  | Viral top-of-funnel wedge; drives reviews and word-of-mouth.                              |
| **Pro Annual**      |  **€29.99 / year**  |   Up to 3 Personal Devices   | **The primary target (~65% of conversions).** Framed with a 7-Day Free Trial (€2.49/mo).  |
| **Pro Lifetime**    | **€79.99 One-Time** |   Up to 3 Personal Devices   | **The Anchor (~20% of conversions).** Captures upfront cash from anti-subscription users. |
| **Family Lifetime** | **€99.99 One-Time** | Up to 10 Devices (Household) | **The Revenue Doubler (~15% of conversions).** Apple Family Sharing enabled.              |

### 3.3 Unit Economics & Profit Margins

- **Cloud Storage / Bandwidth Cost per User:** **€0.00** (Direct P2P transport).
- **Payment Processing Fee:** Apple / Google 15% Small Business Program (~€4.50 on Annual; ~€12.00 on Lifetime).
- **Net Contribution Margin:** **~85% Net Profit** on every sale.

---

## 4. Competitor Benchmarks & Unique Value Proposition (UVP)

| Feature                                       |        **RawDrop**         |         **PhotoSync**         |          **Resilio Sync**           |      **LocalSend**      | **Syncthing (Möbius)**  |
| :-------------------------------------------- | :------------------------: | :---------------------------: | :---------------------------------: | :---------------------: | :---------------------: |
| **All-in-One: Folders + Camera Roll**         |         ✅ **YES**         |        ❌ Photos Only         | ⚠️ Folders only (iOS photos broken) |  ❌ Manual files only   |     ⚠️ Folders only     |
| **Zero-Router 5G WAN Sync**                   |  ✅ **YES (Hyperswarm)**   |  ❌ Needs VPN / Port Forward  |       ✅ Yes (BitTorrent DHT)       |   ❌ Local Wi-Fi Only   |  ⚠️ Slow Public Relays  |
| **Zero-Byte Phone Disk (Verified Offload)**   |         ✅ **YES**         |       ⚠️ Manual delete        |                ❌ No                |          ❌ No          |          ❌ No          |
| **"Shoot & Sync" Live Creator Mode**          |         ✅ **YES**         |     ⚠️ In-App Camera Only     |                ❌ No                |          ❌ No          |          ❌ No          |
| **Modern iOS Lifecycle (No GPS/Audio Hacks)** | ✅ **YES (PiP + 4-Layer)** | ⚠️ Battery-heavy GPS geofence |    ❌ Suspends in minutes on iOS    | ❌ Fails when minimized | ❌ Fails when minimized |
| **Setup Speed**                               |     ⚡ **10s QR Scan**     |      ⚙️ 50+ Nested Menus      |         ⚙️ Hex Secret Keys          |     ⚡ Fast (Radar)     |   ⚙️ Highly Technical   |
| **Competitor Pricing Reference**              |    €29.99/yr or €79.99     |       \$24.99 Lifetime        |     \$59.99 / \$99.99 Lifetime      |        100% Free        |     \$4.99 One-Time     |

---

## 5. Go-To-Market (GTM) & Content-Led SEO Strategy

### 5.1 High-Intent Keyword Targeting (The Traffic Engine)

#### Tier 1: Competitor Defection & Alternative Keywords (Highest Conversion)

- `localsend auto sync folder` (Very Low KD / High Conversion)
- `localsend background sync ios` (Very Low KD / High Conversion)
- `syncthing ios alternative` (~4,000 searches/mo / Low KD)
- `sync obsidian between iphone and windows without icloud` (~3,500 searches/mo / Low KD)
- `icloud for windows alternative` (~5,000 searches/mo / Low-Med KD)

#### Tier 2: Desperation Troubleshooting Keywords (High Volume)

- `icloud for windows not syncing photos` (~25,000 searches/mo / High Intent)
- `icloud for windows stuck on preparing` (~12,000 searches/mo)
- `transfer photos from iphone to pc without itunes` (~45,000 searches/mo)
- `iphone dcim folder empty windows 11` (~18,000 searches/mo)
- `transfer iphone to pc without losing quality` (~30,000 searches/mo)

### 5.2 The 3 Launch Articles (Day 1 Content)

1. **Article 1 (The Obsidian Note Wedge):**  
   _"How to Sync an Obsidian Vault Between iPhone and Windows 11 for €0/mo (No iCloud Corruption)"_
2. **Article 2 (The LocalSend Upgrade Wedge):**  
   _"Love LocalSend? How to Automatically Mirror Your iPhone Camera Roll to PC Without Clicking Accept"_
3. **Article 3 (The Troubleshooting Fix Wedge):**  
   _"iCloud for Windows Photos Stuck or Not Syncing? 5 Fixes + 1 Permanent Zero-Cloud Alternative"_

### 5.3 Launch Sequence

1. **Show HN (Hacker News):** _"Show HN: RawDrop – Open P2P original-quality folder & photo sync between iPhone and Windows"_
2. **Community Seeding:** Educational problem-solving posts on `r/ObsidianMD`, `r/selfhosted`, `r/windows11`, and `r/iphone`.
3. **The 30-Second Viral Demo Video:** Raw screen recording: iPhone snaps a photo $\to$ pops up in Windows File Explorer 1.2 seconds later with zero user intervention.

---

## 6. Brand Identity System & Visual Tokens

### 6.1 Color Palette Architecture

Designed for deep-black OLED mobile screens, high-contrast creator darkrooms, and Apple Display P3 wide gamut.

| Color Token               | Hex Code  |         RGB          | Design Role & Semantic Meaning                                        |
| :------------------------ | :-------: | :------------------: | :-------------------------------------------------------------------- |
| **Deep Obsidian Black**   | `#080A10` |   `rgb(8, 10, 16)`   | Primary background surface (OLED pitch black, zero light bleed).      |
| **Titanium Slate**        | `#161922` |  `rgb(22, 25, 34)`   | Elevated card panels, bottom sheets, and secondary surfaces.          |
| **Hairline Micro-Border** | `#262B38` |  `rgb(38, 43, 56)`   | 1px sub-pixel separation borders.                                     |
| **Electric Cyan Laser**   | `#00F2FE` |  `rgb(0, 242, 254)`  | **Primary Brand Core.** Data packets in flight, active wireless beam. |
| **Signal Cobalt**         | `#007AFF` |  `rgb(0, 122, 255)`  | Apple-native interaction accent; bridges AirDrop familiar trust.      |
| **Pure Titanium White**   | `#FFFFFF` | `rgb(255, 255, 255)` | High-contrast display typography and razor-sharp vectors.             |
| **Wire Activity Amber**   | `#FFB020` | `rgb(255, 176, 32)`  | High-throughput telemetry indicator (active 120+ MB/s wire transfer). |
| **Verified Emerald**      | `#10B981` | `rgb(16, 185, 129)`  | SHA-256 checksum matched, bit-for-bit verified status.                |

### 6.2 Typography System

- **Display Wordmark:** Modern Swiss Geometric Sans (Tight tracking `-0.03em`, weight 800) – `RawDrop`.
- **Interface & Controls:** SF Pro Text / Inter (Weight 400 & 500, line-height 1.5).
- **Wire Telemetry:** JetBrains Mono / SF Mono (Weight 500/600, tabular figures for throughput and hashes).

### 6.3 App Icon Specs (iOS 18 Multi-Environment)

1. **Dark Mode (Default):** Deep Obsidian squircle with Electric Cyan concentric radar pulse (`#00F2FE` on `#080A10`).
2. **Light Mode:** Ceramic pure white with Signal Cobalt pulse (`#007AFF` on `#F8FAFC`).
3. **iOS 18 Tinted Stencil:** Monochromatic surgical steel responding dynamically to user home-screen tinting (`#FFFFFF` on `#1A1C24`).
