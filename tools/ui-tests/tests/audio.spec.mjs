// Stage 12: audio and system widgets in demo mode, and push-to-talk's hold
// against a real host (macOS path on the dev Mac; dry-run host elsewhere).
import { test, expect } from "@playwright/test";
import { pathToFileURL, fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { startHost } from "../lib/host.mjs";

const PANEL = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "panel", "dist", "panel.html")).href;

async function goto(page, name) {
  const i = await page.evaluate((n) => [...document.querySelectorAll("#dots .dot")].map((d) => d.getAttribute("aria-label")).indexOf(n), name);
  await page.locator("#dots .dot").nth(i).click();
}

test("demo audio: mixer, devices, push-to-talk, profiles, ducking, power plan, hold-to-confirm", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(PANEL);
  await goto(page, "Audio");

  // Mixer: one row per app plus the main output; meters move.
  const rows = page.locator(".mx-row");
  await expect(rows).toHaveCount(5);
  const spotify = rows.filter({ hasText: "Spotify" });
  await spotify.locator("input").fill("20");
  await spotify.locator("input").dispatchEvent("change");
  await expect(spotify.locator(".mx-num")).toHaveText("20");
  await spotify.locator(".mx-mute").click();
  await expect(spotify).toHaveAttribute("data-muted", "1");
  await expect.poll(async () => spotify.locator(".mx-meter").evaluate((e) => e.style.transform)).toMatch(/scaleX\(0\)/);

  // Devices: switch the output.
  const speakers = page.locator(".dv-dev", { hasText: "Speakers" });
  await speakers.click();
  await expect(speakers).toHaveClass(/\bon\b/);
  await expect(page.locator('.dv-sec[data-flow="render"] .dv-dev.on')).toHaveCount(1);

  // Push-to-talk: live while held, off on release; the mic shows open while held.
  const ptt = page.locator(".ptt-btn");
  const box = await ptt.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(ptt).toHaveClass(/live/);
  await expect(page.locator('.dv-sec[data-flow="capture"]')).not.toHaveAttribute("data-muted", "1");
  await page.mouse.up();
  await expect(ptt).not.toHaveClass(/live/);
  await expect(page.locator('.dv-sec[data-flow="capture"]')).toHaveAttribute("data-muted", "1");

  // Profile and ducking.
  await page.locator(".w-profiles .cd-btn", { hasText: "Gaming" }).click();
  await expect(page.locator(".dv-dev.on", { hasText: "Speakers" })).toBeVisible();
  await page.locator(".duck").click();
  await expect(page.locator(".duck")).toHaveText(/Ducking on/);

  // Power plan.
  const perf = page.locator(".w-keys .cd-btn", { hasText: "High performance" }).first();
  await perf.click();
  await expect(perf).toHaveClass(/\bon\b/);

  // Lock needs a full hold: a quick tap does nothing.
  const lock = page.locator('.hold[data-a="lock"]');
  await lock.click();
  await expect(lock).not.toHaveAttribute("data-result", "ok");
  const lb = await lock.boundingBox();
  await page.mouse.move(lb.x + 10, lb.y + 10);
  await page.mouse.down();
  await page.waitForTimeout(1150);
  await page.mouse.up();
  await expect(lock).toHaveAttribute("data-result", "ok");

  await goto(page, "PC");
  await expect(page.locator(".br-rows .vol-row")).toHaveCount(2);
  const upd = page.locator(".svc", { hasText: "Windows Update" });
  await upd.locator('[data-a="start"]').click();
  await expect(upd).toHaveAttribute("data-state", "running");
  expect(errors).toEqual([]);
});

test.describe("host", () => {
  let host;
  test.beforeAll(async () => {
    host = await startHost({
      port: 18990,
      localPort: 18991,
      config: { default: { home: "a", pages: [{ id: "a", name: "A", widgets: [{ id: "lk", type: "powerbuttons", x: 0, y: 0, w: 6, h: 3 }, { id: "pt", type: "ptt", x: 6, y: 0, w: 6, h: 3 }] }] } },
    });
  });
  test.afterAll(async () => host?.stop());

  test("lock and sleep refuse without the confirmed hold; the hold goes through (dry run)", async ({ page }) => {
    const rpc = (method, params) => page.evaluate(([m, p]) => window.__panel.bridge.request(m, p), [method, params]);
    await page.goto(`${host.base}/panel/`);
    await expect(page.locator(".hold")).toHaveCount(2);
    expect((await rpc("system.power", { action: "sleep" })).error).toMatch(/Hold the button/);
    expect((await rpc("system.power", { action: "reboot", confirm: true })).ok).toBe(false);
    const lb = await page.locator('.hold[data-a="sleep"]').boundingBox();
    await page.mouse.move(lb.x + 10, lb.y + 10);
    await page.mouse.down();
    await page.waitForTimeout(1150);
    await page.mouse.up();
    await expect(page.locator('.hold[data-a="sleep"]')).toHaveAttribute("data-result", "ok");
    await expect.poll(() => host.log()).toMatch(/\(dry-run\) sleep/);
    // Ping without a held button is refused.
    expect((await rpc("ptt.hold", {})).ok).toBe(false);
  });
});
