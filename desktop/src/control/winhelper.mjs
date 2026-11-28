// Talks to DeskAssistHelper.exe (desktop/native/win-helper): one JSON request
// per line, replies matched by id. Started on first use, restarted if it dies,
// stopped after five idle minutes.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Where the helper lives: env override, the packaged app, then the dev build. */
export function helperPath({ env = process.env, resourcesPath = process.resourcesPath } = {}) {
  const candidates = [
    env.DECK_WIN_HELPER,
    resourcesPath && join(resourcesPath, "win-helper", "DeskAssistHelper.exe"),
    join(here, "..", "..", "native", "win-helper", "out", "DeskAssistHelper.exe"),
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) ?? null;
}

export function createWinHelper({ path = helperPath(), spawnImpl = spawn, timeoutMs = 8000, idleMs = 5 * 60_000, log = console.log } = {}) {
  let child = null;
  let ready = null;
  let seq = 0;
  const pending = new Map();
  let idle = null;

  function start() {
    if (ready) return ready;
    if (!path) return Promise.reject(new Error("The Windows helper isn't installed with this copy of DeskAssist."));
    child = spawnImpl(path, [], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let buf = "";
    ready = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("The Windows helper didn't start.")), timeoutMs);
      child.once("error", (err) => (clearTimeout(t), reject(err)));
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          let m;
          try {
            m = JSON.parse(line);
          } catch {
            continue;
          }
          if (m.ready) {
            clearTimeout(t);
            resolve(m.version);
            continue;
          }
          const p = pending.get(m.id);
          if (!p) continue;
          pending.delete(m.id);
          clearTimeout(p.timer);
          m.ok ? p.resolve(m.result) : p.reject(new Error(m.error || "The Windows helper failed."));
        }
      });
      child.stderr.on("data", (d) => log(`[win-helper] ${String(d).trim()}`));
      child.on("exit", (code) => {
        clearTimeout(t);
        child = null;
        ready = null;
        for (const p of pending.values()) (clearTimeout(p.timer), p.reject(new Error(`The Windows helper stopped (${code}).`)));
        pending.clear();
        reject(new Error(`The Windows helper stopped (${code}).`));
      });
    });
    ready.catch(() => {});
    return ready;
  }

  async function call(op, args = {}) {
    await start();
    clearTimeout(idle);
    idle = setTimeout(() => child?.stdin.end(), idleMs);
    idle.unref?.();
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => pending.delete(id) && reject(new Error("The Windows helper didn't answer.")), timeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ id, op, ...args })}\n`);
    });
  }

  return {
    available: !!path,
    call,
    stop() {
      clearTimeout(idle);
      child?.stdin.end();
      child?.kill();
    },
  };
}
