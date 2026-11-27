// Stage 2.2: pages, swipe, dots, overview, idle return, orientation.
import { test, expect } from "@playwright/test";
import { startHost } from "../lib/host.mjs";

const CONFIG = {
  settings: { idleSec: 6 },
  default: {
    home: "one",
    pages: [
      { id: "one", name: "One", widgets: [{ type: "clock", x: 0, y: 0, w: 6, h: 3 }, { type: "metric", x: 6, y: 0, w: 3, h: 3, options: { source: "cpu" } }] },
      { id: "two", name: "Two", widgets: [{ type: "metric", x: 0, y: 0, w: 12, h: 6, options: { source: "mem" } }] },
      { id: "three", name: "Three", staySec: 0, widgets: [{ type: "clock", x: 0, y: 0, w: 12, h: 6 }] },
      { id: "secret", name: "Hidden", hidden: true, widgets: [] },
    ],
  },
};

let host;
test.beforeAll(async () => {
  host = await startHost({ config: CONFIG });
});
test.afterAll(async () => {
  await host?.stop();
});

const pageId = (page) => page.evaluate(() => window.__panel.pageId);

async function swipe(page, dx) {
  const vp = page.viewportSize();
  const y = vp.height / 2;
  const x0 = vp.width / 2 - dx / 2;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x0 + (dx * i) / 8, y);
  await page.mouse.up();
  await page.waitForTimeout(400);
}

for (const vp of [{ width: 780, height: 360 }, { width: 360, height: 780 }]) {
  test(`navigation at ${vp.width}×${vp.height}`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(vp);
    await page.goto(`${host.base}/panel/`);
    await expect(page.locator("#status")).toHaveAttribute("data-online", "1");

    // Starts on home; hidden pages get no dot.
    expect(await pageId(page)).toBe("one");
    await expect(page.locator("#dots .dot")).toHaveCount(3);

    // Swipe left → next page; swipe right → back.
    await swipe(page, -220);
    expect(await pageId(page)).toBe("two");
    await swipe(page, 220);
    expect(await pageId(page)).toBe("one");
    // Swiping past the first page does nothing.
    await swipe(page, 220);
    expect(await pageId(page)).toBe("one");

    // Dots jump straight to a page.
    await page.locator("#dots .dot").nth(2).click();
    await page.waitForTimeout(350);
    expect(await pageId(page)).toBe("three");
    await expect(page.locator("#dots .dot").nth(2)).toHaveAttribute("aria-current", "page");

    // Long-press the dots → overview; tap a card to jump.
    const dots = page.locator("#dots");
    const box = await dots.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await expect(page.locator("#overview")).toBeVisible();
    await expect(page.locator(".ov-card")).toHaveCount(3);
    await page.locator(".ov-card", { hasText: "Two" }).click();
    await expect(page.locator("#overview")).toBeHidden();
    expect(await pageId(page)).toBe("two");

    // Keyboard arrows (browser panel).
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(350);
    expect(await pageId(page)).toBe("three");

    // Portrait layouts don't overlap.
    if (vp.height > vp.width) {
      await page.keyboard.press("Home");
      await page.waitForTimeout(350);
      const rects = await page.locator(".page:last-child .w").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
      for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          expect(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1).toBe(true);
        }
    }
    expect(errors).toEqual([]);
  });
}

test("idle return: back home after the idle time, but not from a stay page", async ({ page }) => {
  await page.setViewportSize({ width: 780, height: 360 });
  await page.goto(`${host.base}/panel/`);
  await expect(page.locator("#status")).toHaveAttribute("data-online", "1");
  await page.evaluate(() => window.__panel.gotoId("two"));
  expect(await pageId(page)).toBe("two");
  await page.waitForTimeout(8000); // idleSec is 6
  expect(await pageId(page)).toBe("one");

  await page.evaluate(() => window.__panel.gotoId("three")); // staySec: 0 → never returns
  await page.waitForTimeout(8000);
  expect(await pageId(page)).toBe("three");
});

test("live CPU data reaches the metric widget", async ({ page }) => {
  await page.setViewportSize({ width: 780, height: 360 });
  await page.goto(`${host.base}/panel/`);
  await expect(page.locator(".w-metric .num").first()).toHaveText(/^\d+$/, { timeout: 10_000 });
});
