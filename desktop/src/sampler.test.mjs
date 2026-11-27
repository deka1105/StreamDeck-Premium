import { test } from "node:test";
import assert from "node:assert/strict";
import { createSampler } from "./sampler.mjs";
import { system } from "./providers/system.mjs";

function rig() {
  let t = 1_000_000;
  const calls = [];
  const published = [];
  const providers = {
    system: { periodMs: 2000, sample: async () => (calls.push(t), { cpu: 10 }) },
    gpu: { periodMs: 5000, sample: async () => ({ util: 1 }) },
  };
  const s = createSampler({ providers, publish: (type, data) => published.push({ type, data }), now: () => t });
  return { s, calls, published, advance: (ms) => (t += ms) };
}

test("nothing is sampled until a client needs it", async () => {
  const { s, calls } = rig();
  assert.deepEqual(s.tick(), []);
  await s.settle();
  assert.equal(calls.length, 0);
});

test("sampler starts on need and respects the period", async () => {
  const { s, calls, published, advance } = rig();
  s.setNeeds("phone", ["system"]);
  assert.deepEqual(s.tick(), ["system"]);
  await s.settle();
  advance(1000);
  assert.deepEqual(s.tick(), []); // period not elapsed
  advance(1000);
  assert.deepEqual(s.tick(), ["system"]);
  await s.settle();
  assert.equal(calls.length, 2);
  assert.deepEqual(published[0], { type: "data", data: { kind: "system", value: { cpu: 10 } } });
});

test("sampling stops 10 s after the last need, not before", async () => {
  const { s, advance } = rig();
  s.setNeeds("phone", ["system"]);
  s.tick();
  await s.settle();
  s.setNeeds("phone", []); // page changed: no longer needed
  advance(9_000);
  assert.deepEqual(s.activeKinds(), ["system"]); // still in grace
  advance(2_000);
  assert.deepEqual(s.activeKinds(), []);
  assert.deepEqual(s.tick(), []);
});

test("a client that stops refreshing its needs expires", async () => {
  const { s, advance } = rig();
  s.setNeeds("phone", ["system"]);
  advance(29_000);
  s.touch("phone");
  advance(29_000);
  assert.deepEqual(s.activeKinds(), ["system"]); // touched in time
  advance(45_000); // > 30 s TTL + 10 s grace
  assert.deepEqual(s.activeKinds(), []);
});

test("the cached value is handed out and unknown kinds are ignored", async () => {
  const { s } = rig();
  s.setNeeds("phone", ["system", "made-up"]);
  s.tick();
  await s.settle();
  assert.deepEqual(s.latest("system"), { cpu: 10 });
  assert.deepEqual(s.snapshot(["system", "gpu"]), { system: { cpu: 10 } });
  assert.deepEqual(s.activeKinds(), ["system"]);
});

test("the real system provider returns CPU and memory on this OS", async () => {
  const v = await system.sample();
  assert.equal(typeof v.cpu, "number");
  assert.ok(v.cpu >= 0 && v.cpu <= 100, `cpu ${v.cpu}`);
  assert.ok(v.mem.total > 0 && v.mem.used > 0 && v.mem.used <= v.mem.total);
  console.log(`  ${process.platform}: cpu ${v.cpu}% · mem ${(v.mem.used / 2 ** 30).toFixed(1)}/${(v.mem.total / 2 ** 30).toFixed(1)} GiB`);
});
