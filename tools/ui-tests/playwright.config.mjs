import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  workers: 1, // each file starts its own host on fixed ports
  reporter: [["list"]],
  use: { browserName: "chromium", headless: true },
});
