// Stage 2.3 / 2.4: demo mode (what App Review sees) and the Deck widget.
import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PANEL = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "panel", "dist", "panel.html")).href;

test("demo panel: simulated data, deck tiles respond, no network at all", async ({ page }) => {
  const requests = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("file:") && !r.url().startsWith("data:")) requests.push(r.url());
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 780, height: 360 });
  await page.goto(PANEL);

  await expect(page.locator("#banner")).toHaveText(/Simulated/);
  await expect(page.locator(".w-metric .num").first()).toHaveText(/^\d+$/);
  await expect(page.locator(".deck-tile")).toHaveCount(8);

  // Values move over time (it's a live simulation, not a picture).
  const seen = new Set();
  for (let i = 0; i < 4; i++) {
    seen.add(await page.locator(".w-metric .num").first().textContent());
    await page.waitForTimeout(2100);
  }
  expect(seen.size).toBeGreaterThan(1);

  // Tapping a tile goes through deck.press and reports success.
  const tile = page.locator(".deck-tile").first();
  await tile.click();
  await expect(tile).toHaveAttribute("data-result", "ok");

  // Jump to the Deck page by its dot.
  const deckDot = (await page.evaluate(() => [...document.querySelectorAll("#dots .dot")].map((d) => d.getAttribute("aria-label")))).indexOf("Deck");
  await page.locator("#dots .dot").nth(deckDot).click();
  await expect(page.locator('body[data-page="deck"]')).toHaveCount(1);

  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
