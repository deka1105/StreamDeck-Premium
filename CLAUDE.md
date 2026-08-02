# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

streamPhoneDeck turns a phone into a Stream Deck-style control surface: the phone
shows a grid of buttons and each press **launches an app, opens a URL, or sends a
keyboard shortcut on the user's computer**, in real time. **Next.js (App Router)
+ TypeScript + Tailwind CSS v4**, React 19, plus a plain-Node host agent that
does the actual OS control.

## Commands

- `npm run dev` — deck server on http://localhost:3000
- `npm run agent` — host agent that executes actions (`host-agent/agent.mjs`)
- `npm run build` — production build (also the fastest full typecheck)
- `npm run start` — serve the production build
- `npm run lint` — ESLint (flat config, `eslint-config-next`)

There is no test runner configured yet. The agent's pure helpers (e.g.
`comboToAppleScript`) are `export`ed and importable — `main()` only runs when the
file is executed directly, so tests/imports won't start the loop.

## Architecture

Three parts. The browser cannot launch apps or send OS keystrokes (sandboxed), so
execution lives in a **separate Node process**, not the `/host` page.

```
phone (/) ──POST /api/action──▶ bus (src/lib/bus.ts) ──SSE /api/events──▶ host agent ──▶ OS
                                                        └───────────────▶ /host (monitor)
```

- **`src/lib/buttons.ts`** — the data model: `ButtonAction` (`app` | `url` |
  `keys` | `shell`), `DeckButton`, `DeckProfile` + `MAX_TILES_PER_PROFILE` (9),
  `defaultButtons` (the seed layout, NOT the live source of truth), `TILE_COLORS`,
  and shared helpers: `makeAction`/`actionValue` (convert between a type+value and
  the tagged union), `validateAction` (used by both the API route and storage to
  sanitize untrusted input), `describeAction`.
- **`src/lib/keys.ts`** — `parseCombo()` validates/pretty-prints shortcut strings
  (`cmd+shift+4` → `⌘ ⇧ 4`) for the editor. Its modifier/special-key names must
  mirror the agent's `comboToAppleScript` (they're intentionally duplicated —
  keep them in sync).
- **`src/lib/storage.ts`** — per-device persistence in `localStorage`
  (`loadProfiles`/`saveProfiles`, `newButtonId`/`newProfileId`). A device holds
  several **profiles** — named decks of up to `MAX_TILES_PER_PROFILE` (9) pinned
  tiles; only the active one shows. This is the **live source of truth**;
  `defaultButtons` only seeds the "Default" profile on a fresh device. Loading
  migrates a pre-profiles flat deck (`streamphonedeck.deck.v1`) into one profile,
  and a pre-pages profile (flat `buttons`) into a single `DeckPage`. Each profile
  is `pages: DeckPage[]` (≥1) + an `apps` trigger list; the store carries a
  top-level `autoMode` flag (see `profileForApp` in `buttons.ts`).
- **`src/lib/bus.ts`** — the relay. Process-local `Set` of listeners stashed on
  `globalThis` (survives dev hot-reload). Defines `DeckAction` (`label` + typed
  `action` + `at`), shared by the API routes, the monitor page, and —
  structurally — the agent.
- **`src/app/api/action/route.ts`** — accepts the **full action** (`{label,
  action}`), enforces the token via `checkToken` (401 if bad), runs it through
  `validateAction`, and `publish()`es it. Keeps NO button registry — the deck
  owns the layout, the server is a dumb relay.
- **`src/lib/auth.ts` + `src/app/api/config/route.ts`** — the access-token gate.
  `authEnabled()`/`checkToken()` are driven by the `DECK_TOKEN` env var (unset =
  open); token comes via `x-deck-token` or `Bearer` and is compared with
  `timingSafeEqual`. `/api/config` exposes `{authRequired}` so the deck can show
  lock state proactively. Only `POST /api/action` is gated; `/api/events` is not.
- **`src/app/api/events/route.ts`** — SSE stream (`ReadableStream` + manual
  `event:`/`data:` framing). `ready` on connect, `action` per press, heartbeat
  comment every 15s; cleans up on `req.signal` abort.
- **`src/lib/foreground.ts` + `src/app/api/foreground/route.ts`** — "intuitive"
  auto-switching. The agent POSTs the host's focused app; the deck polls GET.
  Latest value is process-local on `globalThis` (like the bus). Ungated like
  `/api/events` — it carries no execution vector.
- **`src/lib/apps.ts` + `src/app/api/apps/route.ts`** — the "Apps" screen feed.
  The agent POSTs `{apps, frontmost}` (running apps); the deck's Apps view polls
  GET while open. Same process-local + ungated pattern. Focusing/pinning an app
  still goes through the token-gated `/api/action` (as an `app` action).
- **`src/components/Deck.tsx`** (`/`) — the phone UI. Loads profiles from storage
  after mount (null until hydrated, to avoid SSR mismatch), POSTs `{label,
  action}`, and hosts edit mode (toggle, add/edit/delete tiles, reset) and the
  profile switcher. Each profile has **pages** of up to `MAX_TILES_PER_PROFILE`
  (9) tiles — a dots/arrows page switcher below the grid; add/delete pages in edit
  mode. **Drag-to-reorder**: pointer-based (mouse + touch); the grid captures the
  pointer, hit-tests `data-tile-id`, reorders live, and persists once on drop (edit
  a tile via its ✎ badge, since the body is a drag handle). **Live tile state**:
  polls `/api/apps` continuously so `app` tiles show a running / frontmost dot.
  **Auto mode** (🪄): polls `/api/foreground` and edge-triggered switches the active
  profile to the first one whose `apps` list matches the focused app (no match =
  stay put); a manual switch sticks until the app changes. An **Apps** view
  (`RunningApps.tsx`) lists the host's running apps — tap to focus, or ＋ to pin.
- **`src/components/ProfileSettings.tsx`** — per-profile modal: rename + the
  trigger-app list for Auto mode, with a "Use current app" shortcut fed by the
  live foreground reading.
- **`src/components/TileEditor.tsx`** — the add/edit modal: label, **icon face**
  (emoji with quick-picks, short text, or an uploaded image — resized to ~64px and
  stored inline as a data URI), action type selector, a value field whose label/hint
  change per type, live `parseCombo` feedback for shortcuts, and color swatches.
  The tile's face is `icon` + `iconType` (`emoji` | `text` | `image`); `DeckButton`
  renders an `<img>` for image faces, text otherwise.
- **`src/components/DeckButton.tsx`** — one tile. In edit mode it shows a delete
  badge and tapping opens the editor instead of sending.
- **`src/app/host/page.tsx`** (`/host`) — **read-only monitor**. Parses the same
  SSE stream and lists actions via `describeAction`. Does NOT execute anything.
- **`host-agent/agent.mjs`** — the executor. Dependency-free SSE client (parses
  the stream from `fetch` because Node has no global `EventSource` here).
  Dispatches by action type: `open -a` (app), `open`/`xdg-open`/`start` (url),
  AppleScript `System Events` (keys, macOS-only), raw `exec` (shell). Reconnects
  on drop. Also polls the macOS frontmost app (`System Events`) every 1.5s and
  POSTs it to `/api/foreground` on change (for Auto mode; macOS-only, no-op
  elsewhere). `DECK_URL` overrides the server; `DECK_DRY_RUN=1` logs instead of
  executing.

## Key constraints

- **The bus is process-local.** Both API routes pin `runtime = "nodejs"` so they
  share memory; deck, server, and agent must all hit the same server instance.
  Does **not** work across serverless/multiple instances — swap `src/lib/bus.ts`
  for a shared broker (Redis pub/sub) with the same interface.
- `/api/events` sets `dynamic = "force-dynamic"`; keep it, or the stream gets
  statically optimized away.
- **Action types are a closed union.** When adding one, update `ButtonAction`,
  `makeAction`/`actionValue`/`validateAction`/`describeAction` in `buttons.ts`,
  the editor's `TYPES`/`FIELD` maps, and the `execute()`/`switch` in the agent —
  all must stay in sync.
- **The deck layout lives in the browser, not the code.** Edits persist to
  `localStorage` (per-device). `defaultButtons` is only a seed; don't treat it as
  the current deck. To share one deck across devices, replace `storage.ts` with a
  server-backed store.
- **`keys` is macOS-only.** `comboToAppleScript` (agent) maps modifiers + a
  `KEY_CODES` table for non-character keys; single characters use `keystroke`.
  `keys.ts` `parseCombo` must recognize the same names. Sending keys needs macOS
  Accessibility permission.
- **Auth is opt-in via `DECK_TOKEN`.** Unset = open (frictionless local dev); set
  = `POST /api/action` requires the token. Because the deck can send **arbitrary
  `shell`**, set a token before exposing the server beyond trusted Wi-Fi. The
  agent needs no token (`/api/events` is observation-only and still ungated).
