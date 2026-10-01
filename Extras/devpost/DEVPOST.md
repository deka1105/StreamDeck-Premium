# DeskAssist — Devpost submission

Draft copy for the Devpost form. Paste the sections into the matching fields;
everything here is factual as of 28 September 2026. Anything not yet true is
marked **[PENDING]** so it can't be submitted by accident.

---

## Tagline (one line)

Your phone is the button. Tap a tile, your Mac responds.

---

## What it does

DeskAssist turns your phone into a Stream Deck — a grid of tiles that control the
computer in front of you. Tap a tile and an app launches, a link opens, a keyboard
shortcut fires, or saved text types itself into whatever window you're working in.

**The deck.** Nine tiles to a page, as many pages as you need. Drag to rearrange.
Give any tile an emoji, a short label, or your own image. Make a tile span two
cells so the one you reach for most is impossible to miss.

**Profiles that follow you.** Build a deck per context — writing, calls, coding.
Switch on Auto mode and the right deck appears by itself as you move between apps
on your Mac. The phone polls the host's focused application and switches decks on
the edge, so a manual override sticks until the focused app actually changes.

**Snippets.** Save the text you retype — an address, a command, a paragraph you
send every week — and send it with one tap. Set a delay first so you have a few
seconds to click the window that should receive the typing. A snippet you reach for
constantly can be promoted onto the deck as a permanent tile.

**Running apps.** See what's open on your Mac, jump straight to any of it, and pin
an app to your deck while you're there. Tiles show a live dot for running and
frontmost state.

**Demo mode.** Tap "Explore the demo" on the pairing screen and the whole app works
against a simulated Mac — no install, no pairing, no network. Built so that anyone
(including an App Store reviewer) can see the product without owning the other half
of it.

---

## How we built it

Three processes, because a browser is sandboxed and cannot control an operating
system. That constraint shaped the whole architecture.

```
phone (Expo/React Native)
   │  X25519 key exchange at pairing, then AES-256-GCM per command
   ▼
desktop host (Electron + Node)
   │  AppleScript System Events / open / exec
   ▼
macOS
```

**Pairing is a real handshake, not a shared password.** The host displays a QR code
carrying an ephemeral X25519 public key and a pairing id. The phone generates its
own ephemeral key, derives a shared secret, runs it through HKDF, and proves it saw
the QR with an HMAC confirmation tag. Every command afterwards is sealed with
AES-256-GCM under that device key, with a monotonic counter for replay protection.
The wire format is implemented independently on both sides and verified by interop
scripts (`mobile/scripts/interop-check.mjs`, `x25519-interop.mjs`) that fail the
build if the two implementations ever disagree.

**No server sees your data.** There is no DeskAssist account and no relay. The
phone talks directly to the computer over the local network. The deck layout, the
snippets, and the device key never leave the two devices — the key lives in the OS
secure store (iOS Keychain / Android Keystore), everything else in local storage.

**A single switch for demo mode.** `src/host.ts` is the only place that decides
between the encrypted transport and the simulated host, and the branch happens
before any sealing, so no demo code path can reach the crypto. The UI imports
`host.ts` instead of `rpc.ts` and genuinely cannot tell which is live.

**Dangerous capability is opt-in.** The host can run shell commands, which is
arbitrary code execution, so it ships disabled. Enabling it is a deliberate tray
toggle with an optional exact-match allowlist, enforced in one place
(`shellDecision()`). A paired phone or a leaked token cannot execute code unless
the human at the computer turned it on.

---

## Monetization

Built on RevenueCat with one entitlement (`deskassist_pro`) and a `default`
offering carrying monthly, annual, and lifetime packages. Entitlement state is
always read from RevenueCat's `CustomerInfo` rather than a local flag, so lapses,
refunds, and restores on a second device resolve correctly with no logic of our
own.

The tier split is deliberate: **the wall sits in front of growth, never in front of
function.**

| | Free | Pro |
|---|---|---|
| Profiles | 1 | Unlimited |
| Pages per profile | 1 (nine tiles) | Unlimited |
| Snippets | 3 | Unlimited |
| Image tile faces | — | ✓ |

All five action types — launch an app, open a URL, send a shortcut, type text, run
a shell command — are free, as is unlimited ad-hoc text sending. A free user gets a
fully working Stream Deck, and nothing that works on day one ever stops working.

Two choices worth calling out. **Free gets three snippets rather than none**,
because a feature nobody can try is a feature nobody buys, and three is enough to
feel why you want the fourth. And **Auto mode is free but self-limiting** — it
switches decks to match your focused app, which does nothing useful with one
profile. The feature demonstrates its own value and creates the want without a lock
icon.

The paywall is reason-aware: reaching for a second profile shows "One deck isn't
enough", a fourth snippet shows "Room for every snippet". The ask names the thing
you just reached for.

---

## Challenges we ran into

**A companion app is nearly unreviewable.** DeskAssist does nothing without a Mac
running the host. An App Store reviewer opens it, finds a QR scanner, has no host,
and rejects under guideline 2.1 — the standard death of companion apps, costing a
full review cycle. Demo mode exists because of that, and it turned out to be a
better product for everyone: you can evaluate the whole app before installing
anything.

**A purchase that granted nothing.** The first test purchase completed and unlocked
nothing. The code looked for an entitlement named `pro`; the dashboard's was
`deskassist_pro`. That mismatch would have shipped as an app that takes money and
gives nothing back — the worst possible failure. It's now self-diagnosing: a
purchase that doesn't unlock prints exactly which of the three possible causes it
is.

**A test key kills a release build.** RevenueCat's SDK detects a Test Store key in a
Release configuration and deliberately terminates the app on launch. A build with
no key runs but can't sell anything. Both failure modes are silent until you try
them on a real build.

**Nine tiles, one page, and a dead button.** On the free tier the seed deck fills
every slot, so "pin this snippet to the deck" had nowhere to go — a permanently
disabled control with no explanation. Found by using the app rather than reading
the code. It now names the limit it hit and offers the upgrade that removes it.

---

## What we learned

That the interesting constraints are never the ones you plan for. The cryptography
was the part we designed carefully; the parts that actually cost days were an
unreviewable app shape, a one-word entitlement mismatch, and a key type that makes
a release build commit suicide.

Also that "it compiles" and "it works" are very different claims. Every feature
described here was verified by driving the built app — demo mode from a cold
launch, a snippet round-tripping with a confirmation, a purchase lifting the gates
— not by reading the diff.

---

## What's next

Windows and Linux hosts (launching apps and opening URLs already work
cross-platform; keystrokes and focus detection are macOS-only today). A formal test
runner around the pure helpers. Optional server-backed deck sync for people who
want one deck across several phones.

---

## Tech stack

Expo / React Native / TypeScript · Electron + Node (host) · Next.js (web deck) ·
`@noble` X25519 + HKDF + AES-256-GCM · RevenueCat · AppleScript System Events ·
Vercel (site)

---

## Links

- **Source:** https://github.com/deka1105/StreamDeck-Premium **[PENDING — make public]**
- **Site / Terms / Privacy:** https://deskassist.vercel.app
- **App Store:** **[PENDING — awaiting review]**
- **Demo video:** **[PENDING — record]**

## Judge access

**[PENDING]** Either enable a free trial on the subscriptions, or generate promo
codes in App Store Connect so judges can unlock Pro and test the premium features.
Devpost requires one or the other.
