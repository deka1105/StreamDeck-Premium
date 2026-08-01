// AES-256-GCM envelopes — the phone side of the host's src/host.mjs seal/unseal.
// Wire format is identical: { n: base64(nonce), ct: base64(ciphertext‖tag) }.
// noble's gcm().encrypt appends the 16-byte tag, matching Node's Buffer.concat.

import "react-native-get-random-values"; // patches global crypto.getRandomValues
import { gcm } from "@noble/ciphers/aes.js";
import { utf8ToBytes, bytesToUtf8 } from "@noble/ciphers/utils.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToB64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[b2 & 63] : "=";
  }
  return out;
}

export function b64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    acc = (acc << 6) | B64.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  (globalThis.crypto as Crypto).getRandomValues(b);
  return b;
}

export type Envelope = { n: string; ct: string };

export function seal(key: Uint8Array, obj: unknown): Envelope {
  const nonce = randomBytes(12);
  const ct = gcm(key, nonce).encrypt(utf8ToBytes(JSON.stringify(obj)));
  return { n: bytesToB64(nonce), ct: bytesToB64(ct) };
}

export function unseal<T = unknown>(key: Uint8Array, n: string, ct: string): T {
  const pt = gcm(key, b64ToBytes(n)).decrypt(b64ToBytes(ct)); // throws on bad tag
  return JSON.parse(bytesToUtf8(pt)) as T;
}

// --- X25519 forward-secret pairing (mirrors desktop/src/host.mjs) ------------

const PAIR_INFO = utf8ToBytes("spd-pair-v2");

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrays) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

export function genEphemeral(): { priv: Uint8Array; pub: Uint8Array } {
  const priv = randomBytes(32);
  return { priv, pub: x25519.getPublicKey(priv) };
}

/** ECDH with the host's QR public key, then HKDF → the 32-byte device key. */
export function deriveDeviceKey(priv: Uint8Array, hostPub: Uint8Array, pid: string): Uint8Array {
  const shared = x25519.getSharedSecret(priv, hostPub);
  return hkdf(sha256, shared, utf8ToBytes(pid), PAIR_INFO, 32);
}

/** HMAC proving we saw the QR (knew the host public key). */
export function confirmTag(key: Uint8Array, pid: string, hostPub: Uint8Array, phonePub: Uint8Array): Uint8Array {
  return hmac(sha256, key, concatBytes(utf8ToBytes(pid), hostPub, phonePub));
}
