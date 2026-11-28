// Talks to the host's POST /rpc: seal a command, send it, unseal the reply.
// Sends are serialized by the caller (buttons disable while in flight) so the
// monotonic counter stays strictly increasing.

import { seal, unseal, b64ToBytes, bytesToB64, genEphemeral, deriveDeviceKey, confirmTag } from "./crypto";
import { nextCounter, nextEvCounter, type Pairing } from "./storage";
import type { ButtonAction } from "./buttons";
import { Platform } from "react-native";
import { hostAddresses } from "./androidLogic";

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

// Android over USB: the computer runs `adb reverse`, so the phone also reaches
// it at 127.0.0.1. A send that can't reach the Wi-Fi address is retried there
// (the same sealed envelope — nothing reached the computer, so no replay), and
// whichever address worked is tried first next time.
let usbFirst = false;
export function setUsbFirst(on: boolean) {
  usbFirst = on;
}
const lastGood = new Map<string, string>();

async function postRpc(p: Pairing, envelope: unknown, timeoutMs?: number): Promise<Response> {
  const list = hostAddresses(p.host, Platform.OS, usbFirst);
  const good = lastGood.get(p.kid);
  const order = good && list.includes(good) ? [good, ...list.filter((a) => a !== good)] : list;
  let lastErr: unknown = null;
  for (const addr of order) {
    try {
      const res = await postJson(`http://${addr}:${p.port}/rpc`, envelope, timeoutMs);
      lastGood.set(p.kid, addr);
      return res;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Can't reach the computer.");
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
    const ctr = await nextCounter(p.kid);
    const envelope = { kid: p.kid, ...seal(key, { ctr, ...cmd }) };

    const res = await postRpc(p, envelope);

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

/** Ask the host for the list of running apps (for the Apps screen). */
export function apps(p: Pairing) {
  return sendCmd<{ ok: boolean; apps: string[]; frontmost: string | null }>(p, { cmd: "apps" });
}

/** Live host state: volume, now playing, and any shortcut recorded on the desktop. */
export type HostStatus = {
  ok: boolean;
  volume: number | null;
  muted: boolean;
  media: { app: string; state: "playing" | "paused" | "stopped"; track: string; artist: string } | null;
  recordedCombo: string | null;
};

export function status(p: Pairing) {
  return sendCmd<HostStatus>(p, { cmd: "status" });
}

// --- panel ------------------------------------------------------------------

type PanelReply<T> = { ok: boolean; result?: T; error?: string };

/** A panel API call (panel.hello, panel.needs, panel.snapshot, …) on the command channel. */
export async function panelCall<T = unknown>(p: Pairing, method: string, params: Record<string, unknown> = {}): Promise<T> {
  const r = await sendCmd<PanelReply<T>>(p, { cmd: "panel", method, params });
  if (!r.ok) throw new Error(r.error === "unknown cmd" ? "Update DeskAssist on your computer to use the panel." : r.error ?? "panel request failed");
  return r.result as T;
}

export type PanelEvents = {
  boot: string;
  seq: number;
  fresh?: boolean;
  events: { seq: number; type: string; data: unknown; at: number }[];
};

// The event channel: one long-poll at a time, never queued behind (or ahead
// of) command sends — it has its own counter, so ordering only matters within
// this chain.
let evQueue: Promise<unknown> = Promise.resolve();

/** Long-poll for panel events on the event channel (held up to ~25 s by the host). */
export function panelWait(p: Pairing, params: { after: number; boot: string | null; timeoutMs?: number }): Promise<PanelEvents> {
  const run = evQueue.then(async () => {
    const key = b64ToBytes(p.key);
    const ctr = await nextEvCounter(p.kid);
    const timeoutMs = params.timeoutMs ?? 25_000;
    const envelope = { kid: p.kid, ...seal(key, { ctr, ch: "ev", cmd: "panel", method: "events.wait", params: { ...params, timeoutMs } }) };
    const res = await postRpc(p, envelope, timeoutMs + 8000);
    if (res.status !== 200) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    const body = await res.json();
    const reply = unseal<PanelReply<PanelEvents>>(key, body.n, body.ct);
    if (!reply.ok || !reply.result) throw new Error(reply.error ?? "events failed");
    return reply.result;
  });
  evQueue = run.then(() => undefined, () => undefined);
  return run;
}
