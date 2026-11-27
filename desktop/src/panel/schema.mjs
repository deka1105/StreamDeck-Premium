// Panel layout schema (ours; PLAN D2). Everything that comes from the editor,
// an imported file or the phone passes through sanitizeConfig before it is
// stored or served. Unknown widget types are dropped, boxes are clamped to the
// 12 × 6 grid, and only option keys the catalogue defines survive.
//
// config = {
//   version: 1,
//   default: Layout,                       used by any client without its own
//   devices: { [clientId]: Layout & {name?} },
//   settings: { idleMin }                   panel-wide defaults
// }
// Layout = { pages: Page[], home: pageId | null }
// Page   = { id, name, hidden, stayMin, widgets: Widget[] }   stayMin: null = default, 0 = never return home
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
  const stay = raw.stayMin === null || raw.stayMin === undefined ? null : Math.max(0, Math.min(24 * 60, int(raw.stayMin, 0)));
  return {
    id,
    name: cleanText(raw.name, 40) || `Page ${index + 1}`,
    hidden: raw.hidden === true,
    stayMin: stay,
    widgets,
  };
}

export function sanitizeLayout(raw, catalogByType) {
  const usedPageIds = new Set();
  const pages = (Array.isArray(raw?.pages) ? raw.pages : [])
    .slice(0, MAX_PAGES)
    .map((p, i) => sanitizePage(p, catalogByType, usedPageIds, i))
    .filter(Boolean);
  const home = pages.some((p) => p.id === raw?.home && !p.hidden) ? raw.home : pages.find((p) => !p.hidden)?.id ?? null;
  return { pages, home };
}

export function sanitizeConfig(raw, catalog) {
  const byType = new Map((catalog?.widgets ?? []).map((w) => [w.type, w]));
  const devices = {};
  for (const [id, layout] of Object.entries(raw?.devices ?? {}).slice(0, 64)) {
    if (!/^[A-Za-z0-9:_-]{1,80}$/.test(id) || !layout || typeof layout !== "object") continue;
    devices[id] = { ...sanitizeLayout(layout, byType), name: cleanText(layout.name, 64) };
  }
  const idle = int(raw?.settings?.idleMin, 5);
  return {
    version: 1,
    default: sanitizeLayout(raw?.default ?? {}, byType),
    devices,
    settings: { idleMin: Math.max(0, Math.min(240, idle)) },
  };
}
