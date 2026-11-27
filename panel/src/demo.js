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
  const gpuU = walker(31, 2, 97, 10);
  const gpuT = walker(58, 40, 82, 2);
  const rx = walker(2.4e6, 2e4, 9e7, 3e6);
  const tx = walker(4e5, 1e4, 2e7, 4e5);
  const ping = walker(14, 8, 60, 3);
  const procCpu = { Safari: walker(18, 1, 60, 6), "Visual Studio Code": walker(12, 1, 50, 5), Spotify: walker(4, 0, 15, 2), Finder: walker(1, 0, 6, 1), Slack: walker(3, 0, 20, 2), Terminal: walker(2, 0, 10, 1.5), Mail: walker(1, 0, 5, 1) };
  const procMem = { Safari: 2.1e9, "Visual Studio Code": 1.6e9, Spotify: 4.2e8, Finder: 1.1e8, Slack: 7.4e8, Terminal: 9e7, Mail: 2.3e8 };
  const hist = [];
  let today = 1.8e9;
  return {
    system: () => ({ cpu: Math.round(cpu() * 10) / 10, cores: 10, perCore: [], mem: { used: Math.round(mem() * 2 ** 30), total: 16 * 2 ** 30 }, swap: { used: 6e8, total: 2 * 2 ** 30 }, tempC: 54, uptime: 3 * 86400 + 4 * 3600, at: Date.now() }),
    gpu: () => {
      const g = { name: "Demo GPU", vendor: "Demo", util: Math.round(gpuU()), temp: Math.round(gpuT()), memUsed: 3.1 * 2 ** 30, memTotal: 8 * 2 ** 30 };
      return { gpus: [g], primary: g, at: Date.now() };
    },
    disks: () => ({ volumes: [{ name: "Macintosh HD", mount: "/", used: 612e9, size: 994e9 }, { name: "Backup", mount: "/Volumes/Backup", used: 1.4e12, size: 2e12 }], io: null, at: Date.now() }),
    net: () => ({ iface: "en0", rx: Math.round(rx()), tx: Math.round(tx()), pingMs: Math.round(ping() * 10) / 10, at: Date.now() }),
    procs: () => ({
      list: Object.keys(procCpu).map((name, i) => ({ name, pids: [1000 + i], cpu: Math.round(procCpu[name]() * 10) / 10, mem: procMem[name], own: true, protected: false, count: name === "Safari" ? 6 : 1 })),
      total: 412,
      at: Date.now(),
    }),
    netq: () => {
      const v = Math.random() < 0.03 ? -1 : Math.round(ping() * 10) / 10;
      hist.push(v);
      if (hist.length > 60) hist.shift();
      today += 3e5 + Math.random() * 2e6;
      const ok = hist.filter((x) => x >= 0);
      return {
        online: true,
        latencyMs: ok.length ? ok.slice(-5).sort((a, b) => a - b)[Math.min(2, ok.slice(-5).length - 1)] : null,
        jitterMs: 1.8,
        lossPct: Math.round((1000 * (hist.length - ok.length)) / Math.max(1, hist.length)) / 10,
        hist: [...hist],
        upSince: Date.now() - 2 * 86400_000 - 3 * 3600_000,
        lastDrop: { at: Date.now() - 2 * 86400_000 - 3 * 3600_000, seconds: 42 },
        today,
        month: 41e9 + today,
        speed: { at: Date.now() - 40 * 60_000, downMbps: 412.6, upMbps: 38.2, pingMs: 13 },
        testing: false,
        ip: null,
        at: Date.now(),
      };
    },
  };
}

export function createDemoBridge({ periodMs = 2000 } = {}) {
  const listeners = new Map();
  const emit = (name, payload) => {
    for (const fn of listeners.get(name) ?? []) fn(payload);
  };
  const gens = demoGenerators();
  const demoState = new Map(); // widget state lives in memory in the demo
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
    "state.get": ({ key } = {}) => ({ key, value: demoState.get(key) ?? null }),
    "state.set": ({ key, value } = {}) => {
      demoState.set(key, value);
      setTimeout(() => emit("event", { type: "state", data: { key, value } }), 0);
      return { ok: true };
    },
    "panel.history": ({ kind } = {}) => {
      if (!gens[kind]) return { kind, samples: [] };
      const now = Date.now();
      return { kind, samples: Array.from({ length: 90 }, (_, i) => ({ at: now - (90 - i) * 2000, value: gens[kind]() })) };
    },
    "procs.kill": () => ({ ok: false, reason: "Demo — nothing is actually ended." }),
    "netq.speedtest": () => ({ ok: false, error: "Demo — no speed test is run." }),
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
