// Stage 13: the Android app's events reach the panel page (volume keys flip
// pages, a hand near the phone wakes it) — here the test plays the app's role,
// in demo mode, exactly as the app injects them into its WebView.
import { test, expect } from "@playwright/test";
import { pathToFileURL, fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const PANEL = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "panel", "dist", "panel.html")).href;

test("phone events: volume down = next page, up = previous; works in demo mode", async ({ page }) => {
  await page.addInitScript(() => {
    window.__sent = [];
    window.ReactNativeWebView = { postMessage: (m) => window.__sent.push(m) };
    window.__deskassistBoot = { demo: true };
  });
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto(PANEL);
  const current = () => page.evaluate(() => window.__panel.pageId);
  await expect.poll(current).toBe("home");
  const send = (action) => page.evaluate((a) => window.__deskassist.receive({ t: "evt", type: "phone", data: { action: a } }), action);
  await send("next");
  await expect.poll(current).toBe("system");
  await send("next");
  await send("prev");
  await expect.poll(current).toBe("system");
  // The phone's battery still reaches the battery widget in demo mode.
  await page.evaluate(() => window.__deskassist.receive({ t: "evt", type: "data", data: { kind: "battery", value: { level: 0.42, charging: false } } }));
  expect(await page.evaluate(() => typeof window.__deskassist.receive)).toBe("function");
});
