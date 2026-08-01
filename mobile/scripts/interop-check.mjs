// Proves the phone's noble AES-256-GCM and the host's Node crypto are wire-
// compatible in BOTH directions — the one thing that can silently break the
// pairing and that we can check without a device. Run: node scripts/interop-check.mjs

import { gcm } from "@noble/ciphers/aes.js";
import crypto from "node:crypto";

const key = Uint8Array.from(crypto.randomBytes(32));
const enc = new TextEncoder();
const dec = new TextDecoder();

// Phone side (noble), mirroring mobile/src/crypto.ts
function phoneSeal(obj) {
  const nonce = Uint8Array.from(crypto.randomBytes(12));
  const ct = gcm(key, nonce).encrypt(enc.encode(JSON.stringify(obj)));
  return { n: Buffer.from(nonce).toString("base64"), ct: Buffer.from(ct).toString("base64") };
}
function phoneUnseal(n, ctB64) {
  const pt = gcm(key, Uint8Array.from(Buffer.from(n, "base64"))).decrypt(Uint8Array.from(Buffer.from(ctB64, "base64")));
  return JSON.parse(dec.decode(pt));
}

// Host side (Node crypto), mirroring desktop/src/host.mjs
function hostSeal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(obj))), c.final()]);
  return { n: iv.toString("base64"), ct: Buffer.concat([ct, c.getAuthTag()]).toString("base64") };
}
function hostUnseal(n, ctB64) {
  const iv = Buffer.from(n, "base64");
  const buf = Buffer.from(ctB64, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(buf.subarray(buf.length - 16));
  return JSON.parse(Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString());
}

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

const msg = { ctr: 7, cmd: "action", label: "Open example", action: { type: "url", target: "https://example.com" } };
const same = (a) => JSON.stringify(a) === JSON.stringify(msg);

console.log("phone → host");
{
  const env = phoneSeal(msg);
  assert(same(hostUnseal(env.n, env.ct)), "host opens a phone-sealed envelope");
}
console.log("host → phone");
{
  const env = hostSeal(msg);
  assert(same(phoneUnseal(env.n, env.ct)), "phone opens a host-sealed envelope");
}
console.log("tamper is rejected across implementations");
{
  const env = phoneSeal(msg);
  const b = Buffer.from(env.ct, "base64");
  b[0] ^= 0x01;
  let threw = false;
  try {
    hostUnseal(env.n, b.toString("base64"));
  } catch {
    threw = true;
  }
  assert(threw, "host rejects a tampered phone envelope");
}

console.log("\nWire-compatible both ways. 🎉");
