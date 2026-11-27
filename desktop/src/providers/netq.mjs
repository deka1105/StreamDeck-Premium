// `netq` kind: internet quality (PLAN 4.5).
//   • a TCP-connect probe every 2 s while something watches (1.1.1.1:443, then 8.8.8.8:443)
//   • latency = median of the last 5 successes; jitter = mean change between
//     consecutive successes; loss = share of failed probes in the window;
//     online = at least one of the last 3 probes succeeded
//   • up-since and the last drop (when, how long)
//   • data used today / this month from the adapter's byte counters (always
//     on, local only), persisted next to the config
//   • an on-demand speed test against speed.cloudflare.com (≈25 MB down,
//     10 MB up; at most one per 2 minutes) and an opt-in public IP

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import si from "systeminformation";
import { tcpPingAny } from "./tcpPing.mjs";

const WINDOW = 60;

// ---------------------------------------------------------- pure maths ----

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** hist: probe results oldest→newest, ms or -1 for a failure. */
export function quality(hist) {
  const ok = hist.filter((v) => v >= 0);
  const recent = ok.slice(-5);
  let jitter = null;
  if (ok.length >= 2) {
    const tail = ok.slice(-10);
    let sum = 0;
    for (let i = 1; i < tail.length; i++) sum += Math.abs(tail[i] - tail[i - 1]);
    jitter = sum / (tail.length - 1);
  }
  const last3 = hist.slice(-3);
  return {
    online: last3.length ? last3.some((v) => v >= 0) : null,
    latencyMs: recent.length ? Math.round(median(recent) * 10) / 10 : null,
    jitterMs: jitter === null ? null : Math.round(jitter * 10) / 10,
    lossPct: hist.length ? Math.round((1000 * (hist.length - ok.length)) / hist.length) / 10 : null,
  };
}

/** Track online/offline transitions. Returns the next tracker state. */
export function track(state, online, now) {
  const s = { upSince: state.upSince ?? null, downSince: state.downSince ?? null, lastDrop: state.lastDrop ?? null };
  if (online === null) return s;
  if (online) {
    if (s.downSince !== null) {
      s.lastDrop = { at: s.downSince, seconds: Math.round((now - s.downSince) / 1000) };
      s.downSince = null;
      s.upSince = now;
    }
    if (s.upSince === null) s.upSince = now;
  } else if (s.downSince === null) {
    s.downSince = now;
    s.upSince = null;
  }
  return s;
}

const dayKey = (t) => new Date(t).toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
const monthKey = (t) => dayKey(t).slice(0, 7);

/** Add a byte delta to the day/month buckets; drops buckets older than 2 months. */
export function addUsage(usage, delta, now) {
  const u = { days: { ...(usage?.days ?? {}) }, months: { ...(usage?.months ?? {}) } };
  if (!(delta > 0)) return u;
  const d = dayKey(now);
  const m = monthKey(now);
  u.days[d] = (u.days[d] ?? 0) + delta;
  u.months[m] = (u.months[m] ?? 0) + delta;
  for (const k of Object.keys(u.days)) if (k < dayKey(now - 62 * 86400_000)) delete u.days[k];
  for (const k of Object.keys(u.months)) if (k < monthKey(now - 62 * 86400_000)) delete u.months[k];
  return u;
}

// ------------------------------------------------------------- runtime ----

export function createNetq({ dir, getSettings = () => ({}), now = Date.now, ping = tcpPingAny, fetchImpl = globalThis.fetch } = {}) {
  const file = dir ? join(dir, "netq.json") : null;
  let saved = { usage: { days: {}, months: {} }, speed: null, ip: null };
  if (file && existsSync(file)) {
    try {
      saved = { ...saved, ...JSON.parse(readFileSync(file, "utf8")) };
    } catch {
      /* start fresh */
    }
  }
  const persist = () => {
    if (!file) return;
    writeFileSync(`${file}.tmp`, JSON.stringify(saved), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  };

  const hist = [];
  let tracker = {};
  let testing = false;
  let lastTestAt = 0;
  let lastBytes = null;
  let usageTimer = null;
  let lastIpAt = 0;

  async function countUsage() {
    try {
      const iface = (await si.networkInterfaceDefault()) || undefined;
      const [s] = await si.networkStats(iface);
      const total = (s?.rx_bytes ?? 0) + (s?.tx_bytes ?? 0);
      if (lastBytes !== null && total >= lastBytes) {
        saved.usage = addUsage(saved.usage, total - lastBytes, now());
        persist();
      }
      lastBytes = total; // a counter reset (reboot, adapter change) just restarts the delta
    } catch {
      /* try again next time */
    }
  }

  async function refreshIp() {
    if (!getSettings().showIp) return (saved.ip = null);
    if (now() - lastIpAt < 30 * 60_000 && saved.ip) return saved.ip;
    lastIpAt = now();
    try {
      const r = await fetchImpl("https://speed.cloudflare.com/meta", { signal: AbortSignal.timeout(5000) });
      const j = await r.json();
      saved.ip = typeof j.clientIp === "string" ? j.clientIp.slice(0, 64) : null;
    } catch {
      /* keep the last one */
    }
    return saved.ip;
  }

  async function speedtest() {
    if (testing) return { ok: false, error: "A speed test is already running." };
    const wait = 120_000 - (now() - lastTestAt);
    if (wait > 0) return { ok: false, error: `Try again in ${Math.ceil(wait / 1000)} s.` };
    testing = true;
    lastTestAt = now();
    try {
      const down = await timed(async () => {
        const r = await fetchImpl("https://speed.cloudflare.com/__down?bytes=25000000", { signal: AbortSignal.timeout(60_000) });
        let n = 0;
        for await (const chunk of r.body) n += chunk.length;
        return n;
      });
      const up = await timed(async () => {
        const body = new Uint8Array(10_000_000);
        await fetchImpl("https://speed.cloudflare.com/__up", { method: "POST", body, signal: AbortSignal.timeout(60_000) });
        return body.length;
      });
      saved.speed = {
        at: now(),
        downMbps: Math.round((down.bytes * 8) / down.seconds / 1e5) / 10,
        upMbps: Math.round((up.bytes * 8) / up.seconds / 1e5) / 10,
        pingMs: quality(hist).latencyMs,
      };
      persist();
      return { ok: true, speed: saved.speed };
    } catch (err) {
      return { ok: false, error: `Speed test failed: ${err.message}` };
    } finally {
      testing = false;
    }
  }

  async function timed(fn) {
    const t0 = performance.now();
    const bytes = await fn();
    return { bytes, seconds: Math.max(0.001, (performance.now() - t0) / 1000) };
  }

  return {
    periodMs: 2000,
    /** Byte counting runs all the time (local only, every 30 s). */
    startUsage() {
      if (usageTimer) return;
      countUsage();
      usageTimer = setInterval(countUsage, 30_000);
      usageTimer.unref?.();
    },
    stopUsage() {
      clearInterval(usageTimer);
      usageTimer = null;
    },
    async sample() {
      const ms = await ping();
      hist.push(ms === null ? -1 : Math.round(ms * 10) / 10);
      if (hist.length > WINDOW) hist.splice(0, hist.length - WINDOW);
      const q = quality(hist);
      tracker = track(tracker, q.online, now());
      const t = now();
      const hours = Number(getSettings().speedtestHours) || 0;
      if (hours > 0 && !testing && t - (saved.speed?.at ?? 0) > hours * 3600_000) speedtest();
      const ip = await refreshIp();
      return {
        ...q,
        hist: [...hist],
        upSince: tracker.upSince,
        lastDrop: tracker.lastDrop,
        today: saved.usage.days[dayKey(t)] ?? 0,
        month: saved.usage.months[monthKey(t)] ?? 0,
        speed: saved.speed,
        testing,
        ip: getSettings().showIp ? ip : null,
        at: t,
      };
    },
    speedtest,
  };
}
