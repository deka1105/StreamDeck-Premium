# DeskAssist — post-submission backlog

Everything found during the Shipaton push, ordered by what it costs you if left
alone. Each item names where it lives so it can be picked up cold.

Status as of 13 November 2026: iOS 1.0.0 **build 8** was submitted (7 Nov) and
**rejected on 13 Nov** — guideline 2.1(b) (error on the In-App Purchase page)
and 3.1.2(c) (dead Terms/Privacy links). Submission
`b57c512c-73d0-4347-9c59-2e0d5a0e6918`, state `UNRESOLVED_ISSUES`, reviewed on an
iPad Air 11-inch (M3). · Play listing **Live**, closed-testing Alpha running
since Oct 11 on versionCode 1 with **0 of 12 testers** · repo public (MIT) ·
site **moved to GitHub Pages** (§1.6).

**In-app purchases were removed entirely on 13 November 2026.** Both rejections
stop applying to an app that sells nothing, and the removal breaks the
dependency on the Paid Applications Agreement — never completed, and the root
cause of 2.1(b). What this cost and what it left to do: §1 below, and
`Extras/app-review/reply-2.1b-and-3.1.2c.md` for the reply and the manual steps.

---

## 1. Shipping the free version

### 1.1 Paid Applications agreement — NO LONGER NEEDED
It was never signed, so StoreKit returned no products, so the paywall showed an
empty store, so App Review rejected under 2.1(b) on 13 Nov 2026. With no in-app
purchases there is nothing to gate on it.

Everything else about the three products was verified correct via the API —
`READY_TO_SUBMIT`, attached to the submission at `READY_FOR_REVIEW`, review
screenshots `COMPLETE`, 175 territories including USA, full price schedules — so
the agreement really was the only cause. **If Pro ever returns, this is step
one, not step last:** App Store Connect → Business → Agreements, Tax, and
Banking, Account Holder only, no API.

### 1.2 Remove the three products from the version — MANUAL, BLOCKS BUILD 9
The products are still attached to submission `b57c512c` and must come off the
version before it goes back for review.

**No API route.** `DELETE /v1/reviewSubmissionItems/{id}` returns
`409 STATE_ERROR.ENTITY_STATE_INVALID — "Item was already submitted"` for all
four non-version items (tried 13 Nov; nothing changed). Web UI only: Apps →
DeskAssist → App Store tab → version **1.0.0** → **In-App Purchases and
Subscriptions** → deselect Pro Monthly (`2f5b54`), Pro Yearly (`2f5b54_Y`) and
Pro Lifetime (`2f5b54_One`) → **Save**.

The products can stay as drafts under Monetization. Nothing in the binary
references them.

### 1.3 Build 9 is required
Build 8 still contains the paywall, the RevenueCat SDK and the dead
`deskassist.sdfolio.com` links. No amount of metadata editing fixes a binary.
`eas build -p ios --profile production`.

### 1.4 Google Payments merchant account — NO LONGER NEEDED
Was blocking Play in-app products. With no in-app purchases on either platform,
it is moot. (Was: Monetize → Products locked behind "You need to set up a Google
Payments merchant account.")

### 1.5 Closed testing needs 12 testers for 14 days
Unchanged and still the longest pole on Android. The Alpha track has been live
since Oct 11 (full rollout, 178 regions) but sits at **0 testers opted-in**.
Production access requires 12 opted-in testers running for 14 continuous days,
and the clock does not start until the twelfth person joins.

### 1.6 The website host was disabled — caused the 3.1.2(c) rejection
Every page on `deskassist.sdfolio.com` *and* `deskassist.vercel.app` was
answering **HTTP 402 `DEPLOYMENT_DISABLED`**: the Vercel project had been
switched off. That broke, at once, the paywall's Terms and Privacy links, the
Privacy Policy URL in App Store Connect, and the Support and Marketing URLs —
which is both the 3.1.2(c) rejection and a guideline 1.5 rejection waiting to
happen.

Worth knowing: the `deskassist` Vercel project sits under org
`team_4ZQ0ZjkOfXtsefK0Txbwh08b`, **not** the `philamentos` account the local
`vercel` CLI is signed into. Recovering it means finding that account first.

**Fixed, canonically, on GitHub Pages** — no billing state that can lapse:

- `.github/workflows/pages.yml` publishes `site/` on every push to `main`
- live at <https://deka1105.github.io/StreamDeck-Premium/> (verified 200)
- App Store Connect updated via the API: Privacy Policy URL, Support URL and
  Marketing URL
- `site/` rewritten for the free app: pricing section, the privacy policy's
  RevenueCat section, and the terms' subscription section

Restoring Vercel is optional and now a marketing-site concern only. If it comes
back it must not become the only copy again. A custom domain (Hostinger or
otherwise) can point at Pages instead.

### 1.7 Shipaton eligibility is forfeited
`Extras/devpost/DEVPOST-SUBMISSION.md` records that Shipaton requires the
RevenueCat SDK and at least one in-app purchase. DeskAssist now has neither, so
the Next Gen Award submission no longer qualifies. This was a known, accepted
cost of shipping free — not an oversight. The Devpost write-ups in
`Extras/devpost/` still describe the monetized app and are now historical.

---

## 2. Blocks a clean release

### 2.1 The Expo placeholder icon — fixed in build 8
The stock template icon — concentric circles, dashed diagonals, a centre
crosshair — came in with the scaffold (`d1cd258`) and is the icon on the App
Store submission.

Every *source* is now the nine-tile deck on the `#0ea5e9 → #6366f1` brand
gradient:
- `mobile/assets/icon.png` (full-bleed 1024, opaque) → done, `79f53f6`
- `desktop/build/icon.png` (824 artwork on 1024 transparent, 22.5% radius) → done
- `site/app-icon.png`, `Extras/devpost/assets/app-icon-1024.png` → done
- Android adaptive foreground/background/monochrome → done
- `Extras/play-assets/play-icon-512.png` → done, downscaled from `assets/icon.png`
  so the two stores show identical artwork

**What remains is a rebuild, not an asset.** `mobile/ios/` is gitignored, and its
asset catalog was generated on Sep 29 — before the redesign — so it froze the
placeholder and no later build refreshed it. The local catalog has been
overwritten by hand, and `expo prebuild -p ios` regenerates it correctly from
`assets/icon.png`. Until build 7 ships, the App Store listing keeps the
placeholder. Android is unaffected: its launcher res was regenerated after the
redesign (Oct 9 15:28 vs sources at 15:26).

### 2.2 Export-compliance declaration — corrected in build 8
`ITSAppUsesNonExemptEncryption` was `false` through build 7, which was wrong:
`mobile/src/crypto.ts` bundles `@noble/*` and performs X25519 key agreement,
HKDF-SHA256, HMAC-SHA256 and AES-256-GCM on every command. The usual exemption
covers apps that only *call* Apple's platform crypto; bundling an
implementation does not qualify. Set to `true` in build 8.

**`true` in the plist is not uploadable without a code.** Tried in build 8 and
Apple's validator rejected the package outright:

```
VERIFY FAILED with 1 error
90592: Invalid Export Compliance Code. The export compliance key value []
in the app's Info.plist doesn't match the key value of the app's export
compliance documentation.
```

Setting `ITSAppUsesNonExemptEncryption: true` makes
`ITSEncryptionExportComplianceCode` mandatory, and the code has to match
documentation already filed on Apple's side. There is none, so the value was
empty and `altool --validate-app` failed before any upload.

**What shipped instead:** the key is now **absent** from `infoPlist`. That is not
a false declaration — it hands the question to App Store Connect, which asks for
export-compliance information during submission and accepts an answer there
without a pre-existing code. `false` (builds 1–7) was the actual misstatement.

Still outstanding, and unavoidable for an app that bundles its own crypto:

- Answer Apple's export-compliance questions honestly at each submission.
- The durable fix is a CCATS/ERN code from BIS; once it exists it goes in
  `ITSEncryptionExportComplianceCode` and the prompts stop.
- Failing that, the route is an annual **self-classification report** to BIS
  (`crypt-supp8@bis.doc.gov`) and the NSA (`enc@nsa.gov`) listing the product
  and its algorithms — an email, not an application, but it recurs yearly.
- France has a separate local declaration Apple surfaces for apps sold there.

### 2.3 The two stores run different code
The bundle on Play is versionCode 1 from Oct 9. Apple's guideline 5.1.1(iv) fix
on Oct 13 — the camera button renamed "Grant camera access" to "Continue", the
neutral permission line, and the Settings fallback in `mobile/App.tsx` — is in
iOS build 8 but **not** in the Android bundle. `app.json` already carries
`versionCode: 2` for the next upload.

Left deliberately: Google never objected to the old wording, and replacing the
bundle would mean cutting a new release on a closed test that only just went
live. Ship the parity fix with the next Android build rather than disturbing a
running test.

### 2.4 The macOS DMG cannot be built
`npm run dist:mac:release` deadlocks in electron-builder's signing stage: twice
observed at 0% CPU with no `codesign` child, ~22 minutes, keychain unlocked and
`no-timeout`. Everything around it is correct — Developer ID Application cert
installed, identity pinned, `check:signing` green, notarize hook accepting API-key
credentials.

Next things to try: pin the certificate SHA-1 instead of the name; sign the
bundle manually outside electron-builder; or `--docker` for a deterministic
environment.

### 2.5 No release, so the README download link is dead
No GitHub release exists. The README's **Download** section points at
`/releases/latest`, which 404s. Blocked on 2.3; once a notarized DMG exists:

```bash
gh release create v0.1.1 desktop/dist/DeskAssist-0.1.1.dmg \
  --title "DeskAssist 0.1.1 (macOS host)" \
  --notes "Signed and notarized. Opens normally on macOS."
```

---

## 3. Correctness and first-run experience

### 3.1 The app allowlist defaults closed with no seeding
`desktop/src/host.mjs:242` blocks every `app` action not in the allowlist. On a
fresh install the list is empty, so **every app tile on the default deck fails**
until the user discovers tray → Allowed apps. The phone surfaces the reason in
its status line, but it reads as "the app is broken".

Fix: seed the allowlist from the default deck's `app` targets on first pair, or
prompt once on the first blocked action.

### 3.2 Accessibility denial degrades silently in two places
Fixed for `keys` / `text` — `desktop/src/executor.mjs` now translates error 1002
and -1719 into an instruction naming the remove-and-re-add step.

Still silent:
- `runningApps()` catches the failure and returns `[]`, so the Apps screen just
  looks empty
- `frontmostApp()` fails the same way, so Auto mode never fires

Both should report "Accessibility not granted" so the phone can say so. Note the
permission is bound to the app's **code signature**, so any re-signed or newly
notarized build invalidates an existing grant and the stale System Settings entry
can read as enabled while being denied.

### 3.3 Dead `devPro` escape hatch — GONE
Deleted with `mobile/src/ProProvider.tsx` on 13 Nov 2026. There is no
entitlement state left to escape.

### 3.4 Stale app name at runtime
`desktop/main.mjs:22` — `app.setName("streamPhoneDeck")`. Affects the macOS menu
bar name, notifications, the tray's "Quit streamPhoneDeck" item, and
`desktop/src/host.mjs` log output.

**Careful:** `app.setName()` determines `app.getPath("userData")`, so changing it
orphans existing `settings.json` and the app allowlist. Needs a one-time
migration that copies the old directory before switching.

---

## 4. Engineering hygiene

### 4.1 No test runner anywhere
None of the three `package.json` files defines a `test` script. The pure helpers
are already exported for testability (`comboToAppleScript`, `validateAction`,
`shellDecision`, `parseCombo`, `profileForApp`) — they just have no runner.

Start with `node:test` on the crypto interop and `shellDecision`, since those are
the two places a silent regression is most expensive.

### 4.2 No CI
`.github/` does not exist. Docs used to claim three workflows; the claims are
removed, but nothing builds or checks on push. A single workflow running
`npm run build` + lint on the web deck and `check:signing` on macOS would catch
most of what bit us.

### 4.3 Repository weight and history
- `.git` is **309 MB** — heavy to clone for a public repo
- A personal email address appears in **9 historical commits** (old xcodebuild and
  session logs, untracked now but browsable since the repo went public)

Neither is urgent. If you rewrite history for the email, do the size sweep in the
same pass.

### 4.4 Three overlapping Devpost documents
`DEVPOST.md`, `DEVPOST-SUBMISSION.md` and `DEVPOST-FINAL.md` all describe the same
submission. Keep one — `DEVPOST-FINAL.md` is the accurate one — and delete the
others.

### 4.5 Site deploys by hand — FIXED
`.github/workflows/pages.yml` now publishes `site/` to GitHub Pages on every
push to `main`. The old Vercel deployment never had `vercel git connect` run
against it and needed a manual `vercel deploy --prod`; it is also dead (§1.6).

---

## 5. Loose ends

- **The RevenueCat project is now unused.** `mobile/.env.local` still holds a
  live `appl_` SDK key that nothing reads (`.env.example` was deleted). The
  dashboard project, its `deskassist_pro` entitlement and the promotional grant
  that expired 4 Oct 2026 can all be left alone or torn down; neither affects
  the app.
- **Legacy web deck** (`src/`, `host-agent/`) is superseded by the native app and
  Electron host. The README explains it, but it is dead weight for a reader.
- **`brag-output/`** is committed, including the composition scratch. Fine to keep
  for provenance; worth pruning if the repo gets a size sweep.
- **iPad** is declared supported (`supportsTablet: true`) with iPad screenshots
  uploaded, but the layout has never been exercised on one. Apple reviews on iPad.

---

## Suggested order

1. Paid Applications agreement (1.1) — unblocks everything commercial
2. Submit the IAPs (1.2) — then verify the paywall actually loads prices
3. Allowlist seeding (3.1) — the worst first-run bug, and cheap
4. Real app icon everywhere (2.1) + encryption declaration (2.2), shipped together as 1.0.1
5. Android production key (1.3) before any Play work
6. macOS DMG (2.3) → release (2.4)
7. Tests (4.1) and CI (4.2)
