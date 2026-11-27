// `system` kind: CPU load (overall + per core), memory, swap, CPU temperature
// (when the OS exposes it) and uptime. Cross-platform via systeminformation.

import si from "systeminformation";

const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

export const system = {
  periodMs: 2000,
  async sample() {
    const [load, mem, temp] = await Promise.all([si.currentLoad(), si.mem(), si.cpuTemperature().catch(() => ({}))]);
    // `active` excludes reclaimable cache on every OS, so it matches what
    // Activity Monitor / Task Manager call "used".
    return {
      cpu: r1(load.currentLoad),
      cores: load.cpus?.length ?? 0,
      perCore: (load.cpus ?? []).map((c) => r1(c.load)),
      mem: { used: mem.active, total: mem.total },
      swap: { used: mem.swapused, total: mem.swaptotal },
      tempC: Number.isFinite(temp?.main) && temp.main > 0 ? r1(temp.main) : null,
      uptime: Math.round(si.time().uptime),
      at: Date.now(),
    };
  },
};
