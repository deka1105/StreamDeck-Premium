# Extras

Material that isn't the product. Kept for provenance, moved out of the repo root
so the top level shows only `mobile/`, `desktop/`, `site/` and `docs/`.

Nothing here is needed to build or run DeskAssist.

| Path | What it is |
| --- | --- |
| [`legacy-web-deck/`](legacy-web-deck/) | The original browser-based deck — Next.js app (`src/`) plus the plain-Node executor (`host-agent/`), with its own `package.json`. Superseded by the native app and the Electron host, but still runnable. |
| [`devpost/`](devpost/) | RevenueCat Shipaton 2026 submission copy, and the icon/screenshot assets in `devpost/assets/`. `DEVPOST-FINAL.md` is the version actually submitted. |
| [`app-review/`](app-review/) | App Store review correspondence — the reply to Apple's guideline 2.1 information request, and the App Review Information notes. |
| [`launch-video/`](launch-video/) | Hyperframes sources for the 20-second launch video, plus the render and poster frame. The copy the README embeds lives at `docs/demo.mp4`. |
| [`BACKLOG.md`](BACKLOG.md) | Known issues and follow-up work, ordered by cost. Tracked items also become GitHub issues. |
| [`HANDOFF.md`](HANDOFF.md) | Working notes from the build. |

## Running the legacy web deck

It has its own dependencies, which are no longer installed at the repo root:

```bash
cd Extras/legacy-web-deck
npm install
npm run dev      # Next.js deck server on :3000
npm run agent    # the Node host agent that executes actions
```

Open `http://<your-computer-ip>:3000/` on your phone. It's gated by an optional
`DECK_TOKEN` sent as a plaintext header over HTTP — acceptable on trusted Wi-Fi,
and precisely the weakness the native app replaced with a real X25519 handshake
and AES-256-GCM transport.
