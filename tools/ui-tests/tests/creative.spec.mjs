// Stage 17: creative controls in demo mode, and the host refusing unknown tools.
import { test, expect } from "@playwright/test";
import { pathToFileURL, fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { startHost } from "../lib/host.mjs";

const PANEL = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "panel", "dist", "panel.html")).href;

test("demo creative page: nine keys, active tool, precision value read back, colour", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(PANEL);
  const i = await page.evaluate(() => [...document.querySelectorAll("#dots .dot")].map((d) => d.getAttribute("aria-label")).indexOf("Create"));
  await page.locator("#dots .dot").nth(i).click();
  await expect(page.locator(".cr-key")).toHaveCount(9);
  await page.locator(".cr-key", { hasText: "Brush" }).click();
  await expect(page.locator(".cr-key.on")).toHaveText(/Brush/);
  await expect(page.locator(".w-cr-slider .cr-val").first()).toHaveText("2.5");
  await page.locator(".w-cr-slider").first().locator('[data-d="1"]').click();
  await expect(page.locator(".w-cr-slider .cr-val").first()).toHaveText("3.5");
  await page.locator(".sw").nth(2).click();
  await expect(page.locator(".cr-chip")).toHaveCSS("background-color", "rgb(239, 68, 68)");
});

test("host: tool ids, controls and colours are checked on the computer (dry run)", async ({ request }) => {
  const host = await startHost({ port: 18994, localPort: 18995 });
  const rpc = async (method, params) => (await (await request.post(`${host.base}/api/panel/rpc`, { data: { method, params } })).json()).result;
  try {
    expect((await rpc("creative.tools", { app: "photoshop" })).tools.length).toBeGreaterThanOrEqual(9);
    expect((await rpc("creative.tool", { app: "photoshop", tool: "rm -rf" })).ok).toBe(false);
    expect((await rpc("creative.set", { app: "illustrator", control: "script", value: 1 })).ok).toBe(false);
    expect((await rpc("creative.color", { app: "photoshop", hex: "javascript:1" })).error).toMatch(/Not a colour/);
    expect((await rpc("blender.op", { op: "xray" })).error).toMatch(/Blender isn't running|add-on/);
  } finally {
    await host.stop();
  }
});
