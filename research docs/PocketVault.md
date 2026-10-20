# Product & Business Dossier: PocketVault Sync

**One-Sentence Pitch:** Automated, zero-cloud cross-OS folder and camera-roll mirroring between iPhone/Android and Windows/Mac/Linux, solving the biggest missing feature of LocalSend and Syncthing.
**Overall Weighted Score:** 8.35 / 10 (Ranked #1 for Technical Solo Founder Fit & Lowest OS Risk)

---

## 1. Problem & Target Customer

### Target Segments

1. **"Mixed-Ecosystem" Prosumers (iPhone + Windows PC, or Android + MacBook):** Tens of millions of users who love iPhones/iPads for mobile but use Windows PCs or Linux machines at their desk.
2. **PKM (Personal Knowledge Management) Users:** _Obsidian_, _Logseq_, and Markdown note-takers who want their vault synced across iPhone, Android, Windows, and Mac without paying \$5–\$10/month for cloud sync or suffering iCloud/Google Drive index corruption.
3. **Photographers, Creators & Privacy Self-Hosters:** Users who want every photo/video shot on their phone to automatically appear in a dedicated folder on their home PC/NAS the moment they walk through the front door.

### The Core Pain Point

- **LocalSend:** Has 40,000+ GitHub stars and millions of users, proving massive demand for local cross-OS transfers. **However, LocalSend is 100% manual:** you must manually open both apps, select files, tap send, and manually tap "Accept" on the PC every single time. It cannot watch or auto-sync a folder.
- **Syncthing:** The gold standard on Linux/Android/Windows, but **has no official iOS app**. The third-party wrapper (_Mobius Sync_) struggles with iOS filesystem sandboxing and complex setup.
- **Cloud Sync (_iCloud for Windows_, _Google Drive_, _Blip_):** _iCloud for Windows_ is notoriously buggy and slow at syncing HEIC/MOV files; _Blip_ charges **\$25/month** for commercial users; cloud storage charges recurring monthly fees per terabyte.

---

## 2. Technical Architecture (Pear + Bare Stack)

- **Why This Is the Purest Match for Pear:** Pear’s **Bare** runtime and `Hyperdrive` were literally designed for distributed POSIX-like file system replication across desktop and mobile.
- **Unified Codebase:**
  - **Desktop Daemon (Windows, macOS, Linux):** Runs a lightweight `Bare` background tray app managing local `Hyperdrive` instances mapped to real OS directories (e.g., `C:\Users\Name\PocketVault\CameraRoll` or `~/ObsidianVault`).
  - **Mobile App (`pear-mobile` on iOS & Android):** Runs the exact same `Hyperdrive` + `Autobase` delta-sync engine inside `react-native-bare-kit`.
- **Solving the iOS Background Sync Problem Cleanly:**
  - Instead of fighting Apple's background socket killers for 24/7 operation, PocketVault uses a **1-Click iOS Shortcuts Automation Hook**:
    - _Trigger 1:_ "When iPhone connects to Home Wi-Fi -> Run PocketVault Background Sync."
    - _Trigger 2:_ "When iPhone is plugged into charger -> Run PocketVault Background Sync."
  - Within 3 seconds of plugging in the phone or opening the app, `Hyperdrive` calculates binary diffs and syncs changed Markdown files or new Camera Roll media at local LAN speeds (30–80 MB/s) or over remote `Hyperswarm` DHT when away from home.

---

## 3. Competitive Landscape

| Competitor                  | Pricing (Verified 2026)           | Core Weakness                                                                                                                              | PocketVault Advantage                                                                                                       |
| :-------------------------- | :-------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------- |
| **LocalSend**               | Free (Open Source)                | **Manual-only**; cannot watch folders, cannot sync deletions/edits, requires manual accept on target device, only works on same Wi-Fi LAN. | **Fully automated folder & camera roll mirroring**; works both on local Wi-Fi AND across the internet via `Hyperswarm` DHT. |
| **Syncthing / Mobius Sync** | Free / Paid iOS wrapper           | Intimidating UI for average users; no first-party iOS support; slow peer discovery across changing mobile networks.                        | 10-second QR pairing; native first-party iOS & Android experience built on `pear-mobile`.                                   |
| **Blip**                    | Free personal / \$25/mo business  | Focused on manual file drops rather than continuous bi-directional folder mirroring; expensive commercial tier.                            | **€29.99 One-Time Pro Unlock** for unlimited folders and devices.                                                           |
| **Obsidian Sync**           | \$5 to \$10/month (\$60–\$120/yr) | Locked only to Obsidian notes; recurring monthly SaaS fee.                                                                                 | Syncs Obsidian vaults, Camera Rolls, PDFs, and any folder for a single one-time price.                                      |

---

## 4. Business Model & Unit Economics

- **Pricing Tiers:**
  - **Free Forever Tier:** Pair 2 devices + automatic sync for 1 folder (up to 5GB total synced volume — ideal for an Obsidian text vault).
  - **PocketVault Pro (One-Time License):** **€29.99 one-time payment** (or €14.99/year) — Unlimited devices (iPhone, Android, Windows, Mac, Linux), unlimited folders, automatic Camera Roll backup, and headless NAS/Docker seed node support.
- **Unit Economics:**
  - Blended Gross LTV: **€25.00**
  - Store / Stripe Checkout Fee: **-€3.75**
  - Cloud Server / Bandwidth Cost per User: **€0.00**
  - **Net Contribution Margin per Pro User:** **€21.25 (85%+ Margin)**
- **Break-Even Point:** **3 Pro licenses per month** covers the €50/month fixed overhead.
- **Profit Projections:**
  - 10 Pro Users/mo: **€163/mo net profit**
  - 50 Pro Users/mo: **€1,013/mo net profit**
  - 100 Pro Users/mo: **€2,075/mo net profit**
  - 500 Pro Users/mo: **€10,575/mo net profit**

---

## 5. Go-To-Market (GTM) & First 10 Customers

1. **Open-Core Developer Trust Strategy:** Release the desktop/CLI `Bare` sync daemon as verifiable open-source on GitHub (`pear run pear://...`) so `r/selfhosted` and Hacker News users can verify zero telemetry, while selling the polished iOS/Android mobile app Unlock.
2. **Targeted Content Marketing ("The Missing LocalSend Auto-Sync"):** Publish high-ranking guides and Reddit posts in `r/ObsidianMD`, `r/selfhosted`, `r/Windows11`, and `r/iphone`:
   - _"How to sync an Obsidian Vault between iPhone and Windows for €0/month without iCloud corruption."_
   - _"Love LocalSend? Here is how to make it auto-sync your iPhone Camera Roll to Windows when you plug in your charger."_

---

## 6. Key Risks & Mitigation

- **Risk 1 (File Conflict Resolution):** What happens if a user edits a Markdown note offline on both their iPhone and Windows laptop before syncing? _Mitigation:_ Use `Autobase` causal ordering or create a clean `.conflict-YYYYMMDD.md` sidecar copy (matching Syncthing's battle-tested behavior) so zero user data is ever overwritten silently.
- **Risk 2 (iOS Photo Library Permissions):** Reading raw HEIC/MOV assets from iOS `MediaLibrary` into a `Hyperdrive` folder can double local storage if copied naively. _Mitigation:_ Stream media chunks directly from asset URIs into the outbound `Hypercore` replication stream without duplicating the full Camera Roll inside the app sandbox.
