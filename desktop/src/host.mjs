// streamPhoneDeck host core — the server the phone pairs with and talks to.
//
// Transport is plain HTTP; ALL security is application-layer.
//
// PAIRING (spd2, forward secret): the QR carries the host's EPHEMERAL X25519
// public key — never a secret. The phone generates its own ephemeral key, does
// ECDH, and HKDF-derives the shared device key. It proves it actually saw the QR
// (knows the host public key) with an HMAC confirmation tag, which also stops an
// on-path attacker from hijacking the pairing. A screenshot of the QR alone can't
// derive the key, and a later key leak doesn't expose past pairings.
//
// MESSAGES: every request/response is an AES-256-GCM envelope keyed by the device
// key, with a monotonic counter. An attacker on the Wi-Fi can't read, forge,
// modify, replay, or inject — the GCM tag fails on tamper, the counter on resend.

import http from "node:http";
import crypto from "node:crypto";
import os from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import qrcode from "qrcode";
import { execute, validateAction, frontmostApp, runningApps } from "./executor.mjs";

const PROTOCOL = "spd2";
const PROTOCOL_VERSION = 2;
const HKDF_INFO = Buffer.from("spd-pair-v2", "utf8");

function lanIPv4() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return "127.0.0.1";
}

// --- AES-256-GCM envelope (the phone mirrors these two functions) ------------

function seal(keyBuf, obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuf, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(obj), "utf8")), cipher.final()]);
  return { n: iv.toString("base64"), ct: Buffer.concat([ct, cipher.getAuthTag()]).toString("base64") };
}

function unseal(keyBuf, n, ctB64) {
  const iv = Buffer.from(n, "base64");
  const buf = Buffer.from(ctB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuf, iv);
  decipher.setAuthTag(buf.subarray(buf.length - 16));
  return JSON.parse(Buffer.concat([decipher.update(buf.subarray(0, buf.length - 16)), decipher.final()]).toString("utf8"));
}

// --- X25519 key agreement ----------------------------------------------------

function rawPub(keyObject) {
  return Buffer.from(keyObject.export({ format: "jwk" }).x, "base64url");
}

function importPub(raw32) {
  return crypto.createPublicKey({
    key: { kty: "OKP", crv: "X25519", x: Buffer.from(raw32).toString("base64url") },
    format: "jwk",
  });
}

/** ECDH + HKDF-SHA256 → 32-byte device key, salted by the pairing id. */
function deriveKey(hostPrivKey, peerRawPub, pid) {
  const shared = crypto.diffieHellman({ privateKey: hostPrivKey, publicKey: importPub(peerRawPub) });
  return Buffer.from(crypto.hkdfSync("sha256", shared, Buffer.from(pid, "utf8"), HKDF_INFO, 32));
}

/** HMAC binding pid + both public keys — proves the phone saw the QR. */
function confirmTag(keyBuf, pid, hostRawPub, peerRawPub) {
  return crypto.createHmac("sha256", keyBuf).update(Buffer.concat([Buffer.from(pid, "utf8"), hostRawPub, peerRawPub])).digest();
}

// --- device store ------------------------------------------------------------

function loadDevices(dir) {
  const p = join(dir, "devices.json");
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return [];
  }
}

function saveDevices(dir, devices) {
  writeFileSync(join(dir, "devices.json"), JSON.stringify(devices, null, 2), { mode: 0o600 });
}

// --- host settings (shell policy) --------------------------------------------
// `shell` tiles are arbitrary RCE, so they are OFF by default and only run when
// the host operator opts in. An optional allowlist restricts which commands run
// even when enabled. Persisted next to devices.json.

function loadSettings(dir) {
  const p = join(dir, "settings.json");
  const defaults = { allowShell: false, shellAllowlist: null };
  if (!existsSync(p)) return defaults;
  try {
    const s = JSON.parse(readFileSync(p, "utf8"));
    return {
      allowShell: s.allowShell === true,
      shellAllowlist: Array.isArray(s.shellAllowlist) ? s.shellAllowlist.filter((c) => typeof c === "string") : null,
    };
  } catch {
    return defaults;
  }
}

function saveSettings(dir, settings) {
  writeFileSync(join(dir, "settings.json"), JSON.stringify(settings, null, 2), { mode: 0o600 });
}

// --- allowed-apps store (which apps the phone is permitted to launch) ---------

const DEFAULT_ALLOWED_APPS = ["Safari", "Finder", "Notes", "Visual Studio Code"];

function loadApps(dir) {
  const p = join(dir, "apps.json");
  if (!existsSync(p)) return [...DEFAULT_ALLOWED_APPS];
  try {
    const list = JSON.parse(readFileSync(p, "utf8"));
    return Array.isArray(list) ? list.filter((a) => typeof a === "string") : [...DEFAULT_ALLOWED_APPS];
  } catch {
    return [...DEFAULT_ALLOWED_APPS];
  }
}

function saveApps(dir, apps) {
  writeFileSync(join(dir, "apps.json"), JSON.stringify(apps, null, 2));
}

// --- host --------------------------------------------------------------------

export function createHost({ dir, port = 8788, name = os.hostname(), dryRun = false, allowShell } = {}) {
  mkdirSync(dir, { recursive: true });
  let devices = loadDevices(dir);
  const settings = loadSettings(dir);
  // An explicit `allowShell` option (e.g. from an env var) overrides the stored setting.
  if (typeof allowShell === "boolean") settings.allowShell = allowShell;
  let allowedApps = loadApps(dir);
  const pendings = new Map(); // pid -> { hostKp, hostRawPub, expiresAt }

  const isAppAllowed = (n) => allowedApps.some((a) => a.toLowerCase() === String(n).toLowerCase());
  function setAppAllowed(nameRaw, on) {
    const nm = String(nameRaw).trim();
    if (!nm) return allowedApps;
    const without = allowedApps.filter((a) => a.toLowerCase() !== nm.toLowerCase());
    allowedApps = (on ? [...without, nm] : without).sort((a, b) => a.localeCompare(b));
    saveApps(dir, allowedApps);
    return allowedApps;
  }

  function startPairing(ttlMs = 120_000) {
    for (const [k, v] of pendings) if (v.expiresAt < Date.now()) pendings.delete(k);

    const pid = crypto.randomBytes(8).toString("hex");
    const hostKp = crypto.generateKeyPairSync("x25519");
    const hostRawPub = rawPub(hostKp.publicKey);
    const expiresAt = Date.now() + ttlMs;
    pendings.set(pid, { hostKp, hostRawPub, expiresAt });

    const payload = { v: PROTOCOL_VERSION, proto: PROTOCOL, name, host: lanIPv4(), port, pid, hpk: hostRawPub.toString("base64") };
    writeFileSync(join(dir, "pairing.json"), JSON.stringify(payload, null, 2)); // dev/test only
    return { payload, expiresAt, deviceId: pid };
  }

  function handlePair(body) {
    if (!body || typeof body.pid !== "string" || typeof body.ppk !== "string" || typeof body.mac !== "string") {
      return { status: 400, json: { error: "bad request" } };
    }
    const pending = pendings.get(body.pid);
    if (!pending || pending.expiresAt < Date.now()) {
      pendings.delete(body.pid);
      return { status: 403, json: { error: "no active pairing" } };
    }
    const peerRawPub = Buffer.from(body.ppk, "base64");
    let key;
    try {
      key = deriveKey(pending.hostKp.privateKey, peerRawPub, body.pid);
    } catch {
      return { status: 400, json: { error: "bad public key" } };
    }
    const expected = confirmTag(key, body.pid, pending.hostRawPub, peerRawPub);
    const got = Buffer.from(body.mac, "base64");
    if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) {
      return { status: 401, json: { error: "bad confirmation" } }; // didn't see the QR
    }

    pendings.delete(body.pid); // single use
    const device = {
      deviceId: body.pid,
      kid: body.pid,
      key: key.toString("base64"),
      name: typeof body.name === "string" ? body.name.slice(0, 64) : "phone",
      lastCtr: 0,
      activated: true,
      createdAt: new Date().toISOString(),
    };
    devices = [...devices, device];
    saveDevices(dir, devices);
    console.log(`✓ Paired "${device.name}" (${device.deviceId})`);
    return { status: 200, sealed: seal(key, { ok: true, host: name }) };
  }

  async function handleRpc(body) {
    if (!body || typeof body.kid !== "string" || typeof body.n !== "string" || typeof body.ct !== "string") {
      return { status: 400, json: { error: "bad request" } };
    }
    const device = devices.find((d) => d.kid === body.kid);
    if (!device) return { status: 404, json: { error: "unknown key" } };

    let msg;
    try {
      msg = unseal(Buffer.from(device.key, "base64"), body.n, body.ct);
    } catch {
      return { status: 401, json: { error: "auth failed" } };
    }
    if (typeof msg.ctr !== "number" || msg.ctr <= device.lastCtr) {
      return { status: 409, json: { error: "replay" } };
    }
    device.lastCtr = msg.ctr;

    let reply;
    if (msg.cmd === "hello") {
      reply = { ok: true, host: name };
    } else if (msg.cmd === "foreground") {
      // Report the focused app so the phone can auto-switch profiles.
      reply = { ok: true, app: await frontmostApp() };
    } else if (msg.cmd === "apps") {
      // Report the running apps for the phone's "Apps" screen.
      reply = { ok: true, apps: await runningApps(), frontmost: await frontmostApp() };
    } else if (msg.cmd === "action") {
      const action = validateAction(msg.action);
      if (!action) {
        reply = { ok: false, error: "invalid action" };
      } else {
        console.log(`▶ ${msg.label ?? action.type} [${action.type}] from ${device.name}`);
        try {
          await execute(action, { dryRun, allowShell: settings.allowShell, shellAllowlist: settings.shellAllowlist });
          reply = { ok: true };
        } catch (err) {
          reply = { ok: false, error: err.message };
        }
      }
    } else {
      reply = { ok: false, error: "unknown cmd" };
    }

    saveDevices(dir, devices);
    return { status: 200, sealed: seal(Buffer.from(device.key, "base64"), reply) };
  }

  function send(res, status, obj) {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  }

  function readBody(req) {
    return new Promise((resolve) => {
      let raw = "";
      req.on("data", (c) => {
        raw += c;
        if (raw.length > 1_000_000) req.destroy();
      });
      req.on("end", () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          resolve(null);
        }
      });
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { ok: true, name, v: PROTOCOL_VERSION, proto: PROTOCOL });
    }
    if (req.method === "POST" && url.pathname === "/pair") {
      const r = handlePair(await readBody(req));
      if (r.sealed) return send(res, 200, { pid: undefined, ...r.sealed });
      return send(res, r.status, r.json);
    }
    if (req.method === "POST" && url.pathname === "/rpc") {
      const body = await readBody(req);
      const r = await handleRpc(body);
      if (r.sealed) return send(res, 200, { kid: body?.kid, ...r.sealed });
      return send(res, r.status, r.json);
    }
    return send(res, 404, { error: "not found" });
  });

  function revoke(deviceId) {
    devices = devices.filter((d) => d.deviceId !== deviceId);
    saveDevices(dir, devices);
  }

  return {
    server,
    port,
    name,
    startPairing,
    revoke,
    listDevices: () => devices.map(({ key, ...rest }) => rest),
    getAllowShell: () => settings.allowShell,
    setAllowShell: (on) => {
      settings.allowShell = !!on;
      saveSettings(dir, settings);
    },
    getShellAllowlist: () => settings.shellAllowlist,
    listen: () => new Promise((r) => server.listen(port, r)),
    stop: () => new Promise((r) => server.close(r)),
  };
}

// --- CLI: run the host and print a pairing QR to the terminal -----------------

async function main() {
  const dir = join(process.cwd(), ".data");
  const dryRun = ["1", "true", "yes"].includes((process.env.DECK_DRY_RUN ?? "").toLowerCase());
  const port = process.env.DECK_PORT ? Number(process.env.DECK_PORT) : undefined;
  // Shell tiles are opt-in (arbitrary RCE). Enable headless with DECK_ALLOW_SHELL=1.
  const allowShell = process.env.DECK_ALLOW_SHELL
    ? ["1", "true", "yes"].includes(process.env.DECK_ALLOW_SHELL.toLowerCase())
    : undefined;
  const host = createHost({ dir, dryRun, port, allowShell });
  await host.listen();

  const { payload } = host.startPairing();
  const qr = await qrcode.toString(JSON.stringify(payload), { type: "terminal", small: true });
  console.log(`\nstreamPhoneDeck host — "${host.name}"${dryRun ? " (DRY RUN)" : ""}`);
  console.log(`Listening (HTTP) on http://${payload.host}:${payload.port}`);
  console.log(`Pairing id: ${payload.pid}  (QR carries a public key only — safe to show)`);
  console.log(`Pairing valid ~2 min\n`);
  console.log(qr);
  console.log("Scan with the phone app, or press Ctrl+C to stop.\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
