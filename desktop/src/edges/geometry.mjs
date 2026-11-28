// Desk edges (Stage 16): pure geometry and value maths, shared by the Electron
// main process and the overlay page (and unit-tested on fake display layouts).
// Coordinates are display-local (0,0 = the display's top-left), in points.

export const EDGE = 3; // px of the screen edge that counts as "at the edge"
export const CORNER = 10; // px square in each corner

export const inRect = (p, r) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height;

/** Which hot zone is the pointer in? "left" | "right" | "tl" | "tr" | "bl" | "br" | "dock" | null. Pure. */
export function zoneAt({ x, y }, display, { dock = null, edgeSpan = [0.15, 0.85], dockTray = null } = {}) {
  const { width: w, height: h } = display;
  if (x < 0 || y < 0 || x >= w || y >= h) return null;
  const top = y < CORNER;
  const bottom = y >= h - CORNER;
  if (x < CORNER && top) return "tl";
  if (x >= w - CORNER && top) return "tr";
  if (x < CORNER && bottom) return "bl";
  if (x >= w - CORNER && bottom) return "br";
  // The hidden dock reveals from the screen edge along the tray's span.
  if (dockTray) {
    const side = dockTray.side ?? "bottom";
    const alongX = x >= dockTray.x && x < dockTray.x + dockTray.width;
    const alongY = y >= dockTray.y && y < dockTray.y + dockTray.height;
    if ((side === "bottom" && alongX && y >= h - EDGE) || (side === "top" && alongX && y < EDGE) || (side === "left" && alongY && x < EDGE) || (side === "right" && alongY && x >= w - EDGE)) return "dock";
  }
  // The system Dock / taskbar owns its own edge; never steal it.
  if (dock && inRect({ x, y }, dock)) return null;
  const inSpan = y >= h * (edgeSpan?.[0] ?? 0.15) && y <= h * (edgeSpan?.[1] ?? 0.85);
  if (x < EDGE && inSpan) return "left";
  if (x >= w - EDGE && inSpan) return "right";
  return null;
}

/**
 * Pressure mode: the pointer must keep pushing into a zone for `ms` before it
 * reveals. Returns a function (zone, now) → zone to reveal or null.
 */
export function createPressure(ms = 0) {
  let current = null;
  let since = 0;
  return (zone, now = Date.now()) => {
    if (zone !== current) {
      current = zone;
      since = now;
    }
    if (!zone) return null;
    return now - since >= ms ? zone : null;
  };
}

/**
 * The hidden-dock tray: a strip for up to 8 apps beside the system Dock (or
 * above a full-width taskbar), on the same edge. Pure.
 */
export function trayBesideDock(display, dock, { apps = 8, icon = 52, gap = 8 } = {}) {
  apps = Math.max(1, Math.min(8, apps));
  const len = apps * icon + (apps + 1) * gap + 36;
  const thick = icon + gap * 2;
  const { width: w, height: h } = display;
  if (dock && (dock.side === "bottom" || !dock.side) && dock.width >= w * 0.9) return { x: 8, y: Math.max(8, dock.y - thick - 8), width: len, height: thick, side: "bottom" };
  if (!dock || dock.side === "bottom" || !dock.side) {
    const y = h - thick - (dock ? Math.max(4, h - (dock.y + dock.height)) : 4);
    if (!dock) return { x: Math.round((w - len) / 2), y, width: len, height: thick, side: "bottom" };
    // Left of the Dock if it fits there, else right of it, else above it.
    if (dock.x - len - 12 >= 8) return { x: dock.x - len - 12, y, width: len, height: thick, side: "bottom" };
    if (dock.x + dock.width + 12 + len <= w - 8) return { x: dock.x + dock.width + 12, y, width: len, height: thick, side: "bottom" };
    return { x: Math.max(8, Math.round((w - len) / 2)), y: Math.max(8, dock.y - thick - 8), width: len, height: thick, side: "bottom" };
  }
  if (dock.side === "left") return { x: dock.x + dock.width + 4, y: Math.max(8, dock.y - len - 12), width: thick, height: len, side: "left" };
  if (dock.side === "right") return { x: dock.x - thick - 4, y: Math.max(8, dock.y - len - 12), width: thick, height: len, side: "right" };
  return { x: 8, y: dock.y + dock.height + 8, width: len, height: thick, side: "top" };
}

/** Where a revealed control sits on its display. Pure. */
export function controlRect(zone, display, { sliderLength = 0.5, dial = 180, dock = null, dockTray = null } = {}) {
  const { width: w, height: h } = display;
  const len = Math.round(h * sliderLength);
  switch (zone) {
    case "left":
      return { x: 0, y: Math.round((h - len) / 2), width: 64, height: len };
    case "right":
      return { x: w - 64, y: Math.round((h - len) / 2), width: 64, height: len };
    case "tl":
      return { x: 0, y: 0, width: dial, height: dial };
    case "tr":
      return { x: w - dial, y: 0, width: dial, height: dial };
    case "bl":
      return { x: 0, y: h - dial, width: dial, height: dial };
    case "br":
      return { x: w - dial, y: h - dial, width: dial, height: dial };
    case "dock":
      return dockTray ?? trayBesideDock(display, dock);
    default:
      return null;
  }
}

/** A vertical slider: pointer y within its rect → 0..1 (top = 1). Pure. */
export const sliderValue = (y, rect) => Math.max(0, Math.min(1, 1 - (y - rect.y) / rect.height));

const origin = (corner, display) => ({ x: corner === "tl" || corner === "bl" ? 0 : display.width, y: corner === "tl" || corner === "tr" ? 0 : display.height });

/**
 * A quarter-circle dial in a corner: the pointer's angle around the corner
 * maps to 0..1, sweeping from the horizontal screen edge to the vertical one. Pure.
 */
export function dialValue({ x, y }, corner, display) {
  const o = origin(corner, display);
  const a = Math.atan2(Math.abs(y - o.y), Math.abs(x - o.x));
  return Math.max(0, Math.min(1, a / (Math.PI / 2)));
}

/** Distance from the corner: far enough out and the dial pops out to float. Pure. */
export function dialDistance({ x, y }, corner, display) {
  const o = origin(corner, display);
  return Math.hypot(x - o.x, y - o.y);
}

/** A full-circle floating dial: 300° sweep from 7 o'clock round to 5 o'clock → 0..1. Pure. */
export function floatingDialValue({ x, y }, center) {
  let deg = (Math.atan2(x - center.x, center.y - y) * 180) / Math.PI; // 0 at 12 o'clock, clockwise
  if (deg < 0) deg += 360;
  const t = (deg - 210 + 360) % 360;
  return t > 300 ? (t > 330 ? 0 : 1) : t / 300;
}

/** Pick the profile for the frontmost app: first whose apps pattern matches, else the fallback. Pure. */
export function profileFor(frontmost, profiles = [], fallback = null) {
  const app = String(frontmost ?? "").toLowerCase();
  for (const p of profiles) {
    const pats = String(p.apps ?? "").split("|").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (app && pats.some((q) => app === q || app.replace(/\.exe$/, "") === q || app.includes(q))) return p;
  }
  return fallback;
}

/** Find which display a global point is on, and the local point. Pure. */
export function locate(point, displays) {
  for (const d of displays) {
    const b = d.bounds;
    if (point.x >= b.x && point.y >= b.y && point.x < b.x + b.width && point.y < b.y + b.height) return { display: d, local: { x: point.x - b.x, y: point.y - b.y } };
  }
  return null;
}

/** Keep a floating dial on screen when displays change. Pure. */
export function clampToDisplay(pos, display, size = 160) {
  return { x: Math.max(0, Math.min(display.width - size, pos.x)), y: Math.max(0, Math.min(display.height - size, pos.y)) };
}
