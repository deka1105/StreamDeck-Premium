// Dev tasks and services: programs set up in the editor (say `npm run dev` in
// a project folder) that the panel can start, stop and restart. Only
// processes DeskAssist itself started can be stopped — never anything else
// running on the computer. The phone sees names, state and recent output.

import { spawn, execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { splitArgs } from "../panel/shortcuts.mjs";

const MAX_LINES = 60;
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r/g, "");

export function createServices({ getSettings, spawnImpl = spawn, log = console.log, platform = process.platform } = {}) {
  const running = new Map(); // id -> { child, startedAt, lines[] }
  const ended = new Map(); // id -> { code, at, lines[] }
  let onChange = () => {};
  const list = () => getSettings()?.control?.services ?? [];

  function push(rec, chunk) {
    const text = strip(String(chunk));
    const parts = (rec.partial + text).split("\n");
    rec.partial = parts.pop() ?? "";
    rec.lines.push(...parts.filter((l) => l.trim()).map((l) => l.slice(0, 300)));
    if (rec.lines.length > MAX_LINES) rec.lines.splice(0, rec.lines.length - MAX_LINES);
  }

  function start(id) {
    const s = list().find((x) => x.id === id);
    if (!s) throw new Error("No such service.");
    if (running.has(id)) return { ok: true, already: true };
    if (s.cwd && !existsSync(s.cwd)) throw new Error(`The folder ${s.cwd} doesn't exist.`);
    // No shell: the program and each argument are passed as they are. On
    // Windows, .cmd launchers (npm, yarn) need the shell to start at all.
    const isCmd = platform === "win32" && /^(npm|npx|yarn|pnpm)$|\.cmd$|\.bat$/i.test(s.cmd);
    const child = spawnImpl(s.cmd, splitArgs(s.args), {
      cwd: s.cwd || undefined,
      stdio: ["ignore", "pipe", "pipe"],
      detached: platform !== "win32", // own process group, so stop() ends its children too
      windowsHide: true,
      shell: isCmd,
      env: { ...process.env, FORCE_COLOR: "0" },
    });
    const rec = { child, startedAt: Date.now(), lines: [], partial: "" };
    running.set(id, rec);
    ended.delete(id);
    child.stdout?.on("data", (c) => push(rec, c));
    child.stderr?.on("data", (c) => push(rec, c));
    const finish = (code) => {
      if (running.get(id) !== rec) return;
      running.delete(id);
      ended.set(id, { code, at: Date.now(), lines: rec.lines });
      log(`■ service ${s.name} exited (${code})`);
      onChange();
    };
    child.on("error", (err) => (rec.lines.push(`Couldn't start: ${err.message}`), finish(-1)));
    child.on("exit", (code, signal) => finish(code ?? (signal ? `signal ${signal}` : null)));
    log(`▶ service ${s.name}`);
    return { ok: true };
  }

  function stop(id) {
    const rec = running.get(id);
    if (!rec) return { ok: true, already: true };
    const pid = rec.child.pid;
    try {
      if (platform === "win32") execFile("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true }, () => {});
      else process.kill(-pid, "SIGTERM");
    } catch {
      rec.child.kill();
    }
    // Insist after a few seconds if it ignores the polite request.
    setTimeout(() => {
      if (running.get(id) === rec) {
        try {
          platform === "win32" ? rec.child.kill() : process.kill(-pid, "SIGKILL");
        } catch {}
      }
    }, 4000).unref?.();
    return { ok: true };
  }

  return {
    periodMs: 2000,
    setOnChange(fn) {
      onChange = fn;
    },
    async sample() {
      return {
        services: list().map((s) => {
          const r = running.get(s.id);
          const e = ended.get(s.id);
          return {
            id: s.id,
            name: s.name,
            url: s.url || "",
            state: r ? "running" : e ? (e.code === 0 ? "done" : "failed") : "stopped",
            since: r?.startedAt ?? e?.at ?? null,
            code: e?.code ?? null,
            lines: (r?.lines ?? e?.lines ?? []).slice(-12),
          };
        }),
        at: Date.now(),
      };
    },
    async control(id, action) {
      if (action === "start") return start(id);
      if (action === "stop") return stop(id);
      if (action === "restart") {
        const rec = running.get(id);
        if (rec) {
          stop(id);
          await new Promise((r) => (rec.child.exitCode !== null || rec.child.signalCode ? r() : rec.child.once("exit", r)));
        }
        return start(id);
      }
      throw new Error("Unknown action.");
    },
    url: (id) => list().find((s) => s.id === id)?.url || null,
    stopAll: () => [...running.keys()].forEach(stop),
  };
}
