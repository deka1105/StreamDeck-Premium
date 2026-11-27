// Starts a throwaway DeskAssist host for browser tests: dry-run (nothing is
// executed), its own data directory in the OS temp folder, and its own ports,
// so it never touches a real installation.

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const HOST = join(repo, "desktop", "src", "host.mjs");

export async function startHost({ port = 18888, localPort = 18889, config } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "deskassist-ui-"));
  if (config) {
    mkdirSync(join(cwd, ".data"), { recursive: true });
    writeFileSync(join(cwd, ".data", "panel.json"), JSON.stringify(config));
  }
  const child = spawn(process.execPath, [HOST], {
    cwd,
    env: { ...process.env, DECK_PORT: String(port), DECK_LOCAL_PORT: String(localPort), DECK_DRY_RUN: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const base = `http://127.0.0.1:${localPort}`;
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      const r = await fetch(`${base}/panel/`);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`host did not start:\n${log}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return {
    base,
    cwd,
    log: () => log,
    stop: () =>
      new Promise((resolve) => {
        child.once("exit", resolve);
        child.kill();
      }),
  };
}
