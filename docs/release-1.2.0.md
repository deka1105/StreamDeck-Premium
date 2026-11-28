# DeskAssist 1.2.0 — release checklist and App Review notes

**Branch:** `panel-parity`. **Do not merge to `main` until the 1.1.0 review is resolved** (PLAN Stage 18). The app version on this branch is 1.2.0 (iOS build 14, Android versionCode 6).

## Before submitting

- [ ] 1.1.0 review resolved (check App Store Connect), then merge `panel-parity` → `main`.
- [ ] Privacy policy: `site/privacy.html` already lists everything 1.2 adds. Update its "Effective" date on the day it ships (the site publishes from `main`).
- [ ] App Store Connect privacy answers: unchanged. The app still collects nothing. Every lookup is made by the user's own computer, and the Android-only features stay between the phone and that computer.
- [ ] iOS build: `eas build -p ios` (or the usual flow). Check the demo panel on a real iPhone.
- [ ] Android: Play policy review for notification-listener access and the HOME intent filter (both opt-in). See docs/ANDROID-CHECKS.md.
- [ ] Desktop: `npm run dist:mac:release` (signing + notarization secrets needed) and `npm run dist:win` on Windows (builds the native helper first). Attach both to the download page.
- [ ] Owner live checks still open: docs/CONTROL-DECK-CHECKS.md, docs/ANDROID-CHECKS.md, docs/desk-edges.md, docs/printers.md, docs/creative-apps.md.

## App Review notes (paste into "Notes")

DeskAssist turns an iPhone into a desk panel and control deck for the user's own computer. It needs a free desktop companion app on the user's Mac or PC to show live data.

**To review without a computer, use the built-in demo:**

1. On the welcome screen, tap **Try the demo** (no account, no computer needed).
2. Tap **Panel** at the top. The yellow "Simulated — demo data" label shows that everything is simulated.
3. Swipe left and right (or tap the dots at the bottom) to see the pages:
   - **Home**: clock, computer load, deck tiles;
   - **System**: charts and processes;
   - **Studio**: streaming-software scenes, meeting buttons, volume, lighting keys, wake-a-computer;
   - **Dev & home**: smart-home tiles, dev services, containers, trackpad;
   - **Audio**: per-app mixer, push-to-talk;
   - **PC**: brightness, power plans;
   - **Printers**: four 3D printers;
   - **Play**: games, photo frame, camera, device batteries;
   - **Create**: tool keys, precision slider, colours;
   - **Blender**;
   - **AI**: coding-agent sessions and plan limits;
   - **Automation**, **Daily**, **Deck**.
4. Every button responds in the demo: scenes switch, "Mute everything" toggles, smart-home lights toggle, containers start and stop. Nothing is sent anywhere.
5. To leave the demo, tap **Connect your own Mac →**.

There are no purchases, accounts or ads. The panel is bundled with the app; it is not downloaded code.
