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

// Control Deck demo state: taps change it, so the demo feels real.
const fmt = (ms) => new Date(ms).toISOString().slice(11, 19);
export function createDemoControl() {
  const st = {
    scene: "Camera",
    recAt: 0,
    paused: false,
    liveAt: 0,
    vcam: false,
    mutes: { "Mic/Aux": false, "Desktop Audio": false },
    sources: [{ id: 1, name: "Webcam", on: true }, { id: 2, name: "Lower third", on: false }, { id: 3, name: "Browser", on: true }],
    ha: [
      { id: "light.desk", name: "Desk lamp", domain: "light", state: "on", brightness: 70 },
      { id: "light.shelf", name: "Shelf lights", domain: "light", state: "off", brightness: null },
      { id: "switch.coffee", name: "Coffee machine", domain: "switch", state: "off" },
      { id: "sensor.office_temp", name: "Office", domain: "sensor", state: "21.4", unit: "°C" },
      { id: "lock.front_door", name: "Front door", domain: "lock", state: "locked" },
      { id: "scene.focus", name: "Focus lighting", domain: "scene", state: "scening" },
    ],
    containers: [
      { id: "a1b2c3d4e5f6", name: "postgres", image: "postgres:17", running: true, upAt: Date.now() - 5 * 3600_000 },
      { id: "b2c3d4e5f6a1", name: "redis", image: "redis:7-alpine", running: true, upAt: Date.now() - 5 * 3600_000 },
      { id: "c3d4e5f6a1b2", name: "mailpit", image: "axllent/mailpit", running: false, upAt: 0 },
    ],
    services: [
      { id: "web", name: "Web app", url: "http://localhost:3000", state: "running", since: Date.now() - 42 * 60_000, lines: ["▲ Next.js 15 · http://localhost:3000", "✓ Compiled /dashboard in 412ms"] },
      { id: "api", name: "API", url: "", state: "running", since: Date.now() - 42 * 60_000, lines: ["listening on :8080", "GET /health 200 2ms"] },
      { id: "tests", name: "Tests (watch)", url: "", state: "stopped", since: null, lines: [] },
    ],
    allMuted: false,
    audio: {
      outputs: [{ id: "spk", name: "Speakers (Realtek)" }, { id: "hp", name: "Headphones (WH-1000XM5)" }, { id: "mon", name: "DELL U2723QE (HDMI)" }],
      inputs: [{ id: "usb", name: "Microphone (Shure MV7)" }, { id: "cam", name: "Webcam microphone" }],
      out: "hp",
      inp: "usb",
      outVol: 0.62,
      outMuted: false,
      inVol: 0.8,
      inMuted: true,
      apps: [
        { name: "Spotify", display: "Spotify", volume: 0.55, muted: false },
        { name: "Discord", display: "Discord", volume: 0.8, muted: false },
        { name: "chrome", display: "Chrome", volume: 1, muted: false },
        { name: "Teams", display: "Teams", volume: 0.9, muted: false },
      ],
      ptt: false,
      ducked: null,
      plan: "bal",
      services: [{ name: "Spooler", display: "Print Spooler", state: "running" }, { name: "docker", display: "Docker Desktop Service", state: "running" }, { name: "wuauserv", display: "Windows Update", state: "stopped" }],
      displays: [{ index: -1, name: "Built-in display", percent: 70 }, { index: 0, name: "DELL U2723QE", percent: 45 }],
    },
  };
  const haOn = (e) => ["on", "unlocked"].includes(e.state);
  return {
    st,
    obs: () => ({
      connected: true,
      current: st.scene,
      scenes: ["Starting soon", "Camera", "Screen + cam", "Screen", "Be right back"],
      record: { active: !!st.recAt, paused: st.paused, time: st.recAt ? fmt(Date.now() - st.recAt) : "" },
      stream: { active: !!st.liveAt, time: st.liveAt ? fmt(Date.now() - st.liveAt) : "" },
      vcam: { active: st.vcam, available: true },
      sources: st.sources.map((x) => ({ ...x })),
      inputs: Object.entries(st.mutes).map(([name, muted]) => ({ name, muted })),
    }),
    ha: () => ({ entities: st.ha.map((e) => ({ ...e, unit: e.unit ?? "", on: haOn(e), tappable: !["sensor"].includes(e.domain), icon: "", brightness: e.state === "on" ? e.brightness : null })), at: Date.now() }),
    containers: () => ({ engine: "docker", containers: st.containers.map((c) => ({ id: c.id, name: c.name, image: c.image, running: c.running, state: c.running ? "running" : "exited", status: c.running ? `Up ${Math.max(1, Math.round((Date.now() - c.upAt) / 3600_000))} hours` : "Exited (0) yesterday" })), at: Date.now() }),
    services: () => ({ services: st.services.map((x) => ({ ...x, code: x.state === "failed" ? 1 : null, lines: [...x.lines] })), at: Date.now() }),
    audio: () => {
      const a = st.audio;
      return {
        platform: "win32",
        available: true,
        canSwitch: true,
        perApp: true,
        ptt: a.ptt,
        ducked: !!a.ducked,
        profiles: [{ id: "music", name: "Music" }, { id: "call", name: "Calls" }, { id: "game", name: "Gaming" }],
        output: { devices: a.outputs.map((d) => ({ ...d, default: d.id === a.out })), volume: a.outVol, muted: a.outMuted },
        input: { devices: a.inputs.map((d) => ({ ...d, default: d.id === a.inp })), volume: a.inVol, muted: a.inMuted && !a.ptt },
        sessions: a.apps.map((x) => ({ ...x, system: false, peak: 0 })),
        at: Date.now(),
      };
    },
    audiolevels: () => ({ sessions: Object.fromEntries(st.audio.apps.map((x) => [x.name, x.muted ? 0 : x.name === "Spotify" ? 0.25 + Math.random() * 0.4 : x.name === "Discord" ? Math.random() * 0.2 : Math.random() * 0.05])), output: st.audio.outMuted ? 0 : 0.3 + Math.random() * 0.3, input: 0, at: Date.now() }),
    winsys: () => ({
      platform: "win32",
      plans: [
        { guid: "bal", name: "Balanced", active: st.audio.plan === "bal" },
        { guid: "perf", name: "High performance", active: st.audio.plan === "perf" },
        { guid: "save", name: "Power saver", active: st.audio.plan === "save" },
      ],
      services: st.audio.services.map((x) => ({ ...x })),
      displays: st.audio.displays.map((x) => ({ ...x })),
      canLock: true,
      canSleep: true,
      at: Date.now(),
    }),
    meeting: () => ({ canMuteAll: true, mic: st.allMuted ? 0 : 60, outMuted: st.allMuted, allMuted: st.allMuted, at: Date.now() }),
    act(method, p = {}) {
      if (method === "obs.control") {
        const c = p.command;
        if (c === "scene") st.scene = p.arg;
        else if (c === "record") (st.recAt = st.recAt ? 0 : Date.now()), (st.paused = false);
        else if (c === "pause") st.paused = !st.paused;
        else if (c === "stream") st.liveAt = st.liveAt ? 0 : Date.now();
        else if (c === "vcam") st.vcam = !st.vcam;
        else if (c === "mute") st.mutes[p.arg] = !st.mutes[p.arg];
        else if (c === "source") st.sources.forEach((x) => x.id === p.arg && (x.on = !x.on));
        return "obs";
      }
      if (method === "ha.tap") {
        const e = st.ha.find((x) => x.id === p.entity);
        if (e?.domain === "lock") e.state = e.state === "locked" ? "unlocked" : "locked";
        else if (e && e.domain !== "scene") e.state = e.state === "on" ? "off" : "on";
        return "ha";
      }
      if (method === "containers.control") {
        const c = st.containers.find((x) => x.id === p.id);
        if (c) (c.running = p.action !== "stop"), (c.upAt = Date.now());
        return "containers";
      }
      if (method === "services.control") {
        const x = st.services.find((y) => y.id === p.id);
        if (x) {
          x.state = p.action === "stop" ? "stopped" : "running";
          x.since = p.action === "stop" ? null : Date.now();
          if (x.state === "running") x.lines = [...x.lines.slice(-1), "started (simulated)"];
        }
        return "services";
      }
      const a = st.audio;
      if (method.startsWith("audio.") || method.startsWith("ptt.")) {
        if (method === "audio.setDefault") a.outputs.some((d) => d.id === p.id) ? (a.out = p.id) : (a.inp = p.id);
        else if (method === "audio.setDeviceVolume") p.flow === "capture" ? (a.inVol = p.volume) : (a.outVol = p.volume);
        else if (method === "audio.setDeviceMute") p.flow === "capture" ? (a.inMuted = p.muted) : (a.outMuted = p.muted);
        else if (method === "audio.setSessionVolume") a.apps.forEach((x) => x.name === p.name && (x.volume = p.volume));
        else if (method === "audio.setSessionMute") a.apps.forEach((x) => x.name === p.name && (x.muted = p.muted));
        else if (method === "audio.duck") {
          if (p.on && !a.ducked) (a.ducked = Object.fromEntries(a.apps.map((x) => [x.name, x.volume]))), a.apps.forEach((x) => x.name !== "Teams" && (x.volume *= 0.3));
          else if (!p.on && a.ducked) a.apps.forEach((x) => (x.volume = a.ducked[x.name] ?? x.volume)), (a.ducked = null);
        } else if (method === "audio.profile") {
          const pr = { music: ["hp", { Spotify: 0.8, Discord: 0.3 }], call: ["hp", { Spotify: 0.15, Teams: 1 }], game: ["spk", { Discord: 0.7, Spotify: 0.3 }] }[p.id];
          if (pr) (a.out = pr[0]), a.apps.forEach((x) => x.name in pr[1] && (x.volume = pr[1][x.name]));
        } else if (method === "ptt.down") a.ptt = true;
        else if (method === "ptt.up") a.ptt = false;
        return "audio";
      }
      if (method === "system.plan") return (a.plan = p.guid), "winsys";
      if (method === "system.service") return a.services.forEach((x) => x.name === p.name && (x.state = p.action === "stop" ? "stopped" : "running")), "winsys";
      if (method === "system.brightness") return a.displays.forEach((x) => x.index === p.index && (x.percent = p.percent)), "winsys";
      if (method === "meeting.muteAll") {
        st.allMuted = !st.allMuted;
        return "meeting";
      }
      return null;
    },
  };
}

/** Generators per data kind. Grows as widgets land. */
export function demoGenerators(control = createDemoControl()) {
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
    ai: () => {
      const now = Date.now();
      const days = Array.from({ length: 7 }, (_, i) => ({ day: new Date(now - (6 - i) * 864e5).toLocaleDateString("en-CA"), tokens: [3.1e6, 5.4e6, 0.8e6, 7.2e6, 4.4e6, 6.1e6, 2.9e6][i] }));
      return {
        sessions: [
          { agent: "claude", id: "d1", project: "deskassist", status: "working", model: "claude-opus-5-5", updatedAt: now - 20_000, tokens: { input: 1.8e6, output: 42e3 } },
          { agent: "claude", id: "d2", project: "website", status: "idle", model: "claude-sonnet-5-5", updatedAt: now - 400_000, tokens: { input: 310e3, output: 9e3 } },
          { agent: "codex", id: "d3", project: "api-server", status: "working", model: "gpt-codex", updatedAt: now - 5_000, tokens: { input: 520e3, output: 15e3 } },
        ],
        claude: { installed: true, usage: { today: 2.9e6, lastHour: 640e3, days, models: { "claude-opus-5-5": 2.2e6, "claude-sonnet-5-5": 0.7e6 } }, limits: { five: { used: 38 + ((now / 60000) % 10), resetsAt: now + 2.3 * 3600e3 }, week: { used: 61, resetsAt: now + 3.4 * 864e5 }, fiveFullAt: now + 4.1 * 3600e3, weekFullAt: null, at: now } },
        codex: { installed: true, usage: { today: 0.5e6, lastHour: 120e3, days, models: { "gpt-codex": 0.5e6 } }, limits: { five: { used: 12, resetsAt: now + 4 * 3600e3 }, week: { used: 30, resetsAt: now + 5 * 864e5 }, at: now } },
        recent: "claude",
        at: now,
      };
    },
    alerts: () => ({ alerts: [{ session: "d2", project: "website", kind: "input", message: "Claude is waiting for your input", at: Date.now() - 90_000 }], prompts: [], at: Date.now() }),
    obs: control.obs,
    ha: control.ha,
    containers: control.containers,
    services: control.services,
    meeting: control.meeting,
    audio: control.audio,
    audiolevels: control.audiolevels,
    winsys: control.winsys,
    github: () => {
      const now = Date.now();
      let seed = 7;
      const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
      const days = Array.from({ length: 371 }, (_, i) => ({ date: new Date(now - (370 - i) * 864e5).toISOString().slice(0, 10), count: rnd() < 0.25 ? 0 : Math.floor(rnd() * 12) }));
      return {
        login: "you", total: days.reduce((a, d) => a + d.count, 0), streak: 9, days,
        kinds: { commits: 812, prs: 64, issues: 21, reviews: 88 },
        repos: [{ repo: "you/deskassist", commits: 412 }],
        prs: [{ number: 128, title: "Panel: night screen", url: "https://github.com/you/deskassist/pull/128", repo: "you/deskassist", draft: false, checks: "passing" }, { number: 131, title: "Rules: away trigger", url: "https://github.com/you/deskassist/pull/131", repo: "you/deskassist", draft: false, checks: "running" }],
        reviews: { count: 1, items: [{ number: 77, title: "Fix calendar time zones", url: "https://github.com/team/app/pull/77", repo: "team/app", author: "sam" }] },
        at: now,
      };
    },
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
  const control = createDemoControl();
  const gens = demoGenerators(control);
  // A Control Deck tap changes the simulated state and shows it at once.
  const controlled = (method) => (params) => {
    const kind = control.act(method, params);
    if (kind) setTimeout(() => emit("event", { type: "data", data: { kind, value: (latest[kind] = gens[kind]()) } }), 60);
    return method === "meeting.muteAll" ? { ok: true, allMuted: control.st.allMuted } : { ok: true, simulated: true };
  };
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
    "agent.answer": () => ({ ok: true }),
    "agent.dismiss": () => ({ ok: true }),
    "agent.focus": () => ({ ok: true, app: "Terminal" }),
    "github.open": () => ({ ok: true }),
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
    "obs.control": controlled("obs.control"),
    "ha.tap": controlled("ha.tap"),
    "containers.control": controlled("containers.control"),
    "services.control": controlled("services.control"),
    "services.open": () => ({ ok: true, simulated: true }),
    "meeting.press": () => ({ ok: true, simulated: true }),
    "meeting.muteAll": controlled("meeting.muteAll"),
    "wol.list": () => ({ items: [{ id: "pc1", name: "Gaming PC" }, { id: "nas", name: "NAS" }] }),
    "wol.wake": () => ({ ok: true, simulated: true }),
    "osc.list": () => ({ items: [{ id: "go", name: "GO" }, { id: "stop", name: "Stop all" }, { id: "next", name: "Next cue" }] }),
    "osc.send": () => ({ ok: true, simulated: true }),
    "pointer.send": () => ({ ok: true, simulated: true }),
    ...Object.fromEntries(["audio.setDefault", "audio.setDeviceVolume", "audio.setDeviceMute", "audio.setSessionVolume", "audio.setSessionMute", "audio.duck", "audio.profile", "ptt.down", "ptt.up", "system.plan", "system.service", "system.brightness"].map((m) => [m, controlled(m)])),
    "ptt.hold": () => ({ ok: true }),
    "phone.platform": () => ({ android: /Android/i.test(navigator.userAgent) }),
    "phone.clipboard.send": () => ({ ok: true, simulated: true }),
    "phone.clipboard.receive": () => ({ ok: true, simulated: true }),
    "system.power": () => ({ ok: true, simulated: true }),
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
