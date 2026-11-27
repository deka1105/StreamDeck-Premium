// Headless stand-in for the phone's Panel screen. Pairs with a running host,
// declares that it needs `system` data, then long-polls the event channel and
// prints live CPU readings. Also proves the event channel can't run commands.
//
//   npm run host:dry            (terminal 1)
//   npm run test:panel-client   (terminal 2)

import http from "node:http";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const info = JSON.parse(readFileSync(join(process.cwd(), ".data", "pairing.json"), "utf8"));
const HPK = Buffer.from(info.hpk, "base64");
const PID = info.pid;

function seal(key, obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(obj))), c.final()]);
  return { n: iv.toString("base64"), ct: Buffer.concat([ct, c.getAuthTag()]).toString("base64") };
}
function unseal(key, n, ctB64) {
  const buf = Buffer.from(ctB64, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(n, "base64"));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return JSON.parse(Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString());
}
function post(path, obj) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(obj);
    const req = http.request(
      { host: "127.0.0.1", port: info.port, path, method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data) } },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null }));
      },
    );
    req.on("error", reject);
    req.end(data);
  });
}
function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

let KEY;
const ctr = { cmd: 0, ev: 0 };
async function rpc(body, ch = "cmd") {
  const payload = { ctr: ++ctr[ch], ...body, ...(ch === "ev" ? { ch: "ev" } : {}) };
  const res = await post("/rpc", { kid: PID, ...seal(KEY, payload) });
  return { status: res.status, reply: res.status === 200 ? unseal(KEY, res.body.n, res.body.ct) : res.body };
}
const panel = (method, params, ch) => rpc({ cmd: "panel", method, params }, ch);

async function main() {
  console.log("1. pair");
  const kp = crypto.generateKeyPairSync("x25519");
  const ppk = Buffer.from(kp.publicKey.export({ format: "jwk" }).x, "base64url");
  const shared = crypto.diffieHellman({
    privateKey: kp.privateKey,
    publicKey: crypto.createPublicKey({ key: { kty: "OKP", crv: "X25519", x: HPK.toString("base64url") }, format: "jwk" }),
  });
  KEY = Buffer.from(crypto.hkdfSync("sha256", shared, Buffer.from(PID), Buffer.from("spd-pair-v2"), 32));
  const mac = crypto.createHmac("sha256", KEY).update(Buffer.concat([Buffer.from(PID), HPK, ppk])).digest();
  const paired = await post("/pair", { pid: PID, ppk: ppk.toString("base64"), mac: mac.toString("base64"), name: "panel-test" });
  assert(paired.status === 200, "paired");

  console.log("2. panel.hello and panel.needs on the command channel");
  const hello = await panel("panel.hello", {});
  assert(hello.reply.ok && hello.reply.result.api === 1, `host "${hello.reply.result.host}" speaks panel api 1`);
  const needs = await panel("panel.needs", { kinds: ["system"] });
  assert(needs.reply.ok, "needs accepted");

  console.log("3. the event channel refuses anything but events.wait");
  const sneaky = await rpc({ cmd: "action", action: { type: "url", target: "https://example.com" } }, "ev");
  assert(sneaky.status === 400, "an action on the event channel is rejected");

  console.log("4. live CPU readings via events.wait (event channel)");
  let after = 0;
  let boot = null;
  const readings = [];
  const t0 = Date.now();
  while (readings.length < 3 && Date.now() - t0 < 20_000) {
    // Meanwhile the command channel stays usable: fire a hello in parallel.
    const [r, side] = await Promise.all([panel("events.wait", { after, boot, timeoutMs: 10_000 }, "ev"), panel("panel.hello", {})]);
    assert(side.status === 200, "command channel works while a long-poll is open");
    assert(r.status === 200 && r.reply.ok, "events.wait answered");
    const res = r.reply.result;
    boot = res.boot;
    after = res.seq;
    for (const e of res.events) {
      if (e.type === "data" && e.data.kind === "system") {
        readings.push(e.data.value.cpu);
        console.log(`    CPU ${e.data.value.cpu}%  (seq ${e.seq})`);
      }
    }
  }
  assert(readings.length >= 3, "3 CPU readings arrived");

  console.log("5. replay on the event channel is still rejected");
  const replay = await post("/rpc", { kid: PID, ...seal(KEY, { ctr: 1, ch: "ev", cmd: "panel", method: "events.wait", params: {} }) });
  assert(replay.status === 409, "stale event-channel counter → replay");

  console.log("\nPanel client checks passed.");
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
