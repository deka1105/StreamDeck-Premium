// Stage 3: the desktop layout editor.
import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHost } from "../lib/host.mjs";

let host;
test.beforeEach(async () => {
  host = await startHost({ port: 18890, localPort: 18891 }); // fresh host per test: starter layout
});
test.afterEach(async () => {
  await host?.stop();
});

async function openEditor(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.setViewportSize({ width: 1400, height: 860 });
  await page.goto(`${host.base}/editor/`);
  await expect(page.locator(".page-list li")).toHaveCount(2); // starter: Home + Deck
  return errors;
}
const editorState = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__editor.state.config)));

test("pages: add, rename, reorder, hide, set home — persists after reload", async ({ page }) => {
  const errors = await openEditor(page);
  await page.click("#addPage");
  await expect(page.locator(".page-list li")).toHaveCount(3);
  await page.fill("#pageName", "Studio");
  await page.locator('.page-list li:has-text("Studio") button[aria-label="Move Studio up"]').click();
  await expect(page.locator(".page-list li").nth(1)).toContainText("Studio");
  await page.check("#pageHome");
  await page.locator(".page-list li", { hasText: "Deck" }).locator(".page-name").click();
  await page.check("#pageHidden");
  await expect(page.locator("#save")).toBeEnabled();
  await page.click("#save");
  await expect(page.locator("#flash")).toContainText("Saved");

  await page.reload();
  await expect(page.locator(".page-list li")).toHaveCount(3);
  const names = await page.locator(".page-list .page-name").allTextContents();
  expect(names).toEqual(["Home", "Studio", "Deck"]);
  await expect(page.locator(".page-list li", { hasText: "Studio" }).locator(".tag")).toHaveText("home");
  await expect(page.locator(".page-list li", { hasText: "Deck" }).locator(".tag.dim")).toHaveText("hidden");
  expect(errors).toEqual([]);
});

test("canvas: add from palette, drag to move, drag corner to resize, overlaps refused", async ({ page }) => {
  await openEditor(page);
  await page.click("#addPage");
  await page.click('.pitem[data-type="metric"]');
  const box = page.locator(".wbox").first();
  await expect(box).toHaveCount(1);
  let w = (await editorState(page)).default.pages[2].widgets[0];
  expect([w.x, w.y, w.w, w.h]).toEqual([0, 0, 3, 2]);

  // Move two cells right, one down.
  const grid = await page.locator("#grid").boundingBox();
  const cw = grid.width / 12;
  const chh = grid.height / 6;
  const b = await box.boundingBox();
  await page.mouse.move(b.x + 20, b.y + 20);
  await page.mouse.down();
  await page.mouse.move(b.x + 20 + cw * 2, b.y + 20 + chh, { steps: 6 });
  await page.mouse.up();
  w = (await editorState(page)).default.pages[2].widgets[0];
  expect([w.x, w.y]).toEqual([2, 1]);

  // Resize by dragging the corner.
  const corner = await page.locator(".wbox .resize").first().boundingBox();
  await page.mouse.move(corner.x + 5, corner.y + 5);
  await page.mouse.down();
  await page.mouse.move(corner.x + 5 + cw * 3, corner.y + 5 + chh, { steps: 6 });
  await page.mouse.up();
  w = (await editorState(page)).default.pages[2].widgets[0];
  expect([w.w, w.h]).toEqual([6, 3]);

  // A second widget can't be dragged on top of the first.
  await page.click('.pitem[data-type="clock"]');
  const second = page.locator(".wbox").nth(1);
  const before = (await editorState(page)).default.pages[2].widgets[1];
  const sb = await second.boundingBox();
  await page.mouse.move(sb.x + 15, sb.y + 15);
  await page.mouse.down();
  await page.mouse.move(b.x + cw * 2 + 30, b.y + chh + 30, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator("#flash")).toContainText("overlap");
  const after = (await editorState(page)).default.pages[2].widgets[1];
  expect([after.x, after.y]).toEqual([before.x, before.y]);
});

test("options form + save reaches a panel within 3 s, without reloading it", async ({ page, context }) => {
  await openEditor(page);
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 780, height: 360 });
  await panel.goto(`${host.base}/panel/`);
  await expect(panel.locator("#status")).toHaveAttribute("data-online", "1");
  await expect(panel.locator(".metric-label").first()).toHaveText("CPU");

  // Change the Home page's CPU metric to memory with a custom label.
  await page.locator(".wbox", { hasText: "Metric" }).first().click();
  await page.selectOption("#opt-source", "mem");
  await page.fill("#opt-label", "RAM in use");
  await page.click("#save");
  const t0 = Date.now();
  await expect(panel.locator(".metric-label").first()).toHaveText("RAM in use", { timeout: 3000 });
  expect(Date.now() - t0).toBeLessThan(3000);
});

test("live preview shows unsaved edits; phones only change after Save", async ({ page, context }) => {
  await openEditor(page);
  const phone = await context.newPage();
  await phone.setViewportSize({ width: 780, height: 360 });
  await phone.goto(`${host.base}/panel/`);
  await expect(phone.locator("#status")).toHaveAttribute("data-online", "1");

  await page.click("#previewToggle");
  const frame = page.frameLocator("#previewFrame");
  await expect(frame.locator(".w-clock")).toBeVisible();
  await page.locator('.pitem[data-type="metric"]').click(); // no room on Home → flash
  await page.locator(".page-list li", { hasText: "Home" }).locator(".page-name").click();
  await page.click("#previewToggle"); // back to canvas to select a widget
  await page.locator(".wbox", { hasText: "Clock" }).click();
  await page.uncheck("#opt-date");
  await page.click("#previewToggle");
  await expect(frame.locator(".clock-date")).toBeHidden();
  // Live data in the preview.
  await expect(frame.locator(".w-metric .num").first()).toHaveText(/^\d+$/, { timeout: 10_000 });
  // The phone still shows the saved layout (date visible).
  await expect(phone.locator(".clock-date")).toBeVisible();
  await page.click("#save");
  await expect(phone.locator(".clock-date")).toBeHidden({ timeout: 3000 });
});

test("a stale save is refused with 409 instead of overwriting", async ({ page, context }) => {
  await openEditor(page);
  const other = await context.newPage();
  other.on("dialog", (d) => d.accept());
  await other.goto(`${host.base}/editor/`);
  await expect(other.locator(".page-list li")).toHaveCount(2);
  await other.click("#addPage");
  await other.click("#save");
  await expect(other.locator("#flash")).toContainText("Saved");
  await page.click("#addPage");
  await page.click("#save");
  await expect(page.locator("#flash")).toContainText("changed elsewhere");
});

test("export a page, then import it back", async ({ page }) => {
  await openEditor(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#exportPage")]);
  const file = join(tmpdir(), `exported-${Date.now()}.json`);
  await download.saveAs(file);
  const data = JSON.parse(readFileSync(file, "utf8"));
  expect(data.kind).toBe("deskassist.page");
  expect(data.page.name).toBe("Home");
  writeFileSync(file, JSON.stringify({ ...data, page: { ...data.page, name: "Home copy" } }));
  await page.setInputFiles("#importFile", file);
  await expect(page.locator(".page-list li")).toHaveCount(3);
  await expect(page.locator(".page-list li").nth(2)).toContainText("Home copy");
  const pages = (await editorState(page)).default.pages;
  expect(pages[2].widgets.length).toBe(pages[0].widgets.length);
  expect(new Set(pages.map((p) => p.id)).size).toBe(3);
});

test("every template creates a page whose widgets all survive saving", async ({ page }) => {
  await openEditor(page);
  const templates = await page.evaluate(() => window.__editor.state.templates);
  expect(templates.length).toBeGreaterThanOrEqual(4);
  for (const t of templates) await page.selectOption("#template", t.id);
  await page.click("#save");
  await expect(page.locator("#flash")).toContainText("Saved");
  const saved = (await editorState(page)).default.pages.slice(2);
  expect(saved.map((p) => p.widgets.length)).toEqual(templates.map((t) => t.page.widgets.length));
});

test("the editor is not served to foreign hosts", async ({ request }) => {
  const r = await request.get(`${host.base}/editor/`, { headers: { host: "evil.example:18891" } });
  expect(r.status()).toBe(403);
});
