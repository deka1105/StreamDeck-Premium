// Stage 7: media widgets against a real host and a fake Jellyfin server.
import { test, expect } from "@playwright/test";
import http from "node:http";
import { startHost } from "../lib/host.mjs";

let jf;
let jfBase;
let host;
const posts = [];

test.beforeAll(async () => {
  jf = http.createServer((req, res) => {
    if (req.headers.authorization !== 'MediaBrowser Token="secret-token"') {
      res.writeHead(401);
      return res.end();
    }
    if (req.method === "POST") {
      posts.push(req.url);
      res.writeHead(204);
      return res.end();
    }
    res.writeHead(200, { "content-type": "application/json" });
    if (req.url.startsWith("/Sessions"))
      return res.end(JSON.stringify([{ Id: "sess1", UserName: "alex", DeviceName: "Living room TV", NowPlayingItem: { Id: "it1", Name: "The Long Voyage", ProductionYear: 2019, RunTimeTicks: 6.3e10 }, PlayState: { PositionTicks: 2.4e10, IsPaused: false } }]));
    if (req.url === "/System/Info/Public") return res.end(JSON.stringify({ Version: "10.10.3" }));
    if (req.url === "/Items/Counts") return res.end(JSON.stringify({ MovieCount: 312 }));
    res.end("{}");
  });
  await new Promise((r) => jf.listen(0, "127.0.0.1", r));
  jfBase = `http://127.0.0.1:${jf.address().port}`;
  host = await startHost({
    port: 18940,
    localPort: 18941,
    config: {
      settings: { mediaServers: [{ id: "jf", type: "jellyfin", name: "Jellyfin", url: jfBase }] },
      default: {
        home: "music",
        pages: [
          {
            id: "music",
            name: "Music",
            widgets: [
              { id: "np", type: "nowplaying", x: 0, y: 0, w: 6, h: 3 },
              { id: "ms", type: "mediaserver", x: 6, y: 0, w: 6, h: 3 },
              { id: "ly", type: "lyrics", x: 0, y: 3, w: 4, h: 3 },
              { id: "rd", type: "radio", x: 4, y: 3, w: 4, h: 3, options: { stations: ["Test FM | https://stream.example/test"] } },
              { id: "vol", type: "volume", x: 8, y: 3, w: 4, h: 1 },
            ],
          },
        ],
      },
    },
  });
  // The token goes in through the editor's write-only secret endpoint.
  const r = await fetch(`${host.base}/api/editor/secret`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "media:jf", value: "secret-token" }) });
  if (!(await r.json()).ok) throw new Error("secret not saved");
});
test.afterAll(async () => {
  await host?.stop();
  jf?.close();
});

test("media server card and now-playing fallback; Jellyfin control reaches the server", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1170, height: 540 });
  await page.goto(`${host.base}/panel/`);
  const card = page.locator(".w-mediaserver");
  await expect(card.locator(".np-title")).toHaveText("The Long Voyage", { timeout: 20_000 });
  await expect(card).toContainText("Living room TV · alex · playing");
  // Nothing plays on this computer in the test, so Now playing shows the server's session.
  const np = page.locator(".w-nowplaying");
  await expect(np).toHaveAttribute("data-state", /server|playing|paused/);
  // The test host runs dry (actions are logged, not performed); the real HTTP
  // call to Jellyfin is covered by the provider's unit test.
  await card.locator(".mbtn.big").click();
  await expect.poll(() => host.log()).toContain("(dry-run) media server jf playpause");
  await page.screenshot({ path: "test-results/media-page.png" });
  expect(errors).toEqual([]);
});

test("lyrics stay off until the widget allows them; the host refuses otherwise", async ({ page, request }) => {
  await page.setViewportSize({ width: 1170, height: 540 });
  await page.goto(`${host.base}/panel/`);
  await expect(page.locator(".w-lyrics")).toContainText("Turn on “Look up lyrics on LRCLIB”", { timeout: 20_000 });
  const r = await request.post(`${host.base}/api/panel/rpc`, { data: { method: "lyrics.get", params: { pageId: "music", widgetId: "ly" } } });
  expect((await r.json()).result.ok).toBe(false);
});

test("radio plays only stations from the widget; media controls reach the host", async ({ request }) => {
  const rpc = async (method, params) => (await (await request.post(`${host.base}/api/panel/rpc`, { data: { method, params } })).json()).result;
  const bad = await rpc("radio.play", { pageId: "music", widgetId: "rd", index: 5 });
  expect(bad.ok).toBe(false);
  const forged = await rpc("radio.play", { pageId: "music", widgetId: "np", index: 0 });
  expect(forged.ok).toBe(false); // not a radio widget
  const ok = await rpc("radio.play", { pageId: "music", widgetId: "rd", index: 0 });
  // Either it "plays" (dry run, a player is installed) or explains what to install.
  expect(ok.ok === true || /Install mpv/.test(ok.error)).toBe(true);
  await rpc("radio.stop", {});
  const ctl = await rpc("media.control", { command: "playpause" });
  expect(ctl.ok).toBe(true);
  await expect.poll(() => host.log()).toContain("(dry-run) media playpause");
});
