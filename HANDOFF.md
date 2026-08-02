# streamPhoneDeck — Handoff

_Last updated: 2026-08-02_

A running status document for whoever picks this up next (human or agent). For
day-to-day architecture reference see [CLAUDE.md](./CLAUDE.md); for user-facing
usage see [README.md](./README.md). This file captures **state, decisions, and
open questions** those two don't.

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
5. **No tile reordering.** Add/edit/delete only. Drag-reorder is the obvious next
   UX addition.
6. **Two key tables to keep in sync.** `keys.ts` (`parseCombo`, validation) and
   the agent's `comboToAppleScript` (`KEY_CODES`) list the same key names
   independently. Adding a key means editing both.

## Suggested next steps (rough priority)

1. A test runner + tests for `parseCombo`, `validateAction`, agent dispatch,
   and now `checkToken`.
2. Tile reordering (drag or move controls).
3. Windows/Linux keystroke support.
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
