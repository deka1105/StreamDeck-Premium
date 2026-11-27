// Appearance: presets + inheritance (panel defaults → layout.look → page.look
// → widget.look), applied as CSS custom properties. Pure helpers are exported
// for tests; DOM helpers take the element to style.

export const PRESETS = {
  midnight: { name: "Midnight", theme: "dark", accent: "#38bdf8", bg: "#070b14", tile: "#0e1626", font: "system", radius: 16, border: true, shadow: false },
  paper: { name: "Paper", theme: "light", accent: "#2563eb", bg: "#eef1f6", tile: "#ffffff", ink: "#0f172a", font: "system", radius: 14, border: true, shadow: true },
  oled: { name: "OLED black", theme: "oled", accent: "#22d3ee", bg: "#000000", tile: "#000000", font: "system", radius: 12, border: true, shadow: false },
  neon: { name: "Neon", theme: "dark", accent: "#f472b6", bg: "#0a0014", tile: "#160a2a", font: "rounded", radius: 22, border: true, shadow: true },
  ember: { name: "Ember", theme: "dark", accent: "#fb923c", bg: "#140b07", tile: "#22140d", font: "serif", radius: 10, border: false, shadow: true },
  glass: { name: "Glass", theme: "dark", accent: "#a5b4fc", bg: "#0b1020", tile: "#ffffff", opacity: 0.08, font: "system", radius: 20, border: true, shadow: false },
  terminal: { name: "Terminal", theme: "oled", accent: "#4ade80", bg: "#000000", tile: "#050805", ink: "#bbf7d0", font: "mono", radius: 4, border: true, shadow: false },
};

const FONTS = {
  system: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, system-ui, sans-serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", system-ui, sans-serif',
  serif: 'ui-serif, "New York", Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  condensed: '"SF Compact", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif',
};

const defined = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ""));

/** Merge looks, later wins; a preset is expanded where it appears. Pure. */
export function resolveLook(...layers) {
  let out = { ...PRESETS.midnight };
  for (const l of layers) {
    if (!l) continue;
    if (l.preset && PRESETS[l.preset]) out = { ...out, ...PRESETS[l.preset] };
    out = { ...out, ...defined(l) };
    if (l.wallpaper === null) delete out.wallpaper;
  }
  return out;
}

const mix = (hex, alpha) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/** CSS variables for a resolved look. Pure. */
export function lookVars(look, { widget = false } = {}) {
  const v = {};
  if (look.accent) {
    v["--accent"] = look.accent;
    v["--accent-soft"] = look.accent;
    v["--accent-faint"] = mix(look.accent, 0.16);
  }
  if (look.tile) v["--surface"] = look.opacity !== undefined ? mix(look.tile, look.opacity) : look.tile;
  if (look.ink) {
    v["--ink"] = look.ink;
    v["--ink-mid"] = mix(look.ink, 0.85);
    v["--ink-dim"] = mix(look.ink, 0.62);
    v["--ink-faint"] = mix(look.ink, 0.45);
  }
  if (look.radius !== undefined) v["--radius"] = `${look.radius}px`;
  if (look.border !== undefined) v["--tile-border"] = look.border ? "1px solid var(--line)" : "1px solid transparent";
  if (look.shadow !== undefined) v["--tile-shadow"] = look.shadow ? "0 6px 18px rgba(0, 0, 0, 0.35)" : "none";
  if (!widget) {
    if (look.bg) v["--bg"] = look.bg;
    if (look.font && FONTS[look.font]) v["--font"] = FONTS[look.font];
    if (look.gap !== undefined) v["--gap"] = `${look.gap}px`;
    if (look.padding !== undefined) v["--page-pad"] = `${look.padding}px`;
    if (look.scale !== undefined) v["--scale"] = String(look.scale);
  }
  return v;
}

function setVars(el, vars, prev) {
  for (const k of prev ?? []) if (!(k in vars)) el.style.removeProperty(k);
  for (const [k, val] of Object.entries(vars)) el.style.setProperty(k, val);
  return Object.keys(vars);
}

/** Apply the panel-wide + page look to <body> and the wallpaper layer. */
export function createLook(body = document.body) {
  let keys = [];
  const wall = document.createElement("div");
  wall.id = "wall";
  wall.innerHTML = `<div class="wall-img"></div><div class="wall-dim"></div>`;
  body.prepend(wall);
  return {
    apply(layoutLook, pageLook) {
      const look = resolveLook(layoutLook, pageLook);
      keys = setVars(body, lookVars(look), keys);
      body.dataset.theme = look.theme ?? "dark";
      body.dataset.font = look.font ?? "system";
      const w = look.wallpaper;
      wall.hidden = !w?.src;
      if (w?.src) {
        const img = wall.firstChild;
        const url = `url("${String(w.src).replace(/["\\\n]/g, "")}")`;
        if (img.style.backgroundImage !== url) img.style.backgroundImage = url;
        img.style.filter = w.blur ? `blur(${w.blur}px)` : "";
        img.style.inset = w.blur ? `-${w.blur * 2}px` : "0";
        wall.lastChild.style.opacity = String(w.dim ?? 0.35);
      }
      body.dataset.wall = w?.src ? "1" : "";
      return look;
    },
  };
}

/** Per-widget look on its cell (accent, tile colour, radius, border, shadow). */
export function applyWidgetLook(cell, look) {
  if (!look) return;
  setVars(cell, lookVars(defined(look), { widget: true }));
  cell.dataset.look = "1";
}
