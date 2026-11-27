// Stage 5: time and personal widgets; state that survives reloads.
import { test, expect } from "@playwright/test";
import { startHost } from "../lib/host.mjs";

const CONFIG = {
  default: {
    home: "time",
    pages: [
      {
        id: "time",
        name: "Time",
        widgets: [
          { id: "an", type: "analog", x: 0, y: 0, w: 2, h: 3, options: { zone: "Asia/Tokyo", label: true } },
          { id: "wc", type: "wordclock", x: 2, y: 0, w: 4, h: 3 },
          { id: "world", type: "worldclocks", x: 6, y: 0, w: 3, h: 3 },
          { id: "cal", type: "calendar", x: 9, y: 0, w: 3, h: 3 },
          { id: "prog", type: "progress", x: 0, y: 3, w: 3, h: 3 },
          { id: "cd", type: "countdown", x: 3, y: 3, w: 3, h: 3, options: { title: "Launch", date: "2099-01-01" } },
          { id: "br", type: "breathe", x: 6, y: 3, w: 3, h: 3 },
          { id: "q", type: "quote", x: 9, y: 3, w: 3, h: 3 },
        ],
      },
      {
        id: "me",
        name: "Personal",
        widgets: [
          { id: "note", type: "note", x: 0, y: 0, w: 4, h: 3 },
          { id: "todo", type: "checklist", x: 4, y: 0, w: 4, h: 3, options: { items: ["One", "Two", "Three"] } },
          { id: "ct", type: "counter", x: 8, y: 0, w: 4, h: 3 },
          { id: "tm", type: "timer", x: 0, y: 3, w: 4, h: 3 },
          { id: "sw", type: "stopwatch", x: 4, y: 3, w: 4, h: 3 },
          { id: "po", type: "pomodoro", x: 8, y: 3, w: 4, h: 3 },
        ],
      },
      { id: "other", name: "Other", widgets: [{ id: "c", type: "clock", x: 0, y: 0, w: 12, h: 6 }] },
    ],
  },
};

let host;
test.beforeAll(async () => {
  host = await startHost({ port: 18910, localPort: 18911, config: CONFIG });
});
test.afterAll(async () => {
  await host?.stop();
});

async function open(page, pageId) {
  await page.setViewportSize({ width: 1170, height: 540 });
  await page.goto(`${host.base}/panel/`);
  await expect(page.locator("#dots .dot")).toHaveCount(3);
  if (pageId) {
    await page.evaluate((id) => window.__panel.gotoId(id), pageId);
    await expect(page.locator(`body[data-page="${pageId}"]`)).toHaveCount(1);
  }
}

test("time widgets render with real values", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await expect(page.locator(".analog-label")).toHaveText("Tokyo");
  expect(await page.locator(".hand.h").getAttribute("transform")).toMatch(/rotate\(/);
  expect(await page.locator(".wc-grid span.on").count()).toBeGreaterThan(5);
  await expect(page.locator(".wc-grid")).toHaveAttribute("aria-label", /^it is /);
  await expect(page.locator(".world-row")).toHaveCount(3);
  await expect(page.locator(".cal-d.today")).toHaveCount(1);
  await expect(page.locator(".w-progress .store-row")).toHaveCount(4);
  await expect(page.locator(".cd-big")).toHaveText(/days/);
  await expect(page.locator(".q-text")).toHaveText(/^“.+”$/);
  await page.screenshot({ path: "test-results/time-page.png" });
  expect(errors).toEqual([]);
});

test("note, checklist and counter survive a reload and reach other screens", async ({ page, context }) => {
  await open(page, "me");
  const other = await context.newPage();
  await open(other, "me");

  await page.locator(".note-text").fill("Call the bank");
  await page.locator(".note-text").blur();
  await page.locator(".cl-row", { hasText: "Two" }).locator("input").check();
  await page.locator(".ct-plus").click();
  await page.locator(".ct-plus").click();
  await page.locator(".ct-plus").click();
  await page.locator(".ct-minus").click();

  // The other screen follows without a reload.
  await expect(other.locator(".note-text")).toHaveValue("Call the bank");
  await expect(other.locator(".cl-row", { hasText: "Two" }).locator("input")).toBeChecked();
  await expect(other.locator(".ct-num")).toHaveText("2");

  await page.waitForTimeout(500); // the host writes state in coalesced batches
  await page.reload();
  await expect(page.locator("#dots .dot")).toHaveCount(3);
  await page.evaluate(() => window.__panel.gotoId("me"));
  await expect(page.locator(".note-text")).toHaveValue("Call the bank");
  await expect(page.locator(".cl-count")).toHaveText("1/3");
  await expect(page.locator(".ct-num")).toHaveText("2");
});

test("a running timer keeps running through a reload; its alarm fires on another page", async ({ page }) => {
  await open(page, "me");
  await page.locator(".w-timer .tbtn.preset", { hasText: "1m" }).click();
  await expect(page.locator(".w-timer")).toHaveAttribute("data-state", "running");
  await page.waitForTimeout(2500);
  await page.reload();
  await expect(page.locator("#dots .dot")).toHaveCount(3);
  await page.evaluate(() => window.__panel.gotoId("me"));
  await expect(page.locator(".w-timer")).toHaveAttribute("data-state", "running");
  const t = await page.locator(".t-time").textContent();
  const [m, s] = t.split(":").map(Number);
  expect(m * 60 + s).toBeLessThan(59);
  expect(m * 60 + s).toBeGreaterThan(45);

  // On another page, the time left shows in a badge above the dots.
  await page.evaluate(() => window.__panel.gotoId("other"));
  await expect(page.locator("#timerBadge")).toBeVisible();
  await expect(page.locator("#timerBadge")).toHaveText(/^⏱ 0:\d\d$/);

  // Shorten it to 3 s via the same API the widget uses; the alarm fires here.
  await page.request.post(`${host.base}/api/panel/rpc`, {
    data: { method: "state.set", params: { key: "me:tm", value: { running: true, endAt: Date.now() + 3000, remainingMs: 0, durationMs: 60_000 } } },
  });
  await expect(page.locator("#alarm")).toBeVisible({ timeout: 6000 });
  await expect(page.locator(".alarm-title")).toHaveText("Time's up");
  await page.locator(".alarm-go").click();
  await expect(page.locator('body[data-page="me"]')).toHaveCount(1);
});

test("pausing a timer early cancels its alarm", async ({ page }) => {
  await open(page, "other");
  await page.request.post(`${host.base}/api/panel/rpc`, {
    data: { method: "state.set", params: { key: "me:tm", value: { running: true, endAt: Date.now() + 2500, remainingMs: 0, durationMs: 60_000 } } },
  });
  await page.waitForTimeout(800);
  await page.request.post(`${host.base}/api/panel/rpc`, {
    data: { method: "state.set", params: { key: "me:tm", value: { running: false, endAt: null, remainingMs: 1700, durationMs: 60_000 } } },
  });
  await page.waitForTimeout(3500);
  await expect(page.locator("#alarm")).toBeHidden();
});

test("stopwatch keeps counting through a reload", async ({ page }) => {
  await open(page, "me");
  await page.locator(".w-stopwatch .tbtn", { hasText: "Start" }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.locator("#dots .dot")).toHaveCount(3);
  await page.evaluate(() => window.__panel.gotoId("me"));
  await page.waitForTimeout(600);
  const txt = await page.locator(".sw-time").textContent();
  expect(Number(txt.split(":")[1])).toBeGreaterThanOrEqual(1);
  await expect(page.locator(".w-stopwatch .tbtn", { hasText: "Lap" })).toBeVisible();
});
