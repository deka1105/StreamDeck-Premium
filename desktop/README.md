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

**In CI (recommended):** the [`desktop-build`](../.github/workflows/desktop-build.yml)
GitHub Actions workflow builds the macOS `.dmg` and Windows `.exe` on native
runners and uploads them as downloadable **artifacts** — no need to build locally,
and it covers the OS you're not on. Runs on push to `desktop/**` or via manual
dispatch.

**Locally:**
```bash
npm run pack       # unpacked .app/.exe dir in dist/ (fast, for testing)
npm run dist:mac   # .dmg   (macOS)
npm run dist:win   # .exe   (NSIS, Windows)
npm run dist       # host-OS target
```

Builds are unsigned by default (`mac.identity` is `null`), so users hit a
Gatekeeper/SmartScreen warning on first launch (**Open Anyway** / **Run anyway**;
if macOS says *"damaged"*, `xattr -dr com.apple.quarantine` the `.app`). Each
installer must be built on its own OS (locally or in CI). For warning-free
distribution, sign them — see below.

## Code signing (optional)

The [`desktop-build`](../.github/workflows/desktop-build.yml) workflow **signs and
notarizes automatically when these repo secrets are set** (Settings → Secrets and
variables → Actions) and builds unsigned otherwise — nothing else to change.

**macOS** — needs a paid Apple Developer account with a **Developer ID
Application** certificate:

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
