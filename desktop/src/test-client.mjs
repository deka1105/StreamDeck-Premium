// Headless stand-in for the native phone app: does the full spd2 forward-secret
// pairing (X25519 → HKDF → HMAC confirm), then proves the message security
// (forgery, tamper, replay all rejected) — plus that a pairing WITHOUT the QR
// public key (bad confirmation) is refused.
//
// Run the host first:  npm run host:dry   (in another terminal)

import http from "node:http";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const info = JSON.parse(readFileSync(join(process.cwd(), ".data", "pairing.json"), "utf8"));
const HPK = Buffer.from(info.hpk, "base64");
const PID = info.pid;

// --- primitives (mirror the host + the phone) --------------------------------
function seal(keyBuf, obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", keyBuf, iv);
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(obj))), c.final()]);
  return { n: iv.toString("base64"), ct: Buffer.concat([ct, c.getAuthTag()]).toString("base64") };
}
function unseal(keyBuf, n, ctB64) {
  const iv = Buffer.from(n, "base64");
  const buf = Buffer.from(ctB64, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", keyBuf, iv);
  d.setAuthTag(buf.subarray(buf.length - 16));
  return JSON.parse(Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString());
}
function ecdh(phonePriv, hostRawPub) {
  return crypto.diffieHellman({
    privateKey: phonePriv,
    publicKey: crypto.createPublicKey({ key: { kty: "OKP", crv: "X25519", x: Buffer.from(hostRawPub).toString("base64url") }, format: "jwk" }),
  });
}
const derive = (shared) => Buffer.from(crypto.hkdfSync("sha256", shared, Buffer.from(PID, "utf8"), Buffer.from("spd-pair-v2", "utf8"), 32));
const macTag = (key, ppk) => crypto.createHmac("sha256", key).update(Buffer.concat([Buffer.from(PID, "utf8"), HPK, ppk])).digest();

// --- http --------------------------------------------------------------------
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
function get(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: info.port, path }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null }));
    }).on("error", reject);
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

let KEY;
let ctr = 0;
async function rpc(cmd) {
  const envelope = { kid: PID, ...seal(KEY, { ctr: ++ctr, ...cmd }) };
  const res = await post("/rpc", envelope);
  return { status: res.status, reply: res.status === 200 ? unseal(KEY, res.body.n, res.body.ct) : res.body };
}

async function main() {
  console.log("1. health");
  const health = await get("/health");
  assert(health.status === 200 && health.body.proto === "spd2", "server up on spd2");

  console.log("2. pairing WITHOUT the QR public key must fail");
  {
    const kp = crypto.generateKeyPairSync("x25519");
    const ppk = Buffer.from(kp.publicKey.export({ format: "jwk" }).x, "base64url");
    const res = await post("/pair", { pid: PID, ppk: ppk.toString("base64"), mac: crypto.randomBytes(32).toString("base64") });
    assert(res.status === 401, "bad confirmation tag rejected (on-path attacker can't hijack pairing)");
  }

  console.log("3. real X25519 pairing derives the device key");
  {
    const kp = crypto.generateKeyPairSync("x25519");
    const ppk = Buffer.from(kp.publicKey.export({ format: "jwk" }).x, "base64url");
    KEY = derive(ecdh(kp.privateKey, HPK));
    const res = await post("/pair", { pid: PID, ppk: ppk.toString("base64"), mac: macTag(KEY, ppk).toString("base64"), name: "test-client" });
    assert(res.status === 200, "handshake accepted");
    const reply = unseal(KEY, res.body.n, res.body.ct);
    assert(reply.ok && reply.host, `host confirmed (sealed with the derived key): "${reply.host}"`);
  }

  console.log("4. forgery — wrong key on /rpc rejected");
  const forged = await post("/rpc", { kid: PID, ...seal(crypto.randomBytes(32), { ctr: 1, cmd: "hello" }) });
  assert(forged.status === 401, "envelope with a different key → auth failed");

  console.log("5. tamper — flipped ciphertext byte rejected");
  const good = { kid: PID, ...seal(KEY, { ctr: 1, cmd: "hello" }) };
  const bytes = Buffer.from(good.ct, "base64");
  bytes[0] ^= 0x01;
  const tampered = await post("/rpc", { ...good, ct: bytes.toString("base64") });
  assert(tampered.status === 401, "GCM tag fails on tamper");

  console.log("6. hello over the paired channel");
  const hello = await rpc({ cmd: "hello", name: "test-client" });
  assert(hello.status === 200 && hello.reply.ok, `connected to "${hello.reply.host}"`);

  console.log("7. replay — old counter rejected");
  const replay = await post("/rpc", { kid: PID, ...seal(KEY, { ctr: 1, cmd: "hello" }) });
  assert(replay.status === 409, "stale counter → replay rejected");

  console.log("8. authenticated action executes");
  const ran = await rpc({ cmd: "action", label: "Open example", action: { type: "url", target: "https://example.com" } });
  assert(ran.status === 200 && ran.reply.ok, "action accepted and executed (dry-run)");

  console.log("9. foreground — host reports its focused app (intuitive mode)");
  const fg = await rpc({ cmd: "foreground" });
  assert(fg.status === 200 && fg.reply.ok, "foreground command accepted over the paired channel");
  assert("app" in fg.reply, `focused app reported: ${JSON.stringify(fg.reply.app)}`);

  console.log("10. apps — host reports its running apps (Apps screen)");
  const ra = await rpc({ cmd: "apps" });
  assert(ra.status === 200 && ra.reply.ok, "apps command accepted over the paired channel");
  assert(Array.isArray(ra.reply.apps), `running apps reported: ${ra.reply.apps.length} app(s)`);

  console.log("11. shell policy — depends on the host's allowShell setting");
  const shell = await rpc({ cmd: "action", label: "Shell", action: { type: "shell", command: "echo spd-test" } });
  if (process.env.EXPECT_SHELL === "on") {
    assert(shell.status === 200 && shell.reply.ok, "shell ALLOWED (host opted in) — command ran");
  } else {
    assert(shell.status === 200 && shell.reply.ok === false && /disabled/i.test(shell.reply.error ?? ""), "shell BLOCKED by default (opt-in required)");
  }

  console.log("\nAll checks passed. 🎉");
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
