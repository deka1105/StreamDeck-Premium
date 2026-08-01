// Grid packing for the deck. Tiles can span multiple columns/rows (w×h); this
// places them first-fit into a `cols`-wide grid, scanning row by row for the
// first spot each tile fits. Returns absolute cell coordinates + the total row
// count so the renderer can position tiles and size the container.

import { clampSpan, type DeckButton } from "./buttons";

export type Placement = { tile: DeckButton; x: number; y: number; w: number; h: number };

export function packDeck(tiles: DeckButton[], cols: number): { placements: Placement[]; rows: number } {
  const occupied: boolean[][] = []; // occupied[row][col]

  const rowOf = (r: number) => (occupied[r] ??= new Array(cols).fill(false));

  const fits = (x: number, y: number, w: number, h: number): boolean => {
    if (x + w > cols) return false;
    for (let r = y; r < y + h; r++) {
      const row = occupied[r];
      if (!row) continue; // empty row → free
      for (let c = x; c < x + w; c++) if (row[c]) return false;
    }
    return true;
  };

  const fill = (x: number, y: number, w: number, h: number) => {
    for (let r = y; r < y + h; r++) {
      const row = rowOf(r);
      for (let c = x; c < x + w; c++) row[c] = true;
    }
  };

  const placements: Placement[] = [];
  for (const tile of tiles) {
    const w = Math.min(clampSpan(tile.w), cols); // never wider than the grid
    const h = clampSpan(tile.h);
    let placed = false;
    for (let y = 0; !placed; y++) {
      for (let x = 0; x + w <= cols; x++) {
        if (fits(x, y, w, h)) {
          fill(x, y, w, h);
          placements.push({ tile, x, y, w, h });
          placed = true;
          break;
        }
      }
    }
  }

  return { placements, rows: occupied.length };
}
