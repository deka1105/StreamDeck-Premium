import { test } from "node:test";
import assert from "node:assert/strict";
import { ready, pick } from "../src/switcher.js";

const S = { waitAfterTouchSec: 8, minGapSec: 20 };

test("a switch waits while the panel is in use and keeps a gap between rule switches", () => {
  const p = { source: "rule", priority: 5 };
  assert.equal(ready(p, { now: 100_000, lastTouch: 95_000, lastSwitch: 0, settings: S }), false); // touched 5 s ago
  assert.equal(ready(p, { now: 100_000, lastTouch: 80_000, lastSwitch: 90_000, settings: S }), false); // switched 10 s ago
  assert.equal(ready(p, { now: 100_000, lastTouch: 80_000, lastSwitch: 70_000, settings: S }), true);
  assert.equal(ready({ ...p, source: "goto" }, { now: 100_000, lastTouch: 80_000, lastSwitch: 99_000, settings: S }), true); // webhooks skip the gap
  assert.equal(ready(null, { now: 1, lastTouch: 0, lastSwitch: 0, settings: S }), false);
});

test("the higher priority wins; a newer request wins a tie", () => {
  const a = { id: "a", priority: 5 };
  const b = { id: "b", priority: 7 };
  const c = { id: "c", priority: 5 };
  assert.equal(pick(a, b).id, "b");
  assert.equal(pick(b, a).id, "b");
  assert.equal(pick(a, c).id, "c");
  assert.equal(pick(null, a).id, "a");
});
