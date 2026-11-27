// Stage 8: webhooks, notifications, rules, shortcuts and Custom HTML end to end.
import { test, expect } from "@playwright/test";
import { startHost } from "../lib/host.mjs";

const CUSTOM = `<div id="out">waiting</div><input id="bar" type="range" min="0" max="100" value="0">
<script>
  var out = document.getElementById("out");
  var leaked = "no";
  try { leaked = parent.document ? "yes" : "no"; } catch (e) { leaked = "blocked"; }
  out.dataset.parent = leaked;
  fetch("https://example.com/").then(function(){ out.dataset.net = "allowed"; }, function(){ out.dataset.net = "blocked"; });
  deskassist.on("push", function (d) { out.textContent = "temp " + (d.values.temperature ? d.values.temperature.value : "?"); });
  document.getElementById("bar").addEventListener("input", function (e) { deskassist.run("vol", Number(e.target.value)); });
</script>`;

let host;
test.beforeAll(async () => {
  host = await startHost({
    port: 18960,
    localPort: 18961,
    config: {
      settings: { pageSwitch: { waitAfterTouchSec: 0, minGapSec: 0, holdMaxMin: 30 } },
      shortcuts: [
        { id: "hello", label: "Hello", icon: "👋", kind: "url", cmd: "https://example.com/hello" },
        { id: "vol", label: "Volume", kind: "program", cmd: "/bin/echo", args: "set {value}", value: { min: 0, max: 100, step: 1 } },
      ],
      rules: [{ id: "music", name: "Music plays", enabled: true, when: { type: "push_value", key: "playing", op: "on" }, then: { type: "show_page", page: "music" }, whileLasts: true, countdownSec: 2, restSec: 0 }],
      default: {
        home: "home",
        pages: [
          {
            id: "home",
            name: "Home",
            widgets: [
              { id: "pv", type: "pushvalue", x: 0, y: 0, w: 4, h: 3, options: { key: "temperature", title: "Temp" } },
              { id: "sg", type: "shortcutgrid", x: 4, y: 0, w: 4, h: 3 },
              { id: "nt", type: "notifications", x: 8, y: 0, w: 4, h: 3 },
              { id: "ch", type: "customhtml", x: 0, y: 3, w: 12, h: 3, options: { html: CUSTOM } },
            ],
          },
          { id: "music", name: "Music", widgets: [{ id: "c", type: "clock", x: 0, y: 0, w: 12, h: 6 }] },
          { id: "other", name: "Other", widgets: [{ id: "c2", type: "clock", x: 0, y: 0, w: 12, h: 6 }] },
        ],
      },
    },
  });
});
test.afterAll(async () => {
  await host?.stop();
});

const curl = (path, body, headers = {}) =>
  fetch(`${host.base}${path}`, { method: "POST", headers, body: typeof body === "object" ? JSON.stringify(body) : body }).then((r) => r.json());

async function open(page) {
  await page.setViewportSize({ width: 1170, height: 540 });
  await page.goto(`${host.base}/panel/`);
  await expect(page.locator("#dots .dot")).toHaveCount(3);
}

test("a pushed value appears live; a notification pops a toast and lands in the feed", async ({ page }) => {
  await open(page);
  await curl("/api/push/temperature", "21.5");
  await expect(page.locator('.w[data-id="pv"] .push-num')).toHaveText("21.5");
  await curl("/api/notify", { title: "Deploy", text: "Production is live", level: "ok" }, { "content-type": "application/json" });
  await expect(page.locator(".toast")).toContainText("Deploy");
  await expect(page.locator(".note-row").first()).toContainText("Production is live");
});

test("goto webhook counts down; Stay keeps the page, Go now switches", async ({ page }) => {
  await open(page);
  await curl("/api/goto/other");
  await expect(page.locator("#switch .sw-text")).toContainText("Switching to Other in");
  await page.locator(".sw-stay").click();
  await expect(page.locator("#switch")).toBeHidden();
  await page.waitForTimeout(3500);
  expect(await page.evaluate(() => window.__panel.pageId)).toBe("home");
  await curl("/api/goto/other");
  await page.locator(".sw-go").click();
  await expect(page.locator('body[data-page="other"]')).toHaveCount(1);
  await curl("/api/goto/1?countdown=0");
  await expect(page.locator('body[data-page="home"]')).toHaveCount(1);
});

test("a while-it-lasts rule switches after its countdown and goes back when it ends", async ({ page }) => {
  await open(page);
  await curl("/api/push/playing", "yes");
  await expect(page.locator("#switch .sw-why")).toHaveText("Music plays", { timeout: 8000 });
  await expect(page.locator('body[data-page="music"]')).toHaveCount(1, { timeout: 8000 });
  await curl("/api/push/playing", "off");
  await expect(page.locator('body[data-page="home"]')).toHaveCount(1, { timeout: 8000 });
});

test("shortcut grid runs a host shortcut by id; the phone never sees its command", async ({ page, request }) => {
  await open(page);
  const list = (await (await request.post(`${host.base}/api/panel/rpc`, { data: { method: "shortcuts.list" } })).json()).result.shortcuts;
  expect(JSON.stringify(list)).not.toContain("/bin/echo");
  await page.locator(".w-scgrid .deck-tile", { hasText: "Hello" }).click();
  await expect.poll(() => host.log()).toContain('"target":"https://example.com/hello"');
  // Webhook run with a number; refused numbers answer 400.
  expect((await fetch(`${host.base}/api/run/vol?value=40`, { method: "POST" })).status).toBe(200);
  expect((await fetch(`${host.base}/api/run/vol?value=4e1`, { method: "POST" })).status).toBe(400);
  await expect.poll(() => host.log()).toContain('program ["/bin/echo","set","40"]');
});

test("Custom HTML: sandboxed (no panel, no network) but gets data and can run shortcuts", async ({ page }) => {
  await open(page);
  await curl("/api/push/temperature", "19");
  const frame = page.frameLocator(".w-custom iframe");
  await expect(frame.locator("#out")).toHaveText("temp 19");
  await expect(frame.locator("#out")).toHaveAttribute("data-parent", "blocked");
  await expect(frame.locator("#out")).toHaveAttribute("data-net", "blocked");
  await frame.locator("#bar").fill("63");
  await expect.poll(() => host.log()).toContain('program ["/bin/echo","set","63"]');
});
