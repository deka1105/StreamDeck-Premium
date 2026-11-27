// Latency without ICMP: time a TCP connect. Needs no privileges or `ping`
// binary, works the same on every OS. Resolves to milliseconds, or null on
// failure/timeout.

import net from "node:net";

export function tcpPing(host = "1.1.1.1", port = 443, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const sock = net.connect({ host, port });
    let done = false;
    const finish = (ms) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(ms);
    };
    sock.setTimeout(timeoutMs, () => finish(null));
    sock.once("connect", () => finish(Number(process.hrtime.bigint() - t0) / 1e6));
    sock.once("error", () => finish(null));
  });
}

/** First answer from a list of targets, in order (fallback if one is blocked). */
export async function tcpPingAny(targets = [["1.1.1.1", 443], ["8.8.8.8", 443]], timeoutMs = 2000) {
  for (const [h, p] of targets) {
    const ms = await tcpPing(h, p, timeoutMs);
    if (ms !== null) return ms;
  }
  return null;
}
