import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  workers: 1, // each file starts its own host on fixed ports
  reporter: [["list"]],
  // Screenshot baselines are made on the development Mac; fonts differ on the
  // Linux CI runner, so CI checks behaviour only and skips pixel comparisons.
  ignoreSnapshots: !!process.env.CI,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide" } },
  use: { browserName: "chromium", headless: true },
});
