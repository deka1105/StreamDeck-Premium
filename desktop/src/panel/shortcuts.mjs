// Host-defined shortcuts (PLAN D7, step 8.1). The phone only ever sends an id
// (and, for a shortcut that takes one, a number). Commands, paths and
// arguments live here, are edited only in the loopback editor, and never reach
// the phone. Also: command widgets (host-defined scripts whose OUTPUT is shown).

import { execFile, spawn } from "node:child_process";

// ---------------------------------------------------------------- numbers ----

/** Strict number parsing: digits, optional "-" and up to 12 decimals. */
export function parseNumber(raw) {
  const s = String(raw ?? "");
  if (!/^-?\d{1,13}(\.\d{1,12})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Check a number against a shortcut's {min,max,step}; returns {ok, value|error}. */
export function checkValue(range, raw) {
  if (!range) return { ok: false, error: "This shortcut doesn't take a number." };
  const v = parseNumber(raw);
  if (v === null) return { ok: false, error: "Not a plain number." };
  const { min = 0, max = 100, step = 1 } = range;
  if (v < min || v > max) return { ok: false, error: `Must be between ${min} and ${max}.` };
  const k = (v - min) / step;
  if (Math.abs(k - Math.round(k)) > 1e-9) return { ok: false, error: `Must be on a step of ${step} from ${min}.` };
  return { ok: true, value: v };
}

/** The number as the host writes it: dot decimals, no trailing zeros. */
export const formatNumber = (v) => String(Number(v.toFixed(6)));

/**
 * Split an argument string like a shell would for quoting only (no
 * expansion): `--name "Two words" x` → ["--name", "Two words", "x"].
 */
export function splitArgs(s) {
  const out = [];
  let cur = "";
  let quote = null;
  let has = false;
  for (const ch of String(s ?? "")) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (cur || has) out.push(cur);
      cur = "";
      has = false;
    } else cur += ch;
  }
  if (cur || has) out.push(cur);
  return out;
}

/** Arguments with the number substituted: `{value}` must be a whole argument. */
export function buildArgs(argString, value) {
  const args = splitArgs(argString);
  if (args.some((a) => a.includes("{value}") && a !== "{value}")) throw new Error("{value} must be an argument of its own.");
  if (value === undefined) return args.filter((a) => a !== "{value}");
  const v = formatNumber(value);
  return args.includes("{value}") ? args.map((a) => (a === "{value}" ? v : a)) : [...args, v];
}

// -------------------------------------------------------------- registry ----

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const KINDS = new Set(["program", "url", "keys", "text", "macro"]);

export function sanitizeShortcuts(list) {
  const out = [];
  const ids = new Set();
  for (const s of Array.isArray(list) ? list.slice(0, 200) : []) {
    if (!s || !ID_RE.test(s.id ?? "") || ids.has(s.id) || !KINDS.has(s.kind)) continue;
    ids.add(s.id);
    const v = s.value && typeof s.value === "object" ? s.value : null;
    const range = v
      ? {
          min: Math.max(-1e12, Math.min(1e12, Number(v.min ?? 0))),
          max: Math.max(-1e12, Math.min(1e12, Number(v.max ?? 100))),
          step: Math.max(0.000001, Number(v.step ?? 1)),
        }
      : null;
    out.push({
      id: s.id,
      label: String(s.label ?? s.id).slice(0, 40),
      icon: String(s.icon ?? "").slice(0, 8),
      color: /^#[0-9a-f]{6}$/i.test(s.color ?? "") ? s.color : "#334155",
      kind: s.kind,
      cmd: String(s.cmd ?? "").slice(0, 2000),
      args: String(s.args ?? "").slice(0, 2000),
      text: String(s.text ?? "").slice(0, 4000),
      combo: String(s.combo ?? "").slice(0, 64),
      steps: Array.isArray(s.steps) ? s.steps.slice(0, 12).map((x) => (typeof x === "number" ? Math.max(0, Math.min(30_000, x)) : String(x).slice(0, 40))) : [],
      value: range && range.max >= range.min && (s.kind === "program" || s.kind === "url") ? range : null,
      toggle: typeof s.toggle === "string" ? s.toggle.slice(0, 60) : "",
    });
  }
  return out;
}

/** What the phone may see about a shortcut: no commands, paths or arguments. */
export const publicShortcut = (s) => ({ id: s.id, label: s.label, icon: s.icon, color: s.color, kind: s.kind, takesNumber: !!s.value, toggle: s.toggle || "" });

// ---------------------------------------------------------------- running ----

export function createShortcutRunner({ getShortcuts, execute, dryRun = false, now = Date.now, runProgram = defaultRunProgram } = {}) {
  const recent = new Map(); // id -> [timestamps]
  const owned = new Set(); // child processes started by shortcuts (for stopping later)

  function rateLimited(id) {
    const t = now();
    const list = (recent.get(id) ?? []).filter((x) => t - x < 1000);
    if (list.length >= 4) return true;
    list.push(t);
    recent.set(id, list);
    return false;
  }

  async function run(id, rawValue, depth = 0) {
    const s = getShortcuts().find((x) => x.id === id);
    if (!s) return { ok: false, status: 404, error: "No such shortcut." };
    let value;
    if (rawValue !== undefined && rawValue !== null && rawValue !== "") {
      const c = checkValue(s.value, rawValue);
      if (!c.ok) return { ok: false, status: 400, error: c.error };
      value = c.value;
      if (rateLimited(id)) return { ok: false, status: 429, error: "Too fast — at most 4 numbers a second." };
    }
    switch (s.kind) {
      case "program": {
        if (!s.cmd) return { ok: false, status: 400, error: "No program set." };
        const args = buildArgs(s.args, value);
        if (dryRun) return console.log(`  (dry-run) program ${JSON.stringify([s.cmd, ...args])}`), { ok: true };
        await runProgram(s.cmd, args, owned);
        return { ok: true };
      }
      case "url": {
        let url = s.cmd;
        if (value !== undefined) {
          if (!url.includes("{value}")) return { ok: false, status: 400, error: "This address has no {value}." };
          url = url.replaceAll("{value}", formatNumber(value));
        } else url = url.replaceAll("{value}", "");
        await execute({ type: "url", target: url }, { dryRun });
        return { ok: true };
      }
      case "keys":
        await execute({ type: "keys", combo: s.combo }, { dryRun });
        return { ok: true };
      case "text":
        await execute({ type: "text", text: s.text }, { dryRun });
        return { ok: true };
      case "macro": {
        if (depth > 2) return { ok: false, status: 400, error: "Macros can't nest that deep." };
        for (const step of s.steps) {
          if (typeof step === "number") await new Promise((r) => setTimeout(r, step));
          else {
            const r = await run(step, undefined, depth + 1);
            if (!r.ok) return r;
          }
        }
        return { ok: true };
      }
      default:
        return { ok: false, status: 400, error: "Unknown shortcut kind." };
    }
  }

  return { run, stopAll: () => owned.forEach((c) => c.kill()) };
}

function defaultRunProgram(cmd, args, owned) {
  // No shell: the program is started directly, each argument passed on its own.
  const child = spawn(cmd, args, { stdio: "ignore", detached: false, windowsHide: true });
  owned.add(child);
  child.on("exit", () => owned.delete(child));
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("spawn", resolve);
  });
}

// --------------------------------------------------------------- commands ----

const SHELLS = {
  bash: ["/bin/bash", ["-c"]],
  zsh: ["/bin/zsh", ["-c"]],
  sh: ["/bin/sh", ["-c"]],
  powershell: ["powershell.exe", ["-NoProfile", "-NonInteractive", "-Command"]],
};

export function sanitizeCommands(list) {
  return (Array.isArray(list) ? list.slice(0, 50) : [])
    .filter((c) => c && ID_RE.test(c.id ?? "") && SHELLS[c.shell])
    .map((c) => ({ id: c.id, label: String(c.label ?? c.id).slice(0, 40), shell: c.shell, script: String(c.script ?? "").slice(0, 8000), every: Math.max(5, Math.min(86400, Number(c.every) || 60)) }));
}

export function createCommandRunner({ getCommands, now = Date.now, exec = execFile } = {}) {
  const cache = new Map(); // id -> {at, output, error}
  const inflight = new Map();
  return {
    async output(id) {
      const c = getCommands().find((x) => x.id === id);
      if (!c) return { ok: false, error: "No such command." };
      const hit = cache.get(id);
      if (hit && now() - hit.at < c.every * 1000) return { ok: true, ...hit };
      if (inflight.has(id)) return inflight.get(id);
      const [bin, pre] = SHELLS[c.shell];
      const p = new Promise((resolve) => {
        exec(bin, [...pre, c.script], { timeout: 30_000, maxBuffer: 256 * 1024, windowsHide: true }, (err, stdout, stderr) => {
          const out = { at: now(), output: String(stdout ?? "").slice(-64 * 1024), error: err ? String(stderr || err.message).slice(-2000) : null };
          cache.set(id, out);
          inflight.delete(id);
          resolve({ ok: true, ...out });
        });
      });
      inflight.set(id, p);
      return p;
    },
  };
}
