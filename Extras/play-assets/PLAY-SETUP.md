# Play Console setup — exact answers

Every outstanding task on the DeskAssist dashboard, with the answer to give.
Open this beside the Console and work down; it should take about 15 minutes.

App: **DeskAssist** · `com.dekisuki05.deskassist` · app ID `4973317940650869756`

---

## Already done

- **Privacy policy** → `https://deskassist.sdfolio.com/privacy.html` ✅ saved

---

## Declarations

These are statements to Google, so read each one rather than taking my word —
but every answer below is checked against what the code actually does.

| Task | Answer | Why |
| --- | --- | --- |
| **Ads** | **No, my app does not contain ads** | No ad SDK anywhere in `mobile/package.json`. |
| **Government apps** | **No** | — |
| **Financial features** | **None of these** | The only money flow is Play Billing itself, which this section does not cover. |
| **Health** | **No** | No health data, no Health Connect. |
| **Target audience** | **18 and over** only | Keeps the app out of the Families programme and its extra obligations. Nothing in the app is aimed at children. |

### App access / Sign-in details

Choose **All functionality is available without special access**.

There are no accounts, no login, and no gated regions. Add this note so a
reviewer isn't stuck at the pairing screen:

> DeskAssist controls a computer, and a reviewer will not have the companion
> Mac app running. On the first screen tap **"Explore the demo instead"** — the
> whole app then runs against a simulated Mac, with a banner saying so. No
> pairing, no network access and no account are needed.

### Content rating

Category: **Utility, Productivity, Communication, or Other**. Then answer **No**
to every content question — violence, sexuality, language, controlled
substances, gambling, horror. The honest ones that need care:

- **Does the app let users interact or exchange content?** → **No.** Snippets
  and tile layouts never leave the device; there is no feed, no messaging, no
  user-to-user anything.
- **Does the app share the user's location?** → **No.**
- **Does the app allow purchases?** → **Yes** (digital content).

Expect a rating of **Everyone / PEGI 3**.

### Data safety

This is the one people get wrong. DeskAssist collects **nothing**.

- **Does your app collect or share any of the required user data types?** → **No**
- **Is all of the user data encrypted in transit?** → **Yes** (AES-256-GCM to the paired computer)
- **Do you provide a way for users to request data deletion?** → Not applicable; no data is collected

Camera is used for QR scanning, and images picked for tile faces stay on the
device — neither is *collected* in Play's sense, because nothing is transmitted
off-device to us. There is no analytics SDK, no crash reporter, no account, and
no server of ours in the path.

---

## Store listing

**App name** (30 max)
```
DeskAssist
```

**Short description** (80 max)
```
Your phone is the button. Tap a tile and your computer responds, encrypted.
```

**Full description** (4000 max)
```
DeskAssist turns your phone into a control surface for your computer. Tap a tile and an app launches, a link opens, a keyboard shortcut fires, or saved text types itself into whatever window you are working in.

NINE TILES, ONE TAP EACH
A grid of tiles you build yourself. Drag to rearrange. Give any tile an emoji, a short label, or your own image. Add as many pages as you need.

PROFILES THAT FOLLOW YOU
Build a deck per context — writing, calls, coding — and switch with a tap. Turn on Auto mode and the right deck appears by itself as you move between apps on your computer.

SNIPPETS
Save the text you retype — an address, a command, a paragraph you send every week — and send it with one tap. Set a short delay first so you can click the window that should receive it.

RUNNING APPS
See what is open on your computer, jump straight to any of it, and pin an app to your deck while you are there. Tiles show a live dot for running and frontmost state.

TRY IT WITHOUT A COMPUTER
Tap "Explore the demo instead" on the first screen and the whole app runs against a simulated computer. No install, no pairing, no network.

PRIVATE BY DESIGN
There is no account and no cloud. You pair by scanning a QR code, which performs an X25519 key exchange; every command after that is AES-256-GCM encrypted and sent straight from your phone to your computer over your own network. Your deck, your snippets and your device key never leave the two devices.

FREE AND PRO
Free gives you a working deck: all five action types, one profile, one page of nine tiles, and three snippets. Pro removes the limits — unlimited profiles, pages and snippets, plus your own images as tile faces.

REQUIRES THE DESKASSIST HOST
To control a real computer you also install the free DeskAssist host app. Launching apps and opening links work on macOS and Windows. Sending keyboard shortcuts, typing text, and focus detection for Auto mode are macOS only for now.
```

That last paragraph matters: it sets expectations honestly, and under-promising
on Android parity is far better than one-star reviews saying shortcuts do nothing.

**App category:** Tools *(Productivity also defensible; Tools fits a launcher better)*
**Tags:** productivity, utilities
**Contact email:** `aryasoftechco@gmail.com`
**Website:** `https://deskassist.sdfolio.com`

---

## Graphics

| Asset | Requirement | Status |
| --- | --- | --- |
| App icon | 512×512 PNG, 32-bit, no transparency | ✅ `play-icon-512.png` |
| Feature graphic | 1024×500 PNG, no transparency | ✅ `feature-graphic-1024x500.png` |
| Phone screenshots | 2–8, min 320px, **max side ≤ 2× min side** | ❌ **needed** |

### Your iOS screenshots cannot be reused

`sc_deck.png` is 1179×2556 — an aspect ratio of **2.17:1**, and Play caps phone
screenshots at **2:1**. They will be rejected.

You need Android captures. Fastest route, since the SDK and emulator are already
installed here:

```bash
export ANDROID_HOME=~/Library/Android/sdk
$ANDROID_HOME/emulator/emulator -list-avds          # pick or create a device
adb install mobile/android/app/build/outputs/apk/release/app-release.apk
adb exec-out screencap -p > shot1.png
```

A 1080×2160 device gives exactly 2:1 and is safely inside the limit. Capture the
deck, the snippet library, and the Apps screen — using **demo mode**, so nothing
depends on a paired Mac.

---

## Still blocked, separately

**Merchant account.** Monetize → Products is locked behind *"You need to set up a
Google Payments merchant account."* Until that is approved, no in-app products
can exist, so the RevenueCat Google Play mapping and the `goog_` key are parked.
It needs your legal name, tax details (PAN/GST), and a bank account — days, not
minutes.

**Closed testing.** Confirmed required for this account:

> Have at least 12 testers opted-in to your closed test — *0 testers currently opted-in*
> Run your closed test with at least 12 testers, for at least 14 days

That is a 14-day wall clock and it has not started. It runs **in parallel** with
merchant verification, so start recruiting testers as soon as the setup tasks
above are green — do not wait for payments.
