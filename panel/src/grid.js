// Grid geometry for panel pages. Pure functions only (unit-tested in test/).
//
// A page is designed on a landscape grid of COLS × ROWS cells. Every widget
// has a landscape box {x, y, w, h}. In portrait the grid turns into
// ROWS columns × COLS rows; a widget may carry its own `portrait` box, and
// widgets without one are packed first-fit in reading order.

export const COLS = 12;
export const ROWS = 6;

const int = (v, d) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);

/** Clamp a box so it lies fully inside a cols × rows grid, honouring min/max sizes. */
export function clampBox(box, cols = COLS, rows = ROWS, { min = { w: 1, h: 1 }, max = { w: cols, h: rows } } = {}) {
  const minW = Math.max(1, Math.min(int(min.w, 1), cols));
  const minH = Math.max(1, Math.min(int(min.h, 1), rows));
  const maxW = Math.max(minW, Math.min(int(max.w, cols), cols));
  const maxH = Math.max(minH, Math.min(int(max.h, rows), rows));
  const w = Math.max(minW, Math.min(maxW, int(box?.w, minW)));
  const h = Math.max(minH, Math.min(maxH, int(box?.h, minH)));
  const x = Math.max(0, Math.min(cols - w, int(box?.x, 0)));
  const y = Math.max(0, Math.min(rows - h, int(box?.y, 0)));
  return { x, y, w, h };
}

/** True when two boxes share at least one cell. */
export function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Pack boxes first-fit, scanning rows top to bottom and columns left to right,
 * into a grid `cols` wide. Rows grow as needed. Returns boxes in input order.
 */
export function pack(sizes, cols) {
  const taken = [];
  const free = (x, y, w, h) => {
    if (x + w > cols) return false;
    for (const t of taken) if (overlaps(t, { x, y, w, h })) return false;
    return true;
  };
  return sizes.map(({ w: w0, h: h0 }) => {
    const w = Math.max(1, Math.min(cols, int(w0, 1)));
    const h = Math.max(1, int(h0, 1));
    for (let y = 0; ; y++) {
      for (let x = 0; x + w <= cols; x++) {
        if (free(x, y, w, h)) {
          const box = { x, y, w, h };
          taken.push(box);
          return box;
        }
      }
    }
  });
}

/**
 * Resolve where each widget sits for an orientation.
 * Landscape: the widget's own box, clamped to COLS × ROWS.
 * Portrait: the widget's `portrait` box if it has one (clamped to ROWS × COLS),
 * otherwise first-fit packing in landscape reading order.
 * Returns { cols, rows, boxes } with boxes aligned to `widgets`.
 */
export function resolveLayout(widgets, orientation = "landscape") {
  if (orientation !== "portrait") {
    return { cols: COLS, rows: ROWS, boxes: widgets.map((w) => clampBox(w, COLS, ROWS)) };
  }
  const pCols = ROWS;
  const pRows = COLS;
  const order = widgets
    .map((w, i) => ({ w, i }))
    .sort((a, b) => a.w.y - b.w.y || a.w.x - b.w.x || a.i - b.i);
  const boxes = new Array(widgets.length);
  const fixed = [];
  for (const { w, i } of order) {
    if (w.portrait) {
      boxes[i] = clampBox(w.portrait, pCols, pRows);
      fixed.push(boxes[i]);
    }
  }
  const loose = order.filter(({ w }) => !w.portrait);
  // Pack loose widgets around the fixed ones.
  const taken = [...fixed];
  for (const { w, i } of loose) {
    const bw = Math.max(1, Math.min(pCols, int(w.w, 1)));
    const bh = Math.max(1, Math.min(pRows, int(w.h, 1)));
    let placed = null;
    for (let y = 0; !placed && y + bh <= pRows; y++) {
      for (let x = 0; x + bw <= pCols; x++) {
        const cand = { x, y, w: bw, h: bh };
        if (!taken.some((t) => overlaps(t, cand))) {
          placed = cand;
          break;
        }
      }
    }
    // No room left: stack it below the grid (the page scrolls in portrait).
    if (!placed) {
      const bottom = taken.reduce((m, t) => Math.max(m, t.y + t.h), 0);
      placed = { x: 0, y: bottom, w: bw, h: bh };
    }
    taken.push(placed);
    boxes[i] = placed;
  }
  const rows = Math.max(pRows, ...boxes.map((b) => b.y + b.h));
  return { cols: pCols, rows, boxes };
}
