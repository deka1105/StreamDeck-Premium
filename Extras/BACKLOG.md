# DeskAssist — post-submission backlog

Everything found during the Shipaton push, ordered by what it costs you if left
alone. Each item names where it lives so it can be picked up cold.

Status as of 13 October 2026: iOS 1.0.0 **build 8** uploaded, VALID, attached to
the version, state `PREPARE_FOR_SUBMISSION` — **not yet submitted** · Play store
listing **Live**, closed-testing Alpha running since Oct 11 on versionCode 1 with
**0 of 12 testers** · repo public (MIT) · site live · Shipaton Next Gen
submitted.

Build 8 resolved Apple's second rejection (2.3.8 placeholder icons, 5.1.1(iv)
camera permission wording) and dropped the false export-compliance declaration.
What is left to ship on either store is in §1 and needs a human.

---

## 1. Blocks revenue — nothing can be sold until these are done

### 1.1 Paid Applications agreement is not active
No StoreKit product can be fetched until this is signed with bank and tax
details complete. This is why the paywall reports *"No pricing is available"* —
not a code bug.

**App Store Connect → Business → Agreements, Tax, and Banking.**

### 1.2 The three in-app purchases have never been submitted
`2f5b54` (monthly), `2f5b54_Y` (annual), `2f5b54_One` (lifetime) sit at
`READY_TO_SUBMIT` in an unsubmitted draft review submission. Until they go
through review with a version, StoreKit serves nothing even with the agreement
active — and Apple's own 2.1 reply flagged it under guideline 3.1.1.

There is **no API route** for this: `reviewSubmissionItems` has no IAP
relationship (confirmed by probing every candidate name), and
`inAppPurchaseSubmissions` rejects with `STATE_ERROR` while the app has no
approved version. It must be done in the web UI, on the version page.

### 1.3 Google Payments merchant account is not set up
The Play mirror of 1.1. Monetize → Products is locked behind *"You need to set
up a Google Payments merchant account."* No merchant account means no in-app
products, which means no Play mapping in RevenueCat, no `goog_` key, and a
paywall with nothing to show. Needs legal name, tax details (PAN/GST) and a
bank account.

### 1.4 Closed testing needs 12 testers for 14 days
The Alpha track has been live since Oct 11 (full rollout, 178 regions) but sits
at **0 testers opted-in**. Production access requires 12 opted-in testers
running for 14 continuous days, and the clock does not start until the twelfth
person joins. This is the longest pole on Android and nothing shortens it.

### 1.5 Android ships a Test Store key
`mobile/.env.local` has `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=test_…`. RevenueCat's
SDK **deliberately terminates the app on launch** when it finds a Test Store key
in a Release build. A Play release would crash on open for every user.

Replace with the production `goog_` key before any Android build.

---

## 2. Blocks a clean release

### 2.1 The Expo placeholder icon is baked into build 6
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

### 2.3 The macOS DMG cannot be built
`npm run dist:mac:release` deadlocks in electron-builder's signing stage: twice
observed at 0% CPU with no `codesign` child, ~22 minutes, keychain unlocked and
`no-timeout`. Everything around it is correct — Developer ID Application cert
installed, identity pinned, `check:signing` green, notarize hook accepting API-key
credentials.

Next things to try: pin the certificate SHA-1 instead of the name; sign the
bundle manually outside electron-builder; or `--docker` for a deterministic
environment.

### 2.4 No release, so the README download link is dead
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

### 3.3 Dead `devPro` escape hatch
`mobile/src/ProProvider.tsx:30` declares `devPro`/`setDevPro`, and
line 74 reads it as `isPro || (__DEV__ && devPro)` — but `setDevPro` is never
called anywhere, so it does nothing. Also gated on `__DEV__`, so it would not
work in a Release build installed over USB.

Either wire it to an `EXPO_PUBLIC_FORCE_PRO` env var with a persistent on-screen
badge so it cannot ship silently unlocked, or delete it.

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

### 4.5 Site deploys by hand
`vercel git connect` was never run, so pushes do not deploy; it took a manual
`vercel deploy --prod` (and a `vercel login`) to publish. One command fixes it
permanently.

---

## 5. Loose ends

- **Revoke the promotional entitlement.** `deskassist_pro` was granted to a device
  for filming and expires **4 October 2026**. Revoke it so your own device
  reflects real entitlement state, or you will debug a phantom Pro later.
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
