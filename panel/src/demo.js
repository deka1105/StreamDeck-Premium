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
    weather: () => {
      const now = Date.now();
      const t0 = new Date(new Date().toDateString()).getTime();
      return {
        place: "Demo City",
        units: { temp: "°C", wind: "km/h" },
        current: { temp: 18, feels: 17, humidity: 55, code: 2, isDay: true, wind: 12 },
        hourly: Array.from({ length: 24 }, (_, i) => ({ t: now + i * 3600_000, temp: 18 - Math.round(4 * Math.sin(i / 4)), code: [1, 2, 3, 61][i % 4], pop: (i * 7) % 60 })),
        daily: Array.from({ length: 7 }, (_, i) => ({ date: new Date(t0 + i * 86400_000).toLocaleDateString("en-CA"), code: [0, 2, 61, 3, 1, 80, 0][i], max: 19 + (i % 3), min: 9 + (i % 2), sunrise: t0 + i * 86400_000 + 7 * 3600_000, sunset: t0 + i * 86400_000 + 17.2 * 3600_000, uv: 3, daylight: 36000 })),
        air: { eaqi: 24, usaqi: 41, pm25: 7, pm10: 12, o3: 58, no2: 11 },
        stale: false,
        at: now,
      };
    },
    markets: () => ({
      rates: { USD: { date: new Date().toLocaleDateString("en-CA"), rates: { EUR: 0.9127, GBP: 0.7621, JPY: 159.54, CHF: 0.8811 } } },
      crypto: { vs: "usd", prices: { bitcoin: { usd: 59836, usd_24h_change: -1.36 }, ethereum: { usd: 1669.3, usd_24h_change: 2.02 } } },
      stale: false,
      at: Date.now(),
    }),
    hn: () => ({
      stories: ["Show HN: A desk panel for your old phone", "The quiet return of plain HTML", "Why I keep a paper notebook", "A tiny database in 400 lines", "How tides really work", "Lessons from ten years of side projects", "Interactive guide to color spaces", "The history of the spreadsheet"].map((title, i) => ({ id: i, title, score: 300 - i * 31, comments: 120 - i * 11 })),
      stale: false,
      at: Date.now(),
    }),
    feeds: () => ({
      items: [["Demo News", "City council approves new bike lanes"], ["Tech Daily", "New laptop chips promise all-day battery"], ["Demo News", "Weekend weather: sunny and mild"], ["Science Now", "Telescope spots a distant galaxy cluster"], ["Tech Daily", "Open-source editor reaches version 2.0"]].map(([feed, title], i) => ({ feed, title, link: `https://example.com/${i}`, category: feed === "Tech Daily" ? "Tech" : "News", at: Date.now() - i * 2400_000 })),
      categories: ["News", "Tech"],
      stale: false,
      at: Date.now(),
    }),
    calendar: () => {
      const t0 = new Date(new Date().toDateString()).getTime();
      const ev = (d, h, mins, title, color) => ({ title, start: t0 + d * 86400_000 + h * 3600_000, end: t0 + d * 86400_000 + h * 3600_000 + mins * 60_000, allDay: false, cal: "Demo", color, location: "" });
      return {
        events: [ev(0, 13, 60, "Lunch with Sam", "#f472b6"), ev(0, 15.5, 30, "Design review", "#38bdf8"), ev(0, 21, 60, "Gym", "#34d399"), ev(1, 9, 15, "Standup", "#38bdf8"), ev(1, 18, 120, "Dinner party", "#fbbf24"), ev(2, 10, 60, "Dentist", "#a78bfa")].filter((e) => e.end > Date.now()),
        days: 7,
        errors: [],
        stale: false,
        at: Date.now(),
      };
    },
    media: () => {
      const dur = 214;
      const pos = (Date.now() / 1000) % dur;
      return { playing: true, app: "Spotify", state: "playing", title: "Golden Hour Drive", artist: "The Demo Band", album: "Night Roads", duration: dur, position: pos, artId: "demo:1", canSeek: true, volume: 42, muted: false, players: "Spotify and Music", supported: true, at: Date.now() };
    },
    mediaServer: () => ({
      configured: true,
      servers: [{ id: "demo", name: "Living room Jellyfin", type: "jellyfin", online: true, version: "10.10", library: "312 movies, 45 shows", sessions: [{ id: "s1", title: "The Long Voyage", subtitle: "2019", duration: 6300, position: 2400, state: "playing", device: "TV", user: "alex", transcoding: false, canControl: true }] }],
      at: Date.now(),
    }),
    radio: () => ({ playing: null, player: "mpv", at: Date.now() }),
    pushes: () => ({ values: { temperature: { value: "21.5", unit: "°C", title: "Living room", at: Date.now() - 120_000 }, build: { value: "passed", sub: "main · 3m 12s", level: "ok", progress: 1, at: Date.now() - 600_000 } }, at: Date.now() }),
    notifications: () => ({ items: [{ id: "1", title: "Deploy", text: "Production is live", level: "ok", at: Date.now() - 300_000 }, { id: "2", title: "Doorbell", text: "Someone is at the door", level: "info", at: Date.now() - 3600_000 }], at: Date.now() }),
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
    "phone.battery": () => ({ level: 0.82, charging: true, lowPower: false }),
    "phone.hosts": () => ({ hosts: [{ id: "demo", name: "Demo Mac", active: true }] }),
    "phone.switchHost": () => ({ ok: true }),
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
    "feeds.open": () => ({ ok: true, simulated: true }),
    "shortcuts.list": () => ({ shortcuts: [{ id: "build", label: "Build", icon: "🔨", color: "#2563eb", kind: "program" }, { id: "deploy", label: "Deploy", icon: "🚀", color: "#9333ea", kind: "program" }, { id: "focus", label: "Focus", icon: "🎧", color: "#0d9488", kind: "macro" }, { id: "lock", label: "Lock", icon: "🔒", color: "#475569", kind: "keys" }] }),
    "shortcut.run": () => ({ ok: true, simulated: true }),
    "command.output": () => ({ ok: true, output: "Filesystem      Size  Used Avail Use%\n/dev/disk1s1   932G  612G  320G  66%\n", at: Date.now() }),
    "rules.state": () => ({ pausedUntil: 0, active: ["music"] }),
    "rules.pause": () => ({ pausedUntil: 0 }),
    "media.control": () => ({ ok: true, simulated: true }),
    "media.art": () => ({ src: null }),
    "mediaServer.poster": () => ({ src: null }),
    "mediaServer.control": () => ({ ok: true, simulated: true }),
    "radio.play": () => ({ ok: false, error: "Demo — radio plays on your computer." }),
    "radio.stop": () => ({ ok: true }),
    "lyrics.get": () => ({ ok: true, found: true, synced: Array.from({ length: 40 }, (_, i) => ({ t: i * 5.3, text: ["Headlights on the open road", "Singing to the radio", "Every mile a little gold", "Golden hour, take it slow"][i % 4] })) }),
    "image.fetch": () => ({ ok: false, error: "Images load from your computer." }),
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
