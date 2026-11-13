# Reply — submission b57c512c-73d0-4347-9c59-2e0d5a0e6918 (rejected 13 Nov 2026)

Guideline 2.1(b) — error on the In-App Purchase page.
Guideline 3.1.2(c) — missing Terms of Use / Privacy Policy links.
Reviewed on iPad Air 11-inch (M3), iPadOS 27.2.1, version 1.0.0 build 8.

**Resolved by removing in-app purchases entirely**, decided 13 Nov 2026. Both
guidelines stop applying to an app that sells nothing: there is no purchase
screen left to show an error, and 3.1.2(c) governs auto-renewable subscriptions,
of which there are now none. It also removes the dependency on the Paid
Applications Agreement, which was never completed and was the root cause of the
2.1(b) rejection.

---

## What was removed

**App** (`mobile/`, shipped in **build 10** — build 8 still contains all of this):

- `src/Paywall.tsx`, `src/ProProvider.tsx`, `src/purchases.ts` — deleted
- `react-native-purchases` — uninstalled; no payment SDK in the binary
- all four free-tier limits — profiles, pages, snippets and image tile faces are
  now unlimited for everyone
- the **✦ Pro** header pill, the `＋ New ✦` / `＋ Profile ✦` locked states, and
  every `showPaywall()` call site across `App.tsx`, `TileEditor.tsx` and
  `SnippetLibrary.tsx`
- `.env.example` — deleted; nothing reads `EXPO_PUBLIC_*` any more

**App Store Connect** (done via the API, verified):

- description — the Pro tier, the subscription terms and the EULA link replaced
  with an "EVERYTHING IS FREE" section
- App Review notes — rewritten to state there are no in-app purchases

**Website** (live on GitHub Pages):

- pricing section — now a single free tier
- privacy policy — the RevenueCat data-processing section replaced with "there
  are none"
- terms of use — the subscription section replaced with a price statement

## Still to do by hand

1. ~~**Remove the three products from the version in App Store Connect.**~~
   **Done 13 Nov 2026.** The rejected submission was cancelled in the web UI,
   which released all five review-submission items (now `REMOVED`) — the API
   had refused with `409 STATE_ERROR.ENTITY_STATE_INVALID`. Version 1.0.0 is
   back to `PREPARE_FOR_SUBMISSION`, and Monthly (`2f5b54`), Yearly
   (`2f5b54_Y`) and the one-time product (`2f5b54_One`) are unsubmitted
   `READY_TO_SUBMIT` drafts attached to nothing.

2. ~~**Upload build 9.**~~ **Superseded by build 10**, uploaded 13 Nov 2026 and
   `VALID`. Build 10 also carries the new chevron app icon and declares
   `ITSAppUsesNonExemptEncryption: false` in its Info.plist, so it needed no
   manual export-compliance answer. It is attached to version 1.0.0.

3. **Record the walkthrough Apple asked for**, on a physical device, one take,
   starting at app launch. The shot list in `APP-REVIEW-REPLY.md` still applies
   minus every paywall step; add instead: add a second profile, add a second
   page, save a fourth snippet, and set an image tile face — the four things
   that used to hit a wall and now just work. This is also the first real test
   of build 10; nothing has run it yet.

4. **Send the reply below** with the recording attached, then submit for review.

Optional: the Paid Applications Agreement is no longer needed for this release.
If Pro ever comes back, that agreement is the first step, not the last.

---

## The reply

Hello,

Thank you for the review. Both issues are resolved in build 10, now uploaded.

**Guideline 2.1(b) — error on the In-App Purchase page**

You were right that the purchase screen did not work. Rather than repair it, we
have removed in-app purchases from DeskAssist altogether.

Build 10 contains no paywall, no purchase screen and no payment SDK. Every
feature that was previously paid — unlimited profiles, unlimited pages,
unlimited snippets and custom image tile faces — is now available to everyone at
no cost. The three in-app purchase products have been removed from this version
and nothing in the binary references them. There is no purchase flow left that
could present an error.

**Guideline 3.1.2(c) — subscription information and links**

DeskAssist no longer offers an auto-renewable subscription, or any in-app
purchase, so the subscription disclosure requirements no longer apply.

We have nonetheless fixed the underlying fault, which was worse than a missing
link: our website host had disabled the deployment, so every link pointing at it
— the Terms of Use and Privacy Policy in the app, and the Privacy Policy,
Support and Marketing URLs in App Store Connect — was returning an HTTP error.
The links existed in the build; they simply no longer resolved, which is why we
did not catch it.

Both documents have been moved to a host with no payment dependency and are
verified publicly reachable:

- Privacy Policy: https://deka1105.github.io/StreamDeck-Premium/privacy.html
- Terms of Use: https://deka1105.github.io/StreamDeck-Premium/terms.html

The Privacy Policy URL in App Store Connect now points at the first of these,
as do the Support and Marketing URLs. Both documents have been updated to state
that the app contains no purchases and sends no data to any payment processor.

English is our only localization, so this is complete for every localization.

The app still requires no account, and a reviewer still needs no Mac — tapping
"Explore the demo instead" on the first screen runs the entire app against a
simulated computer.

Thank you for your patience with this one.

Best regards,
Parag Dekatey
