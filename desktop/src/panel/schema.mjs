import { sanitizeShortcuts, sanitizeCommands } from "./shortcuts.mjs";
import { sanitizeRules } from "./rules.mjs";
// Panel layout schema (ours; PLAN D2). Everything that comes from the editor,
// an imported file or the phone passes through sanitizeConfig before it is
// stored or served. Unknown widget types are dropped, boxes are clamped to the
// 12 × 6 grid, and only option keys the catalogue defines survive.
//
// config = {
//   version: 1,
//   default: Layout,                       used by any client without its own
//   devices: { [clientId]: Layout & {name?} },
//   settings: { idleSec }                   panel-wide defaults
// }
// Layout = { pages: Page[], home: pageId | null }
// Page   = { id, name, hidden, staySec, widgets: Widget[] }   staySec: null = default, 0 = never return home
// Widget = { id, type, x, y, w, h, portrait?: {x,y,w,h}, options: {} }

export const COLS = 12;
export const ROWS = 6;
export const MAX_PAGES = 40;
export const MAX_WIDGETS = 48;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

const int = (v, d) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);

export function clampBox(box, cols = COLS, rows = ROWS, min = { w: 1, h: 1 }, max = { w: cols, h: rows }) {
  const minW = Math.max(1, Math.min(int(min?.w, 1), cols));
  const minH = Math.max(1, Math.min(int(min?.h, 1), rows));
  const maxW = Math.max(minW, Math.min(int(max?.w, cols), cols));
  const maxH = Math.max(minH, Math.min(int(max?.h, rows), rows));
  const w = Math.max(minW, Math.min(maxW, int(box?.w, minW)));
  const h = Math.max(minH, Math.min(maxH, int(box?.h, minH)));
  const x = Math.max(0, Math.min(cols - w, int(box?.x, 0)));
  const y = Math.max(0, Math.min(rows - h, int(box?.y, 0)));
  return { x, y, w, h };
}

function cleanText(v, max = 200) {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max) : "";
}

function cleanId(v, fallback) {
  return typeof v === "string" && ID_RE.test(v) ? v : fallback;
}

/** Coerce one option value to its catalogue definition, or undefined to drop it. */
export function cleanOption(def, value) {
  switch (def.type) {
    case "bool":
      return typeof value === "boolean" ? value : undefined;
    case "number": {
      const n = Number(value);
      if (!Number.isFinite(n)) return undefined;
      const lo = Number.isFinite(def.min) ? def.min : -1e9;
      const hi = Number.isFinite(def.max) ? def.max : 1e9;
      return Math.max(lo, Math.min(hi, n));
    }
    case "choice":
      return (def.choices ?? []).some((c) => c.value === value) ? value : undefined;
    case "text":
    case "textarea":
      return typeof value === "string" ? cleanText(value, def.maxLength ?? (def.type === "textarea" ? 4000 : 200)) : undefined;
    case "list": // list of short strings (e.g. world-clock zones)
      return Array.isArray(value) ? value.filter((s) => typeof s === "string").slice(0, def.maxItems ?? 24).map((s) => cleanText(s, 120)) : undefined;
    case "json": // structured data owned by the widget (e.g. deck tiles); size-capped
      try {
        const s = JSON.stringify(value);
        return s && s.length <= (def.maxBytes ?? 64_000) ? JSON.parse(s) : undefined;
      } catch {
        return undefined;
      }
    default:
      return undefined;
  }
}

// ---- Stage 10: appearance ("look") and display ----------------------------
// A look is a set of optional overrides; null/absent = inherit
// (panel defaults → layout.look → page.look → widget.look).
const FONTS = ["system", "rounded", "serif", "mono", "condensed"];
const THEMES = ["dark", "light", "oled"];
const hex = (v) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined);
const inRange = (v, lo, hi) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? undefined : Math.max(lo, Math.min(hi, Number(v))));
function cleanWallpaper(w) {
  if (!w || typeof w !== "object") return undefined;
  const src = typeof w.src === "string" ? w.src.trim() : "";
  const ok = /^https:\/\/[^\s"'()<>]+$/i.test(src) ? src.slice(0, 2000) : /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src) && src.length <= 1_500_000 ? src : null;
  if (!ok) return undefined;
  return { src: ok, dim: inRange(w.dim, 0, 0.9) ?? 0.35, blur: inRange(w.blur, 0, 30) ?? 0 };
}
export function cleanLook(raw, { widget = false } = {}) {
  if (!raw || typeof raw !== "object") return undefined;
  const out = {
    accent: hex(raw.accent),
    tile: hex(raw.tile),
    ink: hex(raw.ink),
    radius: inRange(raw.radius, 0, 40),
    border: typeof raw.border === "boolean" ? raw.border : undefined,
    shadow: typeof raw.shadow === "boolean" ? raw.shadow : undefined,
    opacity: inRange(raw.opacity, 0, 1),
  };
  if (!widget) {
    Object.assign(out, {
      preset: typeof raw.preset === "string" && /^[a-z0-9-]{1,24}$/.test(raw.preset) ? raw.preset : undefined,
      theme: THEMES.includes(raw.theme) ? raw.theme : undefined,
      bg: hex(raw.bg),
      font: FONTS.includes(raw.font) ? raw.font : undefined,
      scale: inRange(raw.scale, 0.7, 1.5),
      gap: inRange(raw.gap, 0, 24),
      padding: inRange(raw.padding, 0, 32),
      wallpaper: raw.wallpaper === null ? null : cleanWallpaper(raw.wallpaper),
    });
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return Object.keys(out).length ? out : undefined;
}
const NAVS = ["dots", "bar", "side-left", "side-right", "none"];
const hhmm = (v, d) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d);
export function cleanDisplay(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const n = r.night && typeof r.night === "object" ? r.night : {};
  return {
    nav: NAVS.includes(r.nav) ? r.nav : "dots",
    badges: r.badges !== false,
    oledShift: r.oledShift === true,
    dimAfterMin: inRange(r.dimAfterMin, 0, 240) ?? 0,
    dimLevel: inRange(r.dimLevel, 0.1, 0.9) ?? 0.5,
    followPcSleep: r.followPcSleep === true,
    night: {
      mode: ["off", "schedule", "pc"].includes(n.mode) ? n.mode : "off",
      from: hhmm(n.from, "22:30"),
      to: hhmm(n.to, "07:00"),
      style: ["clock", "black"].includes(n.style) ? n.style : "clock",
      brightness: inRange(n.brightness, 0.05, 0.6) ?? 0.25,
    },
  };
}

export function sanitizeWidget(raw, catalogByType, used) {
  if (!raw || typeof raw !== "object") return null;
  const def = catalogByType.get(raw.type);
  if (!def) return null; // unknown type → dropped
  let id = cleanId(raw.id, null);
  if (!id || used.has(id)) {
    let n = used.size + 1;
    while (used.has(`w${n}`)) n++;
    id = `w${n}`;
  }
  used.add(id);
  const box = clampBox(raw, COLS, ROWS, def.min, def.max);
  const out = { id, type: def.type, ...box, options: {} };
  if (raw.portrait && typeof raw.portrait === "object") out.portrait = clampBox(raw.portrait, ROWS, COLS, def.min, def.max);
  const look = cleanLook(raw.look, { widget: true });
  if (look) out.look = look;
  const opts = raw.options && typeof raw.options === "object" ? raw.options : {};
  for (const o of def.options ?? []) {
    if (!(o.key in opts)) continue;
    const v = cleanOption(o, opts[o.key]);
    if (v !== undefined) out.options[o.key] = v;
  }
  return out;
}

export function sanitizePage(raw, catalogByType, usedPageIds, index) {
  if (!raw || typeof raw !== "object") return null;
  let id = cleanId(raw.id, null);
  if (!id || usedPageIds.has(id)) id = `p${index + 1}`;
  while (usedPageIds.has(id)) id = `${id}x`;
  usedPageIds.add(id);
  const used = new Set();
  const widgets = (Array.isArray(raw.widgets) ? raw.widgets : [])
    .slice(0, MAX_WIDGETS)
    .map((w) => sanitizeWidget(w, catalogByType, used))
    .filter(Boolean);
  const stay = raw.staySec === null || raw.staySec === undefined ? null : Math.max(0, Math.min(24 * 3600, int(raw.staySec, 0)));
  return {
    id,
    name: cleanText(raw.name, 40) || `Page ${index + 1}`,
    hidden: raw.hidden === true,
    staySec: stay,
    widgets,
    ...(cleanLook(raw.look) ? { look: cleanLook(raw.look) } : {}),
  };
}

export function sanitizeLayout(raw, catalogByType) {
  const usedPageIds = new Set();
  const pages = (Array.isArray(raw?.pages) ? raw.pages : [])
    .slice(0, MAX_PAGES)
    .map((p, i) => sanitizePage(p, catalogByType, usedPageIds, i))
    .filter(Boolean);
  const home = pages.some((p) => p.id === raw?.home && !p.hidden) ? raw.home : pages.find((p) => !p.hidden)?.id ?? null;
  return { pages, home, look: cleanLook(raw?.look) ?? {}, display: cleanDisplay(raw?.display) };
}

const num = (v, lo, hi) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : null);
const cleanColor = (v) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : null);

function cleanLocation(l) {
  if (!l || typeof l !== "object") return null;
  const lat = num(l.lat, -90, 90);
  const lon = num(l.lon, -180, 180);
  if (lat === null || lon === null) return null;
  return { name: cleanText(l.name, 80) || `${lat.toFixed(2)}, ${lon.toFixed(2)}`, lat, lon, tz: cleanText(l.tz, 64) };
}

function cleanUrlOrPath(v, { allowFile = false } = {}) {
  const s = String(v ?? "").trim().replace(/^webcal:/i, "https:");
  if (/^https?:\/\/[^\s]+$/i.test(s)) return s.slice(0, 2000);
  if (allowFile && /^\/[^\0]+\.ics$/i.test(s)) return s.slice(0, 1000);
  return null;
}

function cleanCalendars(list) {
  const out = [];
  const ids = new Set();
  for (const c of Array.isArray(list) ? list.slice(0, 20) : []) {
    const kind = c?.kind === "caldav" ? "caldav" : "ics";
    const url = cleanUrlOrPath(c?.url, { allowFile: kind === "ics" });
    let id = cleanId(c?.id, null) ?? `cal${out.length + 1}`;
    while (ids.has(id)) id += "x";
    if (!url) continue;
    ids.add(id);
    out.push({
      id,
      name: cleanText(c.name, 60) || (kind === "caldav" ? "iCloud" : "Calendar"),
      kind,
      url,
      user: kind === "caldav" ? cleanText(c.user, 120) : "",
      color: cleanColor(c.color) ?? "#38bdf8",
      only: Array.isArray(c.only) ? c.only.filter((x) => typeof x === "string").slice(0, 30).map((x) => cleanText(x, 80)) : [],
    });
  }
  return out;
}

function cleanFeeds(list) {
  const out = [];
  const seen = new Set();
  for (const f of Array.isArray(list) ? list.slice(0, 200) : []) {
    const url = cleanUrlOrPath(f?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ name: cleanText(f.name, 80), url, category: cleanText(f.category, 40) });
  }
  return out;
}

function cleanMediaServers(list) {
  const out = [];
  for (const m of Array.isArray(list) ? list.slice(0, 4) : []) {
    const url = cleanUrlOrPath(m?.url);
    const type = m?.type === "plex" ? "plex" : m?.type === "jellyfin" ? "jellyfin" : null;
    const id = cleanId(m?.id, null);
    if (!url || !type || !id || out.some((x) => x.id === id)) continue;
    out.push({ id, type, name: cleanText(m.name, 40) || (type === "plex" ? "Plex" : "Jellyfin"), url });
  }
  return out;
}

// Control Deck (Stage 11): OBS, Home Assistant, containers, machines to wake,
// OSC targets, dev services and the trackpad. Passwords and tokens live in the
// secret store, never here.
const HOST_RE = /^[A-Za-z0-9.:\[\]_-]{1,255}$/;
export function cleanControl(c) {
  const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
  const port = (v, d) => Math.max(1, Math.min(65535, int(v, d)));
  const ids = new Set();
  const uid = (v, i, p) => {
    let id = cleanId(v, `${p}${i + 1}`);
    while (ids.has(id)) id += "x";
    ids.add(id);
    return id;
  };
  return {
    obs: { enabled: c?.obs?.enabled === true, host: HOST_RE.test(c?.obs?.host ?? "") ? c.obs.host : "127.0.0.1", port: port(c?.obs?.port, 4455) },
    ha: { url: cleanUrlOrPath(c?.ha?.url)?.replace(/\/+$/, "") ?? "" },
    containers: ["docker", "podman"].includes(c?.containers) ? c.containers : "auto",
    wol: list(c?.wol, 16)
      .filter((m) => /^([0-9a-f]{2}[:-]?){5}[0-9a-f]{2}$/i.test(String(m?.mac ?? "").trim()))
      .map((m, i) => ({ id: uid(m.id, i, "pc"), name: cleanText(m.name, 40) || "Computer", mac: String(m.mac).trim().toUpperCase().replace(/-/g, ":"), address: HOST_RE.test(m.address ?? "") ? m.address : "255.255.255.255", port: port(m.port, 9) })),
    osc: list(c?.osc, 32)
      .filter((o) => HOST_RE.test(o?.host ?? "") && /^\/[\x21-\x7e]{0,200}$/.test(o?.address ?? ""))
      .map((o, i) => ({ id: uid(o.id, i, "osc"), name: cleanText(o.name, 40) || o.address, host: o.host, port: port(o.port, 8000), address: o.address, args: cleanText(o.args, 200) })),
    services: list(c?.services, 16)
      .filter((s) => typeof s?.cmd === "string" && s.cmd.trim())
      .map((s, i) => ({ id: uid(s.id, i, "svc"), name: cleanText(s.name, 40) || s.cmd, cmd: cleanText(s.cmd, 500).trim(), args: cleanText(s.args, 2000), cwd: cleanText(s.cwd, 1000).trim(), url: cleanUrlOrPath(s.url) ?? "" })),
    trackpad: c?.trackpad === true,
  };
}

// Stage 12 audio: profiles (output + input device names, app levels), ducking.
export function cleanAudio(a) {
  const names = (v, max) => (Array.isArray(v) ? v : []).filter((x) => typeof x === "string" && x.trim()).map((x) => cleanText(x, 80).trim()).slice(0, max);
  const ids = new Set();
  return {
    duckLevel: Math.max(0, Math.min(100, int(a?.duckLevel, 30))),
    duckExcept: names(a?.duckExcept ?? ["Teams", "Zoom", "Discord"], 20),
    pttDuck: a?.pttDuck === true,
    profiles: (Array.isArray(a?.profiles) ? a.profiles.slice(0, 12) : [])
      .map((p, i) => {
        let id = cleanId(p?.id, `ap${i + 1}`);
        while (ids.has(id)) id += "x";
        ids.add(id);
        return {
          id,
          name: cleanText(p?.name, 40) || `Profile ${i + 1}`,
          output: cleanText(p?.output, 120),
          input: cleanText(p?.input, 120),
          apps: (Array.isArray(p?.apps) ? p.apps.slice(0, 24) : []).filter((x) => typeof x?.name === "string" && x.name.trim()).map((x) => ({ name: cleanText(x.name, 80), volume: Math.max(0, Math.min(100, int(x.volume, 100))) })),
        };
      }),
  };
}

export function sanitizeConfig(raw, catalog) {
  const byType = new Map((catalog?.widgets ?? []).map((w) => [w.type, w]));
  const devices = {};
  for (const [id, layout] of Object.entries(raw?.devices ?? {}).slice(0, 64)) {
    if (!/^[A-Za-z0-9:_-]{1,80}$/.test(id) || !layout || typeof layout !== "object") continue;
    devices[id] = { ...sanitizeLayout(layout, byType), name: cleanText(layout.name, 64) };
  }
  // Seconds of no touch before the panel returns to its home page; 0 = never.
  const idle = int(raw?.settings?.idleSec, 300);
  return {
    version: 1,
    default: sanitizeLayout(raw?.default ?? {}, byType),
    devices,
    shortcuts: sanitizeShortcuts(raw?.shortcuts),
    commands: sanitizeCommands(raw?.commands),
    rules: sanitizeRules(raw?.rules),
    settings: {
      idleSec: Math.max(0, Math.min(4 * 3600, idle)),
      // Internet widget: opt-in public IP, and an optional speed-test schedule (0 = only on tap).
      netq: {
        showIp: raw?.settings?.netq?.showIp === true,
        speedtestHours: Math.max(0, Math.min(48, int(raw?.settings?.netq?.speedtestHours, 0))),
      },
      location: cleanLocation(raw?.settings?.location),
      units: { temp: raw?.settings?.units?.temp === "F" ? "F" : "C", wind: raw?.settings?.units?.wind === "mph" ? "mph" : "kmh" },
      calendars: cleanCalendars(raw?.settings?.calendars),
      calendarDays: Math.max(1, Math.min(31, int(raw?.settings?.calendarDays, 7))),
      feeds: cleanFeeds(raw?.settings?.feeds),
      mediaServers: cleanMediaServers(raw?.settings?.mediaServers),
      webhooks: { lan: raw?.settings?.webhooks?.lan === true },
      agents: {
        phonePrompts: raw?.settings?.agents?.phonePrompts === true,
        onlyWhenAway: raw?.settings?.agents?.onlyWhenAway === true,
        timeoutSec: Math.max(10, Math.min(600, int(raw?.settings?.agents?.timeoutSec, 60))),
        alerts: raw?.settings?.agents?.alerts !== false,
        idleAlertSec: Math.max(0, Math.min(3600, int(raw?.settings?.agents?.idleAlertSec, 30))),
      },
      pageSwitch: {
        minGapSec: Math.max(0, Math.min(600, int(raw?.settings?.pageSwitch?.minGapSec, 20))),
        waitAfterTouchSec: Math.max(0, Math.min(120, int(raw?.settings?.pageSwitch?.waitAfterTouchSec, 8))),
        holdMaxMin: Math.max(0, Math.min(600, int(raw?.settings?.pageSwitch?.holdMaxMin, 30))),
      },
      control: cleanControl(raw?.settings?.control),
      audio: cleanAudio(raw?.settings?.audio),
      android: { usb: raw?.settings?.android?.usb === true, clipboard: raw?.settings?.android?.clipboard === true, showNotifications: raw?.settings?.android?.showNotifications !== false },
      system: { services: (Array.isArray(raw?.settings?.system?.services) ? raw.settings.system.services : []).filter((n) => typeof n === "string" && /^[A-Za-z0-9_.\- ]{1,80}$/.test(n)).slice(0, 20) },
      mediaUsers: Array.isArray(raw?.settings?.mediaUsers) ? raw.settings.mediaUsers.filter((u) => typeof u === "string").slice(0, 10).map((u) => cleanText(u, 60)) : [],
    },
  };
}
