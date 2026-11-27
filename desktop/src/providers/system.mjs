// `system` kind: overall CPU load and memory use. Cross-platform via
// systeminformation (macOS, Windows, Linux).

import si from "systeminformation";

export const system = {
  periodMs: 2000,
  async sample() {
    const [load, mem] = await Promise.all([si.currentLoad(), si.mem()]);
    // `active` excludes reclaimable cache on every OS, so it matches what
    // Activity Monitor / Task Manager call "used".
    return {
      cpu: round1(load.currentLoad),
      cores: load.cpus?.length ?? 0,
      mem: { used: mem.active, total: mem.total },
      at: Date.now(),
    };
  },
};

function round1(v) {
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
}
