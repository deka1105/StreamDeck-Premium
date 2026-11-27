# Clean-room log

DeskAssist's panel, editor and desk-edge features are written from scratch to
match the *behavior* of three reference products. This file records what was
read and the feature inventory taken from it, so the provenance of every
feature is on record.

## Rules (summary; `PLAN.md` § Clean-room rules is authoritative)

1. Read only public, behavior-describing material: READMEs, user docs, privacy
   pages, changelogs, screenshots, marketing pages.
2. Never read, fetch, download or run the reference products' source or
   binaries.
   - PhoneBox: `agent/`, `android/`, `ios/`, `tools/`, `packaging/`,
     `bucket/`, `scripts/`, `widgets.json`, `templates.json`, `main.js`,
     `style.css`.
   - DeskHub: `companion/`, `firmware/`.
   - Stash: its DMG and the Stash Deck app.
3. Our own names, icons, visual design, data formats and demo data.
4. Where a public spec exists (Open-Meteo, ICS, RSS/OPML, Claude Code hooks,
   obs-websocket, Moonraker, …), implement from that spec.
5. Log every consultation below, per stage.

## Sources consulted

| Date | Product | Material | Licence / status |
|---|---|---|---|
| 2026-11-27 | PhoneBox (github.com/ersinkoc/phonebox) | `README.md`, `docs/GUIDE.md`, `docs/CONTROL-DECK.md`, `docs/DEVELOPMENT.md`, `docs/APPEARANCE.md`, `docs/SETUP.md`, `PRIVACY.md` | MIT, open source |
| 2026-11-27 | DeskHub (github.com/zacharyinserra/deskhub) | `README.md`, `ROADMAP.md` | MIT, open source |
| 2026-11-27 | Stash for Mac (stashformac.com, v4.2.0) | home page, `/updates`, `/creative-pro`, `/privacy`, `/terms` | proprietary; terms forbid reverse engineering |

Repository *file listings* (names and sizes only, via `gh api …/git/trees`)
were viewed for PhoneBox and DeskHub to tell docs apart from source. No source
file contents were opened.

## Feature inventory

Each line: the feature in our own words, then the stage that delivers it.

### From PhoneBox

- Panel of pages, each a 12 × 6 grid of resizable widgets [S2]
- Swipe, page dots and a page overview to move between pages [S2]
- Idle return to a home page, with a per-page stay time [S2]
- Portrait and landscape layouts [S2]
- Browser panel for a monitor, as its own device [S1, S3]
- Simulated demo data for previews [S2]
- Browser layout editor: pages list, phone-sized canvas, drag and resize [S3]
- Widget palette grouped by category, with search [S3]
- Per-widget option forms [S3]
- Live preview of unsaved edits with live data [S3]
- Export and import of pages as files [S3]
- Page templates (Home, System, Clock, Dashboard, Daily, Focus, Calm, …) [S3–S9]
- Per-device pages and home page [S3]
- Metric tile, gauge and history chart widgets [S4]
- CPU, GPU, memory, disks, network throughput, ping [S4]
- Top processes, and a process list with end-process (own session only, deny list) [S4]
- GPU details, memory & disks widgets [S4]
- Clock with status line, analog clock in any time zone, word clock, world clocks [S5]
- Month calendar, time progress (day / week / month / year), countdown [S5]
- Pomodoro, focus history, quick timer, stopwatch [S5]
- Note editable from the phone, daily-reset checklist, counter [S5]
- Breathing exercise, quote, title, phone battery, computer switcher [S5]
- Weather, hourly and 7-day forecast, sun & moon, moon, air quality [S6]
- Exchange rates, crypto prices, Hacker News, RSS/Atom news feeds with OPML import [S6]
- ICS agenda and "next up" [S6]
- Now playing, volume, radio, synced lyrics, spectrum bars [S7]
- Shortcuts sent by ID, with numeric values checked on the computer [S8]
- Webhooks: pushed values, notifications, page switching, refresh [S8]
- Rules engine (when → then) with a calm page-switch countdown [S8]
- Sandboxed Custom HTML widget with a scripting bridge [S8]
- Command widget (computer-defined command, output only) [S8]
- AI sessions (Claude Code, Codex, …) and their details [S9]
- AI quotas, quota ring, burn-rate forecast [S9]
- Allow / Deny of coding-agent permission prompts from the phone [S9]
- GitHub reviews and CI status [S9]
- Appearance presets with global / page / widget inheritance [S10]
- Wallpaper, OLED burn-in shift and dim, night screen [S10]
- Smart Stack (several widgets in one slot) [S10]
- OBS, Home Assistant, Docker, MIDI/OSC, Wake-on-LAN, trackpad [S11]
- Per-app audio mixer, devices, push-to-talk, services, power (Windows) [S12]
- USB transport, kiosk mode, volume-key paging, phone bridge (Android) [S13]
- Steam library, Spotify, Plex, camera, photo frame, Discord, other AI CLIs [S15]
- Interface translations [S18]

### From DeskHub

- Home grid of sized widgets, laid out by cell [S2]
- Configurable pages shown in a navigation bar [S2]
- Drag-and-drop home layout in a browser settings page [S3]
- PC stats: CPU, GPU, RAM, VRAM, GPU temperature, one-minute history, network, disk [S4]
- Internet quality: TCP-connect latency, jitter, loss, uptime, last drop [S4]
- Data used today and this month, on-demand speed test, optional public IP [S4]
- Timer with 1–45 min presets, pause / reset, full-screen "time's up" card [S5]
- Time left shown on the timer's navigation tab [S5]
- Weather: current, next 24 hours, next 6 days [S6]
- Calendars: Google / Outlook ICS links, iCloud CalDAV, local .ics [S6]
- Up to 16 upcoming events grouped by day, in calendar colours [S6]
- "Event still to come today" dot on the calendar tab [S6]
- Now playing with cover, seek and controls [S7]
- Plex and Jellyfin server card; Jellyfin remote control [S7]
- Shortcut tiles: keys, apps, folders, URLs, volume, media, lock [S8, existing]
- Claude Code plan limits via the status line, token totals, 7-day chart, per model [S9]
- Codex usage from local session logs; agent auto-pick [S9]
- "Waiting for you" alerts: permission, question, plan ready, finished [S9]
- GitHub contribution chart widget and page, streaks, top repos [S9]
- Follow the computer's display sleep: dark, dim clock, or unchanged [S10]
- Night mode schedule kept on the display itself [S10]
- Navigation bar position: left, right or bottom [S10]
- Slow scrolling for overflowing text [S10]
- Mic-mute action, tiles lit while mic / speakers are muted [S11]
- 3D printer status for up to 4 printers across 10 brands [S14]
- Steam playing / recent games, launch, friends and playtime; non-Steam games [S15]

### From Stash for Mac

- Edge sliders on the left / right screen edges: volume, brightness, appearance [S16]
- Corner dials: volume, brightness, appearance, keyboard backlight, audio output [S16]
- Timer dial (0–60 min) and music dial with album art and transport [S16]
- Detachable floating dials that snap back into corners [S16]
- Hidden dock of up to 8 apps beside the system dock, revealed on hover or pressure [S16]
- App launcher pulled up from the hidden dock [S16]
- Profiles that swap controls per frontmost app [S16]
- Shared translucent material with frost / refraction / transparency / tint / highlights [S16]
- Haptics and sounds; multi-display calibration [S16]
- Phone: open ("throw") an app on the computer [S2, existing]
- Phone: timer, music, Claude Code and Codex widgets; computer-chosen widgets on the phone [S5, S7, S9, S3]
- Per-app tool keys and precision sliders for Photoshop, Illustrator, After Effects, Premiere Pro, Blender [S17]
- Colour controls when an app's colour picker is open [S17]

## Per-stage notes

Add an entry per stage: what was consulted again (if anything) and any design
decision made *without* reference material because the docs were silent.

- **Stage 0** — no further consultation.
- **Stages 1–3** — no further consultation. Designed here without reference
  material: the panel bridge and its three transports, the encrypted long-poll
  on a second counter channel, the `{type, meta, needs, mount}` widget module
  shape and the catalogue generated from it, the layout schema and its
  sanitizer, the editor's page/canvas/inspector design, template content, and
  the live-tile Deck widget.
- **Stages 4–5** — no further consultation. Designed here: the provider set and
  its normalized shapes, the end-process guard (deny lists written from OS
  knowledge, ownership check, per-widget opt-in verified host-side), the
  TCP-connect latency probe and quality maths (median / jitter / loss as
  described in DeskHub's README, implemented from that description), the word
  clock letter grid, the quote collection (public-domain sources only), and
  the per-widget state store with panel-level alarms.
