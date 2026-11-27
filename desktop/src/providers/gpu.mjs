// `gpu` kind: one entry per graphics adapter. Utilisation, temperature and
// VRAM use are only reported where the OS/driver exposes them (NVIDIA via
// nvidia-smi on Windows/Linux; many Macs report none) — otherwise null, and
// widgets say "not available" instead of inventing a number.

import si from "systeminformation";

const num = (v) => (Number.isFinite(v) ? v : null);

export function normalizeControllers(controllers = []) {
  return controllers.map((c) => ({
    name: c.model || c.name || "GPU",
    vendor: c.vendor || "",
    util: num(c.utilizationGpu),
    temp: num(c.temperatureGpu),
    // MB → bytes
    memUsed: num(c.memoryUsed) !== null ? c.memoryUsed * 2 ** 20 : null,
    memTotal: num(c.memoryTotal) !== null ? c.memoryTotal * 2 ** 20 : num(c.vram) !== null ? c.vram * 2 ** 20 : null,
  }));
}

export const gpu = {
  periodMs: 4000,
  async sample() {
    const g = await si.graphics();
    const gpus = normalizeControllers(g.controllers);
    // The adapter doing the most work (or the first with any data) is "the" GPU.
    const primary = [...gpus].sort((a, b) => (b.util ?? -1) - (a.util ?? -1))[0] ?? null;
    return { gpus, primary, at: Date.now() };
  },
};
