// Pushed values and notifications (webhooks, step 8.2). Anything that can make
// an HTTP request can put a value on the panel (`POST /api/push/<key>`) or
// raise a notification (`POST /api/notify`). Values survive restarts and can
// expire (`ttl`). Both are also data kinds ("pushes", "notifications") so
// widgets subscribe to them like any other data.

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const KEY_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const LEVELS = new Set(["ok", "warn", "error", "info"]);
const AUTO_LEVEL = { passed: "ok", success: "ok", ok: "ok", up: "ok", failed: "error", failure: "error", error: "error", down: "error", running: "info", pending: "info", warning: "warn" };

const txt = (v, n = 200) => (v === undefined || v === null ? undefined : String(v).replace(/[\u0000-\u001f]/g, " ").slice(0, n));

/** Normalize a push body (plain text, number or JSON object). Pure (unit-tested). */
export function normalizePush(body) {
  if (body === null || body === undefined) return { value: "" };
  if (typeof body !== "object") {
    const level = AUTO_LEVEL[String(body).toLowerCase()];
    return level ? { value: txt(body) ?? "", level } : { value: txt(body) ?? "" };
  }
  const p = {
    value: txt(body.value) ?? "",
    title: txt(body.title, 80),
    sub: txt(body.sub, 120),
    unit: txt(body.unit, 16),
    icon: txt(body.icon, 8),
    color: /^#[0-9a-f]{6}$/i.test(body.color ?? "") ? body.color : undefined,
    level: LEVELS.has(body.level) ? body.level : AUTO_LEVEL[String(body.value ?? "").toLowerCase()],
  };
  if (body.progress !== undefined) {
    const n = Number(body.progress);
    if (Number.isFinite(n)) p.progress = Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
  }
  if (Array.isArray(body.items))
    p.items = body.items.slice(0, 20).map((i) => (typeof i === "object" && i ? { label: txt(i.label, 80), value: txt(i.value, 80), level: LEVELS.has(i.level) ? i.level : undefined } : { label: txt(i, 80) }));
  for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];
  return p;
}

/** "Is this pushed value on?" — empty, 0, false, off and no are off. Pure. */
export function isOn(value, expect) {
  const v = String(value ?? "").trim().toLowerCase();
  if (expect !== undefined && expect !== null && expect !== "") return v === String(expect).trim().toLowerCase();
  return !["", "0", "false", "off", "no"].includes(v);
}

export function createPushes({ dir, publish = () => {}, now = Date.now } = {}) {
  const file = dir ? join(dir, "pushes.json") : null;
  let values = {}; // key -> {…payload, at, expires}
  let notes = []; // newest first
  if (file && existsSync(file)) {
    try {
      const j = JSON.parse(readFileSync(file, "utf8"));
      values = j.values ?? {};
      notes = j.notes ?? [];
    } catch {
      /* fresh */
    }
  }
  const persist = () => {
    if (!file) return;
    writeFileSync(`${file}.tmp`, JSON.stringify({ values, notes: notes.slice(0, 50) }), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  };
  const live = () => {
    const t = now();
    let changed = false;
    for (const [k, v] of Object.entries(values))
      if (v.expires && v.expires <= t) {
        delete values[k];
        changed = true;
      }
    if (changed) persist();
    return values;
  };
  const publishAll = () => publish("data", { kind: "pushes", value: { values: { ...live() }, at: now() } });

  return {
    set(key, body, ttlSec) {
      if (!KEY_RE.test(String(key))) throw new Error("bad key");
      if (!(key in values) && Object.keys(values).length >= 200) throw new Error("too many pushed values");
      const ttl = Number(ttlSec);
      values[key] = { ...normalizePush(body), at: now(), ...(ttl > 0 ? { expires: now() + Math.min(ttl, 30 * 86400) * 1000 } : {}) };
      persist();
      publishAll();
      return values[key];
    },
    delete(key) {
      const had = key in values;
      delete values[key];
      persist();
      publishAll();
      return had;
    },
    get: (key) => live()[key] ?? null,
    all: () => ({ ...live() }),
    notify(body) {
      const b = typeof body === "object" && body ? body : { text: String(body ?? "") };
      const n = {
        id: `${now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: txt(b.title, 80) ?? "",
        text: txt(b.text, 400) ?? "",
        level: LEVELS.has(b.level) ? b.level : "info",
        vibrate: b.vibrate !== false,
        seconds: Math.max(2, Math.min(60, Number(b.seconds) || 6)),
        wake: b.wake === true,
        page: txt(b.page, 40),
        at: now(),
      };
      if (!n.title && !n.text) throw new Error("A notification needs a title or text.");
      notes = [n, ...notes].slice(0, 50);
      persist();
      publish("notify", n);
      publish("data", { kind: "notifications", value: { items: notes.slice(0, 30), at: now() } });
      return n;
    },
    notifications: () => notes.slice(0, 30),
    providers() {
      return {
        pushes: { periodMs: 5000, sample: async () => ({ values: { ...live() }, at: now() }) },
        notifications: { periodMs: 10_000, sample: async () => ({ items: notes.slice(0, 30), at: now() }) },
      };
    },
  };
}
