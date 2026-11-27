// Every single number a metric / gauge / chart can show, in one place.
// pick(data) returns a number or null (null = "not available on this computer").

export function fmtBytes(n, digits = 1) {
  if (!Number.isFinite(n)) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1000 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(digits)} ${u[i]}`;
}

export function fmtRate(bytesPerSec) {
  if (!Number.isFinite(bytesPerSec)) return "—";
  return `${fmtBytes(bytesPerSec)}/s`;
}

export function fmtDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min`;
  return `${Math.round(seconds)} s`;
}

const pct = (used, total) => (Number.isFinite(used) && total > 0 ? (100 * used) / total : null);
const rootDisk = (d) => d?.volumes?.[0] ?? null;

export const SOURCES = {
  cpu: { label: "CPU", kind: "system", unit: "%", max: 100, pick: (s) => s?.cpu ?? null },
  mem: { label: "Memory", kind: "system", unit: "%", max: 100, pick: (s) => pct(s?.mem?.used, s?.mem?.total) },
  swap: { label: "Swap", kind: "system", unit: "%", max: 100, pick: (s) => pct(s?.swap?.used, s?.swap?.total) },
  cpuTemp: { label: "CPU temp", kind: "system", unit: "°C", max: 100, pick: (s) => s?.tempC ?? null },
  gpu: { label: "GPU", kind: "gpu", unit: "%", max: 100, pick: (g) => g?.primary?.util ?? null },
  gpuTemp: { label: "GPU temp", kind: "gpu", unit: "°C", max: 100, pick: (g) => g?.primary?.temp ?? null },
  vram: { label: "VRAM", kind: "gpu", unit: "%", max: 100, pick: (g) => pct(g?.primary?.memUsed, g?.primary?.memTotal) },
  disk: { label: "Disk", kind: "disks", unit: "%", max: 100, pick: (d) => pct(rootDisk(d)?.used, rootDisk(d)?.size) },
  netDown: { label: "Download", kind: "net", unit: "rate", pick: (n) => n?.rx ?? null },
  netUp: { label: "Upload", kind: "net", unit: "rate", pick: (n) => n?.tx ?? null },
  ping: { label: "Ping", kind: "net", unit: "ms", max: 200, pick: (n) => n?.pingMs ?? null },
  latency: { label: "Internet latency", kind: "netq", unit: "ms", max: 200, pick: (q) => q?.latencyMs ?? null },
  loss: { label: "Packet loss", kind: "netq", unit: "%", max: 100, pick: (q) => q?.lossPct ?? null },
};

/** Value + unit for display, e.g. ["42", "%"] or ["3.1", "MB/s"]. */
export function formatValue(src, v) {
  if (!Number.isFinite(v)) return ["—", ""];
  if (src.unit === "rate") {
    const [n, u] = fmtRate(v).split(" ");
    return [n, u];
  }
  if (src.unit === "ms") return [v < 10 ? v.toFixed(1) : String(Math.round(v)), "ms"];
  return [String(Math.round(v)), src.unit];
}

export const SOURCE_CHOICES = Object.entries(SOURCES).map(([value, s]) => ({ value, label: s.label }));
