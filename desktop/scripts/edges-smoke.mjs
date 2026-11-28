// Development check for desk edges: turn them on in a throwaway config,
// reveal each control on the primary display, capture the overlay window to
// PNG files, and quit. Run with a temp data folder and other ports:
//   DECK_USER_DATA=$(mktemp -d) DECK_PORT=18788 DECK_LOCAL_PORT=18789 \
//   EDGES_SMOKE=1 EDGES_SMOKE_OUT=/tmp/edges npx electron .
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runEdgesSmoke({ edges, store }) {
  const out = process.env.EDGES_SMOKE_OUT ?? "edges-smoke";
  mkdirSync(out, { recursive: true });
  const cfg = store.config();
  store.save({
    ...cfg,
    settings: {
      ...cfg.settings,
      edges: {
        enabled: true,
        displays: "primary",
        base: { left: "volume", right: "appearance", corners: { tl: "timer", tr: "brightness", bl: "volume", br: "music" }, dock: ["Safari", "Notes", "Calendar", "Music"], launcher: ["Safari", "Notes", "Calendar", "Music", "Maps", "Photos"] },
        floating: [{ kind: "volume", x: 400, y: 300 }],
      },
    },
  });
  await edges.reload();
  await wait(2500);
  const win = [...edges.windows.values()][0];
  if (!win) throw new Error("no overlay window");
  win.webContents.on("console-message", (_e, level, message) => console.log(`[overlay] ${message}`));
  console.log("state:", await win.webContents.executeJavaScript("JSON.stringify({edges: typeof window.__edges, bridge: typeof window.edges, ctl: document.querySelectorAll('.ctl').length})"));
  const shots = { left: "left", tl: "tl", br: "br", dock: "dock" };
  for (const [name, zone] of Object.entries(shots)) {
    const r = await win.webContents.executeJavaScript(`(async () => { try { window.__edges.reveal(${JSON.stringify(zone)}); return "ok " + document.querySelectorAll(".ctl").length; } catch (e) { return "err " + e.message; } })()`);
    console.log(zone, r);
    await wait(350);
    const img = await win.webContents.capturePage();
    writeFileSync(join(out, `edges-${name}.png`), img.toPNG());
    console.log(`captured ${name}: shown=${await win.webContents.executeJavaScript("window.__edges.shown")}`);
  }
  console.log("EDGES SMOKE OK");
  edges.stop();
}
