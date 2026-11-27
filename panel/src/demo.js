// Demo mode: a simulated computer, so the panel is fully usable with nothing
// paired (App Review uses this). Same interface as a real bridge; it never
// touches the network. Every data kind a widget can need gets a plausible,
// slowly drifting value. The panel shows a "Simulated" label while it is on.

import { DEMO_LAYOUT } from "./demoLayout.js";

const DEMO_TILES = [
  { id: "t1", label: "Safari", icon: "🧭", color: "#0ea5e9", kind: "app" },
  { id: "t2", label: "Finder", icon: "📁", color: "#6366f1", kind: "app" },
  { id: "t3", label: "VS Code", icon: "💻", color: "#2563eb", kind: "app" },
  { id: "t4", label: "Spotlight", icon: "🔍", color: "#9333ea", kind: "keys" },
  { id: "t5", label: "Screenshot", icon: "📸", color: "#c026d3", kind: "keys" },
  { id: "t6", label: "Lock", icon: "🔒", color: "#475569", kind: "keys" },
  { id: "t7", label: "GitHub", icon: "🐙", color: "#374151", kind: "url" },
  { id: "t8", label: "Mute", icon: "🔇", color: "#ea580c", kind: "media" },
];

function walker(start, lo, hi, stepSize) {
  let v = start;
  return () => {
    v = Math.max(lo, Math.min(hi, v + (Math.random() - 0.5) * 2 * stepSize));
    return v;
  };
}

/** Generators per data kind. Grows as widgets land. */
export function demoGenerators() {
  const cpu = walker(23, 4, 92, 9);
  const mem = walker(11.4, 7, 15, 0.3);
  return {
    system: () => ({ cpu: Math.round(cpu() * 10) / 10, cores: 10, mem: { used: Math.round(mem() * 2 ** 30), total: 16 * 2 ** 30 }, at: Date.now() }),
  };
}

export function createDemoBridge({ periodMs = 2000 } = {}) {
  const listeners = new Map();
  const emit = (name, payload) => {
    for (const fn of listeners.get(name) ?? []) fn(payload);
  };
  const gens = demoGenerators();
  let needs = [];
  const latest = {};
  const tick = () => {
    for (const k of needs) {
      if (!gens[k]) continue;
      latest[k] = gens[k]();
      emit("event", { type: "data", data: { kind: k, value: latest[k] } });
    }
  };
  setInterval(tick, periodMs);
  setTimeout(() => {
    emit("status", { online: true, detail: "demo" });
    emit("resync");
  }, 0);

  const methods = {
    "panel.hello": () => ({ host: "Demo Mac", api: 1, demo: true }),
    "panel.layout": () => structuredCloneSafe(DEMO_LAYOUT),
    "panel.snapshot": ({ kinds = [] } = {}) => {
      const data = {};
      for (const k of kinds) if (gens[k]) data[k] = latest[k] ?? (latest[k] = gens[k]());
      return { data };
    },
    "panel.needs": ({ kinds = [] } = {}) => {
      needs = kinds;
      return { ok: true };
    },
    // Taps on controls "succeed" without doing anything.
    "action.run": () => ({ ok: true, simulated: true }),
    "deck.tiles": () => ({ name: "Default", tiles: DEMO_TILES }),
    "deck.press": () => ({ ok: true, simulated: true }),
  };

  return {
    kind: "demo",
    demo: true,
    async request(method, params) {
      if (!methods[method]) throw new Error(`demo: ${method} not available`);
      return methods[method](params);
    },
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => listeners.get(name)?.delete(fn);
    },
    setNeeds(kinds) {
      needs = [...new Set(kinds)];
      tick();
    },
  };
}

function structuredCloneSafe(v) {
  return JSON.parse(JSON.stringify(v));
}
