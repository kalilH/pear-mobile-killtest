# Product & Business Dossier: RushLink

**One-Sentence Pitch:** A real-time mobile camera-to-editor 4K video pipeline that streams footage directly from a creator's phone into their remote editor's Mac/PC project folder while they shoot, eliminating cloud upload wait times and storage caps.
**Overall Weighted Score:** 7.55 / 10 (Ranked #1 for Recurring B2B/Prosumer SaaS Revenue)

---

## 1. Problem & Target Customer

### Target Segments

1. **Mobile-First YouTubers & Vertical Video Creators (Reels/TikTok/Shorts):** Creators who shoot 4K60fps, Apple ProRes, or Log video on iPhones/Androids (or transfer SD cards to their phones in the field) and work with a remote video editor.
2. **Event & Wedding Videographers:** Teams seeking same-day edits where footage shot in the morning needs to be on the editor's timeline 20 miles away within minutes.
3. **Boutique Short-Form Video Agencies:** Agencies managing 10–30 executive or creator clients who constantly struggle to get clients to upload heavy raw video files from their phones.

### The Core Pain Point

- **The "Double Transfer" Cloud Bottleneck:** In a standard cloud workflow (_Google Drive_, _Dropbox_, _Frame.io_), if a creator shoots 40GB of 4K footage on their iPhone:
  1. The creator must keep their phone open for 1.5 hours uploading 40GB to the cloud.
  2. Only after the upload finishes can the remote editor spend another 1 hour downloading that 40GB onto their Mac/PC.
- **Punitive Cloud Storage & Bandwidth Pricing:** _Frame.io_ charges **\$15 to \$25 per user/month** and caps storage at 2TB–3TB (forcing agencies to buy extra seats just to get more terabytes). _MASV_ charges **\$0.25 per GB** (\$25 to send a single 100GB shoot). _Blip Business_ charges **\$25/month**.

---

## 2. Technical Architecture (Pear + Bare Stack)

- **Direct-to-Timeline Streaming (`Hyperdrive` + Sparse Replication):**
  - The Creator selects a shoot clips folder on their phone in the `RushLink` mobile app (`pear-mobile`).
  - The remote Video Editor runs the `RushLink Desktop Agent` (built on **Bare**) pointed directly at their Premiere Pro / DaVinci Resolve / Final Cut watched media folder.
  - The moment the creator adds a video clip, `Hyperdrive` begins streaming blocks directly peer-to-peer to the editor's hard drive.
- **Instant Proxy Scrubbing (The Killer Feature):**
  - While the massive 4K raw file streams over `Hyperdrive`, the mobile app generates a lightweight 540p H.264 proxy first and pushes it over the priority `Hypercore` channel in seconds. The editor can start cutting the timeline using the proxy within 30 seconds of the creator finishing a take, while the 4K original silently swaps in behind the scenes.

---

## 3. Competitive Landscape

| Competitor   | Pricing (Verified 2026)          | Core Weakness                                                                                             | RushLink Advantage                                                                                                              |
| :----------- | :------------------------------- | :-------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------ |
| **Frame.io** | \$15–\$25/seat/month             | Requires double wait time (upload to S3, then download); strict 2TB–3TB storage caps force seat upgrades. | **Zero cloud hop** (cuts transfer wait time in half); **unlimited Terabytes** because files flow directly to the editor's disk. |
| **MASV**     | \$0.25 per GB transferred        | Sending 400GB of 4K footage a month costs **\$100/month** in bandwidth fees.                              | Flat **€9.99/month** regardless of whether you send 50GB or 5,000GB.                                                            |
| **Blip**     | Free personal / \$25/mo business | No automatic proxy generation; no NLE watch-folder integration; expensive for solo creators/agencies.     | Purpose-built for creator-to-editor video pipelines at 60% lower cost.                                                          |

---

## 4. Business Model & Unit Economics

- **Pricing Tiers (Recurring SaaS):**
  - **Free Trial:** First 25GB transferred free to prove speed.
  - **Creator Solo Plan:** **€9.99/month** (or €79/year) — 1 Creator mobile device + up to 3 remote Editor desktop connections, unlimited Terabytes.
  - **Agency Plan:** **€29.99/month** — Unlimited client mobile uploaders (via frictionless client invite links) syncing directly to the agency's central NAS/edit bays.
- **Unit Economics:**
  - Monthly Recurring Revenue (MRR) per User: **€9.99** (or €29.99 Agency)
  - Store / Stripe Fee: **-€1.50**
  - Cloud Storage & Bandwidth Cost (even for 10TB/month users): **€0.00**
  - **Net Recurring Margin:** **€8.49/month per user (85% Margin)**
- **Break-Even Point:** **6 active subscribers** covers the €50/month fixed overhead.
- **Cumulative SaaS Profit Projections:**
  - 10 Subscribers: **€35/mo net profit**
  - 50 Subscribers: **€375/mo net profit**
  - 100 Subscribers: **€799/mo net profit** (~€9,588 ARR)
  - 500 Subscribers (incl. 15% Agency tier): **~€5,500/mo net profit** (~€66,000 ARR)

---

## 5. Go-To-Market (GTM) & First 10 Customers

1. **Direct Cold Outreach to Short-Form Editing Agencies:** Search LinkedIn, X (Twitter), and YTJobs.co for "Short-form video agency" and "YouTube video editor." Their #1 operational bottleneck is chasing clients to upload footage from their iPhones to Google Drive. Offer them a branded 1-click app where their clients just select videos and walk away.
2. **Side-by-Side Speed Benchmark Video:** Record a 60-second split-screen reel showing a 10GB 4K iPhone video transferred via Google Drive vs. RushLink direct-to-DaVinci-Resolve timeline.

---

## 6. Key Risks & Mitigation

- **Risk 1 (Asynchronous Time Zones):** If the creator shoots in Germany at 11 PM and closes their phone while their editor in Manila or Los Angeles is asleep, both peers aren't online simultaneously. _Mitigation:_ Ship the `RushLink Desktop Agent` with a "Blind Peer / Home Seed" mode so the creator's own laptop or agency NAS absorbs the transfer at local Wi-Fi speed in 2 minutes and seeds it to the remote editor overnight.
