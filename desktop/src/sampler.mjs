// On-demand sampling (PLAN D4). Providers run only while some client (a phone
// panel, a browser panel) currently needs their kind, plus a short grace period
// so a page flip doesn't stop and restart them. Each sample is cached and
// published as a `data` event.
//
//   providers: { [kind]: { periodMs, sample: () => Promise<value> } }
//   publish:   (type, data) => void

const NEED_TTL_MS = 30_000; // a client must refresh its needs this often
const GRACE_MS = 10_000; // keep sampling this long after the last need
const HISTORY = 180; // samples kept per kind for charts (6 min at 2 s)

export function createSampler({ providers, publish, now = Date.now, needTtlMs = NEED_TTL_MS, graceMs = GRACE_MS, tickMs = 250 } = {}) {
  const clients = new Map(); // client -> { kinds: Set, at }
  const lastNeeded = new Map(); // kind -> time it was last needed
  const lastRun = new Map(); // kind -> time the last sample started
  const inflight = new Set();
  const cache = new Map(); // kind -> { value, at }
  const hist = new Map(); // kind -> [{ at, value }] oldest first
  let timer = null;

  function setNeeds(client, kinds) {
    const known = (Array.isArray(kinds) ? kinds : []).filter((k) => typeof k === "string" && providers[k]);
    clients.set(String(client), { kinds: new Set(known), at: now() });
  }

  /** Keep a client's existing needs alive (called on every events.wait). */
  function touch(client) {
    const c = clients.get(String(client));
    if (c) c.at = now();
  }

  function activeKinds() {
    const t = now();
    for (const [id, c] of clients) {
      if (t - c.at > needTtlMs) {
        clients.delete(id);
        continue;
      }
      for (const k of c.kinds) lastNeeded.set(k, t);
    }
    const active = [];
    for (const [k, at] of lastNeeded) {
      if (t - at <= graceMs) active.push(k);
      else lastNeeded.delete(k);
    }
    return active.sort();
  }

  async function runOne(kind) {
    inflight.add(kind);
    lastRun.set(kind, now());
    try {
      const value = await providers[kind].sample();
      cache.set(kind, { value, at: now() });
      const h = hist.get(kind) ?? [];
      h.push({ at: now(), value });
      if (h.length > HISTORY) h.splice(0, h.length - HISTORY);
      hist.set(kind, h);
      publish("data", { kind, value });
    } catch (err) {
      console.warn(`[sampler] ${kind} failed: ${err.message}`);
    } finally {
      inflight.delete(kind);
    }
  }

  /** Start every active kind whose period has elapsed. Returns the started kinds. */
  function tick() {
    const t = now();
    const started = [];
    for (const kind of activeKinds()) {
      if (inflight.has(kind)) continue;
      const period = providers[kind].periodMs ?? 2000;
      if (t - (lastRun.get(kind) ?? -Infinity) >= period) {
        started.push(kind);
        runOne(kind);
      }
    }
    return started;
  }

  return {
    setNeeds,
    touch,
    activeKinds,
    tick,
    latest: (kind) => cache.get(kind)?.value,
    /** Recent samples for charts, oldest first. */
    history: (kind) => [...(hist.get(kind) ?? [])],
    snapshot(kinds) {
      const out = {};
      for (const k of kinds ?? [...cache.keys()]) if (cache.has(k)) out[k] = cache.get(k).value;
      return out;
    },
    /** Wait for any in-flight samples (tests). */
    settle: async () => {
      while (inflight.size) await new Promise((r) => setTimeout(r, 1));
    },
    start() {
      if (!timer) timer = setInterval(tick, tickMs);
      timer.unref?.();
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
  };
}
