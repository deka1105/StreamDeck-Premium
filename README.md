# DeskAssist

_Ships on the App Store as **DeskAssist**; the repo keeps its original
`streamPhoneDeck` name._

Turn your phone into a [Stream Deck](https://www.elgato.com/stream-deck)-style
control surface. Tap a button on your phone and it **launches an app, opens a URL,
sends a keyboard shortcut, or types text on your computer** — in real time over
your local network, on an **end-to-end encrypted** connection you set up by
**scanning a QR code**.

<p align="center">
  <img src="docs/screenshots/deck.png" width="30%" alt="The deck: a 3×3 grid of tiles with live running-app indicators">
  <img src="docs/screenshots/snippets.png" width="30%" alt="The snippet library: saved text sent with one tap">
  <img src="docs/screenshots/pair.png" width="30%" alt="Pairing screen, with demo mode available without a computer">
</p>

**No computer to hand?** Tap **Explore the demo** on the pairing screen and the
whole app runs against a simulated Mac — no install, no pairing, no network. It
exists so anyone can evaluate the product without owning the other half of it.

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

## Deck features

The deck is fully editable on the device — no code, no config files.

- **Profiles** — group tiles into named decks (Work, Design, Home…) and switch
  with a tap. Each profile is its own layout, saved per device.
- **Pages** — each profile holds multiple **pages of up to 9 tiles**; flip
  between them with the dots/arrows below the grid, add/remove pages in edit mode.
- **🪄 Intuitive (Auto) mode** — the active profile **follows the app you're
  focused on** on your computer. Map apps → profiles (with a "Use current app"
  shortcut); it's edge-triggered, and an unmapped app leaves the deck where it is.
- **Running-apps screen** — a live list of what's open on the host: tap to bring
  an app to the front, or **＋** to pin it as a tile.
- **Live tile state** — `app` tiles light up when that app is running and
  highlight the one that's frontmost.
- **Custom tile faces** — give a tile an **emoji**, short **text** (REC, 1, GG),
  or an **uploaded image** (resized and stored on-device).
- **Drag to reorder**, resize the grid (2–5 columns) and individual tiles
  (2×1, 2×2…), plus icon/color quick-picks in the tile editor.

macOS-only for now: focus detection (Auto mode) and the running-apps list.

## Security

Pairing is **forward-secret** and the channel is authenticated + encrypted, so an
attacker on the same Wi-Fi can't read, forge, replay, or hijack it:

- The QR carries only an **ephemeral X25519 public key** (no secret). The phone
  does ECDH + HKDF to derive a per-device key; an HMAC confirmation proves it saw
  the QR (blocks pairing hijacks).
- Every message is an **AES-256-GCM** envelope with a **monotonic counter** — any
  tamper fails the tag, any replay is rejected.
- Each phone gets its own key and is individually revocable (Unpair).

**`shell` commands are opt-in.** A `shell` tile runs arbitrary commands on the
host, so it's **disabled by default** and only runs when the operator explicitly
enables it:

- **Desktop app**: tray menu → *Allow shell commands* (a confirmation dialog
  guards it; the setting persists per host).
- **Node agent / headless host**: start with `DECK_ALLOW_SHELL=1`.

Optionally restrict *which* commands run, even when enabled, with an exact-match
allowlist: `DECK_SHELL_ALLOWLIST="cmd one,cmd two"` for the agent (or a
`shellAllowlist` array in the host's `settings.json`). With shell disabled, a
paired phone (or a leaked token) still cannot execute code on your machine.

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
3. You land on the deck — tap tiles to fire actions, or use the **Send text** bar
   (with an optional countdown delay) to type onto your computer. In **Edit** mode
   you can add/edit/delete and **drag to reorder** tiles, add **pages** and
   **profiles**, set the layout size (2–5 columns) and resize tiles. Turn on
   **🪄 Auto** to have the profile follow your focused app, or open **Apps** to
   focus/pin what's running. See [Deck features](#deck-features).

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
notes for this version are in [`CLAUDE.md`](CLAUDE.md). (Shell tiles are opt-in
here too — see [Security](#security).)

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
