// Proves the phone's noble X25519 + HKDF + HMAC agree with the host's Node crypto,
// so the forward-secret pairing handshake derives the SAME key on both sides.
// Run: node scripts/x25519-interop.mjs

import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import crypto from "node:crypto";

const eq = (a, b) => Buffer.from(a).equals(Buffer.from(b));
function assert(c, m) {
  if (!c) throw new Error(`FAIL: ${m}`);
  console.log(`  ✓ ${m}`);
}

// Host (Node) keypair; export its raw public (jwk.x is base64url raw 32 bytes).
const hostKp = crypto.generateKeyPairSync("x25519");
const hostRawPub = Buffer.from(hostKp.publicKey.export({ format: "jwk" }).x, "base64url");
const importPub = (raw32) =>
  crypto.createPublicKey({ key: { kty: "OKP", crv: "X25519", x: Buffer.from(raw32).toString("base64url") }, format: "jwk" });

// Phone (noble) keypair.
const phonePriv = crypto.randomBytes(32);
const phoneRawPub = x25519.getPublicKey(phonePriv);

console.log("1. shared secret matches across implementations");
const sharedNode = crypto.diffieHellman({ privateKey: hostKp.privateKey, publicKey: importPub(phoneRawPub) });
const sharedNoble = x25519.getSharedSecret(phonePriv, hostRawPub);
assert(eq(sharedNode, sharedNoble), "Node(host priv · phone pub) == noble(phone priv · host pub)");

console.log("2. HKDF derives the same 32-byte key");
const salt = Buffer.from("pid-1234", "utf8");
const info = Buffer.from("spd-pair-v2", "utf8");
const keyNode = Buffer.from(crypto.hkdfSync("sha256", sharedNode, salt, info, 32));
const keyNoble = hkdf(sha256, sharedNoble, salt, info, 32);
assert(eq(keyNode, keyNoble), "HKDF-SHA256 keys match");

console.log("3. HMAC confirmation tag matches");
const data = Buffer.concat([salt, Buffer.from(hostRawPub), Buffer.from(phoneRawPub)]);
const macNode = crypto.createHmac("sha256", keyNode).update(data).digest();
const macNoble = hmac(sha256, keyNoble, data);
assert(eq(macNode, macNoble), "HMAC-SHA256 tags match");

console.log("\nX25519 handshake is wire-compatible. 🎉");
