# streamPhoneDeck — desktop host

The installable app that runs on your computer, pairs with the phone via a QR
code, and executes actions (launch apps, open URLs, macOS shortcuts, shell). See
[`../SECURE-PAIRING-PLAN.md`](../SECURE-PAIRING-PLAN.md) for the protocol.

Transport is plain HTTP; **all security is application-layer** — each phone gets a
32-byte key from the QR and every message is an AES-256-GCM envelope with a
monotonic counter. An attacker on the same Wi-Fi can't read, forge, replay, or
inject.

## Structure

- `src/host.mjs` — the TLS-free HTTP host: `/health`, `/rpc`, per-device keys,
  envelope seal/unseal, replay counter. Runnable headless (`npm run host`).
- `src/executor.mjs` — OS action executor (app/url/keys/shell).
- `main.mjs` — Electron shell: menu-bar tray, pairing window, IPC.
- `preload.cjs` / `pair.html` — the pairing window bridge + UI.
- `src/test-client.mjs` — headless stand-in for the phone (security tests).
- `scripts/gen-icon.mjs` — generates the tray template + colored app icon.

## Develop

```bash
npm start                 # menu-bar app + pairing window
DECK_DRY_RUN=1 npm start  # log actions instead of running them
npm run smoke             # boot the core inside Electron and exit (no UI)

npm run host              # run just the host in a terminal (prints a QR)
npm run test:client       # prove forge/tamper/replay are rejected (host must run)
```

## Package installers

```bash
npm run pack              # unpacked .app/.exe dir in dist/ (fast, for testing)
npm run dist:mac          # .dmg   (macOS)       — dev build, may be unsigned
npm run dist:mac:release  # .dmg   (macOS)       — refuses to build unless signable
npm run dist:win          # .exe   (NSIS, Windows)
npm run dist              # host-OS target
npm run check:signing     # report macOS signing/notarization readiness
```

Each installer must be built on its own OS. There is no CI workflow in this repo
— `.github/` does not exist, so build locally.

> [!IMPORTANT]
> **`dist:mac` does not guarantee a distributable app.** `build.mac.identity` is
> not pinned, so electron-builder signs with whatever codesigning identity it
> finds first in your keychain. If that's an *Apple Development* certificate, the
> build succeeds and the `.app` **cannot be launched on any Mac** — Gatekeeper
> only accepts `Developer ID Application` + notarization for apps distributed
> outside the App Store.
>
> That is exactly what happened to `DeskAssist-0.1.0.dmg`. Run
> `npm run check:signing` before you ship anything, or use `dist:mac:release`,
> which gates the build on it.

For a **development** build you intend to run only on this machine, ad-hoc
signing sidesteps the certificate question entirely:

```bash
codesign --force --deep --sign - dist/mac/DeskAssist.app
```

## Code signing

Run `npm run check:signing` for a live report of what's present and what's
missing. It classifies every certificate in your keychain, since the names are
easy to confuse — **`Apple Distribution` is App Store submission only and will
not work here.**

### Creating the Developer ID certificate

Needs a paid Apple Developer Program membership, and only the **Account Holder**
can create one:

1. **Keychain Access** → *Certificate Assistant* → *Request a Certificate From a
   Certificate Authority* → fill in your email → **Saved to disk** → save the
   `.certSigningRequest`.
2. [developer.apple.com](https://developer.apple.com/account/resources/certificates/list)
   → Certificates → **+** → **Developer ID Application** → upload the CSR.
3. Download the `.cer`, double-click to install into the login keychain.
4. `npm run check:signing` — it should now list it as usable.

Then pin it so electron-builder can't pick the wrong one:

```json
"mac": { "identity": "Developer ID Application: Your Name (TEAMID)" }
```

### Notarization credentials

`build/notarize.cjs` accepts either style; set one before `npm run dist:mac`:

| Style | Variables |
| --- | --- |
| **A** — Apple ID | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |
| **B** — API key | `APPLE_API_KEY` (path to `.p8`), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` |

App-specific passwords come from [appleid.apple.com](https://appleid.apple.com)
→ Sign-In and Security → App-Specific Passwords. Never commit the `.p8`.

The hook now **refuses to notarize** a bundle signed with the wrong certificate
rather than uploading a build that cannot pass, and prints a loud warning when
credentials are absent instead of skipping quietly.

### Verifying the result

```bash
spctl -a -vvv -t exec dist/mac/DeskAssist.app   # accepted, source=Notarized Developer ID
xcrun stapler validate dist/mac/DeskAssist.app  # The validate action worked!
```

Both must pass. `codesign --verify` passing is **not** sufficient — a
development-signed app verifies fine and still won't launch.

### CI secrets

If you later add a GitHub Actions workflow, these are the secret names the
scripts expect (Settings → Secrets and variables → Actions):

| Secret | What |
| --- | --- |
| `MAC_CSC_LINK` | base64 of your Developer ID Application `.p12` |
| `MAC_CSC_KEY_PASSWORD` | password for that `.p12` |
| `APPLE_ID` | your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | your 10-character Team ID |

Export the cert from **Keychain Access** (Developer ID Application → Export `.p12`),
then `base64 -i DeveloperID.p12 | pbcopy` and paste as `MAC_CSC_LINK`.

**Windows** — needs an Authenticode code-signing certificate:

| Secret | What |
| --- | --- |
| `WIN_CSC_LINK` | base64 of your code-signing `.pfx` |
| `WIN_CSC_KEY_PASSWORD` | password for that `.pfx` |

`base64 -i cert.pfx | pbcopy` → paste as `WIN_CSC_LINK`.

macOS signing uses the hardened runtime (`build/entitlements.mac.plist`) and
notarizes via the `build/notarize.cjs` afterSign hook, which no-ops when the Apple
creds are absent. To sign a **local** mac build, export the same `MAC_*`/`APPLE_*`
vars (as `CSC_LINK`/`CSC_KEY_PASSWORD`/`APPLE_*`) before `npm run dist:mac`.

## Notes

- **`keys` / `text`**: macOS via AppleScript `keystroke` (needs **Accessibility**
  permission — grant the host under System Settings → Privacy & Security →
  Accessibility, or the keystroke silently blocks/prompts); **Windows** via
  PowerShell `SendKeys`. On Windows "cmd" maps to Ctrl, and the Win/Super key +
  secure sequences (Ctrl+Alt+Del) can't be synthesized. Linux has no keystroke
  path yet. `text` types a literal string into the focused app.
- **`shell` runs arbitrary commands**, so it's **off by default**: enable it via
  the tray menu → *Allow shell commands* (confirmation-guarded, persisted in
  `settings.json`), or run headless with `DECK_ALLOW_SHELL=1`. An optional
  `shellAllowlist` (settings.json) / `DECK_SHELL_ALLOWLIST` restricts which exact
  commands run. Enforced by `shellDecision()` in `src/executor.mjs`.
- Host data (device keys, `settings.json`) lives in Electron's `userData/data`;
  **Unpair** from the tray or pairing window revokes a device.
