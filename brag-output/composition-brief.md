# Hyperframes Composition Brief: DeskAssist

## Objective

Create a short launch-style brag video for DeskAssist — a phone app that turns
your phone into a Stream Deck for your Mac.

## Output

- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20s

## Source Material

- Project root: `/Users/shubhamarundekatey/ClaudeCode/day28/StreamDeck-Premium`
- Primary files read: `site/index.html` (voice + palette), `mobile/src/buttons.ts`
  (`TILE_COLORS`, `defaultButtons`), `mobile/App.tsx` (deck UI), `README.md`
- Product name: **DeskAssist**
- Tagline / strongest claim: **"Your phone is the button."**
- Key UI to recreate: the **3×3 deck of gradient tiles on near-black**, with live
  running / frontmost status dots — the app's actual home screen.
- Copy that must appear verbatim (all of it is the project's own):
  - `Your phone is the button.`
  - `Nine tiles. One tap each.`
  - `Tap here. It types there.`
  - `DeskAssist`
  - `No cloud. No account.`

## Creative Direction

- Tone preset: **polished**
- Creative direction: *quiet premium product film — the deck is the hero, the
  cryptography is the flex*
- Interpretation: four scenes, long settled holds, soft crossfades, light-weight
  type with generous tracking. Confident and unhurried. Nothing bounces or flashes.
- Angle: the hero line is already the pitch, so make it literal — open on one tile
  filling the frame, multiply it into the real nine-tile deck, then *prove* the
  claim by tapping a tile on the phone and having text type itself on the Mac.
  This is not a joke product; restraint sells the engineering better than hype.
- Hook: a single sky-gradient tile settling into frame, a tap ripple, then
  "Your phone is the button."
- Outro / punchline: the name, then "No cloud. No account." Nothing louder.
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign

## Visual Identity

- Background: `#070b14` (site `--ground`); deck surface `#0b1120` (app root)
- Text: `#e8eef9` (`--ink`); muted `#8a99b2` (`--muted`)
- Accent: `#46bdf6` (site `--accent`); frontmost ring `#38bdf8`; running dot `#4ade80`
- Display font: `-apple-system`/`SF Pro Display` stack (site `--sans`)
- Body/mono font: `ui-monospace`/`SF Mono`/`JetBrains Mono` (site `--mono`) — the typed line
- Real tile palette (verbatim from `TILE_COLORS`): `#0284c7` `#2563eb` `#4f46e5`
  `#7c3aed` `#c026d3` `#e11d48` `#d97706` `#475569` `#404040`
- Real tile labels (from `defaultButtons`): Safari, VS Code, Finder, Spotlight,
  Screenshot, Lock, GitHub, YouTube, Mute

## Storyboard

`brag-output/brag-plan.md` is the creative contract.

Scene summary:
1. **The button** — 4.5s — one large sky tile settles, tap ripple, then
   "Your phone is the button." held long (it's the hook).
2. **The deck** — 5.9s — nine real tiles stagger in on the beat grid; status dots
   follow; caption "Nine tiles. One tap each." only after the grid is whole.
3. **Tap here, it types there** — 5.6s — split frame: phone deck left, minimal Mac
   text window right. Caption first, then a tap on the "Thanks reply" tile, then
   the line types itself in mono on the Mac side.
4. **Name and claim** — 4.6s — deck softens behind; "DeskAssist", then
   "No cloud. No account."

**Refinement against the plan:** Scene 4's copy was shortened from three lines to
two, and Scene 3's caption moved *before* the typing rather than after. Both are
reading-floor fixes — the original Scene 4 carried 7+ words in 1.4s, which is
under the floor, and a caption competing with a typing line splits attention.
Durations now 4.5 / 5.9 / 5.6 / 4.6 = 20.0s.

## Audio

- Audio role: low steady bed with sparse, motion-matched accents
- Audio arc: fades in under a single tile → gains presence as the deck assembles →
  steps back for a deliberate tap and a light typing texture → one soft accent on
  the name → fades to silence
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (the reference's
  `polished` pick — steady and clean), 109.96 BPM
- Music treatment: start 0, volume 0.30, `data-fade-in="0.6"`, `data-fade-out="1.2"`.
  No swell gimmicks; never rises over the typed line.
- Music cue guidance: bundled preset read from
  `<skill-dir>/assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`.
  Three strong-cue locks:
  - **8.74s** (1.00 after normalisation; listed 0.99) — deck completes
  - **13.11s** (0.98) — typing begins
  - **18.56s** (0.99) — the closing claim lands
  Beat grid for the nine-tile stagger: `4.39, 4.91, 5.34, 6.00, 6.56, 7.09, 7.64,
  8.19, 8.74`. Tiles carry no text to read, so ~0.5s spacing is safe; the caption
  waits for the full grid. Product name aligned to the `16.38` beat.
- Audio-reactive treatment: **skipped, documented.** The extraction helper is owned
  by the `hyperframes-creative` skill, which is not installed in this environment
  (`~/.claude/skills/hyperframes*` absent; `npx hyperframes skills update` requires
  an agent restart to load). Per step-3 guidance, this is noted rather than blocking
  the render.
- Audio-coupled moments:
  - Scene 2, grid completion — major reveal, beat-locked
  - Scene 3, the tap — simulated user action
  - Scene 3, the typed line — thinned key texture, every 4th character
  - Scene 4, the name — one soft accent
- SFX selection guidance (all verified **low high-frequency risk** in
  `sfx-analysis.md`, per polished tone):
  - `impact/impactSoft_medium_000.ogg` @ 0.55 — grid completes (8.70s)
  - `interface/click_003.ogg` @ 0.60 — the tap (12.55s)
  - `keyboard/keypress-*.wav` @ 0.30 — typing texture, 8 hits over the 1.9s type
  - `interface/bong_001.ogg` @ 0.50 — the name (16.33s)
  Scene 1 gets **no** SFX on purpose — the music fade-in carries it, which is more
  polished than adding a sound.
- SFX analysis guidance: `<skill-dir>/assets/sfx/sfx-analysis.md` — only low-HF-risk
  files chosen, since every cue here is a polished moment.
- Audio files: copied into `brag-output/composition/assets/`

## Hyperframes Instructions

**Environment note:** the Hyperframes domain skills (`hyperframes-core`,
`-animation`, `-creative`, `-keyframes`, `-cli`) are **not installed** here, and the
scaffold's `CLAUDE.md` states newly installed skills need an agent restart to load.
The composition therefore follows the authoritative local contract instead of a
`/brag` template: `npx hyperframes docs data-attributes | gsap | compositions`, plus
the scaffolded project's own `CLAUDE.md` Key Rules. `npx hyperframes check` is the gate.

Contract points this composition must honour:

- Root: `data-composition-id="main"`, `data-width="1920"`, `data-height="1080"`
- Every timed element carries `class="clip"` + `data-start` + `data-duration`
- One **paused** root timeline registered on `window.__timelines["main"]`
- GSAP animatable properties only: `opacity, x, y, scale, scaleX, scaleY, rotation,
  width, height, visibility` — so the typewriter is a `width` tween with
  `ease: "steps(32)"` and a border-right caret, not a text plugin
- **Deterministic only** — no `Date.now()`, no `Math.random()`. Keypress SFX files
  are chosen by fixed index, not randomised.
- Audio via `<audio>` with `data-start`/`data-duration`/`data-volume`; relative
  asset paths only, never absolute
- Requirements: show real UI (the deck is recreated from `TILE_COLORS` and
  `defaultButtons`), keep all text above its reading floor, 15–25s total, run
  `hyperframes check` before render.
