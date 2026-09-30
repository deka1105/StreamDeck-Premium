# Devpost submission assets — Next Gen Award

Checked against the posted requirements on 30 September 2026.

## Ready to upload

| File | Size | Requirement it satisfies |
| --- | --- | --- |
| `app-icon-1024.png` | 1024×1024 | "A 1024×1024 app icon" ✅ exact |
| `sc_deck.png` | 1179×2556 | "At least one screenshot at 1179px × 2556px with no device frame" ✅ exact, and it shows the deck in use |
| `sc_snippets.png` | 1179×2556 | spare — the snippet library |
| `sc_00.png` | 1179×2556 | spare — the pairing screen (weakest of the three; it is mostly empty) |

Use **`sc_deck.png`** as the primary screenshot. All three are raw device
captures with **no device frame**, which the requirement asks for explicitly.

## Still outstanding

**Demo video.** Not recorded. The requirements are specific:

- shows the app running on the device it was built for → a physical iPhone
- **no longer than 2 minutes of essential footage**
- **uploaded to YouTube or Vimeo and publicly visible**, with the link on the form
- no third-party trademarks or copyrighted music without permission

**Record it with no music.** `brag-output/brag.mp4` must **not** be used here. It
uses a bundled track whose own README says *"Before publishing or redistributing
the skill, verify and document the exact music license terms"* — i.e. the terms
are undocumented, which is exactly what the rule excludes. A silent screen
recording, or one with your own voice-over, carries no licensing risk at all.
`brag.mp4` is still fine as a supplementary clip on the project page.

On trademarks: the default deck tiles read Safari, VS Code, Finder, Spotlight,
GitHub, YouTube. Naming an app in order to launch it is ordinary nominative use
and is how every launcher works, and the tile icons are standard Unicode emoji
rather than any company's logo — so this is low risk. If you want it airtight,
rename a few default tiles before recording.

**Free trial or promo code.** Required: *"Either a free trial in your app, or a
promo code so judges can unlock the in-app purchase and test all premium
features."*

Neither exists yet. Promo codes need approved in-app purchases, and the three
products are still `READY_TO_SUBMIT` in an unsubmitted draft — so the realistic
route is a **free trial**: App Store Connect → Subscriptions → the monthly
product → **Introductory Offer** → free trial. That can be configured now and
does not depend on the app being approved.

## Not required for Next Gen

A URL to a fully published App Store listing. The Next Gen path replaces it:
*"submit a video and source code instead of a published store listing."*

- **Source code:** https://github.com/deka1105/StreamDeck-Premium (public, MIT)
- App Store status: version 1.0.0 submitted 29 Sep, Waiting for Review

Describe it as submitted and in review. Do not paste an App Store URL that does
not resolve yet.
