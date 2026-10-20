# Product & Business Dossier: PearLens

**One-Sentence Pitch:** A wireless, ultra-low-latency multi-camera director monitor and remote trigger that lets solo creators preview and control up to 3 smartphones (iOS or Android) from an iPad, laptop, or spare phone.
**Overall Weighted Score:** 7.15 / 10 (Strong Niche Hardware-Replacement Play)

---

## 1. Problem & Target Customer

### Target Segments

1. **Solo YouTubers, DIY Mechanics, Artisans & Cooking Creators:** Creators filming hands-on work in a workshop, garage, or kitchen using 1 to 3 smartphones mounted on tripods/arms.
2. **Video Podcasters & Interviewers:** Creators filming a 2-person conversation with two smartphones who need to monitor framing, focus, and storage/battery status from a single tablet on the table.
3. **Slow-Living & Aesthetic Vloggers:** Solo creators shooting on the superior rear smartphone lenses who cannot see the screen while standing in front of the camera.

### The Core Pain Point

- **The "Rear Lens Blindspot":** Smartphone rear cameras have vastly superior sensors and lenses compared to front selfie cameras. However, when filming yourself alone (e.g., working under a car hood, cooking, or sitting at a desk), you cannot see if you are out of frame, out of focus, or if the phone stopped recording due to storage/overheating.
- **Existing Solutions Are Locked or Expensive:**
  - _Apple Continuity Camera / Apple Watch Preview:_ Strictly locked to Apple-only ecosystems, supports only 1 camera at a time, and has a tiny screen on the Watch.
  - _Camo Studio (\$49.99/year):_ Designed to turn a tethered phone into a desktop webcam for Zoom/OBS—not an untethered multi-camera field monitor that triggers local 4K60fps recording on the phones themselves.
  - _Hardware Wireless Video Transmitters (Hollyland Mars / Accsoon):_ Cost **€180 to €400+ per camera**, require bulky HDMI cages and NP-F batteries, and negate the simplicity of shooting on a smartphone.

---

## 2. Technical Architecture (Pear + Bare Stack)

- **Local UDP Swarm Transport (`Hyperswarm` over Local Wi-Fi / Hotspot):**
  - Each Camera Phone runs `PearLens` in **Camera Mode**, capturing full-quality 4K/Log video directly to its own local storage while encoding a lightweight, low-latency 720p/30fps preview stream piped through the `react-native-bare-kit` IPC bridge to `Hyperswarm`.
  - The Director Device (an iPad, Android tablet, Mac/Windows laptop, or old phone) runs in **Monitor Grid Mode**, displaying up to 3 live camera feeds side-by-side.
- **Bidirectional RPC Control Channel (`Protomux` / `Hypercore`):**
  - Tapping **[ RECORD ALL ]** on the Director screen sends an instant P2P command that starts native local recording on all 3 camera phones within <50ms of each other (including an audio sync clap/timecode marker for easy multi-cam alignment in post-production).
  - Provides remote tap-to-focus, exposure lock, battery percentage warnings, and remaining GB disk space alerts.

---

## 3. Competitive Landscape

| Competitor                    | Pricing (Verified 2026)   | Core Weakness                                                                                                             | PearLens Advantage                                                                                        |
| :---------------------------- | :------------------------ | :------------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------- |
| **Camo Studio**               | \$49.99/year subscription | Built as a PC webcam tether; recurring subscription; lacks untethered tablet monitor grid.                                | **Untethered field monitor**; triggers full native on-phone 4K recording; **€34.99 One-Time Pro Unlock**. |
| **Blackmagic Camera App**     | Free                      | Requires Blackmagic Cloud setup or complex IP configurations for multi-cam monitoring; no simple cross-OS P2P QR pairing. | Scan QR to pair iPhone + Android + Windows/iPad in 5 seconds over any Wi-Fi or phone hotspot.             |
| **Accsoon SeeMo / Hollyland** | €180–€350 per unit        | Expensive hardware dongles, cables, and external batteries required.                                                      | **100% software solution** using devices the creator already owns.                                        |

---

## 4. Business Model & Unit Economics

- **Pricing Tiers:**
  - **Free Tier:** 1 Camera to 1 Monitor preview (SD resolution, 10-minute recording trigger limit) to test latency.
  - **Creator Pro (One-Time Unlock):** **€34.99 one-time payment** (or €19.99/year) — Up to 3 simultaneous cameras, HD preview, synchronized multi-cam timecode/audio-sync marker, remote focus/exposure lock, and LUT preview overlay.
- **Unit Economics:**
  - Blended Gross LTV: **€30.00**
  - Apple/Google 15% Small Business Fee: **-€4.50**
  - Cloud Server / Bandwidth Cost per User: **€0.00**
  - **Net Contribution Margin per User:** **€25.50 (85% Margin)**
- **Break-Even Point:** **2 Pro unlocks per month** covers the €50/month fixed overhead.
- **Profit Projections:**
  - 10 Pro Users/mo: **€205/mo net profit**
  - 50 Pro Users/mo: **€1,225/mo net profit**
  - 100 Pro Users/mo: **€2,500/mo net profit**
  - 500 Pro Users/mo: **€12,700/mo net profit**

---

## 5. Go-To-Market (GTM) & First 10 Customers

1. **"Show, Don't Tell" Workshop & Desk Setup Reels:** Film a 30-second behind-the-scenes vertical video showing two phones mounted in a workshop or overhead kitchen rig, both streaming live to an iPad propped up next to the creator, with a single tap triggering both cameras.
2. **Smartphone Filmmaking YouTubers:** Reach out to mid-sized YouTube channels focused on smartphone videography, solo content creation, and budget studio setups (channels that regularly review _Blackmagic Camera_, _Filmic Pro_, and phone cages) with free Pro promo codes.

---

## 6. Key Risks & Mitigation

- **Risk 1 (IPC Video Encoding Latency):** Piping 30fps video frames from React Native's camera view over the JS bridge into the `Bare` worklet can introduce >300ms lag or thermal throttling if done via base64 strings. _Mitigation:_ Pass raw binary `SharedArrayBuffer` / `Uint8Array` chunks via `react-native-bare-kit` IPC or bind a lightweight native C addon (`bare-addon`) for hardware-accelerated H.264 packetization.
