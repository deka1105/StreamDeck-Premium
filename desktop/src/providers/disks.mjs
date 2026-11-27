// `disks` kind: the volumes a person thinks of as their disks (not the dozen
// system/snapshot mounts macOS and Linux expose), plus read/write rates where
// the OS reports them.

import si from "systeminformation";

const SKIP_TYPES = new Set(["tmpfs", "devtmpfs", "overlay", "squashfs", "autofs", "devfs", "nullfs", "proc", "sysfs", "ramfs"]);

/** Keep user-facing volumes, one per device. Pure (unit-tested). */
export function userVolumes(list = [], platform = process.platform) {
  const out = [];
  const seen = new Set();
  for (const f of list) {
    if (!f || !(f.size > 0)) continue;
    if (SKIP_TYPES.has(String(f.type).toLowerCase())) continue;
    const mount = String(f.mount ?? "");
    if (platform === "darwin" && !(mount === "/" || mount.startsWith("/Volumes/"))) continue;
    if (platform === "linux" && /^\/(boot|snap|run|dev|sys|proc|var\/lib\/docker)(\/|$)/.test(mount)) continue;
    const key = platform === "darwin" ? `${f.size}` : f.fs; // APFS volumes share one container
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: platform === "darwin" ? (mount === "/" ? "Macintosh HD" : mount.slice(9)) : mount || f.fs, mount, used: f.used, size: f.size });
  }
  return out;
}

let lastIo = null;

export const disks = {
  periodMs: 5000,
  async sample() {
    const [fs, io] = await Promise.all([si.fsSize(), si.disksIO().catch(() => null)]);
    let rates = null;
    if (io && Number.isFinite(io.rIO) && lastIo) {
      const dt = (Date.now() - lastIo.at) / 1000;
      if (dt > 0) rates = { readOps: Math.max(0, (io.rIO - lastIo.r) / dt), writeOps: Math.max(0, (io.wIO - lastIo.w) / dt) };
    }
    if (io && Number.isFinite(io.rIO)) lastIo = { r: io.rIO, w: io.wIO, at: Date.now() };
    return { volumes: userVolumes(fs), io: rates, at: Date.now() };
  },
};
