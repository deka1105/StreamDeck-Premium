import { test } from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES } from "../src/templates.js";
import { REGISTRY } from "../src/widgets/index.js";
import { clampBox, overlaps } from "../src/grid.js";
import { DEMO_LAYOUT } from "../src/demoLayout.js";

test("every template widget exists in the catalogue", () => {
  for (const t of TEMPLATES) for (const w of t.page.widgets) assert.ok(REGISTRY[w.type], `${t.id}: unknown widget ${w.type}`);
});

test("template widgets fit the grid and don't overlap", () => {
  for (const t of TEMPLATES) {
    const boxes = t.page.widgets.map((w) => {
      const c = clampBox(w);
      assert.deepEqual(c, { x: w.x, y: w.y, w: w.w, h: w.h }, `${t.id}: ${w.type} is out of bounds`);
      return c;
    });
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.equal(overlaps(boxes[i], boxes[j]), false, `${t.id}: widgets ${i} and ${j} overlap`);
  }
});

test("template ids are unique", () => {
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, TEMPLATES.length);
});

test("template options only use keys the widget defines", () => {
  for (const t of TEMPLATES)
    for (const w of t.page.widgets) {
      const keys = new Set((REGISTRY[w.type].meta.options ?? []).map((o) => o.key));
      for (const k of Object.keys(w.options ?? {})) assert.ok(keys.has(k), `${t.id}: ${w.type} has no option "${k}"`);
    }
});

test("the demo layout only uses known widgets", () => {
  for (const p of DEMO_LAYOUT.pages) for (const w of p.widgets) assert.ok(REGISTRY[w.type], `demo: unknown widget ${w.type}`);
});
