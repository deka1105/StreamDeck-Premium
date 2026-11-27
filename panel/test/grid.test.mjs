import { test } from "node:test";
import assert from "node:assert/strict";
import { clampBox, overlaps, pack, resolveLayout, COLS, ROWS } from "../src/grid.js";

test("clampBox keeps boxes inside the grid", () => {
  assert.deepEqual(clampBox({ x: 11, y: 5, w: 4, h: 3 }), { x: 8, y: 3, w: 4, h: 3 });
  assert.deepEqual(clampBox({ x: -3, y: -1, w: 0, h: 99 }), { x: 0, y: 0, w: 1, h: ROWS });
  assert.deepEqual(clampBox({ x: "2", y: "1", w: "3", h: "2" }), { x: 2, y: 1, w: 3, h: 2 });
  assert.deepEqual(clampBox(null), { x: 0, y: 0, w: 1, h: 1 });
});

test("clampBox honours min and max sizes", () => {
  const b = clampBox({ x: 0, y: 0, w: 1, h: 1 }, COLS, ROWS, { min: { w: 2, h: 2 }, max: { w: 4, h: 3 } });
  assert.deepEqual(b, { x: 0, y: 0, w: 2, h: 2 });
  const c = clampBox({ x: 0, y: 0, w: 12, h: 6 }, COLS, ROWS, { min: { w: 2, h: 2 }, max: { w: 4, h: 3 } });
  assert.deepEqual(c, { x: 0, y: 0, w: 4, h: 3 });
});

test("overlaps detects shared cells only", () => {
  assert.equal(overlaps({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 1, w: 2, h: 2 }), true);
  assert.equal(overlaps({ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 2, h: 2 }), false);
});

test("pack places first-fit in reading order", () => {
  const out = pack([{ w: 2, h: 1 }, { w: 2, h: 2 }, { w: 1, h: 1 }, { w: 4, h: 1 }], 4);
  assert.deepEqual(out, [
    { x: 0, y: 0, w: 2, h: 1 },
    { x: 2, y: 0, w: 2, h: 2 },
    { x: 0, y: 1, w: 1, h: 1 },
    { x: 0, y: 2, w: 4, h: 1 },
  ]);
});

test("resolveLayout landscape returns clamped boxes", () => {
  const { cols, rows, boxes } = resolveLayout([{ x: 10, y: 0, w: 4, h: 2 }]);
  assert.equal(cols, 12);
  assert.equal(rows, 6);
  assert.deepEqual(boxes[0], { x: 8, y: 0, w: 4, h: 2 });
});

test("resolveLayout portrait uses explicit boxes and packs the rest", () => {
  const widgets = [
    { x: 0, y: 0, w: 6, h: 2, portrait: { x: 0, y: 0, w: 6, h: 3 } },
    { x: 6, y: 0, w: 6, h: 2 },
    { x: 0, y: 2, w: 3, h: 2 },
  ];
  const { cols, rows, boxes } = resolveLayout(widgets, "portrait");
  assert.equal(cols, 6);
  assert.equal(rows, 12);
  assert.deepEqual(boxes[0], { x: 0, y: 0, w: 6, h: 3 });
  assert.deepEqual(boxes[1], { x: 0, y: 3, w: 6, h: 2 });
  assert.deepEqual(boxes[2], { x: 0, y: 5, w: 3, h: 2 });
});

test("resolveLayout portrait rounds widths to full / half / third", () => {
  const { boxes } = resolveLayout(
    [
      { x: 0, y: 0, w: 4, h: 2 },
      { x: 4, y: 0, w: 8, h: 2 },
      { x: 0, y: 2, w: 1, h: 1 },
    ],
    "portrait",
  );
  assert.deepEqual(boxes.map((b) => b.w), [3, 6, 2]);
});

test("resolveLayout portrait overflows below the grid instead of overlapping", () => {
  const widgets = Array.from({ length: 4 }, (_, i) => ({ x: i * 3, y: 0, w: 6, h: 6 }));
  const { rows, boxes } = resolveLayout(widgets, "portrait");
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.equal(overlaps(boxes[i], boxes[j]), false);
  assert.equal(rows, 24);
});
