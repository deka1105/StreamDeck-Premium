# Android phone — live checks (Stage 13)

Already verified on the Android emulator (Pixel 8 image), with a debug build:
- the app builds with our native module;
- the panel runs;
- the 📱 Android sheet appears (on iOS it doesn't), with light and proximity switches shown because the sensors were detected;
- "Use as the home screen" reports the real default launcher;
- with "Volume keys flip pages" on, volume-down no longer changes the volume.

The emulator was too slow on this Mac to go further. The page flip itself is covered by `tools/ui-tests/tests/android-events.spec.mjs`.

On a real Android phone:

- [ ] Build: `cd mobile && npx expo run:android --device`. Open Panel, then 📱.
- [ ] **Volume keys:** turn on "Volume keys flip pages". Volume down shows the next page, up the previous one, and the volume doesn't change. Leave the panel: the keys change the volume again.
- [ ] **Keep the screen on — While charging:** plug in and the screen stays on; unplug and it times out normally.
- [ ] **Dim with the room:** cover the light sensor; the panel dims within a second or two. Uncover it and brightness returns.
- [ ] **Wake when a hand is near:** with a night screen or dim showing, wave over the top of the phone and the panel wakes.
- [ ] **Full screen / Pin the panel:** bars hide; pinning asks Android to confirm, and Back + Overview unpins.
- [ ] **Home screen:** "Open" goes to Settings › Default apps › Home app; pick DeskAssist and Home returns to it. Pick the old launcher to undo.
- [ ] **USB:** in the computer's editor turn on Settings › Android phone › USB link, plug the phone in (USB debugging on), and turn on "Prefer the USB cable". Turn Wi-Fi off: the panel keeps working.
- [ ] **Notification mirror:** turn it on, allow notification access, then send yourself a message. It appears as a notification on the computer.
- [ ] **Clipboard:** with the bridge allowed in the editor, copy text on the phone, tap Phone → computer, paste on the computer. Then the other way round.
- [ ] **Battery care:** turn on "Share battery with the computer". `phone.battery` appears in the editor's pushed values, and the example rule "Phone charged to 80% → shortcut plug-off" fires.
- [ ] **Wake the computer:** connect once, sleep the computer (wired Ethernet, Wake-on-LAN on), then press Wake in 📱.

**Play Store (fence):** before a release, check Play's policies on notification-listener access and on apps declaring a HOME intent filter. Both features are opt-in and explained in the app.
