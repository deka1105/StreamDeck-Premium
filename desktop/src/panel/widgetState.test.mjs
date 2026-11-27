import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWidgetState, MAX_BYTES } from "./widgetState.mjs";

test("state survives a restart and is published to other panels", () => {
  const dir = mkdtempSync(join(tmpdir(), "wstate-"));
  const events = [];
  const a = createWidgetState({ dir, publish: (type, data) => events.push({ type, data }) });
  a.set("home:note1", { text: "buy milk" }, "phone");
  a.flush();
  assert.deepEqual(events[0], { type: "state", data: { key: "home:note1", value: { text: "buy milk" }, from: "phone" } });
  const b = createWidgetState({ dir });
  assert.deepEqual(b.get("home:note1"), { text: "buy milk" });
  assert.equal(b.get("home:other"), null);
  if (process.platform !== "win32") assert.equal(statSync(join(dir, "widget-state.json")).mode & 0o777, 0o600);
});

test("keys are validated and sizes are capped", () => {
  const s = createWidgetState({});
  assert.throws(() => s.set("../etc", 1), /bad key/);
  assert.throws(() => s.get("no-colon"), /bad key/);
  assert.throws(() => s.set("p:w", "x".repeat(MAX_BYTES)), /too large/);
  for (let i = 0; i < 500; i++) s.set(`p:w${i}`, i);
  assert.throws(() => s.set("p:onemore", 1), /too many/);
  assert.deepEqual(s.set("p:w1", 2), { ok: true }); // updating an existing key is fine
});
