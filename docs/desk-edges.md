# Desk edges (Stage 16)

Controls that appear when the pointer reaches an edge or corner of the computer's screen, and a hidden dock beside the system Dock or taskbar. They are part of the DeskAssist desktop app (Electron).

## How it works

- **One overlay window per display.** It is transparent, always on top, not focusable and kept out of the taskbar. It is click-through (`setIgnoreMouseEvents(true, {forward: true})`): it still sees pointer moves, but takes clicks only while the pointer is over a revealed control. It never steals clicks elsewhere.
- **Full-screen apps:** hidden over them unless "Also over full-screen apps" is on (`setVisibleOnAllWorkspaces(…, {visibleOnFullScreen})`).
- **Hot zones** (`desktop/src/edges/geometry.mjs`, pure and unit-tested):
  - a 3-pixel strip along the middle 70 % of the left and right edges, and a 10-pixel square in each corner;
  - the hidden-dock strip along the tray's span;
  - never over the system Dock or taskbar;
  - optional "pressure": the pointer must keep pushing into the edge for N ms before anything opens.
- **The Dock / taskbar** comes from each display's bounds versus its work area. On macOS the Dock's exact frame is read through System Events, which needs the same Accessibility permission as keyboard shortcuts. If that's denied, the tray sits above the bar instead. Tray menu › "Recalibrate desk edges" re-reads it.
- **Sliders:** sweep the pointer along them to set the value; no click needed.
- **Corner dials:** the pointer's angle around the corner sets the value. Pull a dial out of its corner and it floats as a full circle you can move. Double-click a floating dial to send it back. Floating dials are saved and survive restarts.
- **Timer:** a 1–60 min countdown with a finish sound. **Music:** spinning art; the centre plays or pauses, the halves go to the previous or next track.
- **Profiles per frontmost app** reuse the foreground reading (every 1.5 s) and the same `apps` pattern matching as the phone's Auto mode.
- **Look:** our own glass material: tint, frost (backdrop blur of the control itself), opacity and highlight, or a minimal style. Editing it in the editor restyles the controls on Save, without a restart.

## What each control can do

| Control | macOS | Windows |
|---|---|---|
| Volume | AppleScript (public) | Stage 12 helper |
| Light / dark | System Events appearance preferences (public scripting) | `HKCU\…\Themes\Personalize` registry values |
| Display brightness | **Not offered.** Built-in displays on Apple silicon need the private DisplayServices framework (R12). Shows "not available". | External monitors over DDC/CI (helper); laptop panel via WMI |
| Keyboard light | **Not offered** (private API) | Not offered (no standard API) |
| Audio output | Not yet: needs a Core Audio native helper (same pattern as Windows). Shows "not available". | Stage 12 helper (`IPolicyConfig`) |
| Timer, Music | yes | yes |
| Hidden dock + launcher | yes (icons via Quick Look thumbnails of the .app) | yes (icons from the executable) |

Trackpad haptic ticks (`NSHapticFeedbackManager`) were left out. That API is public, but it only fires while our app is in front, and the overlay is deliberately never in front.

## Verified

- `desktop/src/edges/edges.test.mjs`: hit zones on fake layouts (Dock left/bottom/right, auto-hidden, full-width taskbar, two monitors with mixed scale), pressure, slider and dial maths, profile resolution, settings cleaning, and the controls on macOS and Windows with a fake runner.
- `tools/ui-tests/tests/edges.spec.mjs`: the overlay page in Chromium with a real mouse over a wallpaper:
  - reveal and sweep-to-set;
  - auto-hide;
  - the Dock's edge stays untouched;
  - timer, music, detach and re-dock;
  - tray beside the Dock, plus the launcher;
  - pressure mode.
- Electron smoke on this Mac, a 5120×1440 ultrawide (`EDGES_SMOKE=1`, throwaway data, test ports): overlay windows open, the bridge answers, controls reveal and are captured.

## Live checks for the owner

- [ ] Turn on Settings › Desk edges and Save. Push the pointer into the left edge: the volume slider appears. Sweep it and the volume follows (`osascript -e "output volume of (get volume settings)"`).
- [ ] Bottom-left corner: light/dark toggles. Bottom-right: music plays and pauses.
- [ ] Pull a dial out to float it; quit and reopen DeskAssist and it's still there.
- [ ] Move the Dock to the left, bottom and right (System Settings › Desktop & Dock), then use Recalibrate. The tray stays beside it each time.
- [ ] Add a profile for Safari with a different left edge; switch Safari ↔ Finder and the edge control changes within ~1.5 s.
- [ ] Windows PC: the same, beside the taskbar; brightness on an external monitor with DDC/CI.
