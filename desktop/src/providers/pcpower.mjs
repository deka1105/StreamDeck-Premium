// `pcpower` kind: is the computer's display asleep? For "follow PC sleep" and
// the night screen's "when the computer sleeps" mode.
//  macOS: the display's power state from ioreg (IODisplayWrangler, Intel Macs);
//         where that isn't reported, idle time ≥ the Energy "display sleep" minutes.
//  Windows: idle time ≥ the current power plan's "turn off display after".
//  Elsewhere: idle-time proxy only (never asleep if no timeout is known).

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { idleSeconds } from "./idle.mjs";

const run = promisify(execFile);

/** ioreg text → display on (true) / off (false) / unknown (null). Pure. */
export function parseWrangler(text) {
  const m = /"CurrentPowerState"\s*=\s*(\d+)/.exec(text ?? "");
  return m ? Number(m[1]) >= 4 : null;
}
/** `pmset -g` → display sleep minutes (0 = never), or null. Pure. */
export function parsePmset(text) {
  const m = /^\s*displaysleep\s+(\d+)/m.exec(text ?? "");
  return m ? Number(m[1]) : null;
}
/** `powercfg /q … VIDEOIDLE` → seconds (AC), or null. Pure. */
export function parsePowercfg(text) {
  const m = /Current AC Power Setting Index:\s*0x([0-9a-f]+)/i.exec(text ?? "");
  return m ? parseInt(m[1], 16) : null;
}

export function createPcPower({ platform = process.platform, runImpl = run, idle = idleSeconds } = {}) {
  let timeoutSec = null;
  let timeoutAt = 0;
  async function displayTimeout() {
    if (Date.now() - timeoutAt < 10 * 60_000) return timeoutSec;
    timeoutAt = Date.now();
    try {
      if (platform === "darwin") {
        const min = parsePmset((await runImpl("pmset", ["-g"], { timeout: 4000 })).stdout);
        timeoutSec = min ? min * 60 : null;
      } else if (platform === "win32") {
        const s = parsePowercfg((await runImpl("powercfg", ["/q", "SCHEME_CURRENT", "SUB_VIDEO", "VIDEOIDLE"], { timeout: 6000 })).stdout);
        timeoutSec = s || null;
      }
    } catch {
      timeoutSec = null;
    }
    return timeoutSec;
  }
  return {
    periodMs: 5000,
    async sample() {
      const idleSec = await idle().catch(() => null);
      let on = null;
      let source = "idle";
      if (platform === "darwin") {
        on = parseWrangler((await runImpl("ioreg", ["-r", "-c", "IODisplayWrangler", "-d", "1"], { timeout: 4000 }).catch(() => ({ stdout: "" }))).stdout);
        if (on !== null) source = "display";
      }
      if (on === null) {
        const t = await displayTimeout();
        on = !(t && idleSec !== null && idleSec >= t);
      }
      return { displayAsleep: !on, idleSec, source, at: Date.now() };
    },
  };
}
