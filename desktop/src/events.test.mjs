import { test } from "node:test";
import assert from "node:assert/strict";
import { createEventBus } from "./events.mjs";
import { createPanelApi } from "./panelApi.mjs";
import { createSampler } from "./sampler.mjs";

test("a first wait is fresh and returns immediately", async () => {
  const bus = createEventBus();
  bus.publish("data", { kind: "system" });
  const r = await bus.wait({ after: 0, boot: null, client: "a" });
  assert.equal(r.fresh, true);
  assert.equal(r.boot, bus.boot);
  assert.equal(r.seq, 1);
  assert.deepEqual(r.events, []);
});

test("wait returns buffered events, then long-polls for new ones", async () => {
  const bus = createEventBus();
  const first = await bus.wait({}); // fresh, seq 0
  assert.equal(first.seq, 0);
  const boot = first.boot;
  bus.publish("data", { n: 1 });
  const r1 = await bus.wait({ after: 0, boot, client: "a" }); // a seen-nothing client still gets seq 1
  assert.equal(r1.fresh, undefined);
  assert.deepEqual(r1.events.map((e) => e.data.n), [1]);
  // From seq 1, long-poll for seq 2.
  const pending = bus.wait({ after: 1, boot, client: "a", timeoutMs: 5000 });
  assert.equal(bus.waiting(), 1);
  bus.publish("data", { n: 2 });
  const r3 = await pending;
  assert.deepEqual(r3.events.map((e) => e.data.n), [2]);
  assert.equal(r3.seq, 2);
  assert.equal(bus.waiting(), 0);
});

test("a wait times out with no events", async () => {
  const bus = createEventBus();
  bus.publish("x", {});
  const t0 = Date.now();
  const r = await bus.wait({ after: 1, boot: bus.boot, client: "a", timeoutMs: 50 });
  assert.deepEqual(r.events, []);
  assert.ok(Date.now() - t0 >= 45);
});

test("targeted events reach only their client", async () => {
  const bus = createEventBus();
  bus.publish("x", {});
  bus.publish("toast", { hi: "b" }, { to: "b" });
  bus.publish("data", { all: true });
  const a = await bus.wait({ after: 1, boot: bus.boot, client: "a", timeoutMs: 0 });
  const b = await bus.wait({ after: 1, boot: bus.boot, client: "b", timeoutMs: 0 });
  assert.deepEqual(a.events.map((e) => e.type), ["data"]);
  assert.deepEqual(b.events.map((e) => e.type), ["toast", "data"]);
  assert.equal(b.events[0].to, undefined); // routing field is not leaked
});

test("a stale boot id or a client that fell behind gets fresh: true", async () => {
  const bus = createEventBus({ max: 5 });
  for (let i = 0; i < 20; i++) bus.publish("x", { i });
  assert.equal((await bus.wait({ after: 3, boot: bus.boot, client: "a" })).fresh, true); // fell behind
  assert.equal((await bus.wait({ after: 19, boot: "old-boot", client: "a" })).fresh, true); // host restarted
  assert.equal((await bus.wait({ after: 99, boot: bus.boot, client: "a" })).fresh, true); // from the future
  const ok = await bus.wait({ after: 18, boot: bus.boot, client: "a" });
  assert.equal(ok.fresh, undefined);
  assert.deepEqual(ok.events.map((e) => e.data.i), [18, 19]);
});

test("panel API: needs, snapshot and events.wait end to end", async () => {
  const bus = createEventBus();
  const sampler = createSampler({ providers: { system: { periodMs: 1000, sample: async () => ({ cpu: 42 }) } }, publish: bus.publish });
  const api = createPanelApi({ bus, sampler, hostName: "test" });
  const ctx = { client: "phone-1" };
  assert.equal((await api.call("panel.hello", {}, ctx)).host, "test");
  await api.call("panel.needs", { kinds: ["system"] }, ctx);
  const first = await api.call("events.wait", { after: 0 }, ctx);
  assert.equal(first.fresh, true);
  sampler.tick();
  await sampler.settle();
  const next = await api.call("events.wait", { after: first.seq, boot: first.boot, timeoutMs: 1000 }, ctx);
  assert.deepEqual(next.events[0].data, { kind: "system", value: { cpu: 42 } });
  assert.deepEqual((await api.call("panel.snapshot", { kinds: ["system"] }, ctx)).data, { system: { cpu: 42 } });
  await assert.rejects(api.call("nope", {}, ctx), /unknown method/);
  await assert.rejects(api.call("constructor", {}, ctx), /unknown method/);
});
