// Stage 14: the Printers page in demo mode (1, 2 and 4 printers, an error),
// and a real host polling a fake Klipper/Moonraker printer added in the editor.
import { test, expect } from "@playwright/test";
import http from "node:http";
import { pathToFileURL, fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { startHost } from "../lib/host.mjs";

const PANEL = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "panel", "dist", "panel.html")).href;

test("demo printers: four cards, states, progress, filament, error", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(PANEL);
  const i = await page.evaluate(() => [...document.querySelectorAll("#dots .dot")].map((d) => d.getAttribute("aria-label")).indexOf("Printers"));
  await page.locator("#dots .dot").nth(i).click();
  const cards = page.locator(".pr-card");
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(0)).toHaveAttribute("data-state", "printing");
  await expect(cards.nth(0).locator(".pr-pct")).toHaveText(/\d+%/);
  await expect(cards.nth(0).locator(".pr-slot.on")).toHaveCount(1);
  await expect(cards.nth(1)).toHaveAttribute("data-state", "paused");
  await expect(cards.nth(2).locator(".pr-pct")).toHaveText("✓");
  await expect(cards.nth(3).locator(".pr-error")).toHaveText(/Filament runout/);
  // Nothing overflows its card horizontally.
  const over = await page.evaluate(() => [...document.querySelectorAll(".pr-card")].some((c) => c.scrollWidth > c.clientWidth + 1));
  expect(over).toBe(false);
});

test.describe("host", () => {
  let host;
  let srv;
  let status = "printing";
  test.beforeAll(async () => {
    srv = http.createServer((req, res) => {
      const json = (v) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(v));
      if (req.url.startsWith("/printer/objects/query")) return json({ result: { status: { print_stats: { state: status, filename: "bracket.gcode", print_duration: 300, info: { current_layer: 12, total_layer: 80 } }, virtual_sdcard: { progress: 0.25 }, extruder: { temperature: 210, target: 210 }, heater_bed: { temperature: 60, target: 60 } } } });
      if (req.url.startsWith("/server/files/metadata")) return json({ result: { estimated_time: 2400 } });
      res.writeHead(404).end();
    });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    host = await startHost({
      port: 18992,
      localPort: 18993,
      config: { default: { home: "p", pages: [{ id: "p", name: "Printers", widgets: [{ id: "pw", type: "printer", x: 0, y: 0, w: 6, h: 4 }] }] } },
    });
  });
  test.afterAll(async () => {
    await host?.stop();
    srv?.close();
  });

  test("add a Klipper printer in the editor, test it, and watch the widget", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${host.base}/editor/`);
    await page.getByRole("button", { name: /Settings/ }).click();
    const sec = page.locator("#printerSettings");
    await sec.locator("#prBrand").selectOption("klipper");
    await sec.locator("#prName").fill("Voron");
    await sec.locator("#prHost").fill("127.0.0.1");
    await sec.locator("#prPort").fill(String(srv.address().port));
    await sec.locator("#addPrinter").click();
    await page.getByRole("button", { name: /^Save/ }).first().click();
    await expect.poll(async () => (await fetch(`${host.base}/api/editor/state`).then((r) => r.json())).config.settings.printers.length).toBe(1);
    await page.locator('#printerSettings .set-row').getByRole("button", { name: "Test connection" }).click();
    await expect(page.locator("#printerSettings .cal-status")).toHaveText(/✓ printing, nozzle 210/);

    const panel = await page.context().newPage();
    await panel.setViewportSize({ width: 900, height: 420 });
    await panel.goto(`${host.base}/panel/`);
    const card = panel.locator(".w-printer .pr-card");
    await expect(card).toHaveAttribute("data-state", "printing");
    await expect(card.locator(".pr-pct")).toHaveText("25%");
    await expect(card.locator(".pr-layer")).toHaveText("Layer 12 / 80");
    await expect(card.locator(".pr-left")).toHaveText("30 min left");
    status = "paused";
    await expect(card).toHaveAttribute("data-state", "paused", { timeout: 8000 });
  });
});
