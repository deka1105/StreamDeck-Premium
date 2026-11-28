// Stage 16: the desk-edges overlay page, driven by a real mouse in Chromium
// over a wallpaper, with a stand-in for the Electron bridge. Checks reveal,
// sweep-to-set, the corner dial, detaching a dial, the dock tray and launcher.
import { test, expect } from "@playwright/test";
import http from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "desktop");
const W = 1280;
const H = 720;
let srv;
let base;

test.beforeAll(async () => {
  srv = http.createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (!/^\/(edges|src\/edges)\/[\w.-]+$/.test(path)) return res.writeHead(404).end();
    const type = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css" }[extname(path)] ?? "text/plain";
    try {
      res.writeHead(200, { "content-type": type }).end(readFileSync(join(desktop, path)));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.afterAll(() => srv?.close());

async function open(page, profile = {}) {
  await page.setViewportSize({ width: W, height: H });
  await page.addInitScript(
    ([W, H, profile]) => {
      const state = { volume: 0.4, brightness: 0.7, appearance: 0 };
      window.__calls = [];
      window.__interactive = [];
      const dock = { side: "bottom", x: 440, y: H - 70, width: 400, height: 70 };
      window.edges = {
        info: async () => ({
          id: "1",
          display: { width: W, height: H },
          dock,
          dockTray: null,
          floating: [],
          profile: { left: "volume", right: "brightness", corners: { tl: "timer", tr: "appearance", bl: "volume", br: "music" }, dock: ["Safari", "Notes", "Music"], launcher: ["Maps", "Photos", "Calendar"], pressureMs: 0, sliderLength: 0.5, dialSize: 180, timerMinutes: 25, style: { look: "glass", tint: "#0f172a", accent: "#38bdf8", opacity: 0.72, frost: 18, highlight: 0.18 }, ...profile },
        }),
        on: () => {},
        interactive: (on) => window.__interactive.push(on),
        get: async (k) => (k === "music" ? { playing: true, title: "Golden Hour", artist: "Neon Harbor", progress: 0.4 } : { value: state[k] ?? 0 }),
        set: async (k, v) => (window.__calls.push(["set", k, v]), (state[k] = v), { ok: true }),
        act: async (k, a, arg) => (window.__calls.push(["act", k, a, arg]), k === "timer" && a === "start" ? { ok: true, endsAt: Date.now() + arg * 60000 } : { ok: true, endsAt: 0 }),
        launch: async (app) => (window.__calls.push(["launch", app]), { ok: true }),
        icon: async () => null,
        saveFloating: async (list) => (window.__calls.push(["float", list.map((f) => f.kind)]), { ok: true }),
      };
    },
    [W, H, profile],
  );
  await page.goto(`${base}/edges/overlay.html`);
  // A wallpaper behind the transparent overlay, as on a real desktop.
  await page.evaluate(() => (document.body.style.background = "linear-gradient(135deg,#1e3a8a,#7c3aed 45%,#f97316)"));
  await page.waitForFunction(() => window.__edges);
}

test("edge slider: reveal at the left edge, sweep to set the volume, hide when the pointer leaves", async ({ page }) => {
  await open(page);
  await page.mouse.move(400, H / 2);
  await page.mouse.move(1, H / 2, { steps: 4 });
  const slider = page.locator(".ctl.slider.z-left");
  await expect(slider).toHaveClass(/\bin\b/);
  await expect(slider.locator(".sl-num")).toHaveText("40%");
  const box = await slider.locator(".sl-track").boundingBox();
  await page.mouse.move(30, box.y + box.height * 0.25, { steps: 6 });
  await expect(slider.locator(".sl-num")).toHaveText(/^7\d%$/);
  await expect.poll(() => page.evaluate(() => window.__calls.filter((c) => c[1] === "volume").at(-1)?.[2])).toBeGreaterThan(0.7);
  expect(await page.evaluate(() => window.__interactive.includes(true))).toBe(true);
  await page.screenshot({ path: test.info().outputPath("edge-slider.png") });
  await page.mouse.move(700, H / 2, { steps: 4 });
  await expect(page.locator(".ctl")).toHaveCount(0, { timeout: 3000 });
  // The bottom edge (the Dock's own edge) never reveals anything.
  await page.mouse.move(640, H - 2);
  await page.waitForTimeout(300);
  await expect(page.locator(".ctl")).toHaveCount(0);
});

test("corner dial: timer by angle, click to start; pull it out to float", async ({ page }) => {
  await open(page);
  await page.mouse.move(200, 200);
  await page.mouse.move(2, 2, { steps: 4 });
  const dial = page.locator(".ctl.dial.z-tl");
  await expect(dial).toHaveClass(/\bin\b/);
  await page.mouse.move(120, 60, { steps: 5 });
  await expect(dial.locator(".dl-num")).toHaveText(/min$/);
  await page.mouse.click(120, 60);
  await expect.poll(() => page.evaluate(() => window.__calls.find((c) => c[1] === "timer" && c[2] === "start")?.[3])).toBeGreaterThan(5);
  await expect(dial.locator(".dl-num")).toHaveText(/^\d+:\d\d$/);
  await page.screenshot({ path: test.info().outputPath("corner-timer.png") });

  // Volume dial (bottom-left): drag far out of the corner to detach it.
  await page.mouse.move(200, H - 200);
  await page.mouse.move(2, H - 2, { steps: 4 });
  const bl = page.locator(".ctl.dial.z-bl");
  await expect(bl).toHaveClass(/\bin\b/);
  await page.mouse.move(60, H - 60, { steps: 3 });
  await page.mouse.down();
  await page.mouse.move(520, H - 380, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".float")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.__calls.find((c) => c[0] === "float")?.[1])).toEqual(["volume"]);
  await page.screenshot({ path: test.info().outputPath("floating-dial.png") });
  // Double-click sends it back.
  await page.locator(".float").dblclick();
  await expect(page.locator(".float")).toHaveCount(0);
});

test("music corner and the hidden dock with its launcher", async ({ page }) => {
  await open(page);
  await page.mouse.move(W - 200, H - 200);
  await page.mouse.move(W - 2, H - 2, { steps: 4 });
  const music = page.locator(".ctl.dial.z-br");
  await expect(music).toHaveClass(/playing/);
  await expect(music.locator(".dl-num")).toHaveText("Golden Hour");
  await page.screenshot({ path: test.info().outputPath("corner-music.png") });

  // The tray sits beside the Dock, on its edge.
  await page.mouse.move(200, H - 150);
  await page.mouse.move(200, H - 1, { steps: 6 });
  const tray = page.locator(".ctl.tray");
  await expect(tray).toHaveClass(/\bin\b/);
  await expect(tray.locator(".app")).toHaveCount(3);
  const tb = await tray.boundingBox();
  expect(tb.x + tb.width).toBeLessThanOrEqual(440); // left of the Dock
  await tray.locator(".app").first().click();
  await expect.poll(() => page.evaluate(() => window.__calls.find((c) => c[0] === "launch")?.[1])).toBe("Safari");
  await tray.locator(".tr-more").click();
  await expect(page.locator(".launcher .app")).toHaveCount(3);
  await page.screenshot({ path: test.info().outputPath("dock-launcher.png") });
});

test("pressure mode: a brief touch of the edge doesn't reveal; pushing does", async ({ page }) => {
  await open(page, { pressureMs: 400 });
  await page.mouse.move(300, H / 2);
  await page.mouse.move(1, H / 2);
  await page.mouse.move(300, H / 2);
  await page.waitForTimeout(200);
  await expect(page.locator(".ctl")).toHaveCount(0);
  await page.mouse.move(1, H / 2);
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(100);
    await page.mouse.move(1 + (i % 2), H / 2);
  }
  await expect(page.locator(".ctl.slider")).toHaveCount(1);
});
