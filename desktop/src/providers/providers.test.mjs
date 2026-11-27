import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { userVolumes } from "./disks.mjs";
import { normalizeControllers } from "./gpu.mjs";
import { summarize, killDecision, PROTECTED } from "./procs.mjs";
import { quality, track, addUsage, median, createNetq } from "./netq.mjs";
import { ensureSystemPath } from "./env.mjs";
import { createProviders } from "./index.mjs";

test("disks: macOS keeps / and /Volumes/*, one per APFS container", () => {
  const list = [
    { fs: "/dev/disk1s1s1", mount: "/", size: 1000, used: 10, type: "APFS" },
    { fs: "/dev/disk1s3", mount: "/System/Volumes/Preboot", size: 1000, used: 5, type: "APFS" },
    { fs: "/dev/disk1s5", mount: "/System/Volumes/VM", size: 1000, used: 7, type: "APFS" },
    { fs: "/dev/disk3s1", mount: "/Volumes/Backup", size: 4000, used: 900, type: "APFS" },
    { fs: "devfs", mount: "/dev", size: 1, used: 1, type: "devfs" },
  ];
  assert.deepEqual(userVolumes(list, "darwin").map((v) => v.name), ["Macintosh HD", "Backup"]);
});

test("disks: Windows keeps drive letters; Linux drops system mounts and tmpfs", () => {
  assert.deepEqual(
    userVolumes([{ fs: "C:", mount: "C:", size: 500, used: 200, type: "NTFS" }, { fs: "D:", mount: "D:", size: 900, used: 1, type: "NTFS" }], "win32").map((v) => v.name),
    ["C:", "D:"],
  );
  assert.deepEqual(
    userVolumes(
      [
        { fs: "/dev/sda2", mount: "/", size: 100, used: 1, type: "ext4" },
        { fs: "tmpfs", mount: "/run", size: 10, used: 1, type: "tmpfs" },
        { fs: "/dev/loop0", mount: "/snap/core", size: 10, used: 10, type: "squashfs" },
        { fs: "/dev/sda1", mount: "/boot/efi", size: 1, used: 1, type: "vfat" },
      ],
      "linux",
    ).map((v) => v.name),
    ["/"],
  );
});

test("gpu: missing readings stay null instead of being invented", () => {
  const [g] = normalizeControllers([{ model: "Radeon", vendor: "AMD", vram: 4096 }]);
  assert.equal(g.util, null);
  assert.equal(g.temp, null);
  assert.equal(g.memUsed, null);
  assert.equal(g.memTotal, 4096 * 2 ** 20);
});

test("procs: grouped by name, ownership tracked, protected flagged", () => {
  const list = [
    { pid: 1, name: "Safari", cpu: 10, memRss: 1000, user: "me" },
    { pid: 2, name: "Safari", cpu: 5, memRss: 500, user: "me" },
    { pid: 3, name: "WindowServer", cpu: 30, memRss: 100, user: "_windowserver" },
    { pid: 4, name: "Tool", cpu: 1, memRss: 10, user: "other" },
  ];
  const { list: out } = summarize(list, { user: "me", platform: "darwin" });
  const safari = out.find((g) => g.name === "Safari");
  assert.deepEqual([safari.count, safari.cpu, safari.mem, safari.own], [2, 15, 1500 * 1024, true]);
  assert.equal(out.find((g) => g.name === "WindowServer").protected, true);
  assert.equal(out.find((g) => g.name === "Tool").own, false);
});

test("procs: names never carry command-line arguments", () => {
  const { list } = summarize(
    [
      { pid: 1, name: "sleep 300", command: "sleep 300", cpu: 0, memRss: 1, user: "me" },
      { pid: 2, name: "/usr/bin/python3 tool.py --token=SECRET", command: "/usr/bin/python3 tool.py --token=SECRET", cpu: 0, memRss: 1, user: "me" },
      { pid: 3, name: "Google Chrome Helper", command: "/Applications/Google Chrome.app/…/Google Chrome Helper --type=renderer", cpu: 0, memRss: 1, user: "me" },
    ],
    { user: "me", platform: "darwin" },
  );
  const names = list.map((g) => g.name).sort();
  assert.deepEqual(names, ["Google Chrome Helper", "python3", "sleep"]);
  assert.ok(!JSON.stringify(list).includes("SECRET"));
});

test("procs: Windows DOMAIN\\user ownership matches", () => {
  const { list } = summarize([{ pid: 9, name: "app.exe", cpu: 1, memRss: 1, user: "DESKTOP-1\\Me" }], { user: "me", platform: "win32" });
  assert.equal(list[0].own, true);
});

test("procs: the kill guard refuses system, other users' and our own processes", () => {
  const g = (o) => ({ name: "x", pids: [100], own: true, protected: false, ...o });
  assert.equal(killDecision(g(), { selfPids: [1] }).ok, true);
  assert.equal(killDecision(g({ protected: true }), { selfPids: [1] }).ok, false);
  assert.equal(killDecision(g({ name: "svchost.exe" }), { platform: "win32", selfPids: [1] }).ok, false);
  assert.equal(killDecision(g({ own: false }), { selfPids: [1] }).ok, false);
  assert.equal(killDecision(g({ pids: [1] }), { selfPids: [1] }).ok, false);
  assert.equal(killDecision(undefined).ok, false);
  for (const os of ["darwin", "win32", "linux"]) assert.ok(PROTECTED[os].length >= 10, `${os} deny list`);
});

test("netq: median, latency, jitter, loss and online", () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  const q = quality([10, 20, -1, 30, 40, 50, 60]);
  assert.equal(q.latencyMs, 40); // median of last 5 successes: 20,30,40,50,60
  assert.equal(q.jitterMs, 10);
  assert.equal(q.lossPct, 14.3);
  assert.equal(q.online, true);
  assert.equal(quality([10, -1, -1, -1]).online, false);
  assert.equal(quality([-1, -1, 12]).online, true);
  assert.deepEqual(quality([]), { online: null, latencyMs: null, jitterMs: null, lossPct: null });
});

test("netq: up-since and the last drop", () => {
  let s = track({}, true, 1000);
  assert.equal(s.upSince, 1000);
  s = track(s, false, 5000);
  assert.equal(s.upSince, null);
  s = track(s, false, 7000);
  s = track(s, true, 20000);
  assert.deepEqual(s.lastDrop, { at: 5000, seconds: 15 });
  assert.equal(s.upSince, 20000);
});

test("netq: usage buckets roll over by day and month and expire", () => {
  const d1 = new Date(2026, 0, 31, 23, 0).getTime();
  const d2 = new Date(2026, 1, 1, 1, 0).getTime();
  let u = addUsage(undefined, 100, d1);
  u = addUsage(u, 50, d2);
  assert.equal(u.days["2026-01-31"], 100);
  assert.equal(u.days["2026-02-01"], 50);
  assert.equal(u.months["2026-01"], 100);
  assert.equal(u.months["2026-02"], 50);
  u = addUsage(u, 1, new Date(2026, 5, 1).getTime());
  assert.equal(u.days["2026-01-31"], undefined);
  assert.equal(u.months["2026-01"], undefined);
  assert.deepEqual(addUsage(u, -5, d2), u); // counter reset → no change
});

test("netq: a sample reports quality from fake probes; speed tests are rate limited", async () => {
  const pings = [12, null, 14];
  let t = 1_000_000;
  const fakeFetch = async (url) => {
    if (url.includes("__down")) return { body: (async function* () { yield new Uint8Array(1000); })() };
    return { ok: true, json: async () => ({ clientIp: "203.0.113.9" }) };
  };
  const n = createNetq({ dir: mkdtempSync(join(tmpdir(), "netq-")), now: () => t, ping: async () => (pings.length ? pings.shift() : 10), fetchImpl: fakeFetch, getSettings: () => ({ showIp: true }) });
  await n.sample();
  await n.sample();
  const s = await n.sample();
  assert.deepEqual(s.hist, [12, -1, 14]);
  assert.equal(s.online, true);
  assert.equal(s.ip, "203.0.113.9");
  const first = await n.speedtest();
  assert.equal(first.ok, true);
  assert.ok(first.speed.downMbps >= 0);
  const second = await n.speedtest();
  assert.equal(second.ok, false);
  assert.match(second.error, /Try again/);
});

test("env: the system tool directories are on PATH", () => {
  const env = { PATH: "/usr/bin" };
  ensureSystemPath(env, "darwin");
  for (const d of ["/usr/sbin", "/sbin", "/bin"]) assert.ok(env.PATH.split(":").includes(d));
});

test("live: every provider samples on this OS without throwing", { timeout: 60_000 }, async () => {
  const provs = createProviders({ dir: mkdtempSync(join(tmpdir(), "provs-")) });
  for (const kind of ["system", "gpu", "disks", "net", "procs", "netq"]) {
    const t0 = Date.now();
    const v = await provs[kind].sample();
    assert.ok(v && typeof v === "object", kind);
    const brief = {
      system: () => `cpu ${v.cpu}% temp ${v.tempC}`,
      gpu: () => v.gpus.map((g) => `${g.name} util ${g.util}`).join("; "),
      disks: () => v.volumes.map((d) => `${d.name} ${(d.used / 2 ** 30).toFixed(0)}/${(d.size / 2 ** 30).toFixed(0)} GiB`).join("; "),
      net: () => `${v.iface} rx ${v.rx} tx ${v.tx} ping ${v.pingMs}`,
      procs: () => `${v.total} procs, top: ${[...v.list].sort((a, b) => b.cpu - a.cpu)[0]?.name}`,
      netq: () => `online ${v.online} latency ${v.latencyMs}`,
    }[kind]();
    console.log(`  ${process.platform} ${kind} (${Date.now() - t0} ms): ${brief}`);
  }
  assert.ok((await provs.disks.sample()).volumes.length >= 1, "at least one disk");
});
