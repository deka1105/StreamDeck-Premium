# PLAN — DeskAssist Panel (feature parity with PhoneBox, clean-room)

## Handoff block — paste this first in every new session

DeskAssist is a phone app (`mobile/`, Expo SDK 54 / React Native, iOS + Android)
paired with a desktop host (`desktop/`, Electron + plain Node, macOS + Windows)
over an X25519 / AES-256-GCM encrypted link. Today it is a touch deck: tiles
that launch apps, open URLs, send keys, run macros, control media and volume.

The goal is **feature parity with two reference projects**, **built clean-room**:
we learn *what they do* from their public docs and screenshots, and write every
line ourselves. See "Clean-room rules" below. They are not optional.

- **[ersinkoc/phonebox](https://github.com/ersinkoc/phonebox)**: a phone desk panel
  with live widgets, pages and templates, a desktop layout editor, webhooks, rules,
  AI-session widgets and a control deck. Most of this plan.
- **[zacharyinserra/deskhub](https://github.com/zacharyinserra/deskhub)**: an ESP32
  desk display fed by a Windows companion. We match its *features* on the phone
  panel, not its hardware: 3D-printer monitoring (10 brands), an internet-quality
  page, a GitHub contributions page, deeper Claude Code / Codex usage and
  "waiting for you" alerts, Plex/Jellyfin, a Steam games page (including
  non-Steam games), and the panel following the PC's sleep. The ESP32 firmware,
  USB flashing and over-the-air updates have no phone equivalent and are out of
  scope. Its ROADMAP's *unbuilt* ideas are out of scope too, except where
  PhoneBox already has them.
- **[Stash for Mac](https://www.stashformac.com/)** (littlengine labs): a
  **closed-source commercial** Mac utility. It adds controls hidden at the
  screen's edges and corners: a hidden side dock and app launcher, edge
  sliders, corner dials (some detachable into floating dials), and app
  profiles that switch with the frontmost app. Its iPhone companion "throws"
  apps to the Mac and shows widgets. "Creative Pro" adds per-app tool and
  precision controls for Photoshop, Illustrator, After Effects, Premiere Pro
  and Blender. We match the *features* in our own design. Its trial, pricing
  and licensing are out of scope: DeskAssist stays free unless the owner
  decides otherwise.

**Chosen approach:** one panel renderer written in plain JS/HTML (`panel/`),
**bundled inside the phone app** and shown in a WebView. The same bundle is also
served by the desktop host for the editor's live preview and a browser panel.
The panel never talks to the network itself. It talks to a `bridge`. On the
phone the bridge rides the existing encrypted RPC. In a desktop browser it calls
the host's loopback API. Layouts live on the host, per paired device.

**Work happens on branch `panel-parity`.** `main` holds the build that is in App
Store review (1.1.0, build 13). Every file write is auto-committed and **pushed
to a public repo** within seconds, so never write a secret into this tree.

**Status (27 Nov 2026):** Stages 0–11 done (host 94 tests, panel 35, browser 50 incl. 4 visual snapshots; phone checked in the iOS simulator in demo mode).
**Next:** Stage 18 (languages and release). Stage 11 live checks are in docs/CONTROL-DECK-CHECKS.md. Open from earlier stages: owner checks with real hardware (phone battery, real Spotify/Music playback, a real iCloud calendar, Codex sessions, Claude Code permission prompts end to end from a real session) and the spectrum-bars decision.

**Dev loop:** `npm run build` in `panel/` after any panel/editor change (CI fails if the committed build is stale). Browser tests: `npx playwright test` in `tools/ui-tests` (each test starts its own throwaway host). Simulator: `npx expo run:ios --device "iPhone 17"`, then drive it with the dev-only deep link `deskassist://dev?pair=<QR JSON>&view=panel` (or `?demo=1&view=panel`) — see `mobile/src/devLink.ts`. Test hosts must use other ports (e.g. `DECK_PORT=18788 DECK_LOCAL_PORT=18789`): the owner's real host holds 8788.

---

## Progress checklist

- [x] Stage 0 — Groundwork (tests, CI on macOS + Windows, clean-room log)
- [x] Stage 1 — Walking skeleton: a live CPU number from the computer on the phone — verified on the iOS simulator (live CPU, offline within 30 s, recovers in ~14 s)
- [x] Stage 2 — Pages, grid and navigation; tiles become a widget; demo mode — browser tests at 780×360 and 360×780; demo verified on the simulator. Tile *tap* on the phone not yet verified by hand (the headless simulator can't be tapped from a script); the panel side is covered by `demo.spec.mjs`
- [x] Stage 3 — Desktop layout editor — 8 Playwright tests; save reaches a panel in < 3 s
- [x] Stage 4 — Computer widgets (CPU / GPU / RAM / disks / network / processes) — providers sampled live on macOS and Windows in CI; end-process guard tested end to end (refused unless the widget allows it). On this Intel Mac, GPU load and CPU temperature aren't exposed by the OS and show "not reported"/"—"
- [x] Stage 5 — Time and personal widgets — widget state lives on the host (`state.get/set`, `widget-state.json`); reload/second-screen/alarm tests pass. Phone battery reads via `expo-battery` (not available on the iOS simulator — check on a real phone)
- [x] Stage 6 — Weather, sky and web-data widgets — host fetches everything (docs/data-sources.md); ICS/RRULE, iCloud CalDAV (fixture-tested; real iCloud untested), feeds/OPML; privacy-policy draft in site/privacy.html (publishes only on merge to main)
- [x] Stage 7 — Media widgets — Spotify/Music via AppleScript, Windows via SMTC/PowerShell (docs/media-helpers.md); Plex/Jellyfin, radio, LRCLIB lyrics. **Open:** live check with real playback; spectrum bars need a native helper → owner decision
- [x] Stage 8 — Shortcuts by ID, webhooks, notifications, rules, Custom HTML — browser tests: push → widget, notify → toast, goto countdown (Stay / Go now), while-it-lasts rule, shortcut by id + refused numbers, Custom HTML sandbox (no parent, no network), LAN key
- [x] Stage 9 — AI and code widgets, permission prompts on the phone — docs/ai-sources.md. Documented Claude Code hooks + status-line bridge (installed only on **Link Claude Code**, backed up, removable); plan limits come from the status line, not an undocumented endpoint. GitHub via gh or a stored token (checked against the real API). **Open:** Codex parsed from fixtures only (not installed here); prompts not yet tried from a live Claude Code session
- [x] Stage 10 — Appearance, display, Smart Stack, night / burn-in — 7 presets, look inheritance panel → page → tile, wallpaper (dim/blur), 5 navigation styles, OLED shift, dim when untouched, night screen (schedule / PC asleep / rule), follow PC sleep (`pcpower`: ioreg on Intel Macs, else idle ≥ display-sleep timeout; Windows powercfg), marquee titles, Smart Stack. Visual snapshots are compared on the Mac only (CI sets ignoreSnapshots: fonts differ on Linux). Fixed an older Title-widget bug: text was sized against the viewport
- [x] Stage 11 — Control Deck, cross-platform part — OBS (obs-websocket 5 via our own small WebSocket client, since Electron runs Node 20), Home Assistant REST, Docker/Podman CLI, Wake-on-LAN, OSC, dev services (owned processes only), meeting shortcuts for Zoom/Teams/Meet/Webex, "mute everything" (macOS), opt-in trackpad (JXA CGEvent on macOS, user32 via PowerShell on Windows). Each is tested against a local fixture (14 host tests, 3 browser tests). **Deferred, with reasons:** MIDI output needs a native module on both OSes → Stage 17; phone-sent Wake-on-LAN needs a native UDP module in the app → Stage 13; system-wide mic mute on Windows → Stage 12. Live checks: docs/CONTROL-DECK-CHECKS.md
- [x] Stage 12 — Control Deck, Windows-native part — **built, unverified on a real PC** (R2). Native C# NativeAOT helper (owner chose "best regardless of effort": docs/windows-helper.md), built and driven in CI on windows-latest: per-app mixer with meters, device switching, mic volume/mute, push-to-talk with a 1.5 s lease (also on macOS via input level), ducking, audio profiles, power plans, chosen Windows services, DDC/CI + laptop brightness, lock/sleep with a 1 s hold. Live checks: docs/CONTROL-DECK-CHECKS.md § Stage 12
- [x] Stage 13 — Android-only — local Expo module (Kotlin) + config plugin: volume-key paging, kiosk (home-screen intent filter, screen pinning, immersive), keep awake (charging/always), auto-dim from the light sensor, proximity wake, battery temperature, clipboard bridge (computer side opt-in), notification mirror (NotificationListenerService, opt-in), phone-sent Wake-on-LAN. USB: the host keeps `adb reverse` set up and the app falls back to 127.0.0.1 (same sealed channel, so no extra TLS layer was needed). Battery care = phone.battery/charging/temp pushed values + ordinary rules. Gate: nothing shows on iOS (unit test). Emulator-verified as far as the Mac allowed; live list in docs/ANDROID-CHECKS.md; Play policy review before release
- [x] Stage 14 — 3D printers (DeskHub) — owner has none, so all brands are user-addable and **untested on hardware**. Klipper/Moonraker, OctoPrint, PrusaLink (Digest), Bambu LAN (own MQTT client), Elegoo SDCP, Flashforge (HTTP + G-code), Snapmaker 2.0 (screen-approved token), each fixture-tested. Creality, Anycubic and Snapmaker J1 skipped: no clean source (R9). Page widget (up to 4, adapts to portrait) + compact widget, editor with Test connection. docs/printers.md
- [x] Stage 15 — Games and integration long tail (trimmed per R8) — Games page: Steam from its local files (libraries, manifests, localconfig, registry.vdf / Windows registry), covers from the local cache then Steam's CDN, optional Web API key for friends in game, non-Steam games matched by running program with tracked play time, launch opt-in. Long tail built: photo frame (folder or Immich), camera (RTSP via ffmpeg or HTTP snapshot), Bluetooth device batteries. **Left out, with reasons:** Spotify queue/playlists (needs the owner to register a Spotify developer app for PKCE), Discord (needs a registered Discord app; RPC is not public for this use), Plex playlist control (Stage 7 already covers now-playing control), other AI CLIs (OpenCode, Cursor, Grok…: no documented session/usage files), dictation and app console (no clear cross-platform API). Tests: desktop/src/games/stage15.test.mjs, fake Steam folder
- [x] Stage 16 — Desk edges (Stash) — Electron overlay per display (click-through until a control is under the pointer, hidden over full-screen apps unless allowed): edge sliders (sweep to set), corner dials (volume, brightness, light/dark, output, timer with sound, music) that detach to float and persist, hidden dock + launcher beside the Dock/taskbar, per-app profiles, own glass material, editor section, tray "Recalibrate". **Private APIs avoided (R12):** Mac display brightness and keyboard light show "not available"; Mac output switching waits for a Core Audio helper; haptics skipped (only fires for the frontmost app). Verified by unit tests, a real-mouse browser test of the overlay and an Electron smoke run; Windows edges built, unverified. docs/desk-edges.md
- [x] Stage 17 — Creative app controls (Stash) — owner has none of the apps, so **untested**. Tool keys from the vendors' shortcut lists (Photoshop, Illustrator, After Effects, Premiere), precision sliders and colour through the documented scripting routes with fixed templates and validated numbers (≤ 4 updates/s), Blender add-on with a fixed operation whitelist (Python tests), page templates + "app in front → page" rule examples. Photoshop brush size and colour-picker detection left out: no documented route. docs/creative-apps.md
- [ ] Stage 18 — Languages, release

---

## Decisions (with the alternatives we rejected)

| # | Decision | Rejected alternatives and why |
|---|---|---|
| D1 | **Bundled WebView panel.** Widgets are plain ES modules in `panel/`, built by esbuild into one self-contained HTML file. The phone loads it from the app bundle; the host serves the same file. | **Native React Native widgets:** the desktop editor could never show a true live preview without a second copy of every widget (~130 of them). **Panel loaded from the host:** Apple treats UI code downloaded after install as a guideline 2.5.2 risk, and the phone would show nothing without a computer, which breaks the demo mode App Review depends on. |
| D2 | **Layouts live on the host** (`config.json`, per paired device), edited in the desktop editor and synced to the phone. | **Phone-local layouts** (today's model): there's no desktop editor, no multi-phone setup and no browser panel. The existing phone-local tile deck keeps working as the "Deck" widget. Stage 2 migrates it once. |
| D3 | **Live events via an encrypted long-poll** (`events.wait`, held for up to 25 s). Every event uses the same sealed envelope as RPC, plus a host sequence number. | **SSE / streamed fetch:** React Native's `fetch` doesn't reliably deliver a streamed body on iOS. **WebSocket:** a second transport to secure and keep alive. Long-poll reuses everything we already trust. |
| D4 | **Sampling on demand.** The panel tells the host which data kinds its visible widgets need (`needs`), and providers run only while something is watching. | **Sample everything always:** wastes CPU, and process lists and command widgets are expensive. |
| D5 | **macOS and Windows ship together.** Every stage's host work has a provider for each OS. Windows is verified by CI on `windows-latest`; Windows-native audio and device features (Stage 12) also need a real Windows box. | **macOS first:** rejected by the owner. |
| D6 | **Both phones, gated by platform.** The shared panel runs on iOS and Android. Android-only features (USB/adb, kiosk, volume keys, notification access) are Stage 13 and are hidden on iOS. | **Android only:** iOS is the shipping platform. |
| D7 | **Shortcut and command widgets send IDs, not commands**, for anything that runs a program the host has configured. The existing app/URL/keys tile actions keep their current typed, validated form. | **Sending commands from the phone:** a paired phone or a leaked key would become remote code execution. |
| D8 | **Host tests use `node --test`** (no new dependency). The panel and editor get Playwright in Stage 3. | **Vitest/Jest:** an extra toolchain for a codebase that's mostly plain ESM. |
| D9 | **Host system data comes from the `systeminformation` npm package** (MIT, macOS + Windows + Linux). Anything it lacks gets a small per-OS helper (Stages 7, 11, 12). | **Writing every probe by hand:** months of OS work before the first chart. |
| D10 | **Integration secrets** (GitHub token, Steam Web API key, printer access codes, Plex/Jellyfin keys, iCloud app password, Home Assistant token) live in `desktop/src/secrets.mjs`. It uses Electron `safeStorage` (Keychain on macOS, DPAPI on Windows) when running under Electron, and a 0600 file in the user-data dir when the host runs as plain Node (dev/CI). `config.json` holds only a reference. Secrets never go to the phone. | **Plain `config.json`:** both references keep secrets out of the config file. **The `keytar` native module:** archived upstream, and a native build per OS. |
| D11 | **Printers and other LAN devices are polled by the host, never by the phone.** The phone sees normalized state (`{name, model, online, state, pct, remainingMin, layer, temps, speed, error, slots[]}`). | **Phone talks to devices directly:** iOS Local Network prompts, credentials on the phone, and protocols that allow only one client at a time. |
| D12 | **Desk edges are Electron overlay windows in the existing host** (transparent, always-on-top, click-through until hovered), drawn with the same `panel/` widget code where it fits. A small per-OS native helper (D9 pattern) does what Electron can't: macOS display brightness, keyboard backlight, trackpad haptics and reading the Dock's position (Accessibility); Windows brightness and taskbar position. It ships on macOS **and** Windows (D5); Stash is Mac-only, so Windows is our extension. | **A separate native Swift app:** a second app to sign, update and keep in sync, and no Windows. **macOS-only in Electron:** breaks D5. |
| D13 | **Creative-app controls drive each app through its own documented automation surface**, never by poking pixels. Tool switching uses the app's documented keyboard shortcuts. Precision values and colours go through Adobe's scripting (ExtendScript/UXP via `osascript` on macOS, COM on Windows) and, for Blender, a small add-on of ours on a loopback socket. | **Synthetic mouse drags on sliders:** fragile, breaks with every UI change, and can't read values back. |

---

## Clean-room rules (apply to every step)

1. **Reference material allowed:** for PhoneBox, its README, `docs/*.md`,
   `PRIVACY.md`, screenshots, and the live demo used *as a user*. For DeskHub,
   its `README.md`, `ROADMAP.md` and screenshots. These describe behavior.
2. **Never open either project's source.**
   - PhoneBox: nothing under `agent/`, `android/`, `ios/`, `tools/`,
     `packaging/`, `bucket/`, `scripts/`, and not `widgets.json`,
     `templates.json`, `main.js` or `style.css`.
   - DeskHub: nothing under `companion/` (including `config.example.toml` and
     the tests) or `firmware/`.
   - That includes not fetching them with `gh api`, not reading them in a
     browser, and not asking a subagent to. If an answer needs their code,
     design it ourselves and record that in `docs/CLEANROOM.md`.
   - Third-party open-source projects that DeskHub's README *names* (for
     example ha-bambulab, Orca-Flashforge, Snapmaker Luban) count the same way:
     read their protocol *docs* if they publish any, never their code.
   - **Stash is commercial and closed-source, and its terms forbid reverse
     engineering.** Allowed: the public pages of stashformac.com (home,
     `/updates`, `/creative-pro`, `/privacy`, `/terms`) and its App Store
     listing. **Not allowed:** downloading, installing or running the Stash
     DMG or the Stash Deck app to study them, disassembling or inspecting
     their bundles, sniffing their traffic, or copying their visual design
     from screenshots or videos.
3. **Our own names and assets.** Don't use "PhoneBox", "Desk Hub", "Stash",
   "Stash Deck", "Creative Pro", or Apple's "Liquid Glass" name. Don't use
   their icons, screenshots, demo data, exact catalogue/template JSON, or
   DeskHub's built-in game list. Our desk-edge controls get **our own visual
   design**, not a lookalike of Stash's dials and dock. Widget *categories*
   (clock, weather, CPU, printer) and control *kinds* (volume slider,
   brightness dial) are generic and fine. Our scripting global is
   `window.deskassist`.
4. **Our own formats.** The config schema, widget catalogue format, event names
   and HTTP routes are designed here. Where a public, documented convention
   exists (Open-Meteo's API, a Claude Code `PermissionRequest` hook, RSS/OPML,
   ICS), follow the *public spec*, not PhoneBox.
5. **Log it.** `docs/CLEANROOM.md` records, per stage, which reference docs and
   pages were consulted and the feature list taken from them. That's the
   evidence if the work is ever questioned.

(PhoneBox and DeskHub are MIT-licensed, so copying them with attribution would
be legal; the owner chose clean-room anyway. Stash is proprietary, so for Stash
clean-room isn't a choice: features and ideas from its public description are
fair game, but its code, assets, names and look are not.)

---

## Architecture target

```
 phone app (mobile/)                         desktop host (desktop/)
 ┌──────────────────────────────┐            ┌──────────────────────────────────────┐
 │ App.tsx                      │            │ src/host.mjs   LAN :8788  /pair /rpc │
 │  ├─ existing deck screens    │  sealed    │   ├─ rpc: action.*, panel.*, events.* │
 │  └─ PanelScreen (WebView) ◀──┼─ RPC ─────▶│   ├─ src/panel/ store (config.json)   │
 │       panel.html (bundled)   │  long-poll │   ├─ src/providers/<kind>/{mac,win}   │
 │       bridge = postMessage   │            │   └─ src/events.mjs (seq'd queue)     │
 └──────────────────────────────┘            │ src/local.mjs  127.0.0.1:8789 only   │
                                             │   ├─ /panel/  (same bundle, bridge=fetch)
 panel/ (shared source)                      │   ├─ /editor/ (layout editor)         │
  core/    grid, pages, nav, store, bridge   │   └─ /api/push /api/notify /api/goto  │
  widgets/ one file per widget               └──────────────────────────────────────┘
  catalog.json  templates.json   → esbuild → panel/dist/panel.html
                                            → copied to mobile/src/generated/panelHtml.ts
                                            → served by desktop/src/local.mjs
```

**Widget contract (ours):** `export default { id, needs: ["cpu", ...], mount(el, ctx) → { update(data), unmount() } }`.
`ctx` has `options`, `size`, `bridge`, `t()` and `theme`. Catalogue entries in
`panel/catalog.json` carry `{ id, category, name, defaultSize:{w,h}, minSize, options:[{key,type,label,default,choices}] }`.
The editor builds its option forms from these entries.

**Data kinds** (the `needs` vocabulary, grown stage by stage): `system`, `gpu`, `disks`, `net`,
`netq`, `procs`, `media`, `mediaServer`, `volume`, `weather` (phone-side), `calendar`, `push`,
`notify`, `sessions`, `quotas`, `usage`, `alerts`, `github`, `contrib`, `rules`, `apps`,
`foreground`, `pcpower`, `toggles`, `printers`, `games`.

---

## Stage 0 — Groundwork
**Visible at the end:** a green CI run on both macOS and Windows on the `panel-parity` branch, and `docs/CLEANROOM.md` exists.

**0.1 Clean-room log**
- Goal: create `docs/CLEANROOM.md` with the rules above and the docs consulted so far. For PhoneBox: README, GUIDE, CONTROL-DECK, DEVELOPMENT, APPEARANCE, SETUP, PRIVACY. For DeskHub: README, ROADMAP. For Stash: stashformac.com home, `/updates`, `/creative-pro`, `/privacy`, `/terms` (read 27 Nov 2026, v4.2.0). Add a feature inventory per project distilled from them (PhoneBox: GUIDE §Widgets and §Pages & templates; DeskHub: README §Features, §Customizing Home, §3D printer, §Internet, §GitHub contributions, §Claude Code usage). Tag each inventory line with the stage that delivers it.
- Where: `docs/CLEANROOM.md`.
- Verify: `grep -c "^- " docs/CLEANROOM.md` shows at least 60 inventory lines, every line carries a stage tag, and `grep -riE "phonebox|deskhub|desk hub|stash deck|stashformac|creative pro|liquid glass" desktop mobile/src panel 2>/dev/null` prints nothing.
- Fence: no code. Don't copy PhoneBox doc prose wholesale; summarize it in our own words.

**0.2 Host test harness**
- Goal: `npm test` in `desktop/` runs `node --test src/**/*.test.mjs`. Add first tests for the existing `validateAction` and `seal`/`unseal` round trip (export them if needed, without changing behavior).
- Where: `desktop/package.json`, `desktop/src/*.test.mjs`, and minimal `export` additions in `desktop/src/host.mjs` / `executor.mjs`.
- Verify: `cd desktop && npm test` passes with at least 4 tests.
- Fence: no behavior changes to pairing or execution. Don't add Jest or Vitest (D8).

**0.3 CI matrix**
- Goal: `.github/workflows/ci.yml` runs `npm ci && npm test` in `desktop/` on `macos-latest` and `windows-latest`, plus `npx tsc --noEmit` in `mobile/` on Ubuntu, for pushes to `panel-parity`.
- Where: `.github/workflows/ci.yml`.
- Verify: `gh run list --branch panel-parity --workflow ci.yml --limit 1` shows `completed success`.
- Fence: don't touch `pages.yml`. Don't build Electron installers in CI yet.

---

## Stage 1 — Walking skeleton
**Visible at the end:** the phone opens a "Panel" screen showing a clock and the computer's live CPU % (updating about every 2 s). The same page loads in a browser at `http://127.0.0.1:8789/panel/`. This works with a Mac host, and the Windows CI provider test passes.

**1.1 Panel package skeleton**
- Goal: create `panel/` with `core/app.js` (renders one fixed page: a CSS grid of 12×6), `core/bridge.js` (interface: `request(method, params)`, `on(event, fn)`, `setNeeds(kinds)`), two widgets (`widgets/clock.js` and `widgets/metric.js`, which shows `data.system.cpu`), and `build.mjs` (esbuild → single `panel/dist/panel.html` with inlined JS/CSS). Add `panel/package.json` with `build` and `test` scripts.
- Where: `panel/**`.
- Verify: `cd panel && npm run build && open dist/panel.html` shows the clock ticking and the metric reading "—" (no bridge yet). `npm test` runs one `node --test` for the grid-placement maths.
- Fence: no framework (no React/Vue in the panel). No network calls from the panel.

**1.2 Host system provider + on-demand sampler**
- Goal: add `desktop/src/providers/system.mjs`, which uses `systeminformation` to return `{cpu, mem:{used,total}, at}`, and `desktop/src/sampler.mjs`, which runs providers only for kinds someone currently needs (D4), at a 2 s period, and caches the last value.
- Where: `desktop/src/providers/`, `desktop/src/sampler.mjs`, `desktop/package.json` (add `systeminformation`).
- Verify: `node --test` covers "sampler starts on need, stops 10 s after the last need, and hands out a cached value". CI passes on macOS **and** Windows (this is the Windows tripwire, R2).
- Fence: CPU and memory only. No GPU or processes yet.

**1.3 Encrypted event queue + `events.wait`**
- Goal: add `desktop/src/events.mjs` (per-device queue, monotonic `seq`, keeps the last 200 events) and RPC methods `panel.needs({kinds})`, `panel.snapshot()` and `events.wait({after, timeoutMs≤25000})` in `host.mjs`, sealed with the existing envelope. The sampler publishes `data` events.
- Where: `desktop/src/host.mjs`, `desktop/src/events.mjs`, tests.
- Verify: extend `desktop/src/test-client.mjs` (or add `test-panel-client.mjs`) to pair, call `panel.needs(["system"])`, then `events.wait` and print 3 CPU readings. Run it against `npm run host:dry`.
- Fence: don't change the pairing handshake, key derivation or counter rules. Existing `action` RPCs must still pass the old test client.

**1.4 Loopback server for the browser panel**
- Goal: add `desktop/src/local.mjs`, which listens on **127.0.0.1:8789 only**, serves `panel/dist/panel.html` at `/panel/` and offers `/api/panel/*` JSON equivalents of the RPC methods. It rejects requests whose `Host` isn't `127.0.0.1:8789`/`localhost:8789` and any cross-site `Origin`. In the browser, `bridge.js` picks the fetch transport.
- Where: `desktop/src/local.mjs`, wiring in `desktop/main.mjs` and the `host` script, `panel/core/bridge.js`.
- Verify: `npm run host:dry`, then open `http://127.0.0.1:8789/panel/` and watch the CPU number move. `curl -H "Host: evil.com" http://127.0.0.1:8789/panel/` returns 403. `curl` from another machine to the LAN IP on 8789 fails to connect.
- Fence: no editor and no webhooks yet. Never bind to 0.0.0.0.

**1.5 Phone Panel screen**
- Goal: `npx expo install react-native-webview`. Add `mobile/src/PanelScreen.tsx`, which loads the bundled panel HTML (generated `mobile/src/generated/panelHtml.ts`, written by `panel/build.mjs`), bridges `postMessage` ⇄ `rpc.ts` (new `panelRequest` and an `events.wait` loop that pauses when the app goes to the background), and adds an entry point from the deck header.
- Where: `mobile/src/PanelScreen.tsx`, `mobile/src/rpc.ts`, `mobile/App.tsx` (entry button only), `mobile/package.json`.
- Verify: build a dev client (`npx expo run:ios` on the simulator) paired to `npm run host:dry`. The Panel screen shows the clock and a moving CPU %. Turn off Wi-Fi and it shows "offline" within 30 s, then recovers when Wi-Fi is back.
- Fence: don't restyle or refactor the existing deck UI. The panel's HTML comes only from the app bundle, never from the network (D1).

---

## Stage 2 — Pages, grid, navigation; tiles inside the panel; demo mode
**Visible at the end:** several pages on the phone, switched by swiping, page dots or an overview. The existing tile deck appears as a widget on a page. With no computer (demo mode), the panel shows realistic, clearly labelled simulated data.

**2.1 Layout model + store on the host**
- Goal: define our layout schema (`{version, devices:{[deviceId]:{pages:[{id,name,widgets:[{id,type,x,y,w,h,options}]}], home}}, shortcuts:[], ...}`) in `desktop/src/panel/schema.mjs` with validation and clamping (x+w ≤ 12, y+h ≤ 6, unknown widget types dropped). Store it in the host's user-data `config.json` (mode 0600). Add RPC `panel.layout()`.
- Verify: unit tests for clamping, unknown-type removal and a round trip through `config.json`.
- Fence: schema only. No editor.

**2.2 Multi-page rendering + navigation**
- Goal: the panel renders the device's pages. Horizontal swipe, page dots, an overview on long-press of the dots (tap to jump), idle → home page after N minutes (per-page override), portrait and landscape layouts.
- Verify: the browser panel at 780×360 and 360×780 with a 3-page test layout. A Playwright test arrives in 3.4, so for now a manual check: swipe, tap dots, overview, and the idle return with the timeout set to 10 s.
- Fence: no appearance options yet (Stage 10).

**2.3 Deck widget (bridge to the existing tiles)**
- Goal: widget `deck` renders tiles of the phone's active profile. **As built (changed from the original plan):** no migration to the host. The phone answers `deck.tiles` / `deck.press` itself, so the widget always shows the live tiles you edit on the deck screen, and a tap runs the deck's own `press()` (status line, haptics, timers, app allow-list). Copying tiles to the host would create a second source of truth that drifts. Browser panels show a note instead; host-defined keys arrive with Stage 8 shortcuts.
- Verify: tap Safari on the panel's Deck widget and Safari opens on the Mac (dry-run log in `host:dry`).
- Fence: the old deck screen stays as it is (users can keep using it). No ID-based shortcuts yet (Stage 8).

**2.4 Demo data source**
- Goal: `panel/core/demo.js` generates plausible data for every `needs` kind implemented so far. On the phone, demo mode (the existing "Explore the demo instead") uses it with a "Simulated" banner. Bundled default templates seed a demo layout.
- Verify: fresh simulator install → Explore the demo → Panel shows the clock, a moving CPU and the Deck widget. No network requests (check the Metro / Xcode network log).
- Fence: demo data must never be shown as real when a computer is paired.

---

## Stage 3 — Desktop layout editor
**Visible at the end:** at `http://127.0.0.1:8789/editor/` you drag a widget onto a phone-sized canvas, resize it, change its options, press Save, and the phone updates within 3 s. Live preview shows unsaved edits with real data.

- **3.1 Editor shell:** pages list (add, rename, reorder, hide, delete), a 12×6 canvas at the selected device's aspect ratio, and a device picker (paired phones plus "browser"). Verify: create, rename and reorder pages, reload, and the changes persist. Fence: no widget editing yet.
- **3.2 Palette + inspector:** a palette grouped by category with search, generated from `catalog.json`. Drag to place, drag the corner to resize, collision-free snapping. An option form is generated from the catalogue entry. Verify: place a metric widget, set its option, save, and the phone shows it. Fence: the editor never writes a field the schema doesn't define.
- **3.3 Live preview + push to phones:** an iframe of `/panel/?preview=1` fed by unsaved state through `postMessage`. Saving bumps a revision, and the host emits a `layout` event so phones reload within 3 s. Verify: edit with the phone open; the phone changes only after Save, the preview changes immediately.
- **3.4 Export/import pages + Playwright:** export and import a page as a JSON file. `tools/ui-tests` Playwright suite (Chromium) for the panel and editor at 780×360 and 360×780. Verify: `npx playwright test` green locally and in CI (add the job).
- **3.5 Templates:** `panel/templates.json` (our own content) plus a "New page from template" picker. Start with Home, System, Deck and Clock, and grow it each stage. Verify: create a page from each template, and every widget it references exists in the catalogue (unit test).
- Fence for the whole stage: the editor is **loopback only**. LAN clients can't reach it.

---

## Stage 4 — Computer widgets
**Visible at the end:** a "System" page with CPU, GPU, memory and network charts, disks, ping and a processes list where you can end a process, on both macOS and Windows.

- **4.1 Providers:** `gpu`, `disks`, `net` (throughput and ping to a configurable host), `procs` (top N by CPU/RAM), with a `mac` and `win` implementation where `systeminformation` falls short (Apple-silicon GPU via `powermetrics`-free sources, or "unavailable"; NVIDIA via `nvidia-smi`). Verify: `node --test` with recorded fixtures per OS, plus a live smoke in CI on both OSes printing one sample of each kind.
- **4.2 Widgets:** metric tile, gauge, line chart (rolling window, our own lightweight SVG renderer), GPU details, memory & disks, top processes, processes (tap → sheet → end one instance or all). Verify: Playwright snapshots with demo data, and on-device with the Mac.
- **4.3 End-process guard:** host-side only for the current user's processes, with a deny list of critical system processes per OS and a widget option to disable it. Verify: unit tests prove the deny list and the other-user refusal.
- **4.4 Templates:** System, Processes, Dashboard, Status (partial).
- **4.5 Internet quality (DeskHub):** a `netq` provider that every 2 s makes a TCP connect to `1.1.1.1:443` (falling back to `8.8.8.8:443`) instead of ICMP, which needs no privileges. It keeps 60 samples and derives latency (median of the last 5), jitter, loss %, online (≥1 of the last 3 succeeded), up-since and the last drop with its duration. Data used today and this month comes from adapter counters, persisted in user-data. There's an on-demand speed test against `speed.cloudflare.com` (about 25 MB down, 10 MB up, at most once per 2 min, optionally scheduled every N hours) and an opt-in public IP. An "Internet" widget (with a latency chart and a speed-test button) and an Internet view on the System page. Verify: unit tests with a fake clock and fake connect results for the median/jitter/loss/online maths and the month rollover. Live: pull the Ethernet/Wi-Fi and see "offline" plus a recorded drop.
- Fence: the processes list samples only while a processes widget is visible (D4). The speed test never runs on its own unless scheduled.

## Stage 5 — Time and personal widgets
**Visible at the end:** Clock, Daily, Focus and Calm pages work with no computer data at all.

- Widgets: clock (with status line), analog clock (any time zone), word clock, world clocks, calendar month, time progress (day/week/month/year), countdown, pomodoro, focus history, quick timer, stopwatch, note (edited on the phone, stored on the host), checklist (daily reset), counter, breathe, quote, title, phone battery, Computers (switch paired computer).
- Verify per widget: a Playwright render test with a fake clock (`page.clock`), plus one on-device pass per batch of 5.
- Timer page (DeskHub): presets of 1–45 min, pause and reset, a full-screen "Time's up" card, and the time left shown on the page's nav tab while you're on another page.
- Fence: timers must survive a panel reload (state kept host-side, keyed by widget id).

## Stage 6 — Weather, sky and web data
**Visible at the end:** Home, Ambient, Markets, World and Planner templates show real weather, rates and headlines.

- **Research first (one session):** read the public docs of Open-Meteo (forecast + air quality + geocoding), Frankfurter, CoinGecko's free endpoints and the HN Firebase API. Write the request shapes into `docs/data-sources.md`, with rate limits and attribution needs.
- Widgets: weather, forecast (hourly / 7 days), sun & moon, moon, air quality, exchange rates, crypto, Hacker News, news feeds (RSS/Atom/OPML, fetched by the host), image/webcam URL, agenda (ICS from Google/Outlook/iCloud, parsed host-side), next up.
- Editor: location search (geocoding), unit °C/°F, calendars and feeds sections.
- Verify: unit tests on recorded API responses. Offline: kill the network and the widgets keep their last data with a "stale" marker.
- Fence: public APIs need no keys. **Update `site/privacy` and the App Store privacy answers** before this ships on iOS (new outbound connections).

## Stage 7 — Media
**Visible at the end:** a Music page shows what the Mac or PC is playing, with working transport, seek and volume.

- **Research first:** macOS now-playing sources (`nowplaying-cli`, the MediaRemote private-framework situation on macOS 15+, AppleScript for Spotify/Music as a fallback) and Windows SMTC (`GlobalSystemMediaTransportControlsSessionManager`, which needs a small helper: a .NET or Rust sidecar, or a Node native addon). Pick one per OS, write it up in `docs/media-helpers.md`, and **stop for owner review** if a helper needs a new signing or notarization step.
- Widgets: now playing (art, transport, seek), volume, radio (stream played on the computer), synced lyrics (LRCLIB, opt-in per widget, fetched by the host), spectrum bars (Windows only, marked as such elsewhere).
- Verify: play in Spotify / Apple Music (Mac) and in the browser (Windows CI can't do this, so it goes on the owner's Windows checklist).

## Stage 8 — Shortcuts by ID, webhooks, notifications, rules, Custom HTML
**Visible at the end:** `curl -X POST http://127.0.0.1:8789/api/notify -d '{"title":"Deploy","text":"live"}'` pops a toast on the phone, and a rule ("music plays → Music page") switches the page with a Stay / Go now countdown.

- **8.1 Shortcut registry (D7):** host-configured shortcuts `{id,label,icon,color,kind:program|keys|text|macro|url,…,value?:{min,max,step}}`. The phone sends `{id, value?}`. Numbers are validated host-side, and programs are started without a shell, with `{value}` substitution as a standalone argument. Rate limit of 4/s per shortcut. Verify: unit tests for number parsing, step alignment and argument building, plus a 429 test.
- **8.2 Webhook endpoints (loopback):** `POST /api/push/:key` (text or JSON; `ttl`), `GET /api/push`, `DELETE /api/push/:key`, `POST /api/notify`, `POST /api/goto/:page|next|prev`, `POST /api/refresh`. Pushed values persist across restarts. Optional LAN access with a separate webhook key that opens only these routes. Verify: a curl script in `desktop/scripts/webhook-smoke.sh`, with expected outputs.
- **8.3 Widgets:** pushed value (text, number, progress, list, gauge styles), notifications feed, toast + vibration, big button, shortcut grid (ID-based), command (host runs a configured command every N s; the phone sees only the output).
- **8.4 Rules engine (host):** when → then, with days/hours, "lasts N s", rest, priority, "only while it lasts" and a test button. Start with these triggers: app running, app in front, media playing, pushed value comparisons, pushed value stale, CPU above for 15 s, away from keyboard, time window, always. Actions: show page, notify, push value, run shortcut, night screen. Phone-side countdown with Stay / Go now, a minimum gap between switches, and waiting while the user touches the screen. Verify: unit tests with a fake clock for every trigger, plus an on-device run of the "music → Music page" rule.
- **8.5 Custom HTML widget:** user HTML runs in a sandboxed `iframe srcdoc` (no same-origin), with a `window.deskassist` API (`on`, `data`, `goto`, `run(id, value?)`) over `postMessage`. Verify: a test widget that drives a shortcut by ID with a slider. Make sure the iframe can't reach the bridge directly (Playwright asserts `parent.bridge` is inaccessible).
- Fence: none of these routes is reachable from the LAN without the webhook key, and the key never opens the phone API.

## Stage 9 — AI and code
**Visible at the end:** a Sessions page lists live Claude Code and Codex sessions on this Mac. When Claude Code asks for permission, the phone shows Allow / Deny and the answer reaches Claude Code.

- **Research first:** current Claude Code hook docs (`PermissionRequest`, `PostToolUse`, `Stop`, `UserPromptSubmit`, settings.json format), the Codex hooks format, and where each tool keeps session files. Record the public specs in `docs/ai-sources.md`. Use only documented or observable file formats.
- **9.1 Sessions provider:** Claude Code (`~/.claude` session files) and Codex (`~/.codex/sessions`), later OpenCode, Cursor and others. Expose project, status, model and token counters, **never prompt or reply text**. Verify: fixtures, plus a live check with a running `claude` session.
- **9.2 Permission prompts:** "Install hook" in the editor merges a hook into `~/.claude/settings.json`, keeps a backup and can be removed cleanly. The hook script POSTs to loopback and waits up to N s; no answer means no decision (Claude Code asks in the terminal as usual). Phone card with Allow / Deny, an optional sound and "only when I'm away". Verify: install, trigger a Bash permission in a real `claude` session, Allow from the phone, the command runs. Remove the hook and confirm the file equals the backup.
- **9.3 Quotas:** Claude (from the OAuth usage data Claude Code itself uses: **undocumented**, see R5), Codex (local logs), and a quota ring and quotas widget with a burn-rate forecast. GitHub widget via the `gh` CLI (reviews requested, CI status).
- Templates: AI quotas, Sessions, Deep work, Status.

## Stage 10 — Appearance and display
**Visible at the end:** switch a preset (cards / flat / content only / seamless) in the editor and the phone restyles; a wallpaper shows behind widgets; the night clock appears on schedule.

- Appearance settings with inheritance across global, page and widget (font, scale 50–200 %, radius, gap, padding, border, shadow), theme and accent, wallpaper with darken and blur, OLED burn-in pixel shift and dim-after-idle, night screen schedule, page bar / dot options, Smart Stack (up to 12 widgets in one slot, vertical swipe).
- Verify: Playwright visual snapshots per preset, plus a unit test of the inheritance resolution.

## Stage 11 — Control Deck, cross-platform part
**Visible at the end:** a Control Deck page controls system volume and mute, OBS scenes and recording, and fires meeting shortcuts. Docker containers start and stop. A Wake-on-LAN key wakes a machine.

- **Research first:** obs-websocket v5 protocol docs, Home Assistant REST/WebSocket docs, MIDI output from Node on macOS and Windows, OSC encoding spec, Wake-on-LAN magic packet, and mouse injection on macOS (CGEvent via a tiny Swift helper) and Windows (`SendInput` via a helper).
- Features: OBS (scenes, sources, record/stream, virtual cam), Home Assistant entities and dashboard, Docker/Podman, MIDI/OSC, Wake-on-LAN (host-sent, plus phone-sent "Wake the PC"), Trackpad widget (opt-in, off by default), meeting shortcuts, dev tasks and services (owned processes only), emergency mute and "mics off, camera off" where the OS allows.
- Verify: each integration against a local fixture (a fake obs-websocket server, a fake HA) in `node --test`, plus a live check list in `docs/CONTROL-DECK-CHECKS.md`.

## Stage 12 — Control Deck, Windows-native part
**Visible at the end, on a real Windows PC:** per-app volume faders move Spotify's level only. Default output can be switched. Push-to-talk unmutes the mic while held and restores it on release.

- **Research first, then stop for owner review:** choose a helper (C# .NET sidecar vs. Rust, using Core Audio / `IAudioSessionManager2` / `IPolicyConfig`), and work out packaging and signing in electron-builder for Windows.
- Features: per-app mixer and meters, device selection, mic volume/mute, push-to-talk with lease expiry, ducking, audio profiles, Windows services, power plans, display brightness (DDC/CI), lock/sleep with hold-to-confirm.
- Verify: the helper's own unit tests in CI on `windows-latest`. **Live checks need the owner's Windows machine** (R2).

## Stage 13 — Android-only
**Visible at the end, on an Android phone:** the panel runs as a kiosk home screen, volume keys flip pages, and it connects over USB with no Wi-Fi.

- USB transport (`adb reverse` + pinned TLS with a key the app creates), kiosk / home-screen mode, keep awake on charger, power standby, volume-key paging, ambient light/proximity, phone battery reports (for the battery-temperature rule), battery care via smart plug or a shortcut, and a phone bridge (clipboard, notifications to the Mac) as an opt-in with Android notification access.
- Verify: each on a physical Android phone. Each one is hidden on iOS (a unit test of the platform gate).
- Fence: Play policy review of notification access and kiosk before release (R1).

## Stage 14 — 3D printers (DeskHub)
**Visible at the end:** a Printer page shows up to 4 printers at once (state, progress, time left, layer, nozzle/bed/chamber temperatures, speed, errors, filament slot colours with the active slot highlighted), plus a compact Printer widget. Printers are added in the desktop editor with a "Test connection" button.

- **14.0 Ask, then research (one session, no code).**
  - **Ask the owner which printers they own.** Real hardware is the only true verification. Every brand without hardware ships as "built from the published protocol, untested on hardware", which is DeskHub's own stance.
  - Collect each protocol's **public** documentation into `docs/printers.md`: maker docs, published specs, or protocol write-ups (not code).
  - Add a table per brand: transport, auth, what fields exist, how many clients the printer allows at once, and whether a documented source exists at all.
  - Fence: if a brand's only source is someone else's code, mark it "no clean source" and skip it (R9).
- **14.1 Normalized model + printer page/widget** (D11): the shape `{name, model, online, state, pct, remainingMin, layer, layers, file, temps:{nozzle, bed, chamber}, speed, error, slots:[{color, material, active}]}`. The page and widget render from that shape. A demo-data printer covers App Review. Verify: Playwright with 1, 2 and 4 printers, plus an error state.
- **14.2 Documented-API brands first:** Klipper/Moonraker (HTTP, port 7125 or 80, optional API key, poll every 2 s, slicer time estimate, layer from print stats, filament colours from file metadata), OctoPrint (REST + API key; layers only if its plugin reports them), PrusaLink (HTTP Digest auth; no layers or colours). Verify per brand: a fixture HTTP server in `node --test`, plus a live check if the owner has one.
- **14.3 Brands with published or community-documented protocols:**
  - Bambu Lab: MQTT over TLS on the LAN with serial + access code. Cloud login is a separate, later step because it's reverse-engineered (R9).
  - Elegoo Centauri Carbon: SDCP over WebSocket.
  - Flashforge: HTTP API on newer models, G-code port 8899 on older ones.
  - Anycubic LAN Mode (MQTT).
  - Creality stock firmware: WebSocket on port 9999.
  - Snapmaker 2.0 (touchscreen Wi-Fi API with an on-screen approve step).
  - Snapmaker J1/Artisan (SACP on port 8888).
  - Each one: a fixture (a local MQTT broker / WebSocket server) test, back-off when the printer allows only one client, and credentials per D10.
- Fence: the host polls only while a printer widget or page is visible, or a rule needs it. The phone never connects to a printer (D11).

## Stage 15 — Games and integration long tail
- **Games page (DeskHub + PhoneBox):**
  - The Steam game being played (cover, session time) and the 5 most recent with tap-to-launch (`steam://rungameid/<id>`, only for listed games, launch is opt-in). Read from Steam's local files: library manifests, `localconfig.vdf`, and the running app id from the registry on Windows or `registry.vdf` on macOS. Covers from local cache, else Steam's public CDN.
  - An optional Steam Web API key (D10) for friends in game and total playtime.
  - **Non-Steam games:** the user adds them from a "pick from running programs" list, matched by process name, command-line text or window title, with optional cover and launch target. The host tracks last played and duration.
  - We write **our own** list of well-known games to recognise; DeskHub's list is not copied (clean-room rule 3).
  - Verify: fixture `.vdf`/`.acf` files and a fake process list in `node --test`.
- The rest, each its own step (research its public API → provider with fixture tests → widget → template if any): Spotify (PKCE queue/playlists), Plex playlists/queue control, RTSP camera via ffmpeg, photo frame (folder / Immich), Discord, CodexBar, other AI CLIs (OpenCode, Cursor, Antigravity, Grok, Pi, WorkBuddy, Copilot CLI), dictation, app console, device batteries. Order them by what the owner actually uses (ask at stage start).

## Stage 16 — Desk edges on the computer (Stash)
**Visible at the end:** move the pointer to the left edge of the Mac's screen and a volume slider appears. Sweep it and the volume follows. Drop the pointer into the bottom-left corner and a dial for brightness/dark mode/output device appears. A hidden dock of 8 apps slides out beside the macOS Dock; pull up on it for a launcher of more apps. Switch to another app and its profile swaps the controls. The same works on Windows at the screen edges and beside the taskbar.

- **16.0 Research, then stop for owner review (one session, no code).**
  - macOS: Electron transparent always-on-top windows on every display, click-through with `setIgnoreMouseEvents(true, {forward:true})` for hover detection, fullscreen spaces and auto-hiding Dock behaviour.
  - The native helper's APIs: brightness (public `IODisplay` vs private DisplayServices, and what Apple-silicon built-in displays need), keyboard backlight, `NSHapticFeedbackManager` for trackpad haptics, reading the Dock's frame via Accessibility, and the dark-mode toggle via System Events.
  - Windows: monitor brightness via WMI (laptops) and DDC/CI (externals, shared with Stage 12), taskbar position via `SHAppBarMessage`, and the light/dark registry key.
  - Write it up in `docs/desk-edges.md` and **stop for the owner** if anything needs a private API or changes notarization (R12).
- **16.1 Edge zones + overlay shell.**
  - Per display, thin invisible hover strips on the left and right edges and the four corners, with a configurable reveal delay.
  - An optional **pressure** mode: the pointer must keep pushing into the edge for N ms. This cuts accidental reveals.
  - Hidden in fullscreen apps unless allowed.
  - A per-display calibration store, a display picker, and graceful fallback when a calibrated display is unplugged.
  - Verify: a unit test of the hit-zone maths on fake display layouts (two monitors, mixed scale, Dock left/bottom/right). Live: on the Mac with an external display, each zone reveals only its own control.
- **16.2 Edge sliders.** Left and right edges are configured independently: volume, brightness or appearance (dark/light). There's an accent colour and a minimal style. Values are read back so the slider matches changes made elsewhere. Verify: drag the slider, then `osascript -e "output volume of (get volume settings)"` matches within 2 %. On Windows, the CI unit test covers the volume mapping.
- **16.3 Corner dials.**
  - Quarter-circle dials from each corner: volume, brightness, appearance, keyboard backlight, audio output device, a **timer** (0–60 min, live countdown, finish animation and sound) and **music** (spinning album art from the Stage 7 media provider, pull it out for previous / play-pause / next).
  - **Detachable:** pull a dial out into a floating full-circle control you can place anywhere, and snap it back into a corner. Two floating styles.
  - Haptic ticks on a trackpad (macOS helper) and optional sounds.
  - Verify: Playwright for the dial geometry and value maths (the dial UI is web code). Live: the timer finishes with sound, and the detached dial survives a host restart in the same place.
- **16.4 Hidden dock + launcher.**
  - A side tray of up to 8 apps beside the system Dock (beside the taskbar on Windows), aligned using the helper's Dock/taskbar position, with recalibrate from the tray menu.
  - Pull up for a slotted **launcher** of more apps. Launching reuses the existing `app` action.
  - An optional "expanding apps" layout.
  - Verify: Dock on the left, bottom and right (`defaults write com.apple.dock orientation …; killall Dock`): the tray stays aligned each time.
- **16.5 Profiles per frontmost app.** The dock, sliders and dials swap per frontmost app, reusing the foreground provider and the profile/trigger model the phone deck already has (Auto mode). Verify: unit test of profile resolution, then live: switch Safari → Finder and the dial set changes within 1.5 s.
- **16.6 Shared glass material + settings.**
  - One material for the dock, dials and sliders, with our own controls: frost, refraction, transparency, tint and highlights.
  - Everything is editable in the loopback editor under a new "Desk edges" section.
  - The phone shows "shelf" widgets the user picks on the computer: this is the existing Stage 3 editor flow, so no new work.
  - Verify: change tint in the editor and the dock restyles without a restart.
- Phone side (already covered elsewhere): "throw" an app from the phone to open it on the computer is the existing `app` action plus a flick gesture on a tile (Stage 2.3). Timer, Spotify/now playing, Claude Code and Codex widgets are Stages 5, 7 and 9.
- Fence: never steal clicks outside the revealed control. Overlays must never cover a fullscreen app unless the user allowed it. Our own visuals (clean-room rule 3).

## Stage 17 — Creative app controls (Stash)
**Visible at the end:** open Photoshop and the phone's panel switches to a Photoshop page. Nine tool keys (the user picks which), a brush-size precision slider, and a colour control appear. The colour control shows up when Photoshop's colour picker is open. Dragging the slider changes the brush size live. The same pattern works for Illustrator, After Effects, Premiere Pro and Blender.

- **17.0 Research, then ask (one session).**
  - Ask the owner which of the five apps they have. Every app without a copy ships "untested", per R10.
  - From **Adobe's and Blender's own docs**, record per app in `docs/creative-apps.md`:
    - the tool shortcuts;
    - the scripting route for reading/setting brush size (Photoshop), stroke weight (Illustrator), the selected single-value property (After Effects), and the current tool;
    - how to detect a colour picker being open, which may need the Accessibility window list;
    - Premiere's tools;
    - Blender's Python API for mode, transform, rotation X/Y/Z, camera focal length, light power / sun strength, sculpt brush size and strength, frame selected, camera view, X-ray and shading.
  - Fence: if a control has no documented route, leave it out rather than guess.
- **17.1 Context switch.** When one of these apps is frontmost, the phone auto-switches to its page, reusing Auto mode and the rules engine. Users pick 9 tools for the Adobe apps. Verify: unit test plus a live check with whichever app the owner has.
- **17.2 Tool keys.** Shortcuts per app as host-side shortcut IDs (D7), with labels and icons of our own design. Verify: tap each key and the app's active tool changes (live) or the right keystroke is logged (dry run).
- **17.3 Precision and colour controls (D13).**
  - Value sliders send a number to a host shortcut with a range (Stage 8.1 numbers), which runs our script against the app.
  - Values are read back so the slider starts at the real value.
  - Colour control: foreground / fill / text colour for Photoshop, Illustrator and After Effects.
  - Verify: a fixture test of script generation and value clamping. Live: brush size 1 → 200 tracks the slider at ≤ 4 updates/s.
- **17.4 Blender add-on.** A small add-on of ours, installed from the editor, listens on loopback only. It accepts only the fixed operations above, with values clamped. Verify: Python unit test of the operation whitelist, then a live check in Blender.
- Fence: no app is controlled by synthetic mouse moves. Scripts are generated from fixed templates with validated numbers only, never from phone-supplied text. "Adobe", app names and Blender are used only to describe compatibility; no logos.

## Stage 18 — Languages and release
- i18n: our own `t()` with key-based dictionaries for the panel, editor and app. Start with English, then add locales in batches. RTL support (Arabic) needs a layout check.
- Release: app version 1.2.0 with a demo-mode walkthrough of the new panel in the review notes and an updated privacy policy. Desktop host installers for macOS (notarized) and Windows. Merge `panel-parity` → `main` **only after** 1.1.0's review is resolved.

---

## Risks and tripwires

| # | Risk | Tripwire (when you'll know) | Fallback |
|---|---|---|---|
| R1 | **App Review** rejects the panel (2.5.2 downloaded code, 4.2 minimum functionality without a Mac, privacy answers out of date). | Stage 2.4: if demo mode can't show a convincing panel without a computer, stop. Each stage adding outbound connections (4.5 speed test/public IP, 6, 7 media servers, 9, 15): privacy policy not updated = don't submit. | The panel stays bundled (D1), demo mode covers every widget, and Custom HTML only runs user-typed HTML in a sandbox. If needed, ship Custom HTML Android-only. |
| R2 | **Windows can't be verified from this Mac.** | Stage 1.2: the first Windows CI run. If `systeminformation` or the host fails on `windows-latest`, fix it before Stage 2. Stage 12 start: no Windows machine available = the stage is marked "built, unverified" and doesn't ship. | CI covers unit tests and provider smoke. Native audio/device work waits for a Windows box. |
| R3 | **Node/Electron lacks a native API** (media sessions, mouse injection, Core Audio). | Research steps at the start of Stages 7, 11 and 12. If a helper needs new signing or notarization, the step says stop. | A small per-OS sidecar helper, spawned and talked to over stdio JSON. |
| R4 | **React Native WebView bridge throughput** (charts at 2 s × many widgets). | Stage 4.2: if the Panel screen drops frames on a mid-range phone with the System template. | Batch `data` events into one message per tick, and send deltas instead of full arrays. |
| R5 | **Undocumented quota endpoints** (Claude usage, Codex app-server) change or rate-limit. | Stage 9.3: a non-2xx or schema mismatch in the live check. | Show "quota unavailable" honestly. Never invent numbers. Back off at most every 3 minutes and honor 429 `Retry-After`. |
| R6 | **Clean-room contamination.** Someone opens PhoneBox source "just to check". | Every PR touching `panel/` or `desktop/src`: the reviewer asks whether `docs/CLEANROOM.md` was updated this stage. | If source was viewed, note it in `CLEANROOM.md`, and have the affected component rewritten by a session that didn't see it. |
| R7 | **Auto-push publishes every edit** to the public repo. | Any time you're about to write a token, key, Home Assistant URL with a token, or a personal path into the tree. | Secrets go in the host's user-data dir or an env var, never in the repo. Fixtures use made-up data. |
| R8 | **Scope.** This is many months of work, and the plan will drift. | At each stage boundary, re-read this file. If a stage took more than twice its step count in sessions, re-plan the next one before starting it. | Cut from Stage 15 first, then 17, then 14.3, then Stage 12. Stages 1–10 (plus 16 if the owner ranks it up) are the product. |
| R9 | **Printer and cloud protocols with no clean source.** Several brands (and Bambu's cloud login) are known only through community reverse-engineering, often published as code. | Step 14.0: any brand whose `docs/printers.md` row says "no clean source". | Skip that brand, or have the owner capture the printer's traffic themselves so we write from observed behavior. Never port someone's client code. |
| R10 | **Hardware or software we don't have** (printers, Plex/Jellyfin, Steam on Windows, Adobe apps, Blender). | Every Stage 7, 14, 15 and 17 step: no device or app = verified on fixtures only. | Label those integrations "untested" in the editor, as DeskHub does, until the owner or a user confirms them. |
| R11 | **A commercial competitor (Stash) takes issue** with a lookalike. | Stage 16.6 and 17.2: before any desk-edge or creative-control UI is finalized, compare it against the rule-3 list (names, icons, visual design). | Change the visuals and names, not the features. Keep `docs/CLEANROOM.md` showing that only public pages were read. |
| R12 | **macOS private APIs** (brightness on Apple-silicon displays, keyboard backlight, Dock-notification tricks) break on an OS update. | Step 16.0 lists each control's API as public or private. Any private one ships behind a capability check. | The control shows "unavailable on this Mac" instead of failing silently. |

---

## How to work a step (for any model or session)

1. Read the handoff block, the decisions and the clean-room rules.
2. Do exactly one step. Respect its **fence**.
3. Run its **verify**. If it fails, fix it or report the failure. Don't tick the box.
4. Tick the checklist and update the **Status / Next** line in the handoff block.
5. If reality disagrees with this plan, edit the plan (with the reason) instead of quietly diverging.
