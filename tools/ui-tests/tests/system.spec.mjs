// Stage 4: computer widgets against a real host on this machine.
import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { startHost } from "../lib/host.mjs";

const CONFIG = {
  default: {
    home: "sys",
    pages: [
      {
        id: "sys",
        name: "System",
        widgets: [
          { id: "cpuChart", type: "chart", x: 0, y: 0, w: 4, h: 2, options: { source: "cpu", source2: "mem" } },
          { id: "netChart", type: "chart", x: 4, y: 0, w: 4, h: 2, options: { source: "netDown", source2: "netUp" } },
          { id: "g", type: "gauge", x: 8, y: 0, w: 2, h: 2, options: { source: "mem" } },
          { id: "gpuTemp", type: "metric", x: 10, y: 0, w: 2, h: 2, options: { source: "gpuTemp" } },
          { id: "store", type: "storage", x: 0, y: 2, w: 4, h: 2 },
          { id: "gpu", type: "gpu", x: 4, y: 2, w: 4, h: 2 },
          { id: "top", type: "topprocs", x: 8, y: 2, w: 4, h: 4, options: { count: 5 } },
          { id: "net", type: "internet", x: 0, y: 4, w: 8, h: 2 },
        ],
      },
      {
        id: "procs",
        name: "Processes",
        widgets: [
          { id: "locked", type: "processes", x: 0, y: 0, w: 6, h: 6, options: { allowKill: false } },
          { id: "open", type: "processes", x: 6, y: 0, w: 6, h: 6, options: { allowKill: true } },
        ],
      },
    ],
  },
};

let host;
test.beforeAll(async () => {
  host = await startHost({ port: 18900, localPort: 18901, config: CONFIG });
});
test.afterAll(async () => {
  await host?.stop();
});

test("every computer widget shows live data from this machine", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1170, height: 540 });
  await page.goto(`${host.base}/panel/`);
  await expect(page.locator(".w-gauge .num")).toHaveText(/^\d+$/, { timeout: 15_000 });
  await expect(page.locator(".w-chart .chart-line.s0").first()).toHaveAttribute("d", /^M/, { timeout: 15_000 });
  await expect(page.locator(".w-storage .store-row").first()).toBeVisible({ timeout: 15_000 });
  expect(await page.locator(".w-storage .store-row").count()).toBeGreaterThanOrEqual(2); // memory + ≥1 disk
  await expect(page.locator(".w-gpu .gpu-card, .w-gpu .muted").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".w-procs .proc-row")).toHaveCount(5, { timeout: 15_000 });
  await expect(page.locator(".w-internet .net-status")).toHaveText(/Online|Offline/, { timeout: 15_000 });
  // A value the computer doesn't report reads "—", never a made-up number.
  const gpuTemp = await page.locator('.w[data-id="gpuTemp"] .num').textContent();
  expect(gpuTemp === "—" || /^\d+$/.test(gpuTemp)).toBe(true);
  await page.screenshot({ path: "test-results/system-page.png" });
  expect(errors).toEqual([]);
});

test("ending a process: refused unless the widget allows it, then works", async ({ request }) => {
  test.skip(process.platform === "win32", "uses the POSIX `sleep` command");
  const child = spawn("sleep", ["300"], { stdio: "ignore" });
  const exited = new Promise((r) => child.once("exit", (code, signal) => r(signal ?? code)));
  const rpc = async (params) => {
    const r = await request.post(`${host.base}/api/panel/rpc`, { data: { method: "procs.kill", params } });
    return (await r.json()).result;
  };
  try {
    // From a widget with ending turned off → refused by the computer.
    const locked = await rpc({ name: "sleep", pid: child.pid, all: false, widgetId: "locked" });
    expect(locked.ok).toBe(false);
    expect(locked.reason).toMatch(/turned off/);
    // From a widget id that isn't in this client's layout → refused.
    const forged = await rpc({ name: "sleep", pid: child.pid, all: false, widgetId: "made-up" });
    expect(forged.ok).toBe(false);
    // From the widget that allows it → the process ends.
    const ok = await rpc({ name: "sleep", pid: child.pid, all: false, widgetId: "open" });
    expect(ok.ok).toBe(true);
    expect(await exited).toBe("SIGTERM");
    expect(host.log()).toContain('end pid');
  } finally {
    child.kill();
  }
});

test("process sheet: shows why ending is off, and offers it when allowed", async ({ page }) => {
  await page.setViewportSize({ width: 1170, height: 540 });
  await page.goto(`${host.base}/panel/`);
  await page.evaluate(() => window.__panel.gotoId("procs"));
  const locked = page.locator('.w[data-id="locked"]');
  await expect(locked.locator(".proc-row").first()).toBeVisible({ timeout: 15_000 });
  await locked.locator(".proc-row").first().click();
  await expect(locked.locator(".sheet-msg")).toContainText("off for this widget");
  await locked.locator(".sheet-btn", { hasText: "Cancel" }).click();
  await expect(locked.locator(".proc-sheet")).toBeHidden();

  const open = page.locator('.w[data-id="open"]');
  const own = open.locator(".proc-row");
  await expect(own.first()).toBeVisible({ timeout: 15_000 });
  await own.first().click();
  // Either end buttons (own process) or an explanation (system / other user) — never silently nothing.
  await expect(open.locator(".sheet-btn.danger, .sheet-msg:not(:empty)").first()).toBeVisible();
});
