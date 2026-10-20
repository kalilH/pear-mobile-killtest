# Product & Business Dossier: RawDrop (CrowdVault)

**One-Sentence Pitch:** Instant, uncompressed 4K wedding and event media synchronization that streams original guest photos and videos directly to the host's laptop and phone with zero cloud compression or storage caps.
**Overall Weighted Score:** 7.75 / 10 (Ranked #1 for Built-In Viral K-Factor)

---

## 1. Problem & Target Customer

### Target Segments

1. **Engaged Couples & Wedding Hosts:** Couples spending €15,000–€40,000 on a wedding who want every candid guest video and photo in full 4K quality the next morning.
2. **Milestone Party, Retreat & Sports Team Organizers:** 30th/50th birthdays, bachelor/bachelorette trips, amateur sports tournaments, and school trips.
3. **Independent Event Planners & Wedding Content Creators:** Professionals hired to capture behind-the-scenes vertical video at weddings.

### The Core Pain Point

- **WhatsApp / Telegram Groups:** Compress 4K 60fps iPhone/Android videos by ~80–85%, turning dimly lit reception videos into pixelated mush, and strip EXIF timestamps/locations.
- **Google Photos / iCloud Shared Albums:** Fail across mixed ecosystems (Android guests cannot join iCloud natively without web workarounds; iPhone guests hate signing into Google accounts), and 100GB of guest 4K video immediately maxes out the host's personal paid cloud storage quota.
- **QR Web Portals (_Kululu_, _GuestPix_, _WedShoots_):** Charge **\$49 to \$99 per event**, yet still cap total uploads (e.g., 100 media items on mid-tiers) or compress video bitrate because AWS S3 storage + egress bandwidth for 150GB of raw 4K video destroys their margins.

---

## 2. Technical Architecture (Pear + Bare Stack)

- **Host "Vault Node" (Desktop + Mobile):** The bride/groom or host runs RawDrop on their home/venue laptop (using the **Bare** desktop daemon) AND their smartphone (`pear-mobile`). The laptop acts as an always-on, high-storage `Hyperdrive` destination with 500GB+ of free local disk space.
- **Cryptographic Event Swarm:** Creating an event generates a unique `Autobase` / `Hyperdrive` swarm key encoded into printable table tent QR codes (`pear://...` or deep link).
- **Guest Flow (Zero-Account Mobile / App Clip):**
  - Guests scan the QR code, select 10–50 photos/videos they shot during the event, and tap **[ Send Original Quality ]**.
  - `Hyperdrive` streams the exact raw `.MOV`, `.MP4`, and `.HEIC` byte streams directly to the host's phone and seeding laptop over `Hyperswarm`.
  - Automatic deduplication via cryptographic content hashing ensures if a guest taps "Select All" twice, zero duplicate bytes are transferred.

---

## 3. Competitive Landscape

| Competitor             | Pricing (Verified 2026) | Core Weakness                                                                                                               | RawDrop Advantage                                                                                                                       |
| :--------------------- | :---------------------- | :-------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| **Kululu**             | \$49 to \$99 per event  | Caps media counts on mid-tiers (e.g., 100 uploads); web uploads time out on large 4K video files over weak venue reception. | **Unlimited gigabytes & unlimited 4K video length**; P2P chunked resume automatically finishes uploading when guests get home to Wi-Fi. |
| **GuestPix**           | From \$49 per event     | Cloud storage retention limits; browser upload fails when phone screen locks during a 2GB video upload.                     | Resumable `Hyperdrive` byte streaming; **€24.99 flat Event Pass** (50% cheaper than incumbents).                                        |
| **WhatsApp / AirDrop** | Free                    | WhatsApp ruins video quality; AirDrop only works iPhone-to-iPhone within 3 meters and fails on batches >30 videos.          | Cross-platform (iPhone + Android + Windows + Mac), works from anywhere, 100% uncompressed original files.                               |

---

## 4. Business Model & Unit Economics

- **Pricing Tiers (Host Pays, Free for All Guests):**
  - **Free Mini-Event:** Up to 5 guests / 25 photos & videos (great for testing before the wedding day).
  - **Party Pass:** **€19.99 one-time** (Up to 35 guests, unlimited uncompressed 4K video/photos, auto-generates printable PDF QR table cards).
  - **Wedding Pro Pass:** **€39.99 one-time** (Unlimited guests, desktop vault auto-backup, live slideshow display mode on laptop/TV via Bare desktop app).
- **Unit Economics:**
  - Blended Revenue per Event: **€24.99**
  - Store / Stripe Fee (many hosts buy on desktop when printing QR cards): **-€2.50**
  - Cloud Storage & Bandwidth Cost (even if guests transfer 250GB of 4K video): **€0.00**
  - **Net Contribution Margin per Event:** **~€22.49 (90% Margin)**
- **Break-Even Point:** **3 events per month** covers the €50/month fixed overhead.
- **Profit Projections:**
  - 10 Events/mo: **€175/mo net profit**
  - 50 Events/mo: **€1,075/mo net profit**
  - 100 Events/mo: **€2,199/mo net profit**
  - 500 Events/mo: **€11,195/mo net profit**

---

## 5. Go-To-Market (GTM) & Built-In Viral Loop

1. **Built-In Viral K-Factor:** At a 100-person wedding, 60–80 people scan the RawDrop QR code and experience instant, uncompressed sharing. A subtle footer on the guest confirmation screen says: _"Hosting a wedding, birthday, or group trip? Collect everyone's full-quality 4K videos for free ->"_.
2. **Etsy & Canva Table-Card Templates:** Sell or give away aesthetic "Scan to Share Wedding Photos" Canva templates on Etsy and bridal blogs with RawDrop pre-integrated.
3. **Local Wedding Photographers & DJs (Bonn / NRW / DACH):** Partner with independent wedding photographers and DJs. Give them a 30% affiliate cut (or free branded QR cards) so they can offer "Uncompressed Guest Raw Footage Collection" as a €100 upsell to their clients while paying €25 for the software.

---

## 6. Key Risks & Mitigation

- **Risk 1 (Guest App Install Friction):** Wedding guests hate downloading bloated apps or creating accounts after having two glasses of champagne. _Mitigation:_ Zero sign-up/email required; build an **iOS App Clip** and **Android Instant App** wrapper so scanning the QR opens a native sheet in 2 seconds without visiting the App Store.
- **Risk 2 (Host Device Offline):** If the bride's phone is dead at 2 AM when guests try to upload, P2P needs an online peer. _Mitigation:_ Instruct the host during setup to install the 1-click RawDrop Desktop Vault on their laptop at home (which stays online 24/7 during the wedding weekend) as an always-on swarm peer.
