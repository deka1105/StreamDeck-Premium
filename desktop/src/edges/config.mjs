// Desk edges settings: clean what the editor saves, and work out the
// controls in effect for the frontmost app (its profile over the base setup).

import { profileFor } from "./geometry.mjs";

export const SLIDER_KINDS = ["none", "volume", "brightness", "appearance"];
export const DIAL_KINDS = ["none", "volume", "brightness", "appearance", "keyboard", "output", "timer", "music"];
const HEX = /^#[0-9a-f]{6}$/i;
const app = (s) => String(s ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120);
const apps = (v, max) => (Array.isArray(v) ? v.map(app).filter(Boolean).slice(0, max) : []);
const pick = (v, list, d) => (list.includes(v) ? v : d);
const num = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : d);

function cleanSet(raw = {}, base = null) {
  const c = raw.corners ?? {};
  // In a profile, an absent value means "same as the base setup".
  const opt = (v, list) => (base && (v === undefined || v === "") ? undefined : pick(v, list, base ? undefined : "none"));
  const out = {
    left: base ? opt(raw.left, SLIDER_KINDS) : pick(raw.left, SLIDER_KINDS, "volume"),
    right: base ? opt(raw.right, SLIDER_KINDS) : pick(raw.right, SLIDER_KINDS, "none"),
    corners: {
      tl: base ? opt(c.tl, DIAL_KINDS) : pick(c.tl, DIAL_KINDS, "timer"),
      tr: base ? opt(c.tr, DIAL_KINDS) : pick(c.tr, DIAL_KINDS, "none"),
      bl: base ? opt(c.bl, DIAL_KINDS) : pick(c.bl, DIAL_KINDS, "appearance"),
      br: base ? opt(c.br, DIAL_KINDS) : pick(c.br, DIAL_KINDS, "music"),
    },
    dock: raw.dock === undefined && base ? undefined : apps(raw.dock, 8),
    launcher: raw.launcher === undefined && base ? undefined : apps(raw.launcher, 40),
  };
  return out;
}

export function cleanEdges(raw = {}) {
  const s = raw.style ?? {};
  const ids = new Set();
  return {
    enabled: raw.enabled === true,
    pressureMs: num(raw.pressureMs, 0, 1500, 0),
    allowFullscreen: raw.allowFullscreen === true,
    displays: raw.displays === "primary" ? "primary" : "all",
    sliderLength: num(raw.sliderLength, 0.25, 0.9, 0.5),
    dialSize: num(raw.dialSize, 120, 300, 180),
    timerMinutes: num(raw.timerMinutes, 1, 60, 25),
    style: {
      look: s.look === "minimal" ? "minimal" : "glass",
      tint: HEX.test(s.tint ?? "") ? s.tint : "#0f172a",
      accent: HEX.test(s.accent ?? "") ? s.accent : "#38bdf8",
      opacity: num(s.opacity, 0.2, 1, 0.72),
      frost: num(s.frost, 0, 40, 18),
      highlight: num(s.highlight, 0, 0.6, 0.18),
    },
    base: cleanSet(raw.base ?? {}),
    profiles: (Array.isArray(raw.profiles) ? raw.profiles.slice(0, 20) : []).map((p, i) => {
      let id = /^[A-Za-z0-9_-]{1,40}$/.test(p?.id ?? "") ? p.id : `ep${i + 1}`;
      while (ids.has(id)) id += "x";
      ids.add(id);
      return { id, name: String(p?.name ?? "").slice(0, 40) || `Profile ${i + 1}`, apps: String(p?.apps ?? "").slice(0, 300), ...cleanSet(p ?? {}, true) };
    }),
    floating: (Array.isArray(raw.floating) ? raw.floating.slice(0, 6) : [])
      .filter((f) => DIAL_KINDS.includes(f?.kind) && f.kind !== "none")
      .map((f) => ({ kind: f.kind, display: String(f.display ?? "").slice(0, 40), x: num(f.x, 0, 20000, 100), y: num(f.y, 0, 20000, 100) })),
  };
}

/** The controls in effect for the frontmost app. Pure. */
export function effectiveProfile(edges, frontmost) {
  const p = profileFor(frontmost, edges.profiles, null);
  const b = edges.base;
  const or = (v, d) => (v === undefined ? d : v);
  return {
    profile: p?.name ?? null,
    left: or(p?.left, b.left),
    right: or(p?.right, b.right),
    corners: { tl: or(p?.corners?.tl, b.corners.tl), tr: or(p?.corners?.tr, b.corners.tr), bl: or(p?.corners?.bl, b.corners.bl), br: or(p?.corners?.br, b.corners.br) },
    dock: or(p?.dock, b.dock),
    launcher: or(p?.launcher, b.launcher),
    pressureMs: edges.pressureMs,
    sliderLength: edges.sliderLength,
    dialSize: edges.dialSize,
    timerMinutes: edges.timerMinutes,
    style: edges.style,
  };
}

/** The Dock / taskbar from the difference between a display's bounds and work area. Pure. */
export function dockFromWorkArea(bounds, workArea) {
  const top = workArea.y - bounds.y;
  const left = workArea.x - bounds.x;
  const right = bounds.x + bounds.width - (workArea.x + workArea.width);
  const bottom = bounds.y + bounds.height - (workArea.y + workArea.height);
  // The macOS menu bar sits at the top (~25–38 pt); anything else is the Dock or taskbar.
  if (bottom > 0) return { side: "bottom", x: 0, y: bounds.height - bottom, width: bounds.width, height: bottom };
  if (left > 0) return { side: "left", x: 0, y: top, width: left, height: bounds.height - top };
  if (right > 0) return { side: "right", x: bounds.width - right, y: top, width: right, height: bounds.height - top };
  if (top > 48) return { side: "top", x: 0, y: 0, width: bounds.width, height: top }; // Windows taskbar at the top
  return null; // auto-hidden
}
