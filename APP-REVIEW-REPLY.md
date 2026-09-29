# App Review — Guideline 2.1 reply (DeskAssist 1.0.0)

Four things to do, in this order. Only step 3 is the actual reply.

1. **Attach the In-App Purchases to the submission** — see [Before you reply](#before-you-reply).
2. **Replace the Notes field** — the text currently live in App Store Connect is
   the old version and contains a broken claim. See [Notes field](#notes-field).
3. **Paste [the reply](#the-reply) into Resolution Center**, with the screen recording attached.
4. Consider the two [open risks](#open-risks) below.

## Open risks

Found by auditing the live submission via the App Store Connect API on
29 Sep 2026. Neither blocks the reply, but both are cheap to fix and both sit on
guidelines Apple named in this rejection.

**The Notes field in App Store Connect is stale.** It still holds the earlier
1,287-character version, which tells the reviewer:

> Host download: https://deskassist.vercel.app

That page has no download link, and its only outbound link points at a private
GitHub repository that 404s for anyone else. A reviewer who follows it finds
nothing. Replace the field with `APP-REVIEW-NOTES.txt`, which drops the claim
and states the Mac host is optional.

**All three screenshot sets include the pairing screen.** `sc_00.png`
(iPhone 6.1"), `67_pair.png` (iPhone 6.7") and `ipad_67_pair.png` (iPad 12.9")
are the same near-empty permission screen — a title, one line of text, and a
"Grant camera access" button. Guideline 2.3.3, listed in this rejection, says
screenshots must show the actual app in use and "not merely the title art, login
page, or splash screen."

It is the third of three in each set and the other two (deck, snippets) do show
real UI, so it is not fatal. But it is the weakest asset in the listing and the
easiest thing to improve: replace it with the **Apps** screen, **edit mode**, or
the **paywall**, all of which show the product working.

Verified and *not* a problem: every screenshot is correctly sized for its slot
(iPhone 6.1" 1179×2556, iPhone 6.7" 1290×2796, iPad 2048×2732 — the `ipad_67_`
filenames are misleading but the images are genuine iPad dimensions). Demo
account correctly set to not-required, contact name/phone/email present, age
rating 4+.

**Still worth knowing:** the app declares `supportsTablet: true` and has iPad
screenshots, so **App Review will test it on iPad**. Apple's note says to test
each supported platform. If the iPad layout has not been exercised, do that
before replying — an untested iPad layout is a 2.1 bug rejection waiting to
happen. Also, build 1 declares `usesNonExemptEncryption = False` while the app
performs X25519 and AES-256-GCM; changing that needs a new build, so it stays a
next-version item.

---

## Before you reply

**Your three IAP products are not attached to this submission.** All three are
`READY_TO_SUBMIT` — created and complete, but never submitted with a version:

| Product ID | Type | Name | State |
| --- | --- | --- | --- |
| `2f5b54` | Auto-renewable, 1 month | Monthly | READY_TO_SUBMIT |
| `2f5b54_Y` | Auto-renewable, 1 year | Yearly | READY_TO_SUBMIT |
| `2f5b54_One` | Non-consumable | One-time | READY_TO_SUBMIT |

This is confirmed, not inferred. The open review submission contains exactly one
item — the app version — and no in-app-purchase or subscription items:

```
submission 801f7439-7bb2-49bc-96de-9df0ebadfc82
  state     = UNRESOLVED_ISSUES     (this is the one you reply to)
  submitted = 2026-09-28T12:58:52Z
  items (1) = REJECTED  <app version only>
  >>> NO IAP / SUBSCRIPTION ITEMS IN THIS SUBMISSION
```

It matters because Apple is asking you to demonstrate "accessing paid content
or features," and their own note flags it:

> Guideline 3.1.1 – In-App Purchase: In-App Purchase products should be
> configured and submitted alongside the app.

If you reply without fixing this, the reviewer reaches a paywall whose products
aren't in review with the build.

### This must be done in the web UI — there is no API route

Both API approaches were tried and neither works:

1. **`reviewSubmissionItems`** has no IAP relationship. It accepts only
   `appStoreVersion`, `appEvent`, `appCustomProductPageVersion`,
   `appStoreVersionExperiment`, `appStoreVersionExperimentV2` — confirmed by
   probing each name. Attempts returned
   `409 ENTITY_ERROR.RELATIONSHIP.UNKNOWN`.
2. **`inAppPurchaseSubmissions` / `subscriptionSubmissions`** returned
   `409 STATE_ERROR.INVALID_REQUEST_ENTITY_STATE_INVALID` for all three. Those
   endpoints submit a product *standalone*, which requires an app that is
   already approved on the App Store. 1.0.0 is a first version and is
   `REJECTED`, so there is nothing to attach a standalone product submission to.

Nothing was changed by either attempt — all three products remain
`READY_TO_SUBMIT` and the submission still holds one item.

**The products themselves are complete**, so the UI route will not hit a
validation wall:

| Product | Localization | Price | Review screenshot |
| --- | --- | --- | --- |
| `2f5b54_One` | "Pro Lifetime" + description | schedule set | `COMPLETE` |
| `2f5b54` | "Pro Monthly" + description | all countries | `COMPLETE` |
| `2f5b54_Y` | "Pro Yearly" + description | all countries | `COMPLETE` |

Subscription group localization ("DeskAssist Pro") is present.

### Steps

1. Open **[appstoreconnect.apple.com](https://appstoreconnect.apple.com)** and
   sign in with the developer account for team **4LX3D498MB** (the Account
   Holder address). Any Admin on the team can do this step, but signing in as
   the Account Holder avoids permission surprises.

2. **Apps** → **DeskAssist**.

3. Make sure you are on the **App Store** tab (top row, next to *TestFlight*).

4. In the **left sidebar**, under the **iOS App** heading, click the version
   row — it reads **1.0.0** and is marked *Rejected*. Rejected versions stay
   editable, so this page will let you change things.

5. Scroll down that page to the section titled **In-App Purchases and
   Subscriptions**. It sits below *Build* and above *App Review Information*.
   (On some accounts it is still labelled just **In-App Purchases**.)

6. Click the **＋** button in that section — or **Select In-App Purchases and
   Subscriptions** if the section is currently empty.

7. A picker opens listing everything eligible. Tick **all three**:

   | Shown as | Product ID |
   | --- | --- |
   | Pro Monthly | `2f5b54` |
   | Pro Yearly | `2f5b54_Y` |
   | Pro Lifetime | `2f5b54_One` |

   All three are `READY_TO_SUBMIT` and fully configured, so all three will
   appear. If any is missing from the list, stop — something changed since this
   was written and it needs re-checking.

8. Confirm with **Done** / **Add**.

9. Click **Save** at the top right. Wait for the confirmation before leaving the
   page — navigating away early silently discards it.

10. Reload the page and check the section still lists all three. ASC will
    occasionally accept a Save and drop it.

### Then reply

Attaching them is a change to the submission, so do it **before** replying in
Resolution Center, and reply afterwards.

One thing to watch for at that point: if, after saving, the version page shows
an active **Add for Review** / **Submit for Review** button, App Store Connect
wants the amended submission re-sent rather than just a Resolution Center
message. In that case reply in Resolution Center **and** press it. If no such
button appears, the Resolution Center reply alone is correct — the review is
paused waiting on your response, not on a new submission.

### Verifying it worked

The clean signal is the product state. All three currently read
`READY_TO_SUBMIT`; once they are attached and the submission goes in, they move
to `WAITING_FOR_REVIEW` (then `IN_REVIEW`). That is checkable without the UI —
ask Claude to re-run the state check, or watch the badges next to each product
under **Monetization → Subscriptions / In-App Purchases**.

**Other confirmed submission facts:**

| | |
| --- | --- |
| Version 1.0.0 | `REJECTED` — editable, so you can fix and reply |
| Submission `801f7439…` | `UNRESOLVED_ISSUES` — still open; **reply to it, don't create a new one** |
| Build attached | **build 1**, uploaded 24 Sep, `VALID`, not expired |
| Build 1 on TestFlight | yes — `IN_BETA_TESTING`, group "Team (Expo)" → install and record this one |

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

**Additional notes on the points under "Prevent Common Issues"**

- **Testing on physical devices:** the submitted build (build 1) was installed
  from TestFlight and exercised on a physical iPhone and a physical iPad running
  the current iOS/iPadOS release, covering the full flow shown in the recording.
- **Demo account:** none is needed. The app has no accounts, so there are no
  credentials to provide. "Demo Account Required" is set to No accordingly.
- **Distribution model:** DeskAssist is a general-consumer utility sold on the
  public App Store. It is not built for specific businesses, organizations or
  employees, so no alternative distribution programme applies.

Please let us know if anything further would help.

---

## Notes field

> App Store Connect → App Review Information → **Notes**. Also in
> `APP-REVIEW-NOTES.txt`.

See `APP-REVIEW-NOTES.txt` in the repository root — paste its contents verbatim.

---

## Screen recording shot list

Apple requires a **physical device** on the **latest iOS** — not the simulator.

**Record build 1, via TestFlight.** Build 1 (uploaded 24 Sep) is the build
attached to version 1.0.0, and it is already live in TestFlight internal testing
(group "Team (Expo)") — open the TestFlight app on your iPhone and install it.
Do not record a local `expo run:ios` build; that is a different binary from the
one in review, which is exactly what Apple is asking you to test.

Two timing details that will make or break the take:

- **Auto mode changes the focused app every 6 seconds**, on an arbitrary phase
  (`ROTATE_MS = 6000` in `src/demo.ts`). Hold that screen 12–15s so at least one
  change is definitely captured — a 5-second hold can show nothing and look
  broken.
- **The snippet limit is 3 and you currently have 1.** The paywall appears on the
  *fourth* snippet, so you need three saves to reach it.

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
| 8 | Header → **Auto**. **Hold for a full 12–15 seconds** without touching anything | Auto mode, the headline feature |
| 9 | Header → **Edit**. Add a tile, edit one, drag to reorder, delete one | Full editing |
| 10 | Still in Edit, try to add a **second page** → paywall opens | **Paid feature, triggered by a limit** |
| 11 | On the paywall, show all three options (monthly / yearly / one-time) | Shows the IAP products |
| 12 | Close the paywall, tap the **Pro** pill in the header → paywall again | Second, direct route to purchase |
| 13 | Snippets → keep tapping **＋ New** and saving. The 2nd and 3rd save fine; the **4th** opens the paywall | Shows limits are real and consistent |
| 14 | Return to the deck and end on it | Clean close |

Things to avoid: don't show the simulator, don't cut between takes, don't leave
a screen up for under a second, and don't start the recording after the app is
already open.

If you can complete an actual sandbox purchase on camera, do it at step 11 — a
completed purchase answers "accessing paid content" more convincingly than a
paywall screenshot. This requires the IAPs to be attached to the submission
(see [Before you reply](#before-you-reply)) and a Sandbox Apple ID signed in
under Settings → App Store → Sandbox Account.
