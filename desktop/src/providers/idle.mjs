// Seconds since the last keyboard/mouse input, for "away" rules.
// macOS: HIDIdleTime from `ioreg -c IOHIDSystem` (nanoseconds).
// Windows: GetLastInputInfo via a tiny inline C# type in PowerShell.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export function parseHidIdle(out) {
  const m = /"HIDIdleTime"\s*=\s*(\d+)/.exec(String(out ?? ""));
  return m ? Math.floor(Number(m[1]) / 1e9) : null;
}

const WIN_IDLE = `Add-Type @'
using System; using System.Runtime.InteropServices;
public static class Idle { [StructLayout(LayoutKind.Sequential)] struct LII { public uint cbSize; public uint dwTime; }
 [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LII p);
 public static uint Ms() { var l = new LII(); l.cbSize = (uint)Marshal.SizeOf(l); GetLastInputInfo(ref l); return (uint)Environment.TickCount - l.dwTime; } }
'@; [Idle]::Ms()`;

export async function idleSeconds(platform = process.platform) {
  if (platform === "darwin") return parseHidIdle((await run("ioreg", ["-c", "IOHIDSystem", "-d", "4", "-r"], { timeout: 4000, maxBuffer: 8_000_000 })).stdout);
  if (platform === "win32") {
    const { stdout } = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", WIN_IDLE], { timeout: 8000, windowsHide: true });
    const ms = Number(stdout.trim());
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  }
  return null;
}
