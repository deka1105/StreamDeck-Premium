# App Review — Guideline 2.1 reply (DeskAssist 1.0.0)

Three things to do, in this order. Only step 2 is the actual reply.

1. **Attach the In-App Purchases to the submission** — see [Before you reply](#before-you-reply).
2. **Paste [the reply](#the-reply) into Resolution Center**, with the screen recording attached.
3. **Paste [the notes](#notes-field) into** App Store Connect → App Review Information → Notes.

---

## Before you reply

**Your three IAP products are not attached to this submission.** All three are
`READY_TO_SUBMIT` — created and complete, but never submitted with a version:

| Product ID | Type | Name | State |
| --- | --- | --- | --- |
| `2f5b54` | Auto-renewable, 1 month | Monthly | READY_TO_SUBMIT |
| `2f5b54_Y` | Auto-renewable, 1 year | Yearly | READY_TO_SUBMIT |
| `2f5b54_One` | Non-consumable | One-time | READY_TO_SUBMIT |

This matters because Apple is asking you to demonstrate "accessing paid content
or features," and their own note flags it:

> Guideline 3.1.1 – In-App Purchase: In-App Purchase products should be
> configured and submitted alongside the app.

If you reply without fixing this, the reviewer reaches a paywall whose products
aren't in review with the build. Fix it first:

App Store Connect → **App Store** tab → the **1.0.0** version page → scroll to
**In-App Purchases and Subscriptions** → **Add** → select all three → Save.

They then go to review together with the build.

---

## The reply

> Paste everything below into Resolution Center, and attach the screen recording.

Thank you for the review. Answers to each point follow.

**1. Screen recording**

Attached. It is captured on a physical iPhone running the latest iOS, begins at
app launch, and shows the typical user flow.

Please note the following about the flows you listed:

- **Account registration / login / deletion:** DeskAssist has no accounts of any
  kind. There is no sign-up, no sign-in, no profile, and no server-side user
  record, so there is no account-deletion flow to show. Nothing needs to be
  created or logged into to reach full functionality.
- **User-generated content:** none is shared. Snippets, tile labels and tile
  images are stored only on the device and are never uploaded or made visible to
  any other user. There is no feed, no messaging and no social surface, so there
  is no content to report or block.
- **Paid content:** shown in the recording. The paywall is opened and each
  free-tier limit that triggers it is demonstrated.

**Important for reviewing this app:** DeskAssist is a companion app that
controls a computer, and a reviewer will not have the companion Mac app running.
For that reason the app includes a complete simulated mode. On the first screen,
tap **"Explore the demo instead"** and the entire app runs against a simulated
Mac — the deck responds to taps, the running-apps list populates, Auto mode
reacts to a rotating focused app, and the snippet library sends text and reports
the result. A standing banner makes clear it is a simulation. No Mac, no
pairing, no network access and no account are required.

**2. Purpose and target audience**

DeskAssist turns an iPhone into a physical-style control surface for your
computer — a grid of tiles where one tap launches an application, opens a URL,
sends a keyboard shortcut, or types a saved block of text on the computer in
front of you.

*The problem it solves:* dedicated hardware control decks cost $100–250 and sit
permanently on your desk. Almost everyone who wants one already owns a
touchscreen that is already sitting next to their keyboard. DeskAssist replaces
the hardware with the phone you already have.

*Target audience:* people who repeat the same computer actions all day —
developers, streamers, video editors, designers, support and finance staff who
retype the same replies, and anyone who prefers one tap to a memorized keyboard
shortcut.

*Value:* fewer keystrokes and no context switching for routine actions; a
configurable surface that changes automatically depending on which application
is in the foreground; and saved text sent to the computer with a single tap.

**3. Setting up and accessing the main features**

No login credentials and no sample files are required. There is no account.

To review every feature on the device alone:

1. Launch the app. The pairing screen appears.
2. Tap **"Explore the demo instead"** (below the camera button). No camera
   permission or network access is needed.
3. The deck appears — a 3×3 grid of tiles. **Tap any tile**; the status line
   under the header reports the simulated result.
4. **Snippets** — tap *Snippets* in the header. Tap a saved snippet to send it;
   **＋ New** adds one.
5. **Apps** — tap the display icon in the header for the simulated list of
   running applications. Tap one to focus it, **＋** to pin it as a tile.
6. **Auto mode** — tap *Auto*. The active profile follows a rotating simulated
   foreground application.
7. **Edit mode** — tap *Edit* to add, edit, delete, drag-reorder and resize
   tiles, and to add pages and profiles.
8. **In-App Purchase** — tap the **Pro** pill in the header, or reach any
   free-tier limit: a second profile, a second page, a fourth snippet, or an
   image tile face. Free allows 1 profile, 1 page, 3 snippets and emoji/text
   tile faces; Pro removes all four limits.

Using it with a real computer is optional and not required for review. The
companion Mac app displays a QR code; scanning it pairs the two devices over the
local network.

**4. External services, tools and platforms**

The app has no backend of ours. There is no server we operate in the data path.

| Service | Used for |
| --- | --- |
| **Apple In-App Purchase** | all payments; the only payment path in the app |
| **RevenueCat** | reads and caches the purchase entitlement returned by Apple |
| **Expo / React Native** | application framework (no hosted service at runtime) |

Not used: no analytics or crash-reporting SDK, no advertising SDK, no
authentication provider, no AI or machine-learning service, no data provider, no
cloud storage, and no third-party payment processor.

All cryptography is performed locally on the device using the open-source
`@noble` libraries (X25519 key exchange, HKDF, AES-256-GCM). Tile layouts,
snippets and images are stored locally via the iOS keychain and on-device
storage. When paired with a real computer, traffic goes directly from the phone
to that computer over the user's own local network.

**5. Regional differences**

There are none. The app functions identically in every region: no geo-gating, no
region-specific content or features, no regional pricing logic in the app (App
Store pricing is handled by Apple), and no region-restricted services. The
interface is English only.

**6. Regulated industry / third-party material**

The app does not operate in a regulated industry. It handles no health,
financial, medical or government data, and provides no regulated service.

It contains no protected third-party material. Tile labels such as "Safari" or
"VS Code" are user-editable text naming an application on the user's own
computer; the default tiles use standard Unicode emoji as icons, not any
third-party logos, trademarks or artwork. All code and assets are our own or
open-source under permissive licenses.

Please let us know if anything further would help.

---

## Notes field

> App Store Connect → App Review Information → **Notes**. Also in
> `APP-REVIEW-NOTES.txt`.

See `APP-REVIEW-NOTES.txt` in the repository root — paste its contents verbatim.

---

## Screen recording shot list

Apple requires a **physical device** on the **latest iOS** — not the simulator.
Install the submitted build through TestFlight so the recording matches what is
in review.

Start the recording **before** launching the app, keep it in one continuous
take, and don't rush: let each screen settle for about two seconds so the
reviewer can read it. Target 2–3 minutes.

| # | Action | Why it's in here |
| --- | --- | --- |
| 1 | Home screen, tap the DeskAssist icon, let it launch | Apple requires the recording to begin with launch |
| 2 | Pairing screen — pause ~3s, then tap **"Explore the demo instead"** | The single most important moment: proves no Mac is needed |
| 3 | Deck appears. Tap **Safari**, then **Spotlight**, then **Screenshot** | Core loop; the status line shows each result |
| 4 | Point out the demo banner (hold ~2s) | Shows the simulation is disclosed, not deceptive |
| 5 | Type into the **Send text** bar, tap **Send** | The send-text feature |
| 6 | Header → **Snippets**. Tap a snippet to send it. Tap **＋ New**, save one | Shows snippets are local-only, no sharing surface |
| 7 | Header → display icon (**Apps**). Tap an app to focus, **＋** to pin one | Live host state |
| 8 | Header → **Auto**. Wait ~5s for the simulated foreground app to change | Auto mode, the headline feature |
| 9 | Header → **Edit**. Add a tile, edit one, drag to reorder, delete one | Full editing |
| 10 | Still in Edit, try to add a **second page** → paywall opens | **Paid feature, triggered by a limit** |
| 11 | On the paywall, show all three options (monthly / yearly / one-time) | Shows the IAP products |
| 12 | Close the paywall, tap the **Pro** pill in the header → paywall again | Second, direct route to purchase |
| 13 | Add a 4th **snippet** → paywall opens with the snippet-limit message | Shows limits are real and consistent |
| 14 | Return to the deck and end on it | Clean close |

Things to avoid: don't show the simulator, don't cut between takes, don't leave
a screen up for under a second, and don't start the recording after the app is
already open.

If you can complete an actual sandbox purchase on camera, do it at step 11 — a
completed purchase answers "accessing paid content" more convincingly than a
paywall screenshot. This requires the IAPs to be attached to the submission
(see [Before you reply](#before-you-reply)) and a Sandbox Apple ID signed in
under Settings → App Store → Sandbox Account.
