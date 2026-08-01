# streamPhoneDeck

Turn your phone into a [Stream Deck](https://www.elgato.com/stream-deck)-style
control surface. Tap a button on your phone and it **launches an app, opens a URL,
sends a keyboard shortcut, or types text on your computer** — in real time over
your local network, on an **end-to-end encrypted** connection you set up by
**scanning a QR code**.

## The two apps

| Part | What it is | Tech | Folder |
| --- | --- | --- | --- |
| **Phone app** | Native iOS/Android deck — scans a QR to pair; editable, **resizable** grid of tiles | Expo / React Native (TS) | [`mobile/`](mobile/) |
| **Desktop host** | Installable menu-bar/tray app that pairs with the phone and runs the actions | Electron + electron-builder | [`desktop/`](desktop/) |

```
native phone app  ──AES-256-GCM over HTTP (per-device key)──▶  desktop host  ──▶  macOS / Windows
   scan QR to pair          monotonic counter, X25519 handshake        tray + pairing window
```

> There's also a **legacy browser-based deck** (Next.js) in `src/` + `host-agent/`
> — the original version. It still works but is superseded by the native app +
> desktop host below. See [Legacy web deck](#legacy-web-deck).

## Action types

| Type | Example | What it does | Platforms |
| --- | --- | --- | --- |
| `app` | `{ type: "app", target: "Safari" }` | Launch/focus an app | macOS · Windows · Linux |
| `url` | `{ type: "url", target: "https://github.com" }` | Open a URL | all |
| `keys` | `{ type: "keys", combo: "cmd+shift+4" }` | Send a keyboard shortcut | macOS · Windows |
| `text` | `{ type: "text", text: "Hello!" }` | Type a literal string into the focused app | macOS · Windows |
| `shell` | `{ type: "shell", command: "…" }` | Run a shell command | all |

`keys` and `text` synthesize keystrokes (macOS AppleScript `System Events` /
Windows PowerShell `SendKeys`) and need **macOS Accessibility permission**.

## Security

Pairing is **forward-secret** and the channel is authenticated + encrypted, so an
attacker on the same Wi-Fi can't read, forge, replay, or hijack it:

- The QR carries only an **ephemeral X25519 public key** (no secret). The phone
  does ECDH + HKDF to derive a per-device key; an HMAC confirmation proves it saw
  the QR (blocks pairing hijacks).
- Every message is an **AES-256-GCM** envelope with a **monotonic counter** — any
  tamper fails the tag, any replay is rejected.
- Each phone gets its own key and is individually revocable (Unpair).

Full protocol + threat model: [`SECURE-PAIRING-PLAN.md`](SECURE-PAIRING-PLAN.md).

## Install & run

### Desktop host

**Option A — download a prebuilt installer (easiest).** The
[`desktop-build`](.github/workflows/desktop-build.yml) GitHub Actions workflow
builds a macOS `.dmg` and a Windows `.exe` on every push to `desktop/**` (or run
it manually). Download from the run's **Artifacts**, then install:

- **macOS:** open the `.dmg` → drag **streamPhoneDeck** to Applications. It's
  **unsigned**, so the first launch is blocked → **System Settings → Privacy &
  Security → Open Anyway**. If it says *"damaged"*:
  `xattr -dr com.apple.quarantine /Applications/streamPhoneDeck.app`.
- **Windows:** run the `.exe` (NSIS). SmartScreen → **More info → Run anyway**.

**Option B — build it yourself:**
```bash
cd desktop && npm install
npm run dist:mac   # .dmg   (or dist:win / dist)
```

**Option C — run from source (dev):**
```bash
cd desktop && npm install && npm start   # tray app + pairing window
```

See [`desktop/README.md`](desktop/README.md) for details.

### Phone app

Needs an **Expo dev build** (Expo Go can't reach a self-hosted LAN device).

```bash
cd mobile && npm install
npx expo run:ios --device      # or run:android — builds + installs a dev client
npx expo start --dev-client    # serves the JS while you use it
```

For a **standalone** build (runs without your computer): `eas build -p android
--profile preview` (Android is easiest — no Apple account). Full instructions,
including CI, in [`mobile/README.md`](mobile/README.md).

## Pair & use

1. On the computer: launch the host → click **Pair a phone** (shows a QR).
2. On the phone: open the app → **scan the QR** with the camera.
3. You land on the deck — set the **layout size** (2–5 columns) and **resize tiles**
   (2×1, 2×2…) in Edit mode; tap tiles, or use the **Send text** bar (with an
   optional countdown delay) to type onto your computer.

Both devices must be on the **same Wi-Fi**. On iOS, allow the **Local Network**
permission prompt. For `keys`/`text`, grant the host **Accessibility** (macOS:
System Settings → Privacy & Security → Accessibility).

## Build & CI

| Workflow | Builds | Runner |
| --- | --- | --- |
| [`desktop-build`](.github/workflows/desktop-build.yml) | macOS `.dmg` + Windows `.exe` installers | macOS + Windows |
| [`mobile-android`](.github/workflows/mobile-android.yml) | Android **standalone release APK** (runs without Metro) | Ubuntu |
| [`mobile-ios-eas`](.github/workflows/mobile-ios-eas.yml) | iOS build via EAS | Ubuntu → EAS cloud |

The desktop pipeline **signs + notarizes automatically** once you add the code
-signing secrets (macOS Developer ID + Apple creds, Windows Authenticode) — and
falls back to **unsigned** until then. Setup + secret names:
[`desktop/README.md` → Code signing](desktop/README.md#code-signing-optional).

## Legacy web deck

The original browser-based version still lives at the repo root:

```bash
npm install
npm run dev      # Next.js deck server on :3000
npm run agent    # host agent that executes actions
```

Open `http://<your-computer-ip>:3000/` on your phone. It's gated by an optional
`DECK_TOKEN` (plaintext header over HTTP) — fine on trusted Wi-Fi, but the native
app + desktop host above replace it with real end-to-end encryption. Architecture
notes for this version are in [`CLAUDE.md`](CLAUDE.md).

## Repository layout

```
desktop/   Electron host — pairing window, tray, OS executor, installer packaging
mobile/    Expo phone app — QR pairing, crypto, resizable deck, send-text
site/      Landing page (static site/index.html)
src/       Legacy Next.js web deck (+ src/lib shared model)
host-agent/ Legacy Node agent for the web deck
.github/workflows/  CI: desktop installers + mobile builds
SECURE-PAIRING-PLAN.md   Protocol, threat model, and build stages
```
