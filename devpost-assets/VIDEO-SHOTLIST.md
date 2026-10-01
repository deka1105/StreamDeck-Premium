# Demo video — shot list and craft notes

Target: **75–100 seconds.** The cap is 2 minutes and judges need not watch past
it, so finishing early is a feature. No music (licensing — see `MANIFEST.md`).

---

## The one thing that matters: show both devices

A phone-only screen recording shows the tap but not the result, which is the
entire point of the product. Pick one of these before you shoot anything.

**Option A — one camera, both devices in frame.** Mac open on the desk, phone in
your hand or on a small stand in front of it, film with a second phone or a
webcam. Easiest by far, needs no editing, and it is the most *convincing* option
because the causality is unfaked: one continuous shot, a real finger, a real
screen reacting.

Watch for: moiré and glare off both screens. Shoot in a dim room, kill overhead
lights and any window behind the screens, set the Mac to full brightness, and
angle the camera slightly off-perpendicular to the Mac panel.

**Option B — two screen recordings, composited side by side.** Sharper and more
legible, but you have to sync them and it needs an editor. iOS: Settings →
Control Center → add Screen Recording. macOS: ⌘⇧5. Clap or tap at the start of
both to give yourself a sync point.

**Option C — hybrid.** Mac screen recording as the main frame, phone screen
recording inset bottom-left. Best legibility, most editing work.

If you have an hour, do A. If you have an afternoon and an editor, do C.

---

## Structure

Lead with the payoff. Most demos open on onboarding, which is the least
interesting thing you built.

| Time | Beat | Why |
| --- | --- | --- |
| 0:00–0:08 | **Cold open, no preamble.** Nine-tile deck on the phone, Mac visible. Tap **Safari** → Safari opens on the Mac. Tap **Spotlight** → Spotlight opens. | Someone decides in 5 seconds whether this is worth watching. Two taps, two visible consequences, no explanation needed. |
| 0:08–0:18 | **Say what it is, once, plainly.** On-screen text or voice: "My phone is a Stream Deck for my Mac. Every tile is a shortcut." | A non-technical viewer now understands the product. Do this *after* the hook, not before. |
| 0:18–0:35 | **The money shot: tap here, it types there.** Open Snippets, tap "Thanks reply" — the sentence types itself into a document on the Mac. Hold on the typed line for a beat. | This is the most surprising capability you have, and the one people don't expect. Give it room. |
| 0:35–0:50 | **Auto mode.** Turn on 🪄 Auto. Switch apps on the Mac. The deck changes by itself. | The "oh, that's clever" moment. It needs no narration — just let the deck change while the viewer watches. |
| 0:50–1:02 | **It's a real app, not a demo.** Edit mode: drag a tile, change an icon, add a page. Then the Apps screen with live running/frontmost dots. | Shows depth and polish. Judges are checking whether this is a weekend prototype. |
| 1:02–1:12 | **Monetization.** Tap the **Pro** pill, or hit a free limit so the reason-aware message appears. Show the three tiers. | Required to be visible for a RevenueCat hackathon. The limit-triggered route is better than the Pro pill — it shows *why* someone would pay. |
| 1:12–1:22 | **The trust claim.** One line over the pairing screen or a QR: "Paired by QR, end-to-end encrypted, no account, nothing leaves your network." | This is your differentiator against every cloud-relay competitor. One sentence, held long enough to read. |
| 1:22–1:30 | **Close.** App name, one line, stop. | Don't trail off. End on the name. |

Cut anything that doesn't earn its seconds. Pairing, permission prompts and
settings screens are all cuttable — mention pairing in the trust beat instead of
performing it.

---

## Make it work for every kind of viewer

**Most people watch muted.** Burn in captions or on-screen text for every spoken
line. This is the single highest-return thing after the two-screen fix. It also
covers deaf and hard-of-hearing viewers, and anyone watching in a noisy room.

**Non-technical viewers** need one plain sentence in the first 10 seconds. "My
phone is a Stream Deck for my Mac" beats any description involving X25519.

**Technical viewers and judges** want the engineering — but at 1:12, not at
0:00. One line about the encryption is enough in the video; the depth lives in
the README and `SECURE-PAIRING-PLAN.md`.

**Accessibility, concretely:**

- Caption text at least ~40px at 1080p; thin light type on a bright screen
  recording disappears.
- Put captions on a solid or heavily-dimmed strip, not straight over UI.
- Never rely on colour alone — when you point out the green running dot, say
  "running", don't just let green mean it.
- No flashing or strobing transitions.
- Hold every line long enough to read twice: roughly 0.3s per word, minimum
  ~1.5s even for three words.

**If you narrate:** write the script first and read it, don't improvise. Record
voice separately from the screen capture so a fluffed line costs one take of
audio rather than the whole demo. Say what the viewer *can't* see — "this is
going over my own wifi, there's no server in the middle" — rather than reading
the buttons out loud.

---

## Mechanics

- **Record on build 6** from TestFlight (the current binary, with the QR back
  button and the corrected permission prompts).
- **Before you start:** Do Not Disturb on both devices, clear the Mac desktop of
  anything personal, close noisy apps, empty the Dock of clutter, and sign out
  of anything with your real name visible.
- **Grant Accessibility to the host first** (System Settings → Privacy &
  Security → Accessibility → DeskAssist, remove and re-add). Without it,
  Spotlight and the Apps list silently do nothing — which would wreck the two
  best beats.
- **Prefer the real host over demo mode.** The whole video depends on the Mac
  visibly reacting; demo mode cannot show that. Keep demo mode as the fallback
  only if pairing refuses on the day.
- **Shoot each beat as its own take.** Eight short clips you can re-shoot
  individually, not one long take you have to nail end to end.
- **Export 1080p, H.264, 30fps.** Upload to YouTube — public or unlisted, not
  private — and put the link on the form.

---

## Two warnings

**No music.** The bundled track in `brag-output/brag.mp4` has undocumented
licence terms and the rules bar copyrighted music without permission. Silence
plus captions is completely fine, and voice-over is better than music anyway for
a product demo.

**Mind the tile labels.** The default deck reads Safari, VS Code, GitHub,
YouTube. That is ordinary nominative use and the icons are Unicode emoji rather
than logos, so the risk is low — but if you want it airtight, rename a few tiles
to generic names before shooting.
