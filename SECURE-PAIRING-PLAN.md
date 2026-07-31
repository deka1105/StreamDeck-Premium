# Secure pairing — Electron host + native phone app

Turns streamPhoneDeck into: an **installable desktop app** (Electron, macOS/Windows)
that the phone pairs with by **scanning a QR code**, over a channel that no other
device or person on the same Wi‑Fi can read, forge, replay, or tamper with.

## Why the architecture changes

Today the "phone app" is a **web page** served by Next.js, authed by a static
`DECK_TOKEN` sent in plaintext over HTTP. On shared Wi‑Fi that token can be
sniffed and actions injected — and the deck can run arbitrary `shell`, so that is
a full remote‑code path.

Going **native on the phone** removes the web page entirely and lets us pin a TLS
certificate on the client (native TLS clients pin cleanly; browsers can't without
scary warnings). So the **Electron desktop app becomes the TLS server the phone
talks to directly**. The Next.js SSE relay + separate Node agent collapse into one
process.

```
BEFORE:  phone browser ──HTTP token──▶ Next server ──SSE──▶ node agent ──▶ OS
AFTER:   native phone  ──AES-256-GCM envelopes (per-device key)──▶ Electron host ──▶ OS
```

> **Transport note.** An earlier draft used pinned self-signed TLS. React Native
> can't cleanly do *dynamic* cert pinning (the pin is per-user, learned from the
> QR at runtime; RN pinning is build-time only, and RN `fetch` refuses
> self-signed hosts). So security moved **up a layer**: plain HTTP transport, and
> every message is an **AES-256-GCM envelope** keyed by a per-device key. Simpler,
> no native TLS module, and the same guarantees.

## The pairing / security protocol

Threat model: an attacker on the same Wi‑Fi (passive sniffing, or active
ARP‑spoof MITM) must not be able to read, forge, replay, tamper with, or enrol.

1. **Pair (spd2, forward secret)** — user clicks *Pair a phone*. Host generates a
   fresh **ephemeral X25519 keypair** + `pid`, and renders a QR encoding
   `{ v, proto:"spd2", name, host:<lan-ip>, port, pid, hpk:<base64 host public key> }`.
   The QR holds **only a public key** — no secret.
2. **Handshake** — the app makes its own ephemeral X25519 keypair, does ECDH with
   `hpk`, and HKDF-derives the **device key**. It `POST /pair { pid, ppk, mac }`
   where `mac = HMAC(key, pid‖hpk‖ppk)` proves it saw the QR. The host re-derives
   the key from `ppk`, checks the tag, stores the device, and returns a reply
   **sealed with the key** (which authenticates the host back).
3. **Envelope protocol** — every request is `POST /rpc` with an **AES-256-GCM
   envelope** `{ kid, n, ct }` (nonce + ciphertext‖tag) sealed with the device key,
   whose plaintext carries a strictly-increasing `ctr` and a `cmd`. The host finds
   the device by `kid` (=`pid`), decrypts (tag verifies integrity + authenticity),
   rejects `ctr <= lastCtr` (replay), runs the command, returns a sealed reply.
4. **Use** — `cmd:"hello"` is a connectivity check; `cmd:"action"` validates +
   executes. Revoke = delete the device key.

Why it holds (attacker on the same Wi-Fi, no QR):
- **AES-256-GCM** → confidentiality + integrity; any bit-flip fails the tag.
- **X25519 + HKDF** → the device key is derived, never transmitted. A **screenshot
  of the QR can't derive it** (needs the phone's ephemeral private key), and a
  later key leak doesn't expose past pairings (forward secrecy).
- **HMAC confirmation** → an on-path attacker who never saw the QR **can't hijack
  the pairing** (can't forge the tag without `hpk`).
- **Monotonic counter** → replays rejected. Each phone is individually revocable.
- Residual: an attacker can drop packets (DoS, unavoidable on a shared network)
  and see that encrypted blobs flow (traffic metadata), nothing more.

## Stages (each ends in something you can run)

- **1a — Host core (headless).** ✅ Ported executor (app/url/keys/shell), HTTP
  server with `/health` + `/rpc`, AES-256-GCM envelopes, per-device keys, monotonic
  counter. Verified by a Node test-client incl. forgery/tamper/replay negatives.
- **1b — Electron shell.** ✅ Tray/menu-bar app wrapping the core: *Pair a phone*
  window renders the QR + live pairing status, device list/revoke. Boot-verified.
- **2 — Expo phone app: pair → connect.** ✅ `mobile/` Expo app (SDK 57):
  QR scan → device key in the secure store → starter tiles that seal actions over
  `/rpc`. iOS/Android native config (Local Network + ATS + cleartext) via config
  plugins. CI added: Android dev-client APK in GitHub Actions, iOS via EAS.
  Typechecks; phone↔host crypto verified wire-compatible. Final end-to-end needs a
  dev build on a real phone (yours to run). ← _here_
- **3 — Full deck UX on the phone.** ✅ Editable grid (edit mode, add/edit/delete,
  reset), a tile editor (label, emoji, action type, per-type value with live
  shortcut preview, color), and AsyncStorage persistence — parity with the web
  deck (app/url/keys/shell). Typechecks; on-device run still yours.
- **4 — Packaging.** ✅ `electron-builder` config → `.dmg` (mac) / `.exe` (nsis,
  win) / AppImage (linux); generated colored app icon; single-instance lock,
  open-at-login toggle, port-in-use dialog. Verified with an unpacked build
  (`--dir`): the `.app` bundles the right files, dev test-client excluded. Signed
  installers need your Developer ID / code-signing cert.
- **5 — Forward-secrecy hardening (spd2).** ✅ QR now carries an ephemeral X25519
  public key, not a secret; `POST /pair` does ECDH → HKDF → device key with an
  HMAC confirmation tag. Verified headlessly: `x25519-interop.mjs` (noble↔Node
  agree) + the host test-client (bad-confirmation hijack, forgery, tamper, replay
  all rejected). Typechecks.

## Tooling defaults (say if you'd rather not)

- **Phone:** Expo / React Native (TS) — matches the codebase; `expo-camera`
  (scan QR), `expo-secure-store` (device key + send counter), `@noble/ciphers`
  for AES-256-GCM (Hermes-compatible), plain `fetch` to `/rpc`. Needs an Expo
  **dev build** (Expo Go can't reach a self-hosted LAN device).
- **Desktop:** Electron + `electron-builder`; host core is plain Node ESM so it's
  testable without a display.
- **Layout:** `desktop/` and `mobile/` as sibling folders in this repo (each its
  own package). The existing Next.js app stays for the `/host` monitor, off the
  critical path.

## Known gaps to handle later

- **`keys`**: ✅ macOS (AppleScript) + Windows (PowerShell `SendKeys`, verified via
  `comboToSendKeys` mapping tests). Windows can't send Win/Super or Ctrl+Alt+Del,
  and "cmd" maps to Ctrl; Linux still unsupported.
- **`shell` is arbitrary RCE by design** — now gated behind pairing, but consider
  an allowlist / per‑action confirmation before shipping widely.
- ~~**QR carries the secret**~~ — ✅ fixed in stage 5: the QR carries an ephemeral
  X25519 public key, so a screenshot can't derive the connection key.
- **iOS/Android need a dev build** for LAN access: iOS ATS + Local Network
  permission, Android cleartext config. Baked into the Expo config plugin in stage 2.
