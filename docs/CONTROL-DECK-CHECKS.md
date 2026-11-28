# Control Deck — live checks (Stage 11)

Automated tests cover each integration against a local fake (`desktop/src/control/control.test.mjs`, `tools/ui-tests/tests/control.spec.mjs`).
These checks need the real thing and are for the owner. Tick each one when done.

- [ ] **OBS** (28 or later): Tools › WebSocket Server Settings › Enable, copy the password. In the editor: Settings › Control Deck › Connect to OBS + Save password. Add the OBS widget. Switch scenes, start and stop a recording (stopping asks twice), toggle a mic mute.
- [ ] **Home Assistant**: paste the address and a long-lived token, then **Test & list entities**. Put `light.*` and `sensor.*` ids in a Home Assistant widget. Tap a light and watch it change.
- [ ] **Docker / Podman**: start Docker Desktop. Containers list within 4 s. Turn on "Allow start / stop" for the widget, then stop and start a container.
- [ ] **Wake-on-LAN**: add a computer's MAC address. Put it to sleep and press Wake. (Wired Ethernet; WoL turned on in its firmware.)
- [ ] **OSC**: point a message at QLab / a lighting desk / `oscdump 9000`, press the key.
- [ ] **Dev services**: add `npm` / `run dev` with a project folder. Start it, see output, open its page, stop it, and check the process is gone (`ps`).
- [ ] **Meeting**: in a Zoom and a Teams call, Mic / Camera / Leave work (DeskAssist needs Accessibility permission). Mute everything mutes the mic and the speakers, and a second tap restores both.
- [ ] **Trackpad**: turn it on in Settings, then move, tap, two-finger scroll and right-click from the phone. On Windows, repeat on a real PC.
