// Small per-widget state kept on the computer: notes, checklists, counters,
// timers. Keyed by "<pageId>:<widgetId>" so it survives a panel reload and is
// the same on every screen showing that widget. Every change is published as
// a `state` event so other open panels update at once.
//
// Limits keep a misbehaving client from filling the disk: 32 KB per widget,
// 500 widgets, written atomically to <dataDir>/widget-state.json (0600).

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const KEY_RE = /^[A-Za-z0-9_-]{1,40}:[A-Za-z0-9_-]{1,40}$/;
export const MAX_BYTES = 32 * 1024;
export const MAX_KEYS = 500;

export function createWidgetState({ dir, publish = () => {}, now = Date.now } = {}) {
  const file = dir ? join(dir, "widget-state.json") : null;
  let data = {};
  if (file && existsSync(file)) {
    try {
      data = JSON.parse(readFileSync(file, "utf8")) ?? {};
    } catch {
      data = {};
    }
  }
  let timer = null;
  const persist = () => {
    if (!file) return;
    clearTimeout(timer);
    // Coalesce bursts (a dragged counter, typing in a note).
    timer = setTimeout(() => {
      writeFileSync(`${file}.tmp`, JSON.stringify(data), { mode: 0o600 });
      renameSync(`${file}.tmp`, file);
    }, 250);
  };

  return {
    get(key) {
      if (!KEY_RE.test(String(key))) throw new Error("bad key");
      return data[key]?.value ?? null;
    },
    set(key, value, from = "") {
      if (!KEY_RE.test(String(key))) throw new Error("bad key");
      const json = JSON.stringify(value ?? null);
      if (json.length > MAX_BYTES) throw new Error("too large");
      if (!(key in data) && Object.keys(data).length >= MAX_KEYS) throw new Error("too many widgets with saved state");
      data[key] = { value: JSON.parse(json), at: now() };
      persist();
      publish("state", { key, value: data[key].value, from });
      return { ok: true };
    },
    flush() {
      if (!file) return;
      clearTimeout(timer);
      writeFileSync(`${file}.tmp`, JSON.stringify(data), { mode: 0o600 });
      renameSync(`${file}.tmp`, file);
    },
  };
}
