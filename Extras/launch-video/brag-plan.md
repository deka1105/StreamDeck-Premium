# Brag Plan: DeskAssist

## What is this app?

DeskAssist turns a phone into a Stream Deck for your Mac — a grid of tiles where
one tap launches an app, opens a link, fires a keyboard shortcut, or types saved
text on the computer in front of you, over an end-to-end encrypted link you set
up by scanning a QR code.

## The angle

The product's own hero line already *is* the pitch: **"Your phone is the
button."** So the video makes that literal — it opens on one tile filling the
frame, multiplies it into the real nine-tile deck, then proves the claim by
tapping a tile on the phone and having text appear on the Mac.

This is not a joke product, and the video shouldn't wink. The brag is that a
solo-built app does a real hardware replacement with a real cryptographic
handshake. Restraint sells that better than hype.

## Hook (first 2-3 seconds)

Near-black. A single large rounded tile — sky gradient, compass glyph, label
"Safari" — scales in and settles. A tap ripple crosses it. The line appears:

> Your phone is the button.

One tile, one claim. No logo yet, no chrome, no UI frame. The tile *is* the hook
because the tile is the product.

## Key moments (the middle)

- The single tile **multiplying into the real 3×3 deck** — nine tiles in the
  app's actual palette with its actual labels (Safari, VS Code, Finder,
  Spotlight, Screenshot, Lock, GitHub, YouTube, Mute).
- **Live state dots** arriving on Safari / VS Code / Finder — green for running,
  a cyan ring on the frontmost one. This is the detail that makes it read as a
  real connected app rather than a mockup.
- **Tap here, it types there.** A tile press on the phone side; on the Mac side,
  text types in character by character. The single most surprising capability,
  and the one that proves the connection is live.

## Outro / punchline

The deck recedes and softens. Product name at full scale, the hero line under
it, then one quiet three-part claim: *No cloud. No account. Sealed end-to-end.*
No CTA, no URL shouting. The restraint is the flex.

## User flow worth showing

Entry → key action → result, pulled straight from the product:

1. **Entry:** scan the QR the desktop host shows — "scan once to pair".
2. **Key action:** tap a tile on the phone (the snippet tile).
3. **Result:** the Mac acts — text types into the focused window.

Scene 3 is the centerpiece and shows beats 2 and 3 directly. Pairing (beat 1) is
referenced in the outro claim rather than dramatised, because a QR scan is the
least visually interesting second of the flow and the encryption story lands
better as a stated fact.

## Tone

- Preset: **polished**
- Creative direction: *quiet premium product film — the deck is the hero, the
  cryptography is the flex*
- Interpretation: four scenes, long settled holds, soft crossfades, light-weight
  type with generous tracking. Motion is confident and unhurried; nothing
  bounces, flashes, or shouts. Every claim is one the site actually makes.

## Format: landscape — 1920x1080
## Duration: 20s

## Visual identity (from the project)

- Background: `#070b14` (site `--ground`), deck surface `#0b1120` (app root)
- Accent: `#46bdf6` (site `--accent`); deck sky tile `#0284c7`
- Text: `#e8eef9` (`--ink`), muted `#8a99b2` (`--muted`)
- Running-state green: `#4ade80` (`--good`); frontmost ring `#38bdf8`
- Display font: SF Pro Display / `-apple-system` (site `--sans`)
- Body/mono font: SF Mono / JetBrains Mono (site `--mono`) — for the typed text
- Real tile palette: `#0284c7` `#2563eb` `#4f46e5` `#7c3aed` `#c026d3` `#e11d48`
  `#d97706` `#475569` `#404040` (from `mobile/src/buttons.ts` `TILE_COLORS`)
- Strongest visual element: the 3×3 grid of vivid gradient tiles on near-black,
  with live status dots. It is genuinely striking and it is the product.

## Share copy (draft)

Built DeskAssist: your phone becomes a Stream Deck for your Mac. Tap a tile —
apps launch, shortcuts fire, saved text types itself. No cloud, no account,
end-to-end encrypted over your own network.

## Audio direction

- Role: low, steady bed with sparse motion-matched accents
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (steady and
  clean; the reference's `polished` pick)
- Music treatment: start at 0, volume ~0.30, short fade-in over the first ~0.6s,
  fade out across the final ~1.2s. No swell gimmicks.
- Music cue guidance: preset read from
  `assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`
  — tempo 109.96 BPM. Three strong-cue locks, one per major moment:
  - **8.74s** (intensity 0.99) — the nine-tile deck completes
  - **13.11s** (0.98) — the typed text begins on the Mac side
  - **17.47s** (0.99) — the product name lands
  Beat-grid window for the tile stagger in Scene 2: beats at 4.91 / 5.34 / 6.00 /
  6.56 / 7.09 / 7.64 / 8.19 / 8.74. Tiles carry no text to read, so this ~0.5s
  spacing is safe; the *caption* waits until the grid is complete.
- Audio-reactive treatment: subtle — let music RMS/bass give the tile grid a
  gentle presence and the near-black background a slight depth breath. No
  waveform, equalizer, or pulsing that touches type legibility.
- SFX posture: sparse, 4-6 cues total, motion-matched, 0.55-0.70 volume
  (polished restraint). Keypress ticks thinned and quiet.
- Audio-coupled moments: tile landing (Scene 1), first + last tile of the grid
  stagger (Scene 2), the simulated tap and the per-character typing (Scene 3),
  one soft accent on the name (Scene 4).
- Restraint rule: no sound on every tile, no impact hits, nothing percussive
  under the typed line, and no cue at all under a line the viewer is still
  reading.

## Storyboard

### Scene 1 — The button — 4.5s

Near-black `#070b14`. One large rounded tile (≈360px, sky gradient `#0284c7`,
compass glyph, label "Safari") scales 0.96 → 1.0 and settles centre-frame. A
single soft tap ripple crosses it. Then, beneath it, the hero line fades up:
**"Your phone is the button."**

Line holds settled ~1.7s (5 words) before the transition begins — this is the
hook and gets the most reading room in the video.

Sequential/interaction: yes — a simulated tap ripple on the tile, once, at ~1.1s.
Audio intent: quiet arrival; establish the bed without announcing itself.
Audio-coupled idea: one soft `interface/drop_*` on the tile settling; tile
landing biased to the 1.09s beat.
Music: low steady bed, fading in.
Transition mood: soft crossfade (0.7s) → Scene 2

### Scene 2 — The deck — 5.0s

The single tile divides into the real nine-tile deck: a 3×3 grid assembles with
tiles arriving in a stagger on the beat grid, in the app's true palette and with
its true labels — Safari, VS Code, Finder, Spotlight, Screenshot, Lock, GitHub,
YouTube, Mute. Once the grid is whole, **live status dots** fade in: green on
Safari and Finder, a cyan frontmost ring on VS Code.

Caption settles only after the grid completes: **"Nine tiles. One tap each."**
(held ~1.2s).

Sequential/interaction: yes — nine tiles appear one by one on beats 4.91→8.74;
status dots arrive as a second, softer wave after the grid is whole.
Audio intent: build without clutter — the grid should feel assembled, not
machine-gunned.
Audio-coupled idea: accent only the **first and last** tile of the stagger; let
the middle seven land silently. Grid completion locked to the **8.74s** strong cue.
Music: bed continues, slightly more present.
Transition mood: soft crossfade (0.7s) → Scene 3

### Scene 3 — Tap here, it types there — 6.0s

Split frame. Left: the phone deck, now with a violet snippet tile labelled
"Thanks reply". Right: a minimal, chrome-light Mac text window on the same dark
ground, empty, cursor blinking.

A tap lands on the snippet tile (ripple + brief press-in). A beat later, on the
Mac side, text types in character by character in mono:
**"Thanks for the quick turnaround."**

Caption, lower third: **"Tap here. It types there."** (held ~1.2s, placed so it
never competes with the typing line for attention.)

Sequential/interaction: yes — a simulated tap on the phone tile, then
per-character typing on the Mac side. This is the centerpiece: the product
doing its thing, not describing it.
Audio intent: cause and effect made audible — one deliberate tap, then a light
mechanical texture that stops cleanly.
Audio-coupled idea: `interface/click_*` on the tap; randomized `keyboard/keypress-*`
per character, thinned to roughly every other character and held at ~0.45 volume
so it stays texture rather than noise. Typing start locked to the **13.11s**
strong cue.
Music: bed steady; do not let it swell over the typing.
Transition mood: soft crossfade (0.8s) → Scene 4

### Scene 4 — Name and claim — 4.5s

The deck softens and recedes (slight scale-down and blur, staying faintly
visible as texture). Centre-frame, in order:

- **DeskAssist** — display face, light weight, generous tracking
- *Your phone is the button.* — the hero line, smaller, muted
- then one quiet line: **No cloud. No account. Sealed end-to-end.**

Final ~0.8s holds on the name with the music already fading.

Sequential/interaction: yes — three text elements arrive in order, each held to
its reading floor (name ~0.9s, hero line ~1.2s, claim line ~1.4s for 6 words).
Audio intent: land, then get out of the way.
Audio-coupled idea: one soft `interface/bong_001` as the name lands, locked to
the **17.47s** strong cue. Nothing under the claim line.
Music: fade to silence across the final 1.2s.
Transition mood: hold to black

**Scene durations:** 4.5 + 5.0 + 6.0 + 4.5 = **20.0s** ✓

**Music mood for this video:** steady, clean, quietly confident — a low bed, not
a soundtrack.

**Audio summary:** A restrained bed fades in under a single tile, gains presence
as the deck assembles to a strong cue at 8.74s, steps back for a deliberate tap
and a light typing texture at 13.11s, then accents the name once at 17.47s and
fades to silence.

## Content safety

No secrets, keys, tokens, hostnames, emails, or personal data appear in any
scene. The snippet text ("Thanks for the quick turnaround.") and the tile labels
are the app's own generic demo content. The Mac window is a neutral text surface
with no identifying chrome.
