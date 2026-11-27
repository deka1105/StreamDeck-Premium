// `net` kind: throughput on the default interface (bytes/s) and latency.

import si from "systeminformation";
import { tcpPingAny } from "./tcpPing.mjs";

let iface = null;

export const net = {
  periodMs: 2000,
  async sample() {
    if (!iface) iface = (await si.networkInterfaceDefault().catch(() => "")) || null;
    const [stats, ping] = await Promise.all([si.networkStats(iface ?? undefined).catch(() => []), tcpPingAny()]);
    const s = stats[0] ?? {};
    return {
      iface: s.iface || iface,
      rx: Number.isFinite(s.rx_sec) ? Math.max(0, s.rx_sec) : null,
      tx: Number.isFinite(s.tx_sec) ? Math.max(0, s.tx_sec) : null,
      pingMs: ping === null ? null : Math.round(ping * 10) / 10,
      at: Date.now(),
    };
  },
};
