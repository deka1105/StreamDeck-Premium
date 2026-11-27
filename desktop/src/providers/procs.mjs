// `procs` kind: the heaviest processes, grouped by name, plus the
// end-process guard (PLAN 4.3). Sampled only while a processes widget is on
// screen (D4) — listing processes is the most expensive provider.

import os from "node:os";
import si from "systeminformation";

/** Processes that must never be ended from a phone, per OS (lower-case names). */
export const PROTECTED = {
  darwin: ["kernel_task", "launchd", "windowserver", "loginwindow", "systemuiserver", "dock", "coreaudiod", "coreservicesd", "opendirectoryd", "securityd", "mds", "mds_stores", "configd", "powerd", "logd", "notifyd", "distnoted", "cfprefsd", "trustd", "usbmuxd", "bluetoothd", "airportd", "fseventsd", "diskarbitrationd", "watchdogd", "syslogd", "hidd", "controlcenter"],
  win32: ["system", "system idle process", "registry", "smss.exe", "csrss.exe", "wininit.exe", "winlogon.exe", "services.exe", "lsass.exe", "lsaiso.exe", "svchost.exe", "dwm.exe", "explorer.exe", "fontdrvhost.exe", "sihost.exe", "msmpeng.exe", "memory compression", "spoolsv.exe", "audiodg.exe", "conhost.exe", "ctfmon.exe", "taskhostw.exe", "runtimebroker.exe", "searchindexer.exe", "securityhealthservice.exe"],
  linux: ["systemd", "init", "kthreadd", "xorg", "xwayland", "gnome-shell", "kwin_x11", "kwin_wayland", "plasmashell", "dbus-daemon", "pipewire", "pulseaudio", "networkmanager", "sshd", "login", "gdm", "sddm", "lightdm"],
};

const me = () => {
  try {
    return os.userInfo().username.toLowerCase();
  } catch {
    return "";
  }
};

/** Group raw processes by name and keep the heaviest. Pure (unit-tested). */
export function summarize(list = [], { limit = 25, user = me(), platform = process.platform } = {}) {
  const prot = new Set(PROTECTED[platform] ?? []);
  const groups = new Map();
  for (const p of list) {
    if (!p?.name) continue;
    const key = p.name;
    const g = groups.get(key) ?? { name: p.name, pids: [], cpu: 0, mem: 0, own: true, protected: prot.has(p.name.toLowerCase()) };
    g.pids.push(p.pid);
    g.cpu += Number(p.cpu) || 0;
    g.mem += (Number(p.memRss) || 0) * 1024; // KB → bytes
    // Windows reports user as DOMAIN\name; compare the last part.
    const owner = String(p.user ?? "").toLowerCase().split("\\").pop();
    if (owner !== user) g.own = false;
    groups.set(key, g);
  }
  const all = [...groups.values()].map((g) => ({ ...g, cpu: Math.round(g.cpu * 10) / 10, count: g.pids.length }));
  const byCpu = [...all].sort((a, b) => b.cpu - a.cpu).slice(0, limit);
  const byMem = [...all].sort((a, b) => b.mem - a.mem).slice(0, limit);
  const keep = new Map([...byCpu, ...byMem].map((g) => [g.name, g]));
  return { list: [...keep.values()], total: list.length };
}

/**
 * Decide whether `pids` may be ended. Only this user's processes, never a
 * protected one, never the host itself or its parents.
 */
export function killDecision(group, { platform = process.platform, selfPids = [process.pid, process.ppid] } = {}) {
  if (!group) return { ok: false, reason: "That process is no longer running." };
  if (group.protected || (PROTECTED[platform] ?? []).includes(group.name.toLowerCase())) return { ok: false, reason: `${group.name} is part of the system and can't be ended from the phone.` };
  if (!group.own) return { ok: false, reason: `${group.name} belongs to another user.` };
  if (group.pids.some((p) => selfPids.includes(p))) return { ok: false, reason: "DeskAssist can't end itself." };
  return { ok: true };
}

let last = { list: [], total: 0 };

export const procs = {
  periodMs: 3000,
  async sample() {
    const p = await si.processes();
    last = summarize(p.list);
    return { ...last, at: Date.now() };
  },
  /** End one instance (pid) or all instances of a process group by name. */
  async kill({ name, pid, all = false }) {
    const fresh = summarize((await si.processes()).list, { limit: 100000 });
    const group = fresh.list.find((g) => g.name === name);
    const d = killDecision(group);
    if (!d.ok) return d;
    const targets = all ? group.pids : group.pids.filter((p) => p === Number(pid));
    if (!targets.length) return { ok: false, reason: "That instance is no longer running." };
    let ended = 0;
    for (const t of targets) {
      try {
        process.kill(t, "SIGTERM");
        ended++;
      } catch {
        /* already gone or not permitted */
      }
    }
    return ended ? { ok: true, ended } : { ok: false, reason: "The process couldn't be ended." };
  },
};
