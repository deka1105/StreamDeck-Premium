// Event queue for panels (PLAN D3). A ring buffer of sequenced events plus
// long-poll waiters. Clients pass the last `seq` they saw and the `boot` id of
// the queue they saw it from; a restarted host has a new boot id, so clients
// know to resync instead of waiting for sequence numbers that will never come.

import crypto from "node:crypto";

export function createEventBus({ max = 200, now = Date.now } = {}) {
  const boot = crypto.randomBytes(6).toString("hex");
  let seq = 0;
  const buf = [];
  const waiters = new Set();

  const visible = (e, client) => !e.to || e.to === client;
  const strip = ({ to, ...rest }) => rest;

  function since(after, client) {
    return buf.filter((e) => e.seq > after && visible(e, client)).map(strip);
  }

  function publish(type, data, { to } = {}) {
    const e = { seq: ++seq, type, data, at: now() };
    if (to) e.to = String(to);
    buf.push(e);
    if (buf.length > max) buf.splice(0, buf.length - max);
    for (const w of [...waiters]) {
      if (visible(e, w.client)) w.flush();
    }
    return e.seq;
  }

  /**
   * Resolve with events newer than `after` for `client`, waiting up to
   * `timeoutMs` for one to arrive. `fresh: true` means the caller must resync
   * from a snapshot (first call, host restarted, or it fell behind the buffer).
   */
  function wait({ after = 0, boot: theirBoot = null, client = "", timeoutMs = 25_000 } = {}) {
    const a = Number.isFinite(Number(after)) ? Number(after) : 0;
    const oldest = buf.length ? buf[0].seq : seq + 1;
    if (theirBoot !== boot || a <= 0 || a > seq || a < oldest - 1) {
      return Promise.resolve({ boot, seq, events: [], fresh: true });
    }
    const ready = since(a, client);
    if (ready.length || timeoutMs <= 0) return Promise.resolve({ boot, seq, events: ready });
    return new Promise((resolve) => {
      const w = {
        client,
        flush() {
          clearTimeout(w.timer);
          waiters.delete(w);
          resolve({ boot, seq, events: since(a, client) });
        },
      };
      w.timer = setTimeout(w.flush, Math.min(timeoutMs, 25_000));
      w.timer.unref?.();
      waiters.add(w);
    });
  }

  return {
    boot,
    publish,
    wait,
    get seq() {
      return seq;
    },
    waiting: () => waiters.size,
    close() {
      for (const w of [...waiters]) w.flush();
    },
  };
}
