// Rules (step 8.4): when → then, evaluated on the computer every 2 s.
//
// rule = { id, name, enabled, when: {type, …}, then: {type, …},
//          days: [0-6], hours: "HH:MM-HH:MM", lastsSec, restSec, priority,
//          whileLasts, countdownSec }
//
// Page switches are sent to panels as `rule` events; the panel counts down,
// waits while you're using it, and goes back when a "while it lasts" rule ends.

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
export const TRIGGERS = ["app_running", "app_front", "media_playing", "push_value", "push_stale", "cpu_above", "away", "time_window", "always"];
export const ACTIONS = ["show_page", "notify", "push_value", "run_shortcut", "night_screen"];
const OPS = new Set(["on", "gt", "ge", "lt", "le", "eq"]);

const s40 = (v) => String(v ?? "").slice(0, 120);
const n = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : d);

export function sanitizeRules(list) {
  const out = [];
  const ids = new Set();
  for (const r of Array.isArray(list) ? list.slice(0, 100) : []) {
    if (!r || !ID_RE.test(r.id ?? "") || ids.has(r.id)) continue;
    if (!TRIGGERS.includes(r.when?.type) || !ACTIONS.includes(r.then?.type)) continue;
    ids.add(r.id);
    out.push({
      id: r.id,
      name: s40(r.name) || r.id,
      enabled: r.enabled !== false,
      when: { type: r.when.type, apps: s40(r.when.apps), key: s40(r.when.key), op: OPS.has(r.when.op) ? r.when.op : "on", value: s40(r.when.value), seconds: n(r.when.seconds, 1, 86400, 60), pct: n(r.when.pct, 1, 100, 80), minutes: n(r.when.minutes, 1, 1440, 5) },
      then: { type: r.then.type, page: s40(r.then.page), title: s40(r.then.title), text: s40(r.then.text), level: ["ok", "warn", "error", "info"].includes(r.then.level) ? r.then.level : "info", key: s40(r.then.key), value: s40(r.then.value), id: s40(r.then.id) },
      days: Array.isArray(r.days) ? [...new Set(r.days.map(Number).filter((d) => d >= 0 && d <= 6))] : [],
      hours: /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(r.hours ?? "") ? r.hours : "",
      lastsSec: n(r.lastsSec, 0, 3600, 0),
      restSec: n(r.restSec, 0, 86400, 60),
      priority: n(r.priority, 0, 10, 5),
      whileLasts: r.whileLasts === true,
      countdownSec: n(r.countdownSec, 0, 30, 3),
    });
  }
  return out;
}

/** Inside "HH:MM-HH:MM" (wrapping past midnight)? Empty = always. Pure. */
export function inHours(hours, d) {
  if (!hours) return true;
  const [a, b] = hours.split("-").map((x) => x.split(":").map(Number)).map(([h, m]) => h * 60 + m);
  const t = d.getHours() * 60 + d.getMinutes();
  return a <= b ? t >= a && t < b : t >= a || t < b;
}

const matchApp = (name, pattern) => {
  const pats = String(pattern ?? "").split("|").map((p) => p.trim().toLowerCase()).filter(Boolean);
  const nm = String(name ?? "").toLowerCase();
  return pats.length === 0 || pats.some((p) => nm === p || nm.replace(/\.exe$/, "") === p || nm.includes(p));
};

/** Does a rule's condition hold right now? `read` supplies the facts. */
export async function holds(when, read) {
  switch (when.type) {
    case "always":
    case "time_window":
      return true;
    case "app_running":
      return (await read.apps()).some((a) => matchApp(a, when.apps));
    case "app_front":
      return matchApp(await read.frontmost(), when.apps) && !!(await read.frontmost());
    case "media_playing": {
      const m = read.media();
      return !!(m?.playing && m.state === "playing" && matchApp(m.app, when.apps));
    }
    case "push_value": {
      const p = read.push(when.key);
      if (!p) return false;
      if (when.op === "on") return read.isOn(p.value, when.value);
      const a = Number(p.value);
      const b = Number(when.value);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return when.op === "eq" && String(p.value) === String(when.value);
      return { gt: a > b, ge: a >= b, lt: a < b, le: a <= b, eq: a === b }[when.op];
    }
    case "push_stale": {
      const p = read.push(when.key);
      if (read.uptimeSec() < when.seconds) return false;
      return !p || read.now() - p.at > when.seconds * 1000;
    }
    case "cpu_above":
      return (read.cpu() ?? 0) > when.pct;
    case "away":
      return (await read.idleSec()) >= when.minutes * 60;
    default:
      return false;
  }
}

export function createRules({ getRules, read, act, now = Date.now, publish = () => {} }) {
  const st = new Map(); // id -> { since, active, lastFired }
  let pausedUntil = 0;

  async function tick() {
    const t = now();
    const d = new Date(t);
    const results = [];
    for (const r of getRules()) {
      const s = st.get(r.id) ?? { since: null, active: false, lastFired: 0 };
      st.set(r.id, s);
      let ok = r.enabled && t >= pausedUntil && (!r.days.length || r.days.includes(d.getDay())) && inHours(r.hours, d);
      if (ok) ok = await holds(r.when, read).catch(() => false);
      const need = r.when.type === "cpu_above" ? Math.max(15, r.lastsSec) : r.lastsSec;
      if (ok) {
        s.since ??= t;
        if (!s.active && t - s.since >= need * 1000 && t - s.lastFired >= r.restSec * 1000) {
          s.active = true;
          s.lastFired = t;
          results.push({ rule: r, event: "start" });
          await act(r, "start");
        }
      } else {
        s.since = null;
        if (s.active) {
          s.active = false;
          results.push({ rule: r, event: "end" });
          if (r.whileLasts) await act(r, "end");
        }
      }
    }
    return results;
  }

  let timer = null;
  return {
    tick,
    /** Run a rule's action once (editor "Test"); a "while it lasts" rule ends after 8 s. */
    async test(id) {
      const r = getRules().find((x) => x.id === id);
      if (!r) return { ok: false, error: "Save the rule first." };
      await act(r, "start");
      if (r.whileLasts) setTimeout(() => act(r, "end"), 8000).unref?.();
      return { ok: true };
    },
    active: () => [...st.entries()].filter(([, s]) => s.active).map(([id]) => id),
    pause(minutes) {
      pausedUntil = minutes > 0 ? now() + minutes * 60_000 : 0;
      publish("data", { kind: "rules", value: { pausedUntil, at: now() } });
      return { pausedUntil };
    },
    pausedUntil: () => pausedUntil,
    start(ms = 2000) {
      timer ??= setInterval(() => tick().catch((e) => console.warn(`[rules] ${e.message}`)), ms);
      timer.unref?.();
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
  };
}
