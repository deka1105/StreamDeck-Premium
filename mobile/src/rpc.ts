// Talks to the host's POST /rpc: seal a command, send it, unseal the reply.
// Sends are serialized by the caller (buttons disable while in flight) so the
// monotonic counter stays strictly increasing.

import { seal, unseal, b64ToBytes, bytesToB64, genEphemeral, deriveDeviceKey, confirmTag } from "./crypto";
import { nextCounter, type Pairing } from "./storage";
import type { ButtonAction } from "./buttons";

export type DeckAction = ButtonAction;

// POST JSON with a timeout so an unreachable host surfaces a clear message
// instead of hanging. On a real phone the usual cause is the wrong Wi-Fi or the
// iOS "Local Network" permission being off.
async function postJson(url: string, body: unknown, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    const host = url.replace(/^https?:\/\//, "").split("/")[0];
    throw new Error(`Can't reach ${host}. Same Wi-Fi as the Mac? Local Network permission on?`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Forward-secret pairing: derive a shared key from the host's QR public key,
 * prove we saw the QR with a confirmation tag, and return the Pairing to store.
 */
export async function pair(host: string, port: number, pid: string, hostPubB64: string, deviceName: string): Promise<Pairing> {
  const hostPub = b64ToBytes(hostPubB64);
  const { priv, pub } = genEphemeral();
  const key = deriveDeviceKey(priv, hostPub, pid);
  const mac = confirmTag(key, pid, hostPub, pub);

  const res = await postJson(`http://${host}:${port}/pair`, { pid, ppk: bytesToB64(pub), mac: bytesToB64(mac), name: deviceName });
  if (res.status !== 200) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  const body = await res.json();
  const reply = unseal<{ ok: boolean; host: string }>(key, body.n, body.ct); // also authenticates the host
  return { kid: pid, key: bytesToB64(key), host, port, name: reply.host ?? "host" };
}

// Serialize every /rpc call. nextCounter() is read-modify-write, so overlapping
// sends — e.g. a button press landing during a background foreground poll — could
// reuse a counter and be rejected as a replay. Chaining guarantees each send
// completes before the next starts, keeping ctr strictly increasing and ordered.
let rpcQueue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = rpcQueue.then(fn, fn);
  rpcQueue = run.then(() => undefined, () => undefined); // never let a failure break the chain
  return run;
}

async function sendCmd<T = unknown>(p: Pairing, cmd: Record<string, unknown>): Promise<T> {
  return serialize(async () => {
    const key = b64ToBytes(p.key);
    const ctr = await nextCounter();
    const envelope = { kid: p.kid, ...seal(key, { ctr, ...cmd }) };

    const res = await postJson(`http://${p.host}:${p.port}/rpc`, envelope);

    if (res.status !== 200) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    const body = await res.json();
    return unseal<T>(key, body.n, body.ct);
  });
}

export function hello(p: Pairing, name: string) {
  return sendCmd<{ ok: boolean; host: string }>(p, { cmd: "hello", name });
}

export function sendAction(p: Pairing, label: string, action: DeckAction) {
  return sendCmd<{ ok: boolean; error?: string }>(p, { cmd: "action", label, action });
}

/** Ask the host which app is focused, for intuitive auto profile switching. */
export function foreground(p: Pairing) {
  return sendCmd<{ ok: boolean; app: string | null }>(p, { cmd: "foreground" });
}
