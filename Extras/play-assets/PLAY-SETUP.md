# Google Play — state and what is left

App: **DeskAssist** · `com.dekisuki05.deskassist` · app ID `4973317940650869756`

Verified in the Play Console on 2026-10-13. Everything that can be done from
this machine is done; what remains needs a human or a calendar.

---

## Done

| Item | State |
| --- | --- |
| Store listing | **Live** — name, both descriptions, icon, feature graphic, 2 screenshots |
| App content declarations | **10 of 10 actioned**, "Need attention" is empty |
| Content rating | Actioned Oct 10 |
| Data safety | Actioned Oct 9 |
| Privacy policy | `https://deskassist.sdfolio.com/privacy.html` |
| Internal testing | Release 1 (1.0.0), live Oct 9 |
| **Closed testing – Alpha** | **Available to testers**, full rollout, live Oct 11, 178 regions |
| App bundle | versionCode **1**, 1.0.0, uploaded Oct 9, Active |

### Graphics in the listing

| Asset | Spec | File |
| --- | --- | --- |
| App icon | 512×512, no alpha | `play-icon-512.png` — downscaled from `mobile/assets/icon.png` so both stores show identical artwork |
| Feature graphic | 1024×500 | `feature-graphic-1024x500.png` |
| Phone screenshot 1 | 1080×2160 (exactly 2:1) | `play-screenshot-1-deck.png` — the deck in demo mode |
| Phone screenshot 2 | 1080×2160 (exactly 2:1) | `play-screenshot-2-apps.png` — running apps, Notes FRONTMOST |

Both screenshots are real Android captures from the release APK, cropped from
the Pixel 8's 1080×2400 by trimming the gesture-nav strip. Play caps phone
screenshots at 2:1, so the iOS captures (1179×2556, 2.17:1) could not be reused.

Capturing them needed `-gpu swiftshader_indirect`; under hardware GPU
`adb exec-out screencap` returned all-black frames even with the app focused.

---

## Blocked on you

### 1. Twelve testers, fourteen days — the long pole

```
✓ Publish a closed testing release
○ Have at least 12 testers opted-in   (0 currently opted-in)
○ Run your closed test with at least 12 testers, for at least 14 days
```

The track has been live since Oct 11 but **nothing counts until 12 people
actually opt in**. Nothing shortens this; it is the critical path to production.

### 2. Google Payments merchant account

Monetize → Products stays locked behind *"You need to set up a Google Payments
merchant account."* Until it is approved there are no in-app products, so no
Play mapping in RevenueCat, no `goog_` key, and the paywall has nothing to show.
Needs legal name, tax details (PAN/GST) and a bank account — days, not minutes.

It runs **in parallel** with the tester clock. Do not wait for one to start the
other.

---

## Known divergence between the stores

The bundle on Play is versionCode 1 from Oct 9. The camera-permission copy fix
made on Oct 13 for Apple (the "Grant camera access" → "Continue" rename required
by guideline 5.1.1(iv)) is **not** in it. `app.json` carries `versionCode: 2` for
the next upload.

This is deliberate. Google never objected to the old wording, and pushing a new
bundle would mean a new release on a closed test that only just went live. The
parity fix rides along with the next Android build; it is not worth disturbing a
running test for.

---

## The AI asset declaration

Set to **"Label assets as created or edited using AI"**, with the app icon and
feature graphic ticked and both screenshots left unticked. The radios are
read-only once the listing is published (`disabled`, `pointer-events: none`),
and stay that way even with a pending edit.

That split is defensible: the icon and feature graphic are the output of a
Pillow script, and the screenshots are genuine device captures. The control
reads "generated **or edited** with AI", which is broader than "a generative
model drew this" — so labeling the script-drawn pair is the cautious and
accurate reading. Changing it would mean moving from disclosed to undisclosed,
which is the wrong direction to guess in.
