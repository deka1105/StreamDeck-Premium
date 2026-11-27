// Baseline tests for the host's existing security and validation code.
// Run: npm test (in desktop/)

import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { seal, unseal } from "./host.mjs";
import { validateAction, shellDecision } from "./executor.mjs";

test("seal/unseal round-trips an object", () => {
  const key = crypto.randomBytes(32);
  const msg = { ctr: 7, cmd: "hello", nested: { a: [1, 2, 3] } };
  const { n, ct } = seal(key, msg);
  assert.deepEqual(unseal(key, n, ct), msg);
});

test("unseal rejects a wrong key and a tampered ciphertext", () => {
  const key = crypto.randomBytes(32);
  const { n, ct } = seal(key, { ok: true });
  assert.throws(() => unseal(crypto.randomBytes(32), n, ct));
  const bytes = Buffer.from(ct, "base64");
  bytes[0] ^= 1;
  assert.throws(() => unseal(key, n, bytes.toString("base64")));
});

test("validateAction accepts the basic types and strips extra fields", () => {
  assert.deepEqual(validateAction({ type: "app", target: "Safari", evil: 1 }), { type: "app", target: "Safari" });
  assert.deepEqual(validateAction({ type: "keys", combo: "cmd+shift+4" }), { type: "keys", combo: "cmd+shift+4" });
  assert.deepEqual(validateAction({ type: "media", command: "setvol", value: 250 }), { type: "media", command: "setvol", value: 100 });
});

test("validateAction rejects unknown types, empty values and bad macros", () => {
  assert.equal(validateAction({ type: "nope", target: "x" }), null);
  assert.equal(validateAction({ type: "url", target: "" }), null);
  assert.equal(validateAction({ type: "media", command: "explode" }), null);
  assert.equal(validateAction({ type: "macro", steps: [] }), null);
  assert.equal(validateAction({ type: "macro", steps: [{ action: { type: "bad" } }] }), null);
});

test("validateAction clamps macro length and delays", () => {
  const steps = Array.from({ length: 20 }, () => ({ action: { type: "url", target: "https://example.com" }, delayMs: 999_999 }));
  const out = validateAction({ type: "macro", steps });
  assert.equal(out.steps.length, 8);
  assert.equal(out.steps[0].delayMs, 30_000);
});

test("shellDecision: off by default, allowlist is exact-match", () => {
  assert.equal(shellDecision("ls").ok, false);
  assert.equal(shellDecision("ls", { allowShell: true }).ok, true);
  assert.equal(shellDecision("ls -la", { allowShell: true, shellAllowlist: ["ls"] }).ok, false);
  assert.equal(shellDecision(" ls ", { allowShell: true, shellAllowlist: ["ls"] }).ok, true);
});
