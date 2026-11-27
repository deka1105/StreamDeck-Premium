// The panel's only way out. The panel never fetches the computer itself; it
// talks to a bridge with one interface and three transports:
//
//   native  — inside the phone app's WebView. Requests go to React Native via
//             postMessage; RN forwards them over the encrypted RPC link and
//             runs the event long-poll itself, pushing events back in.
//   http    — in a desktop browser served by the host's loopback server.
//             Requests are POST /api/panel/rpc; events come from a long-poll.
//   offline — opened as a file or with no computer: requests fail, and the
//             app falls back to demo data.
//
// Interface: request(method, params) → Promise, on(name, fn) → off,
//            setNeeds(kinds), kind ("native" | "http" | "offline").
// Emitted:   "event" {type, data}, "status" {online}, "resync".

import { createDemoBridge } from "./demo.js";

const REQUEST_TIMEOUT_MS = 30_000;
const NEEDS_KEEPALIVE_MS = 15_000;

function emitter() {
  const listeners = new Map();
  return {
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => listeners.get(name)?.delete(fn);
    },
    emit(name, payload) {
      for (const fn of listeners.get(name) ?? []) {
        try {
          fn(payload);
        } catch (err) {
          console.error(`[bridge] "${name}" listener failed`, err);
        }
      }
    },
  };
}

/** Re-sends the current needs every few seconds so the host keeps sampling. */
function needsKeeper(request) {
  let kinds = [];
  let timer = null;
  const send = () => request("panel.needs", { kinds }).catch(() => {});
  return (next) => {
    kinds = [...new Set(next)].sort();
    send();
    clearInterval(timer);
    timer = setInterval(send, NEEDS_KEEPALIVE_MS);
  };
}

function nativeBridge() {
  const ev = emitter();
  const pending = new Map();
  let nextId = 1;

  // React Native calls this through injectJavaScript.
  window.__deskassist = {
    receive(msg) {
      if (!msg || typeof msg !== "object") return;
      if (msg.t === "res") {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        clearTimeout(p.timer);
        msg.ok ? p.resolve(msg.result) : p.reject(new Error(msg.error || "request failed"));
      } else if (msg.t === "evt") {
        ev.emit("event", { type: msg.type, data: msg.data });
      } else if (msg.t === "status") {
        ev.emit("status", { online: !!msg.online, detail: msg.detail });
      } else if (msg.t === "resync") {
        ev.emit("resync");
      }
    },
  };

  const request = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("timed out"));
      }, REQUEST_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      window.ReactNativeWebView.postMessage(JSON.stringify({ t: "req", id, method, params }));
    });

  // Tell the app the panel is ready to receive events.
  setTimeout(() => window.ReactNativeWebView.postMessage(JSON.stringify({ t: "ready" })), 0);

  return { kind: "native", request, on: ev.on, setNeeds: needsKeeper(request) };
}

function httpBridge() {
  const ev = emitter();
  const params = new URLSearchParams(location.search);
  // A browser panel can act as a named device (?device=monitor); otherwise it
  // is an anonymous browser client.
  const client = (params.get("device") || "").replace(/[^a-z0-9]/gi, "").slice(0, 32) || "browser";

  async function request(method, body = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch("/api/panel/rpc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method, params: body, client }),
        signal: ctrl.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return json.result;
    } finally {
      clearTimeout(timer);
    }
  }

  let online = null;
  const setOnline = (v, detail) => {
    if (v === online) return;
    online = v;
    ev.emit("status", { online: v, detail });
  };

  (async function loop() {
    let after = 0;
    let boot = null;
    let delay = 1000;
    for (;;) {
      try {
        const r = await request("events.wait", { after, boot, timeoutMs: 25_000 });
        setOnline(true);
        if (r.boot !== boot || r.fresh) {
          boot = r.boot;
          ev.emit("resync");
        }
        for (const e of r.events) ev.emit("event", e);
        after = r.seq;
        delay = 1000;
      } catch (err) {
        setOnline(false, err.message);
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 15_000);
      }
    }
  })();

  return { kind: "http", client, request, on: ev.on, setNeeds: needsKeeper(request) };
}

function offlineBridge() {
  const ev = emitter();
  setTimeout(() => ev.emit("status", { online: false, detail: "no computer" }), 0);
  return {
    kind: "offline",
    request: () => Promise.reject(new Error("no computer connected")),
    on: ev.on,
    setNeeds: () => {},
  };
}

export function createBridge() {
  // The phone app sets this before the page loads when its session is the demo.
  const boot = typeof window !== "undefined" ? window.__deskassistBoot ?? {} : {};
  const forceDemo = boot.demo === true || (typeof location !== "undefined" && /[?&]demo=1\b/.test(location.search));
  if (forceDemo) return createDemoBridge();
  if (typeof window !== "undefined" && window.ReactNativeWebView) return nativeBridge();
  if (typeof location !== "undefined" && /^https?:$/.test(location.protocol)) return httpBridge();
  // Opened as a file with no computer: show the demo rather than empty tiles.
  return createDemoBridge();
}
