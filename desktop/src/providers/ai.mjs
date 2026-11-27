// `ai` kind: coding-agent sessions, token totals and plan limits
// (docs/ai-sources.md). Reads only ids, folders, model names, token counts,
// statuses and timestamps — never prompts, replies or tool arguments.

import { existsSync, openSync, readSync, closeSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const DAY = 86400_000;
const dayKey = (t) => new Date(t).toLocaleDateString("en-CA");

/** Is a process alive? */
export function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

/** Read only the bytes appended to `file` since the last call. */
export function createTailer() {
  const pos = new Map(); // file -> {offset, rest}
  return (file) => {
    let size;
    try {
      size = statSync(file).size;
    } catch {
      return [];
    }
    const st = pos.get(file) ?? { offset: 0, rest: "" };
    if (size < st.offset) Object.assign(st, { offset: 0, rest: "" }); // file was rewritten
    if (size === st.offset) return [];
    const fd = openSync(file, "r");
    try {
      const len = Math.min(size - st.offset, 32 * 1024 * 1024);
      const buf = Buffer.alloc(len);
      readSync(fd, buf, 0, len, st.offset);
      st.offset += len;
      const text = st.rest + buf.toString("utf8");
      const lines = text.split("\n");
      st.rest = lines.pop() ?? "";
      pos.set(file, st);
      return lines;
    } finally {
      closeSync(fd);
    }
  };
}

/** Token-usage record from one Claude Code transcript line, or null. Pure. */
export function claudeUsageLine(line) {
  if (!line.includes('"usage"') || !line.includes('"assistant"')) return null;
  let d;
  try {
    d = JSON.parse(line);
  } catch {
    return null;
  }
  const u = d?.type === "assistant" ? d.message?.usage : null;
  if (!u) return null;
  return {
    t: Date.parse(d.timestamp) || 0,
    session: d.sessionId ?? "",
    model: d.message?.model ?? "",
    input: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
    output: u.output_tokens ?? 0,
    stop: d.message?.stop_reason ?? null,
  };
}

/** Token-count / limits record from one Codex rollout line, or null. Pure. */
export function codexLine(line) {
  let d;
  try {
    d = JSON.parse(line);
  } catch {
    return null;
  }
  if (d?.type === "session_meta") return { kind: "meta", id: d.payload?.id ?? "", cwd: d.payload?.cwd ?? "", t: Date.parse(d.payload?.timestamp ?? d.timestamp) || 0 };
  if (d?.type === "event_msg" && d.payload?.type === "token_count") {
    const tot = d.payload.info?.total_token_usage ?? {};
    const last = d.payload.info?.last_token_usage ?? {};
    const rl = d.payload.rate_limits ?? {};
    const win = (w) => (w && Number.isFinite(w.used_percent) ? { used: w.used_percent, windowMin: w.window_minutes ?? null, resetsAt: w.resets_at ? w.resets_at * 1000 : w.resets_in_seconds ? (Date.parse(d.timestamp) || Date.now()) + w.resets_in_seconds * 1000 : null } : null);
    return {
      kind: "tokens",
      t: Date.parse(d.timestamp) || 0,
      total: { input: tot.input_tokens ?? 0, output: tot.output_tokens ?? 0 },
      last: { input: last.input_tokens ?? 0, output: last.output_tokens ?? 0 },
      primary: win(rl.primary),
      secondary: win(rl.secondary),
    };
  }
  if (d?.type === "turn_context") return { kind: "model", model: d.payload?.model ?? "" };
  return null;
}

/** Linear projection of when a limit reaches 100 %, from two readings. Pure. */
export function forecast(readings, now = Date.now()) {
  const r = readings.filter((x) => Number.isFinite(x.used)).slice(-12);
  if (r.length < 2) return null;
  const a = r[0];
  const b = r.at(-1);
  if (b.used <= a.used || b.t <= a.t) return null;
  const perMs = (b.used - a.used) / (b.t - a.t);
  const fullAt = now + (100 - b.used) / perMs;
  return b.resetsAt && fullAt > b.resetsAt ? null : fullAt; // won't fill before it resets
}

export function createAi({ claudeDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), codexDir = process.env.CODEX_HOME || join(homedir(), ".codex"), limitsFile, now = Date.now } = {}) {
  const tail = createTailer();
  const usage = []; // Claude records, last 7 days
  const codex = { sessions: new Map(), records: [] };
  const limitHistory = { five: [], week: [] };
  let lastScan = 0;

  function scanClaude() {
    const root = join(claudeDir, "projects");
    if (!existsSync(root)) return;
    const cutoff = now() - 7 * DAY;
    for (const proj of readdirSync(root)) {
      const dir = join(root, proj);
      let files = [];
      try {
        files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
      } catch {
        continue;
      }
      for (const f of files) {
        const file = join(dir, f);
        try {
          if (statSync(file).mtimeMs < cutoff) continue;
        } catch {
          continue;
        }
        for (const line of tail(file)) {
          const rec = claudeUsageLine(line);
          if (rec && rec.t >= cutoff) usage.push(rec);
        }
      }
    }
    while (usage.length && usage[0].t < cutoff) usage.shift();
    usage.sort((a, b) => a.t - b.t);
  }

  function scanCodex() {
    const root = join(codexDir, "sessions");
    if (!existsSync(root)) return;
    const cutoff = now() - 7 * DAY;
    const walk = (d, depth) => {
      let entries = [];
      try {
        entries = readdirSync(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const p = join(d, e.name);
        if (e.isDirectory() && depth < 4) walk(p, depth + 1);
        else if (e.name.endsWith(".jsonl")) {
          try {
            if (statSync(p).mtimeMs < cutoff) continue;
          } catch {
            continue;
          }
          const s = codex.sessions.get(p) ?? { file: p, id: basename(p), cwd: "", model: "", total: null, last: 0, primary: null, secondary: null };
          for (const line of tail(p)) {
            const r = codexLine(line);
            if (!r) continue;
            if (r.kind === "meta") Object.assign(s, { id: r.id || s.id, cwd: r.cwd, started: r.t });
            else if (r.kind === "model") s.model = r.model || s.model;
            else if (r.kind === "tokens") {
              const prev = s.total;
              s.total = r.total;
              s.last = r.t;
              s.primary = r.primary ?? s.primary;
              s.secondary = r.secondary ?? s.secondary;
              const add = prev ? { input: r.total.input - prev.input, output: r.total.output - prev.output } : r.last;
              codex.records.push({ t: r.t, model: s.model, input: Math.max(0, add.input), output: Math.max(0, add.output) });
            }
          }
          codex.sessions.set(p, s);
        }
      }
    };
    walk(root, 0);
    codex.records = codex.records.filter((r) => r.t >= cutoff);
  }

  function claudeSessions() {
    const dir = join(claudeDir, "sessions");
    if (!existsSync(dir)) return [];
    const out = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      try {
        const s = JSON.parse(readFileSync(join(dir, f), "utf8"));
        if (!s.pid || !alive(s.pid)) continue;
        const mine = usage.filter((u) => u.session === s.sessionId);
        const last = mine.at(-1);
        out.push({
          agent: "claude",
          id: s.sessionId,
          pid: s.pid,
          project: basename(s.cwd ?? ""),
          status: s.status === "busy" ? "working" : "idle",
          model: last?.model ?? "",
          startedAt: s.startedAt ?? null,
          updatedAt: s.updatedAt ?? null,
          tokens: { input: mine.reduce((a, u) => a + u.input, 0), output: mine.reduce((a, u) => a + u.output, 0) },
          kind: s.kind ?? "",
        });
      } catch {
        /* a session file being rewritten; next time */
      }
    }
    return out.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }

  function totals(records) {
    const t = now();
    const today = dayKey(t);
    const sum = (rs) => rs.reduce((a, r) => a + r.input + r.output, 0);
    const days = Array.from({ length: 7 }, (_, i) => {
      const k = dayKey(t - (6 - i) * DAY);
      return { day: k, tokens: sum(records.filter((r) => dayKey(r.t) === k)) };
    });
    const models = {};
    for (const r of records.filter((x) => dayKey(x.t) === today)) models[r.model || "unknown"] = (models[r.model || "unknown"] ?? 0) + r.input + r.output;
    return { today: sum(records.filter((r) => dayKey(r.t) === today)), lastHour: sum(records.filter((r) => t - r.t < 3600_000)), days, models };
  }

  function claudeLimits() {
    if (!limitsFile || !existsSync(limitsFile)) return null;
    try {
      const j = JSON.parse(readFileSync(limitsFile, "utf8"));
      const rl = j.rate_limits ?? {};
      const w = (x) => (x && Number.isFinite(x.used_percentage) ? { used: x.used_percentage, resetsAt: x.resets_at ? x.resets_at * 1000 : null } : null);
      const five = w(rl.five_hour);
      const week = w(rl.seven_day);
      for (const [hist, v] of [[limitHistory.five, five], [limitHistory.week, week]]) {
        if (v && hist.at(-1)?.t !== j.at) hist.push({ t: j.at, used: v.used, resetsAt: v.resetsAt });
        while (hist.length > 30) hist.shift();
      }
      return { five, week, at: j.at, model: j.model ?? "", plan: five || week ? "subscription" : null };
    } catch {
      return null;
    }
  }

  return {
    periodMs: 5000,
    async sample() {
      if (now() - lastScan > 4000) {
        scanClaude();
        scanCodex();
        lastScan = now();
      }
      const limits = claudeLimits();
      const codexSessions = [...codex.sessions.values()].filter((s) => s.last && now() - s.last < 30 * 60_000).map((s) => ({ agent: "codex", id: s.id, project: basename(s.cwd || ""), status: now() - s.last < 60_000 ? "working" : "idle", model: s.model, updatedAt: s.last, tokens: s.total ?? { input: 0, output: 0 } }));
      const latestCodex = [...codex.sessions.values()].sort((a, b) => b.last - a.last)[0];
      const lastClaude = usage.at(-1)?.t ?? 0;
      const lastCodex = latestCodex?.last ?? 0;
      return {
        sessions: [...claudeSessions(), ...codexSessions],
        claude: {
          limits: limits ? { ...limits, fiveFullAt: forecast(limitHistory.five, now()), weekFullAt: forecast(limitHistory.week, now()) } : null,
          usage: totals(usage),
          installed: existsSync(claudeDir),
        },
        codex: {
          limits: latestCodex ? { five: latestCodex.primary, week: latestCodex.secondary, at: latestCodex.last } : null,
          usage: totals(codex.records),
          installed: existsSync(codexDir),
        },
        recent: lastCodex > lastClaude ? "codex" : "claude",
        at: now(),
      };
    },
  };
}
