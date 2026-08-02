# streamPhoneDeck — phone app (Expo)

Native iOS/Android client. Scans the desktop host's pairing QR, then sends
button presses over an **AES-256-GCM encrypted channel** (see
[`../SECURE-PAIRING-PLAN.md`](../SECURE-PAIRING-PLAN.md)).

> **Needs a dev build — not Expo Go.** Expo Go can't reach a self-hosted device
> on your LAN (iOS Local Network permission + ATS, Android cleartext all require
> the native config baked into this project). Build a dev client, then run Metro.

## Structure

- `src/crypto.ts` — AES-256-GCM `seal`/`unseal` **and** the X25519→HKDF→HMAC
  pairing handshake, wire-identical to the host (`desktop/src/host.mjs`). Verified
  by `scripts/interop-check.mjs` + `scripts/x25519-interop.mjs`.
- `src/storage.ts` — pairing (device key) + send counter in the OS secure store.
- `src/rpc.ts` — seals a command → `POST /rpc` → unseals the reply.
- `src/buttons.ts` / `src/keys.ts` — deck data model + shortcut parser (ported
  from the web app's `src/lib`).
- `src/deckStorage.ts` — profiles → pages of tiles + column count, persisted in
  AsyncStorage (migrates older single-deck / single-page layouts forward).
- `src/layout.ts` — grid packing: places multi-cell tiles (w×h) first-fit into
  the chosen number of columns.
- `src/TileEditor.tsx` — add/edit tile modal (label; **icon face**: emoji / text /
  uploaded image via `expo-image-picker` + `-image-manipulator`; action type,
  value, color, **size in grid cells**; live shortcut preview).
- `src/ProfileSettings.tsx` / `src/NamePrompt.tsx` — profile rename + Auto-mode
  trigger-app list; cross-platform name entry.
- `src/RunningApps.tsx` — the host's running-apps screen (focus / pin-as-tile).
- `App.tsx` — pair screen (QR scanner) → deck screen with **profiles**, **pages**
  (dots/arrows), **🪄 Auto mode**, **live tile state**, **drag-to-reorder**, an
  adjustable **layout size** (2–5 columns) and **resizable tiles**.

## Run it

**Android (fastest — no Apple account):**
```bash
# In CI: the "mobile-android-dev-build" workflow produces an APK artifact.
# Locally instead:
cd mobile
npx expo run:android          # builds + installs the dev client on a device/emulator
# then it starts Metro; or later: npx expo start --dev-client
```

**iOS:**
```bash
cd mobile
npx expo run:ios              # local, needs Xcode
# or a cloud build (managed signing):
npx eas init                  # one time — creates the Expo project
eas build -p ios --profile development           # real device
eas build -p ios --profile development-simulator # simulator, no Apple account
```

## Pair + use

1. On the Mac: `cd desktop && npm start`, click **Pair a phone** (shows a QR).
2. In this app: grant camera, scan the QR. It stores the device key and says
   *Connected to <host>*.
3. Tap a tile — the Mac runs the action. Same Wi-Fi is required; an attacker on
   that Wi-Fi still can't read, forge, replay, or tamper (no key, no QR).

## CI

- `.github/workflows/mobile-android.yml` — `expo prebuild` + `gradlew
  assembleDebug` → downloadable dev-client APK. Runs on push to `mobile/**`.
- `.github/workflows/mobile-ios-eas.yml` — EAS cloud build (needs `EXPO_TOKEN`
  secret + `eas init`). Manual dispatch; pick device or simulator profile.

## Verify without a device

```bash
npx tsc --noEmit                 # types
node scripts/interop-check.mjs   # phone↔host AES-GCM is wire-compatible both ways
node scripts/x25519-interop.mjs  # pairing handshake agrees with the host
```
