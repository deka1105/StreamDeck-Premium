# Reply — submission b57c512c-73d0-4347-9c59-2e0d5a0e6918 (rejected 13 Nov 2026)

Guideline 2.1(b) — error on the In-App Purchase page.
Guideline 3.1.2(c) — missing Terms of Use / Privacy Policy links.
Reviewed on iPad Air 11-inch (M3), iPadOS 27.2.1, version 1.0.0 build 8.

**Do not send this until steps 1–3 below are actually done.** Every previous
rejection on this app was made worse by replying ahead of the fix.

---

## What caused each rejection

### 2.1(b) — "the app displayed an error message in In-App Purchase page"

StoreKit returned no products, so the paywall had nothing to show and said so.
Everything that *can* be verified through the App Store Connect API is correct:

| Product | Id | State | Review screenshot | Territories | Prices |
| --- | --- | --- | --- | --- | --- |
| Pro Monthly | `2f5b54` | READY_TO_SUBMIT | COMPLETE | 175 (incl. USA) | 175 rows |
| Pro Yearly | `2f5b54_Y` | READY_TO_SUBMIT | COMPLETE | 175 (incl. USA) | 175 rows |
| Pro Lifetime | `2f5b54_One` | READY_TO_SUBMIT | COMPLETE | 175 (incl. USA) | schedule set |

All three are attached to this submission — it holds five items: the app version
plus the subscription group, both subscriptions and the one-time purchase, each
at `READY_FOR_REVIEW`. That was the gap in the September rejection and it is
closed.

**What is left is the Paid Applications Agreement.** Without it in effect,
StoreKit serves zero products in sandbox *and* production regardless of how the
products are configured — which is exactly the symptom, and exactly what Apple's
own message points at ("the Account Holder must also accept the Paid Apps
Agreement … Confirm you have a Paid Apps Agreement in effect"). `BACKLOG.md §1.1`
recorded it as not active on 13 October and nothing since has changed it. There
is no API for agreements; only the Account Holder can sign it.

### 3.1.2(c) — missing Terms of Use and Privacy Policy links

The links were present but **dead**. Every page on `deskassist.sdfolio.com` and
`deskassist.vercel.app` was returning `HTTP 402 DEPLOYMENT_DISABLED` — the Vercel
project had been switched off. That killed, simultaneously:

- the paywall's Terms and Privacy links,
- the Privacy Policy URL in App Store Connect,
- the Support URL and Marketing URL (a guideline 1.5 rejection waiting to happen).

Fixed by moving the canonical copies to GitHub Pages, which has no billing state
that can lapse. All verified 200.

---

## Steps, in order

1. **Sign the Paid Applications Agreement.** App Store Connect → Business →
   Agreements, Tax and Banking. Needs the Account Holder, plus bank and tax
   details. Nothing below matters until this shows *Active*.

2. **Confirm the paywall loads prices** on a physical device with a Sandbox
   Apple ID signed in under Settings → App Store → Sandbox Account. Three rows
   with real prices, no notice. If it still shows "Pro isn't available for
   purchase yet", stop — the agreement has not propagated and replying is futile.

3. **Upload build 9** (`eas build -p ios --profile production`). Build 8 still
   carries the dead `deskassist.sdfolio.com` links, so build 8 cannot pass
   3.1.2(c) no matter what the metadata says.

4. **Record the screen recording Apple asked for** on a physical device, in one
   take, beginning at app launch. Shot list in `APP-REVIEW-REPLY.md`; the two
   additions this time are: tap **Terms** and **Privacy** on the paywall and let
   each page load on camera, and complete a sandbox purchase.

5. **Paste the reply below** into Resolution Center with the recording attached.

---

## The reply

Hello,

Thank you for the review. Both issues are resolved; build 9 is now uploaded.

**Guideline 2.1(b) — error on the In-App Purchase page**

Our Paid Applications Agreement was not in effect when you reviewed build 8, so
StoreKit returned no products and the purchase screen had nothing to display.
The agreement is now active. All three products — DeskAssist Pro Monthly, Pro
Yearly and Pro Lifetime — are attached to this submission, available in all 175
territories, with prices and review screenshots complete. We have confirmed on a
physical device with a sandbox account that the paywall now loads all three
prices and that a purchase completes and unlocks Pro. The screen recording shows
this end to end.

We have also changed how the screen behaves if the store is ever unreachable: it
now states plainly that Pro is not available for purchase and offers to check
again, rather than surfacing a store error. The free tier is fully functional
either way.

**Guideline 3.1.2(c) — subscription information and links**

You were right, and the cause was worse than a missing link: our website host had
disabled the deployment, so every link to it — the Terms of Use and Privacy
Policy on the paywall, and the Privacy Policy, Support and Marketing URLs in App
Store Connect — was returning an HTTP error. We did not catch it because the
links existed in the build; they simply no longer resolved.

Both documents have been moved to a host with no payment dependency and verified
publicly reachable. Build 9 links to them from the purchase screen, where they
are visible without scrolling:

- Terms of Use: https://deka1105.github.io/StreamDeck-Premium/terms.html
- Privacy Policy: https://deka1105.github.io/StreamDeck-Premium/privacy.html

The App Store Connect metadata now carries the Privacy Policy URL in the Privacy
Policy field, and the App Description carries a link to the standard Apple Terms
of Use (EULA), which is the EULA this app uses.

The purchase screen itself now states the title, the length and the price of each
option — Pro Monthly (auto-renews every 1 month), Pro Yearly (auto-renews every
1 year, with the price shown per month as well) and Pro Lifetime (one-time, never
renews) — together with the renewal and cancellation terms. That text is on the
screen whether or not prices have loaded.

English is our only localization, so this is complete for every localization.

Thank you for your patience with this one.

Best regards,
Parag Dekatey
