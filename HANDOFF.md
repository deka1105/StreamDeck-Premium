# streamPhoneDeck — Handoff

_Last updated: 2026-09-23_

A running status document for whoever picks this up next (human or agent). For
day-to-day architecture reference see [CLAUDE.md](./CLAUDE.md); for user-facing
usage see [README.md](./README.md). This file captures **state, decisions, and
open questions** those two don't.

## 09-23: monetization, demo mode, snippets (Shipaton run)

The phone app now ships under the name **DeskAssist** (`mobile/app.json`;
bundle `com.dekisuki05.deskassist`, App Store Connect record `6800168772`,
never publicly released). Three things landed:

- **RevenueCat** (`mobile/src/purchases.ts`, `ProProvider.tsx`, `Paywall.tsx`).
  One `pro` entitlement; entitlement truth always read from `CustomerInfo`,
  never a local flag. Free tier is a complete product — 1 profile, 1 page,
  9 tiles, 3 snippets, unlimited ad-hoc text. Pro sells growth. Paywall pricing
  comes from `offerings.current`, so it changes without an app release.
- **Demo mode** (`mobile/src/demo.ts` + `host.ts`). A simulated Mac so the app
  is fully usable with nothing installed. `host.ts` is the only switch between
  it and the encrypted transport; the branch happens before `sendCmd`, so no
  demo path can reach the crypto. Exists primarily to avoid an App Review 2.1
  rejection ("unable to review, no hardware") — a companion app that opens to
  only a QR scanner gets rejected.
- **Snippet library** (`mobile/src/snippets.ts`, `SnippetLibrary.tsx`). Saved
  reusable text, sent with one tap, honouring the existing Delay. `＋ Tile`
  promotes a snippet onto the deck as a `text` action.

**Verified on an iPhone 17 Pro simulator** (dev build, Test Store key): demo
mode from cold launch, deck render with live running/frontmost dots, snippet
create → save → send (status confirmed `Sent "…"`), free-tier counters.

### Blocked on the owner

1. **RevenueCat dashboard**: create the `pro` entitlement, attach products, add
   them to the *current* offering. The `sk_` key supplied was a legacy v1 key
   and cannot configure a project via API v2 — needs either the dashboard UI or
   a v2 API key.
2. **App Store Connect**: create the IAP products. A non-consumable lifetime
   unlock has the fewest metadata rejection surfaces; add subscriptions after.
3. **`appl_` SDK key** for any build going to the App Store. The repo is wired
   for a `test_` Test Store key, which simulates purchases and must not ship —
   `isTestStoreKey()` warns at configure time and the paywall shows a TEST STORE
   badge in dev builds.
4. **Host `site/`** so `site/terms.html` and `site/privacy.html` resolve, then
   set `SITE_BASE` in `mobile/src/Paywall.tsx`. Apple rejects a subscription
   paywall with dead Terms/Privacy links. Both pages still contain
   `REPLACE_WITH_SUPPORT_EMAIL` and `REPLACE_WITH_JURISDICTION`.
5. **Rotate any secret key** that has been pasted into a chat or terminal.

### Gotcha for local dev

`mobile/ios/` is generated and gitignored, and it goes stale: it predated
`expo-image-picker` and the DeskAssist rename, which crashed the app at launch
(`Cannot find native module 'ExponentImagePicker'`) and built the wrong bundle
id. Run `npx expo prebuild --clean -p ios` after changing native deps or
`app.json`. EAS builds prebuild fresh in the cloud and are unaffected.

## Since the 07-28 snapshot (shipped)

Both the native app and the legacy web deck gained, at parity: **profiles**,
**pages** (multiple pages of ≤9 tiles per profile), **🪄 intuitive/Auto mode**
(the active profile follows the host's focused app), a **running-apps screen**
(focus / pin-as-tile), **live tile state** (running/frontmost dots), **custom
tile faces** (emoji / text / uploaded image), and **drag-to-reorder**. Security:
**`shell` is now opt-in** (off by default; tray toggle or `DECK_ALLOW_SHELL=1`,
optional exact-match allowlist). Focus detection + the apps list are macOS-only.
The sections below are the original 07-28 snapshot; some open items are now done
(noted inline).

## In one line

Turn your phone into a Stream Deck: tap a tile → an app launches / a URL opens /
a keyboard shortcut fires on your computer. Deck is a Next.js web app; a small
Node agent on the target machine does the real OS control.

## Status: working prototype ✅

Verified end-to-end on macOS (iPhone 17 Pro simulator + local Mac):

- Deck renders and sends presses; agent receives over SSE and executes.
- Real OS control confirmed (launching Finder brought it to the foreground).
- In-app tile editing (add / edit / delete / reset) works and persists.
- Key-string validation (`cmd+shift+4` → `⌘ ⇧ 4`) verified.
- `npm run build` and `npm run lint` both pass clean.

Optional shared-secret auth is in (opt-in via `DECK_TOKEN`). Not yet done: tests,
non-macOS keystrokes, tile reordering.

## How to run

```bash
npm install
npm run dev      # deck server on :3000
npm run agent    # host agent — executes actions on THIS machine
```

Phone (same Wi-Fi): open `http://<computer-ip>:3000/`. Optional monitor:
`http://localhost:3000/host`. Preview actions without running them:
`DECK_DRY_RUN=1 npm run agent`.

## Architecture at a glance

```
phone (/) ──POST /api/action──▶ server bus ──SSE /api/events──▶ host agent ──▶ your OS
                                             └──────────────────▶ /host (read-only monitor)
```

A browser is sandboxed and cannot control the OS — that's why the **agent is a
separate Node process**. The server keeps no button registry; it validates and
relays whatever action the deck sends. See CLAUDE.md for the file-by-file map.

## Key decisions & why

- **Node host agent, not the browser.** Browsers can't launch apps or send OS
  keys. The agent (`host-agent/agent.mjs`) is dependency-free and parses SSE from
  `fetch` (this Node has no global `EventSource`).
- **Deck sends the full action; server is a dumb relay.** Originally the server
  looked up a fixed `buttonId`. That blocked user-created tiles, so the deck now
  sends `{label, action}` and the server only validates the shape. This is what
  makes in-app editing possible.
- **Layout persists per-device in `localStorage`.** A deck is personal — your
  phone is your deck. `defaultButtons` only seeds a fresh device. Swapping
  `src/lib/storage.ts` for a server store would make it shared across devices.
- **SSE + in-memory bus, not WebSockets.** Simplest real-time transport that runs
  under `next dev`/`next start` with zero infra. Trade-off: process-local (see
  below).
- **Keystrokes via AppleScript `System Events`.** Native, no dependencies; costs
  us macOS-only + an Accessibility permission prompt.

## Known issues / open decisions

1. ~~No authentication.~~ **Done (2026-07-28).** Optional shared-secret token:
   set `DECK_TOKEN` on the server and `POST /api/action` requires it (`x-deck-token`
   or `Bearer`). The phone prompts on 401 and stores it per-device; the agent
   needs nothing since `/api/events` is read-only. Unset = open (local dev).
   `src/lib/auth.ts`, `/api/config`. _Remaining: `/api/events` is still
   unauthenticated (observation-only, low risk) — gate it too if info-leak
   matters, via a query-param token since EventSource can't set headers._
2. **Process-local bus.** Deck, server, and agent must hit the same server
   instance. Won't work on serverless/multi-instance — would need Redis pub/sub
   (same interface as `src/lib/bus.ts`).
3. **`keys` is macOS-only.** Windows (PowerShell SendKeys) and Linux (xdotool)
   paths are stubbed with clear errors, not implemented. `app`/`url` are
   cross-platform.
4. **No test runner.** Logic has been verified manually and via ad-hoc scripts.
   `keys.ts`/`buttons.ts`/agent helpers are pure and importable — good first
   targets when adding a runner (e.g. `node --test` or Vitest).
5. ~~No tile reordering.~~ **Done.** Drag-to-reorder in edit mode (pointer-based
   on web, `PanResponder` on native).
6. **Two key tables to keep in sync.** `keys.ts` (`parseCombo`, validation) and
   the agent's `comboToAppleScript` (`KEY_CODES`) list the same key names
   independently. Adding a key means editing both.

## Suggested next steps (rough priority)

1. A test runner + tests for the pure helpers (`parseCombo`, `validateAction`,
   `coerceButton`/`coerceIcon`, `profileForApp`, `shellDecision`, `checkToken`,
   `comboToAppleScript`/`comboToSendKeys`) — all currently verified via ad-hoc
   headless scripts; formalize them. **← top priority.**
2. Windows/Linux support for focus detection + the running-apps list (macOS-only
   today), and Linux keystrokes.
4. Optional server-backed deck storage for multi-device sync.
5. Optionally gate `/api/events` too (query-param token) if observation leakage
   matters.

## Landing page

`site/index.html` is a standalone, self-contained marketing/overview page (dark
control-surface theme, no build step, no external requests). Open it directly, or
serve `site/` with any static host. For zero-config GitHub Pages, serve from a
`/docs` folder or point Pages at `site/`.

## Environment notes

- Verified with Node 23.11, npm 11, Next 16, React 19, Tailwind 4 on macOS 15.
- The repo has an auto-push watcher that commits/pushes files as they're written,
  so the working tree is usually clean and changes land on `origin/main`.
- A stray `~/package-lock.json` briefly confuses Turbopack's workspace-root
  detection (harmless warning); remove it or set `turbopack.root` to silence.
