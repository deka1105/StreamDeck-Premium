// Stage 10: looks (presets + inheritance), wallpaper, navigation styles,
// night / black screens, dimming, Smart Stack, marquee — plus visual snapshots.
import { test, expect } from "@playwright/test";
import { startHost } from "../lib/host.mjs";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const tiles = (p) => [
  { id: `${p}a`, type: "pushvalue", x: 0, y: 0, w: 4, h: 3, options: { key: "temp", title: "Temperature" } },
  { id: `${p}b`, type: "title", x: 4, y: 0, w: 8, h: 1, options: { text: "Good evening", card: true } },
  { id: `${p}c`, type: "note", x: 4, y: 1, w: 4, h: 2 },
  { id: `${p}d`, type: "pushvalue", x: 8, y: 1, w: 4, h: 2, options: { key: "build", title: "Build", style: "progress" } },
  { id: `${p}e`, type: "notifications", x: 0, y: 3, w: 12, h: 3 },
];

let host;
test.beforeAll(async () => {
  host = await startHost({
    port: 18980,
    localPort: 18981,
    config: {
      default: {
        home: "one",
        look: { preset: "midnight" },
        display: { nav: "bar" },
        pages: [
          { id: "one", name: "Home", widgets: tiles("a") },
          { id: "two", name: "Paper", look: { preset: "paper", radius: 6 }, widgets: tiles("b").map((w) => (w.id === "ba" ? { ...w, look: { tile: "#fde68a", accent: "#b45309" } } : w)) },
          { id: "three", name: "Wall", look: { preset: "glass", wallpaper: { src: PNG, dim: 0.5, blur: 4 } }, widgets: tiles("c") },
          { id: "four", name: "Stack", widgets: [
            { id: "st", type: "stack", x: 0, y: 0, w: 6, h: 6, options: { types: "pushvalue, notifications, title", seconds: 0, smart: false } },
            { id: "mq", type: "title", x: 6, y: 0, w: 3, h: 1, options: { text: "A very long headline that cannot possibly fit in this small tile", marquee: true, card: true } },
          ] },
        ],
      },
    },
  });
  await fetch(`${host.base}/api/push/temp`, { method: "POST", body: "21.5" });
  await fetch(`${host.base}/api/push/build`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: "passed", progress: 0.7 }) });
});
test.afterAll(async () => host?.stop());

async function open(page, path = "/panel/") {
  await page.setViewportSize({ width: 1170, height: 540 });
  await page.goto(`${host.base}${path}`);
  await expect(page.locator("#dots .dot")).toHaveCount(4);
  await expect(page.locator('.w[data-id="aa"] .push-num')).toHaveText("21.5");
}
const go = (page, id) => page.evaluate((x) => window.__panel.gotoId(x), id);
const cssVar = (page, sel, v) => page.locator(sel).first().evaluate((el, name) => getComputedStyle(el).getPropertyValue(name).trim(), v);

test("looks inherit: panel → page preset → tile override", async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => document.body.dataset.theme)).toBe("dark");
  await go(page, "two");
  await expect(page.locator('body[data-theme="light"]')).toHaveCount(1);
  expect(await cssVar(page, "body", "--radius")).toBe("6px");
  expect(await cssVar(page, '.w[data-id="ba"]', "--surface")).toBe("#fde68a");
  expect(await cssVar(page, '.w[data-id="bc"]', "--surface")).toBe("#ffffff");
  await go(page, "one");
  await expect(page.locator('body[data-theme="dark"]')).toHaveCount(1);
  expect(await cssVar(page, "body", "--radius")).toBe("16px");
});

test("wallpaper shows only on its page, with dim and blur", async ({ page }) => {
  await open(page);
  await expect(page.locator("#wall")).toBeHidden();
  await go(page, "three");
  await expect(page.locator("#wall")).toBeVisible();
  expect(await page.locator(".wall-img").evaluate((e) => e.style.filter)).toBe("blur(4px)");
  expect(await page.locator(".wall-dim").evaluate((e) => e.style.opacity)).toBe("0.5");
});

test("page bar shows names; side bar and hidden navigation work", async ({ page }) => {
  await open(page);
  await expect(page.locator("#dots .dot-name").first()).toBeVisible();
  await page.locator("#dots .dot", { hasText: "Paper" }).click();
  await expect(page.locator('body[data-page="two"]')).toHaveCount(1);
  for (const nav of ["side-left", "none", "dots"]) {
    await page.evaluate((n) => window.__panel.display.apply({ nav: n, badges: true, night: { mode: "off" } }), nav);
    if (nav === "none") await expect(page.locator("#dots")).toBeHidden();
    else if (nav === "dots") await expect(page.locator("#dots .dot-name").first()).toBeHidden();
    else expect(await page.locator("#dots").evaluate((e) => getComputedStyle(e).flexDirection)).toBe("column");
  }
});

test("night screen from a rule; a tap wakes it; PC asleep → black", async ({ page }) => {
  await open(page);
  await page.evaluate(() => document.body.dispatchEvent(new CustomEvent("deskassist-night", { detail: { on: true } })));
  await expect(page.locator('#night[data-style="night"]')).toBeVisible();
  await expect(page.locator(".night-time")).toHaveText(/\d{1,2}:\d{2}/);
  await page.locator("#night").click();
  await expect(page.locator("#night")).toBeHidden();
  // Computer's display asleep with "follow PC sleep" → black screen.
  await page.evaluate(() => {
    window.__panel.display.apply({ nav: "bar", badges: true, followPcSleep: true, night: { mode: "off" } });
  });
  expect(await page.evaluate(() => window.__panel.display.needs())).toEqual(["pcpower"]);
});

test("Smart Stack swaps widgets by its dots; marquee scrolls long text", async ({ page }) => {
  await open(page);
  await go(page, "four");
  const view = page.locator(".stack-view");
  await expect(view).toHaveAttribute("data-type", "pushvalue");
  await page.locator('.stack-dots i[data-k="1"]').click();
  await expect(view).toHaveAttribute("data-type", "notifications");
  await expect(view.locator(".w-notes")).toBeVisible();
  await expect(page.locator(".marquee-track.on")).toHaveCount(1);
});

test("editor: pick a preset and night schedule; saved config is sanitised", async ({ page }) => {
  await page.goto(`${host.base}/editor/`);
  await page.locator("#settingsToggle").click();
  await page.locator('.preset[data-preset="ember"]').click();
  await page.locator("#navStyle").selectOption("side-right");
  await page.locator("#nightMode").selectOption("schedule");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(async () => (await (await fetch(`${host.base}/api/editor/state`)).json()).config.default.look.preset).toBe("ember");
  const cfg = (await (await fetch(`${host.base}/api/editor/state`)).json()).config.default;
  expect(cfg.display.nav).toBe("side-right");
  expect(cfg.display.night.mode).toBe("schedule");
});

test.describe("visual", () => {
  for (const [id, name] of [["one", "midnight-bar"], ["two", "paper-tile-override"], ["three", "glass-wallpaper"]]) {
    test(`snapshot: ${name}`, async ({ page }) => {
      await open(page);
      await go(page, id);
      await page.waitForTimeout(400);
      await expect(page).toHaveScreenshot(`${name}.png`, { mask: [page.locator(".push-at, .note-row .muted, #status")] });
    });
  }
  test("snapshot: night screen", async ({ page }) => {
    await open(page);
    await page.evaluate(() => document.body.dispatchEvent(new CustomEvent("deskassist-night", { detail: { on: true } })));
    await expect(page).toHaveScreenshot("night.png", { mask: [page.locator(".night-clock")] });
  });
});
