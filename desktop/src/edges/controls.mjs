// Desk edges: what the sliders and dials control, per OS. Each `get` answers
// { value } (0..1) or { unavailable: true, reason } — never a made-up value.
//
// macOS: volume (AppleScript), dark mode (System Events, public scripting),
//   music (the Stage 7 media provider). Display brightness and keyboard
//   backlight need private frameworks on Apple-silicon Macs (R12), and the
//   output device needs Core Audio from a native helper: both say so.
// Windows: volume, output device and external-monitor brightness through the
//   Stage 12 helper; laptop brightness through WMI; dark mode via the
//   Personalize registry key.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Parse `reg query … AppsUseLightTheme` → dark (true) / light (false) / null. Pure. */
export function parseLightTheme(stdout) {
  const m = /AppsUseLightTheme\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(String(stdout));
  return m ? parseInt(m[1], 16) === 0 : null;
}

export function createEdgeControls({ platform = process.platform, runImpl = run, execute, media, audio, system, log = console.log } = {}) {
  const mac = platform === "darwin";
  const win = platform === "win32";
  const osa = async (script) => (await runImpl("osascript", ["-e", script], { timeout: 5000 })).stdout.trim();
  let timer = { endsAt: 0, minutes: 0 };

  async function get(kind) {
    switch (kind) {
      case "volume": {
        if (mac) return { value: Number(await osa("output volume of (get volume settings)")) / 100 };
        if (win && audio) {
          const s = await audio.sample();
          return s.available ? { value: s.output?.volume ?? 0 } : { unavailable: true, reason: s.error };
        }
        return { unavailable: true, reason: "Not on this computer." };
      }
      case "appearance": {
        if (mac) return { value: (await osa('tell application "System Events" to tell appearance preferences to get dark mode')) === "true" ? 1 : 0 };
        if (win) {
          const { stdout } = await runImpl("reg", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", "/v", "AppsUseLightTheme"], { timeout: 4000, windowsHide: true });
          return { value: parseLightTheme(stdout) ? 1 : 0 };
        }
        return { unavailable: true, reason: "Not on this computer." };
      }
      case "brightness": {
        if (win && system) {
          const d = (await system.sample()).displays ?? [];
          return d.length ? { value: d[0].percent / 100, index: d[0].index } : { unavailable: true, reason: "No display reports its brightness." };
        }
        return { unavailable: true, reason: mac ? "Mac display brightness needs a private Apple API — not used." : "Not on this computer." };
      }
      case "keyboard":
        return { unavailable: true, reason: "Keyboard backlight needs a private Apple API — not used." };
      case "output": {
        if (win && audio) {
          const s = await audio.sample();
          return s.available ? { devices: s.output?.devices ?? [] } : { unavailable: true, reason: s.error };
        }
        return { unavailable: true, reason: mac ? "Switching output on a Mac needs a Core Audio helper (planned)." : "Not on this computer." };
      }
      case "music": {
        const m = await media?.sample?.().catch(() => null);
        const n = m?.now ?? m;
        return { playing: n?.state === "playing" || n?.playing === true, title: n?.title ?? "", artist: n?.artist ?? "", progress: n?.duration ? Math.min(1, (n.position ?? 0) / n.duration) : 0 };
      }
      default:
        return { unavailable: true, reason: "Unknown control." };
    }
  }

  async function set(kind, value) {
    const v = Math.max(0, Math.min(1, Number(value) || 0));
    switch (kind) {
      case "volume":
        await execute({ type: "media", command: "setvol", value: Math.round(v * 100) });
        return { ok: true };
      case "appearance":
        if (mac) await osa(`tell application "System Events" to tell appearance preferences to set dark mode to ${v >= 0.5}`);
        else if (win) {
          for (const name of ["AppsUseLightTheme", "SystemUsesLightTheme"]) await runImpl("reg", ["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", "/v", name, "/t", "REG_DWORD", "/d", v >= 0.5 ? "0" : "1", "/f"], { timeout: 4000, windowsHide: true });
        } else return { ok: false, error: "Not on this computer." };
        return { ok: true };
      case "brightness": {
        const g = await get("brightness");
        if (g.unavailable) return { ok: false, error: g.reason };
        await system.methods.setBrightness({ index: g.index, percent: Math.round(v * 100) });
        return { ok: true };
      }
      case "output":
        if (!win || !audio) return { ok: false, error: "Switching output needs Windows (or a Mac helper, planned)." };
        await audio.methods.setDefault({ id: String(value) });
        return { ok: true };
      default:
        return { ok: false, error: "That control can't be set." };
    }
  }

  async function act(kind, action, arg) {
    if (kind === "music") {
      if (!["playpause", "next", "previous"].includes(action)) return { ok: false };
      await media?.control?.(action);
      return { ok: true };
    }
    if (kind === "timer") {
      if (action === "start") {
        const m = Math.max(1, Math.min(60, Math.round(Number(arg) || 25)));
        timer = { endsAt: Date.now() + m * 60_000, minutes: m };
      } else if (action === "cancel") timer = { endsAt: 0, minutes: 0 };
      else if (action === "done") {
        timer = { endsAt: 0, minutes: 0 };
        // A short, unmistakable sound when the timer finishes.
        if (mac) runImpl("afplay", ["/System/Library/Sounds/Glass.aiff"]).catch(() => {});
        else if (win) runImpl("powershell.exe", ["-NoProfile", "-Command", "[System.Media.SystemSounds]::Asterisk.Play()"], { windowsHide: true }).catch(() => {});
      }
      return { ok: true, endsAt: timer.endsAt };
    }
    return { ok: false };
  }

  async function launch(app) {
    await execute({ type: "app", target: String(app) });
    log(`🚀 desk edge launched ${app}`);
    return { ok: true };
  }

  return { get, set, act, launch };
}
