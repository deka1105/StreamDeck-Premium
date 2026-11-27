import { test } from "node:test";
import assert from "node:assert/strict";
import { visiblePages, homeIndex, indexAfterReload, step, idleReturnSec } from "../src/nav.js";

const layout = {
  home: "b",
  settings: { idleSec: 300 },
  pages: [
    { id: "a", widgets: [] },
    { id: "hidden", hidden: true, widgets: [] },
    { id: "b", widgets: [] },
    { id: "c", staySec: 0, widgets: [] },
    { id: "d", staySec: 10, widgets: [] },
  ],
};

test("hidden pages are skipped and home is found among visible pages", () => {
  assert.deepEqual(visiblePages(layout).map((p) => p.id), ["a", "b", "c", "d"]);
  assert.equal(homeIndex(layout), 1);
  assert.equal(homeIndex({ ...layout, home: "hidden" }), 0);
});

test("reload keeps the current page when it still exists", () => {
  assert.equal(indexAfterReload(layout, "d"), 3);
  assert.equal(indexAfterReload(layout, "gone"), 1);
});

test("step clamps at the ends", () => {
  assert.equal(step(0, -1, 4), 0);
  assert.equal(step(3, 1, 4), 3);
  assert.equal(step(1, 1, 4), 2);
  assert.equal(step(5, 0, 0), 0);
});

test("idle return: default, per-page override, never, and not from home", () => {
  const [a, b, c, d] = visiblePages(layout);
  assert.equal(idleReturnSec(layout, a), 300);
  assert.equal(idleReturnSec(layout, b), null); // home
  assert.equal(idleReturnSec(layout, c), null); // stays for good
  assert.equal(idleReturnSec(layout, d), 10);
  assert.equal(idleReturnSec({ ...layout, settings: { idleSec: 0 } }, a), null);
});
