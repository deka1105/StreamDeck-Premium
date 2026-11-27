// Claude Code integration (steps 9.2, 9.4, 9.5): permission prompts answered on
// the phone, "waiting for you" alerts, and a status-line bridge for plan limits.
// Uses only Claude Code's documented hook and status-line interfaces
// (docs/ai-sources.md). Installing changes ~/.claude/settings.json only when
// the owner presses Install; a backup is kept and Remove undoes exactly what
// Install added.

import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, copyFileSync, chmodSync } from "node:fs";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const MARK = "deskassist-hook";
const runFile = promisify(execFile);

// --------------------------------------------------------------- scripts ----
// Written into <dataDir>/hooks/ at install time. Plain Node, no dependencies.

const PERMISSION_HOOK = `// ${MARK}: asks the DeskAssist panel to allow or deny a Claude Code permission.
// No answer (or any error) prints nothing, and Claude Code asks as usual.
const fs = require("fs");
const cfg = JSON.parse(fs.readFileSync(__dirname + "/hook-config.json", "utf8"));
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", async () => {
  try {
    const input = JSON.parse(raw || "{}");
    const ti = input.tool_input || {};
    const detail = String(ti.command || ti.file_path || ti.path || ti.url || ti.pattern || ti.query || "").slice(0, 400);
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), (cfg.timeoutSec + 2) * 1000);
    const r = await fetch("http://127.0.0.1:" + cfg.port + "/api/agent/permission", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: cfg.token, session: input.session_id || "", project: require("path").basename(input.cwd || ""), tool: input.tool_name || "", detail }),
      signal: ctrl.signal,
    });
    const j = await r.json();
    if (j.decision === "allow" || j.decision === "deny") {
      const decision = j.decision === "allow" ? { behavior: "allow" } : { behavior: "deny", message: "Denied from the DeskAssist panel." };
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision } }));
    }
  } catch {}
  process.exit(0);
});
`;

const EVENT_HOOK = `// ${MARK}: tells the DeskAssist panel a Claude Code session moved on or is waiting.
const fs = require("fs");
const cfg = JSON.parse(fs.readFileSync(__dirname + "/hook-config.json", "utf8"));
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", async () => {
  try {
    const i = JSON.parse(raw || "{}");
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 2000);
    await fetch("http://127.0.0.1:" + cfg.port + "/api/agent/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: cfg.token, event: i.hook_event_name || "", session: i.session_id || "", project: require("path").basename(i.cwd || ""), type: i.notification_type || "", message: String(i.message || "").slice(0, 200) }),
      signal: ctrl.signal,
    });
  } catch {}
  process.exit(0);
});
`;

const STATUSLINE_BRIDGE = `// ${MARK}: saves Claude Code's plan limits for DeskAssist, then runs the
// status line you had before, unchanged.
const fs = require("fs");
const { spawnSync } = require("child_process");
const cfg = JSON.parse(fs.readFileSync(__dirname + "/hook-config.json", "utf8"));
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const i = JSON.parse(raw || "{}");
    if (i.rate_limits) {
      const out = { rate_limits: i.rate_limits, model: (i.model && i.model.display_name) || "", at: Date.now() };
      fs.writeFileSync(cfg.limitsFile + ".tmp", JSON.stringify(out));
      fs.renameSync(cfg.limitsFile + ".tmp", cfg.limitsFile);
    }
  } catch {}
  if (cfg.previousStatusLine) {
    const r = spawnSync(process.platform === "win32" ? "cmd.exe" : "/bin/sh", process.platform === "win32" ? ["/d", "/s", "/c", cfg.previousStatusLine] : ["-c", cfg.previousStatusLine], { input: raw, encoding: "utf8" });
    process.stdout.write(r.stdout || "");
  }
  process.exit(0);
});
`;

// ------------------------------------------------------------ settings ----

const readJson = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8") || "{}") : {});
const writeJson = (f, v) => {
  writeFileSync(`${f}.tmp`, `${JSON.stringify(v, null, 2)}\n`);
  renameSync(`${f}.tmp`, f);
};
const ours = (group) => (group?.hooks ?? []).some((h) => String(h.command ?? "").includes(MARK));

/** Remove every hook group we added. Pure. */
export function withoutOurs(settings) {
  const s = structuredClone(settings);
  for (const ev of Object.keys(s.hooks ?? {})) {
    s.hooks[ev] = s.hooks[ev].filter((g) => !ours(g));
    if (!s.hooks[ev].length) delete s.hooks[ev];
  }
  if (s.hooks && !Object.keys(s.hooks).length) delete s.hooks;
  return s;
}

export function createAgents({ dir, claudeDir, port = 8789, publish = () => {}, getSettings = () => ({}), idleSeconds = async () => 0, now = Date.now } = {}) {
  const hooksDir = join(dir, "hooks");
  const limitsFile = join(dir, "claude-limits.json");
  const cfgFile = join(hooksDir, "hook-config.json");
  let token = existsSync(cfgFile) ? readJson(cfgFile).token : null;
  const pending = new Map(); // id -> {resolve, info, timer}
  const alerts = new Map(); // session -> alert
  const stopTimers = new Map();

  // The command Claude Code runs: our script under this Node / Electron binary.
  const nodeCmd = (script) => {
    const exe = JSON.stringify(process.execPath);
    const file = JSON.stringify(join(hooksDir, script));
    return process.versions.electron ? `ELECTRON_RUN_AS_NODE=1 ${exe} ${file} # ${MARK}` : `${exe} ${file} # ${MARK}`;
  };

  const publishAlerts = () => publish("data", { kind: "alerts", value: { alerts: [...alerts.values()], prompts: [...pending.values()].map((p) => p.info), at: now() } });

  function writeScripts(previousStatusLine) {
    mkdirSync(hooksDir, { recursive: true });
    token ??= crypto.randomBytes(18).toString("base64url");
    const old = existsSync(cfgFile) ? readJson(cfgFile) : {};
    writeFileSync(cfgFile, JSON.stringify({ port, token, timeoutSec: getSettings().agents?.timeoutSec ?? 60, limitsFile, previousStatusLine: previousStatusLine ?? old.previousStatusLine ?? null }), { mode: 0o600 });
    for (const [name, body] of [["permission-hook.cjs", PERMISSION_HOOK], ["event-hook.cjs", EVENT_HOOK], ["statusline-bridge.cjs", STATUSLINE_BRIDGE]]) {
      writeFileSync(join(hooksDir, name), body);
      try {
        chmodSync(join(hooksDir, name), 0o700);
      } catch {
        /* windows */
      }
    }
  }

  const settingsFile = () => join(claudeDir, "settings.json");

  return {
    limitsFile,
    status() {
      const s = existsSync(settingsFile()) ? readJson(settingsFile()) : {};
      const installed = Object.values(s.hooks ?? {}).some((groups) => groups.some(ours));
      return { claudeFound: existsSync(claudeDir), installed, statusLine: String(s.statusLine?.command ?? "").includes(MARK), settingsFile: settingsFile() };
    },
    /** Add our hooks + status-line bridge to Claude Code's settings (backup kept). */
    install() {
      if (!existsSync(claudeDir)) throw new Error("Claude Code isn't set up for this user (no ~/.claude).");
      const file = settingsFile();
      if (existsSync(file)) copyFileSync(file, `${file}.deskassist.bak`);
      const s = withoutOurs(readJson(file));
      const prevStatus = s.statusLine && !String(s.statusLine.command ?? "").includes(MARK) ? s.statusLine : null;
      writeScripts(prevStatus?.command ?? null);
      const timeoutSec = (getSettings().agents?.timeoutSec ?? 60) + 5;
      s.hooks ??= {};
      const add = (ev, group) => (s.hooks[ev] ??= []).push(group);
      add("PermissionRequest", { matcher: "*", hooks: [{ type: "command", command: nodeCmd("permission-hook.cjs"), timeout: timeoutSec }] });
      for (const ev of ["Notification", "Stop", "UserPromptSubmit", "PostToolUse"]) add(ev, { ...(ev === "Notification" || ev === "PostToolUse" ? { matcher: "*" } : {}), hooks: [{ type: "command", command: nodeCmd("event-hook.cjs"), timeout: 5 }] });
      s.statusLine = { type: "command", command: nodeCmd("statusline-bridge.cjs"), ...(prevStatus?.padding !== undefined ? { padding: prevStatus.padding } : {}) };
      writeJson(file, s);
      return this.status();
    },
    /** Take out exactly what install added and put the old status line back. */
    remove() {
      const file = settingsFile();
      if (!existsSync(file)) return this.status();
      const s = withoutOurs(readJson(file));
      if (String(s.statusLine?.command ?? "").includes(MARK)) {
        const prev = existsSync(cfgFile) ? readJson(cfgFile).previousStatusLine : null;
        if (prev) s.statusLine = { type: "command", command: prev };
        else delete s.statusLine;
      }
      writeJson(file, s);
      return this.status();
    },

    /** A hook asks: hold until the phone answers or time runs out. */
    async permission(body) {
      if (!token || body?.token !== token) return { status: 401, json: { error: "bad token" } };
      const opts = getSettings().agents ?? {};
      if (!opts.phonePrompts) return { status: 200, json: { decision: null } };
      if (opts.onlyWhenAway && (await idleSeconds().catch(() => 0)) < 60) return { status: 200, json: { decision: null } };
      const id = crypto.randomBytes(6).toString("hex");
      const timeoutSec = Math.max(10, Math.min(600, opts.timeoutSec ?? 60));
      const info = { id, agent: "claude", session: String(body.session ?? "").slice(0, 80), project: String(body.project ?? "").slice(0, 80), tool: String(body.tool ?? "").slice(0, 80), detail: String(body.detail ?? "").slice(0, 400), at: now(), expiresAt: now() + timeoutSec * 1000 };
      const decision = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), timeoutSec * 1000);
        pending.set(id, { resolve, info, timer });
        publish("prompt", info);
        publishAlerts();
      });
      const p = pending.get(id);
      if (p) clearTimeout(p.timer);
      pending.delete(id);
      publish("prompt_done", { id, decision });
      publishAlerts();
      return { status: 200, json: { decision } };
    },
    answer(id, decision) {
      const p = pending.get(id);
      if (!p || !["allow", "deny"].includes(decision)) return { ok: false, error: "That request has already been answered or timed out." };
      console.log(`${decision === "allow" ? "✓" : "✗"} ${decision} ${p.info.tool} in ${p.info.project} (from the panel)`);
      p.resolve(decision);
      return { ok: true };
    },

    /** Hook events: moved on (clear) or waiting (alert). */
    event(body) {
      if (!token || body?.token !== token) return { status: 401, json: { error: "bad token" } };
      const s = String(body.session ?? "");
      const base = { session: s, project: String(body.project ?? "").slice(0, 80), at: now() };
      const clear = () => {
        alerts.delete(s);
        clearTimeout(stopTimers.get(s));
        stopTimers.delete(s);
        // Answered in Claude Code's own window: drop the phone card (the hook gets no decision).
        for (const [id, p] of pending) if (p.info.session === s) p.resolve(null);
      };
      if (body.event === "UserPromptSubmit" || body.event === "PostToolUse") clear();
      else if (body.event === "Notification" && getSettings().agents?.alerts !== false) {
        if (body.type === "permission_prompt" && [...pending.values()].some((p) => p.info.session === s)) return { status: 200, json: { ok: true } };
        const kind = body.type === "permission_prompt" ? "permission" : body.type === "idle_prompt" ? "input" : body.type === "elicitation_dialog" ? "question" : null;
        if (kind) alerts.set(s, { ...base, kind, message: String(body.message ?? "").slice(0, 200) });
      } else if (body.event === "Stop" && getSettings().agents?.alerts !== false) {
        clearTimeout(stopTimers.get(s));
        const wait = Math.max(0, getSettings().agents?.idleAlertSec ?? 30) * 1000;
        stopTimers.set(s, setTimeout(() => {
          alerts.set(s, { ...base, at: now(), kind: "finished", message: "Finished — waiting for your reply" });
          publishAlerts();
        }, wait));
      }
      publishAlerts();
      return { status: 200, json: { ok: true } };
    },
    dismiss(session) {
      alerts.delete(String(session));
      publishAlerts();
      return { ok: true };
    },
    provider: () => ({ periodMs: 15_000, sample: async () => ({ alerts: [...alerts.values()], prompts: [...pending.values()].map((p) => p.info), at: now() }) }),

    /** Bring a session's terminal or app to the front (macOS: walk up to its .app). */
    async focus(pid) {
      if (process.platform !== "darwin" || !Number.isInteger(pid)) return { ok: false, error: "Not available on this computer." };
      let p = pid;
      for (let i = 0; i < 12 && p > 1; i++) {
        const { stdout } = await runFile("ps", ["-o", "ppid=,comm=", "-p", String(p)]).catch(() => ({ stdout: "" }));
        const m = /^\s*(\d+)\s+(.*)$/.exec(stdout.trim());
        if (!m) break;
        const app = /\/([^/]+)\.app\//.exec(m[2])?.[1];
        if (app) {
          await runFile("open", ["-a", app]);
          return { ok: true, app };
        }
        p = Number(m[1]);
      }
      return { ok: false, error: "Couldn't find that session's window." };
    },
  };
}

export const _scripts = { PERMISSION_HOOK, EVENT_HOOK, STATUSLINE_BRIDGE, MARK };
export { basename };
