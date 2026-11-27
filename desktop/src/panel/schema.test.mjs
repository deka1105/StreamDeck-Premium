import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clampBox, sanitizeConfig, sanitizeWidget, cleanOption } from "./schema.mjs";
import { createPanelStore } from "./store.mjs";

const CATALOG = {
  widgets: [
    {
      type: "clock",
      min: { w: 2, h: 1 },
      options: [
        { key: "seconds", type: "bool", default: false },
        { key: "label", type: "text", default: "" },
      ],
    },
    {
      type: "metric",
      options: [
        { key: "source", type: "choice", default: "cpu", choices: [{ value: "cpu" }, { value: "mem" }] },
        { key: "warn", type: "number", min: 0, max: 100, default: 70 },
      ],
    },
  ],
};
const byType = new Map(CATALOG.widgets.map((w) => [w.type, w]));

test("clampBox keeps x + w ≤ 12 and y + h ≤ 6", () => {
  assert.deepEqual(clampBox({ x: 10, y: 5, w: 5, h: 4 }), { x: 7, y: 2, w: 5, h: 4 });
  assert.deepEqual(clampBox({ x: 99, y: 99, w: 99, h: 99 }), { x: 0, y: 0, w: 12, h: 6 });
});

test("unknown widget types are dropped; min sizes are enforced", () => {
  const used = new Set();
  assert.equal(sanitizeWidget({ type: "rm-rf", x: 0, y: 0, w: 1, h: 1 }, byType, used), null);
  const c = sanitizeWidget({ id: "c", type: "clock", x: 0, y: 0, w: 1, h: 1 }, byType, used);
  assert.deepEqual([c.w, c.h], [2, 1]);
});

test("options are coerced to the catalogue and unknown keys are removed", () => {
  const w = sanitizeWidget(
    { type: "metric", x: 0, y: 0, w: 2, h: 2, options: { source: "gpu-hack", warn: 500, evil: "<script>", __proto__: { x: 1 } } },
    byType,
    new Set(),
  );
  assert.deepEqual(w.options, { warn: 100 });
  const c = sanitizeWidget({ type: "clock", x: 0, y: 0, w: 2, h: 1, options: { seconds: "yes", label: "Hi\u0000there" } }, byType, new Set());
  assert.deepEqual(c.options, { label: "Hithere" });
  assert.equal(cleanOption({ type: "json", maxBytes: 10 }, { a: "much too long" }), undefined);
});

test("ids are made unique and pages get safe defaults", () => {
  const cfg = sanitizeConfig(
    {
      default: {
        home: "nope",
        pages: [
          { id: "a", name: "", widgets: [{ id: "x", type: "clock" }, { id: "x", type: "clock" }] },
          { id: "a", hidden: true, staySec: -5, widgets: [] },
          "garbage",
        ],
      },
    },
    CATALOG,
  );
  const [p1, p2] = cfg.default.pages;
  assert.equal(cfg.default.pages.length, 2);
  assert.notEqual(p1.widgets[0].id, p1.widgets[1].id);
  assert.notEqual(p1.id, p2.id);
  assert.equal(p1.name, "Page 1");
  assert.equal(p2.staySec, 0);
  assert.equal(cfg.default.home, "a"); // invalid home → first visible page
});

test("device layouts with bad ids are dropped", () => {
  const cfg = sanitizeConfig({ devices: { "../../etc": { pages: [] }, abc123: { name: "Phone", pages: [{ id: "p", widgets: [] }] } } }, CATALOG);
  assert.deepEqual(Object.keys(cfg.devices), ["abc123"]);
  assert.equal(cfg.devices.abc123.name, "Phone");
});

test("store round-trips through panel.json (0600) and bumps the revision", () => {
  const dir = mkdtempSync(join(tmpdir(), "panelstore-"));
  let changed = 0;
  const s = createPanelStore({ dir, catalog: CATALOG, onChange: () => changed++ });
  assert.equal(s.layoutFor("anyone").pages.length, 2); // starter: home + deck (deck widget unknown here → empty page)
  const rev0 = s.rev;
  s.save({ default: { pages: [{ id: "only", name: "Only", widgets: [{ type: "clock", x: 0, y: 0, w: 4, h: 2 }] }] }, devices: { phone1: { pages: [{ id: "mine", widgets: [] }] } } });
  assert.equal(s.rev, rev0 + 1);
  assert.equal(changed, 1);
  const file = join(dir, "panel.json");
  if (process.platform !== "win32") assert.equal(statSync(file).mode & 0o777, 0o600);
  const reloaded = createPanelStore({ dir, catalog: CATALOG });
  assert.equal(reloaded.rev, s.rev);
  assert.equal(reloaded.layoutFor("someone").pages[0].id, "only");
  assert.equal(reloaded.layoutFor("phone1").pages[0].id, "mine");
  assert.equal(reloaded.layoutFor("phone1").own, true);
  assert.ok(JSON.parse(readFileSync(file, "utf8")).default);
});
