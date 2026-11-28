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

## Stage 12 — on a real Windows PC

- [ ] Install a Windows build (`npm run dist:win` on Windows). Open the Audio template page.
- [ ] Play Spotify and a YouTube tab. Move Spotify's fader: only Spotify's level changes (check the Windows Volume Mixer). Its meter moves with the music.
- [ ] Switch the output from speakers to headphones in the Audio devices widget. The sound moves, and Windows' Sound settings show the new default.
- [ ] Mute the mic in Windows. Hold Push to talk: the mic unmutes (check Sound settings › Input). Release: it's muted again. Hold, then close the panel app: within about 2 s the mic is muted again.
- [ ] "Duck others" lowers Spotify but not Teams; tap again and it comes back.
- [ ] Save a profile in the editor (Settings › Audio & Windows), change things, apply it from the panel: devices and levels return.
- [ ] Power plan switches (check `powercfg /getactivescheme`).
- [ ] An external monitor with DDC/CI on: its brightness follows the slider. On a laptop, the built-in display does too.
- [ ] Hold Lock for a second: the PC locks. A quick tap does nothing.
- [ ] List a service you can control (e.g. one of your own) and start/stop it.
