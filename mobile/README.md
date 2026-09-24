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
- `src/demo.ts` — the simulated host behind **demo mode**: a fake `Pairing` with a
  sentinel `kid`, a rotating frontmost app, and a plausible running-apps list.
- `src/host.ts` — the single switch between the real encrypted transport and the
  demo simulation. The UI imports this instead of `rpc.ts`, so no call site knows
  which is live and no demo code can reach `sendCmd`.
- `src/snippets.ts` — the snippet model + AsyncStorage persistence, validated on
  load like `deckStorage`. `snippetToTile` promotes one onto the deck.
- `src/SnippetLibrary.tsx` — the snippets screen (send / edit / delete / pin) plus
  its editor sheet. Named in PascalCase to avoid colliding with `snippets.ts` on
  case-insensitive filesystems.
- `src/purchases.ts` — RevenueCat: the `deskassist_pro` entitlement, free-tier `Limits`
  the deck enforces, and the `usePro()` context. Pure logic + types, no UI.
- `src/ProProvider.tsx` — owns entitlement state (CustomerInfo is the only source
  of truth) and hosts the paywall. Wraps the whole app in `App.tsx`.
- `src/Paywall.tsx` — the Pro sheet. Its headline changes with *why* it opened;
  packages come from RevenueCat's current offering, so pricing is dashboard-driven.
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

## Demo mode

Tap **Explore the demo** on the pair screen and the whole app becomes usable with
no computer, no host install, and no network: a simulated Mac accepts every
action, reports a rotating frontmost app so Auto mode visibly reacts, and lists
running apps so tiles light their live dots.

It exists for App Review as much as for curiosity. A companion app that opens to
nothing but a QR scanner gets rejected under guideline 2.1 — *unable to review, no
hardware* — and that costs a whole review cycle. A reviewer can now operate the
product end to end.

A demo session is a real `Pairing` carrying the sentinel `kid` `__demo__`, so it
persists across launches and **Unpair** leaves it exactly like a real pairing. A
standing amber banner says it's a simulation on every screen.

## Snippets

The snippet library is the long tail of text you retype: addresses, commands,
boilerplate. Save it once, tap to type it into whatever's focused on your Mac.

- The composer's **✎** button saves what you typed without sending it.
- Tapping a snippet sends it, honouring the **Delay** setting — that pause is the
  window in which you go click the app on your Mac that should receive the typing.
  Sending returns to the deck so the countdown's Cancel stays reachable.
- **＋ Tile** promotes a snippet you reach for constantly onto the deck as a `text`
  tile. Tiles are the nine things you grab without thinking; the library is
  everything else.

Note the free tier's arithmetic: nine tiles and one page means the seed deck fills
every slot, so `＋ Tile` has nowhere to go until a tile is freed. Rather than a
dead button, pressing it names the wall it hit — and offers Pro, since Pro is what
adds pages.

Free keeps three snippets, Pro unlimited — see below for why it isn't zero.

## Pro (RevenueCat)

The free tier is a complete product — one profile, one page, nine tiles, three
snippets, and unlimited ad-hoc text sending all work forever. Pro sells *growth*:
unlimited profiles, pages, and snippets, plus image tile faces. Nothing that works
on day one stops working.

Free gets three snippets rather than none deliberately: a feature nobody can try
is a feature nobody buys, and three is enough to feel why you'd want the fourth.

Entitlement truth always comes from RevenueCat's `CustomerInfo`, never a local
flag, so lapses, refunds, and restores on a second device all resolve correctly
with no logic of our own.

**Setup.** Copy `.env.example` → `.env.local` and fill in the public SDK keys
from RevenueCat → Project settings → API keys. In the RevenueCat dashboard,
create an entitlement whose identifier matches `ENTITLEMENT_ID` in `src/purchases.ts` (currently **`deskassist_pro`**), attach the store
products to it, and add them to the **current** offering (the app reads
`offerings.current`, so pricing and package mix change without an app release).

With no key set, the app runs entirely on the free tier and the paywall explains
why rather than crashing — so the repo stays runnable by anyone who clones it.

In a dev build, long-press the **PRO** badge on the paywall to unlock the gates
locally without a sandbox purchase. That path is compiled out of release builds.

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
