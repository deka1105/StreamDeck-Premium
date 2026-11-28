// Meeting controls: each app's own keyboard shortcuts (from the vendors'
// published shortcut lists), sent after bringing the app forward, plus a
// system-wide "mute everything" (microphone input to 0 and speakers muted,
// with the previous levels restored on the second tap) where the OS allows.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

// app id → { name, mac app to focus, Windows window title to focus, keys }
export const MEETING_APPS = {
  zoom: {
    name: "Zoom",
    macApp: "zoom.us",
    winTitle: "Zoom",
    mac: { mic: "cmd+shift+a", camera: "cmd+shift+v", share: "cmd+shift+s", hand: "option+y", leave: "cmd+w" },
    win: { mic: "alt+a", camera: "alt+v", share: "alt+s", hand: "alt+y", leave: "alt+q" },
  },
  teams: {
    name: "Microsoft Teams",
    macApp: "Microsoft Teams",
    winTitle: "Microsoft Teams",
    mac: { mic: "cmd+shift+m", camera: "cmd+shift+o", share: "cmd+shift+e", hand: "cmd+shift+k", leave: "cmd+shift+h" },
    win: { mic: "ctrl+shift+m", camera: "ctrl+shift+o", share: "ctrl+shift+e", hand: "ctrl+shift+k", leave: "ctrl+shift+h" },
  },
  meet: {
    // Google Meet runs in the browser: the keys go to whichever window is in front.
    name: "Google Meet",
    macApp: null,
    winTitle: null,
    mac: { mic: "cmd+d", camera: "cmd+e", hand: "ctrl+cmd+h" },
    win: { mic: "ctrl+d", camera: "ctrl+e", hand: "ctrl+alt+h" },
  },
  webex: {
    name: "Webex",
    macApp: "Webex",
    winTitle: "Webex",
    mac: { mic: "cmd+shift+m", camera: "cmd+shift+v" },
    win: { mic: "ctrl+m", camera: "ctrl+shift+v" },
  },
};

/** The key combo for an app's action on this OS, or null. Pure. */
export function meetingCombo(app, action, platform = process.platform) {
  const a = MEETING_APPS[app];
  if (!a) return null;
  return (platform === "win32" ? a.win : a.mac)[action] ?? null;
}

export function createMeeting({ execute, dryRun = false, platform = process.platform, runImpl = run, log = console.log } = {}) {
  let saved = null; // levels before "mute everything"

  async function osa(script) {
    const { stdout } = await runImpl("osascript", ["-e", script], { timeout: 5000 });
    return stdout.trim();
  }

  async function focus(app) {
    const a = MEETING_APPS[app];
    if (platform === "darwin" && a.macApp) {
      await runImpl("osascript", ["-e", `tell application "${a.macApp}" to activate`], { timeout: 5000 }).catch(() => {
        throw new Error(`${a.name} isn't running.`);
      });
      await new Promise((r) => setTimeout(r, 150));
    } else if (platform === "win32" && a.winTitle) {
      const { stdout } = await runImpl("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(New-Object -ComObject WScript.Shell).AppActivate($env:DA_TITLE)`], { timeout: 5000, windowsHide: true, env: { ...process.env, DA_TITLE: a.winTitle } });
      if (!/True/i.test(stdout)) throw new Error(`${a.name} isn't open.`);
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  return {
    periodMs: 3000,
    async sample() {
      if (platform !== "darwin") return { canMuteAll: false, allMuted: !!saved, at: Date.now() };
      try {
        const [input, outMuted] = (await osa("set s to get volume settings\nreturn ((input volume of s) as text) & \",\" & ((output muted of s) as text)")).split(",");
        return { canMuteAll: true, mic: Number(input), outMuted: outMuted === "true", allMuted: !!saved, at: Date.now() };
      } catch (err) {
        return { canMuteAll: true, error: err.message, allMuted: !!saved, at: Date.now() };
      }
    },
    async press(app, action) {
      const combo = meetingCombo(app, action, platform);
      if (!combo) throw new Error("That app has no shortcut for this.");
      if (dryRun) return log(`  (dry-run) meeting ${app} ${action} → ${combo}`), { ok: true };
      await focus(app);
      await execute({ type: "keys", combo });
      log(`🎙 ${MEETING_APPS[app].name} ${action}`);
      return { ok: true };
    },
    /** Mute the microphone and speakers system-wide; a second call restores them. */
    async muteAll() {
      if (platform !== "darwin") throw new Error("Muting the microphone system-wide on Windows comes with the Windows audio helper (Stage 12).");
      if (dryRun) return log("  (dry-run) mute everything"), { ok: true, allMuted: !saved };
      if (!saved) {
        const [input, outMuted] = (await osa("set s to get volume settings\nreturn ((input volume of s) as text) & \",\" & ((output muted of s) as text)")).split(",");
        saved = { input: Number(input) || 50, outMuted: outMuted === "true" };
        await osa("set volume input volume 0\nset volume output muted true");
        log("🔇 everything muted");
        return { ok: true, allMuted: true };
      }
      const s = saved;
      saved = null;
      await osa(`set volume input volume ${Math.max(1, Math.min(100, s.input))}\nset volume output muted ${s.outMuted}`);
      log("🔈 mute everything undone");
      return { ok: true, allMuted: false };
    },
  };
}
