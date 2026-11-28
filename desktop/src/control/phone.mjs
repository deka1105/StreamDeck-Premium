// Stage 13 (host side of the Android features):
//  - phone reports → pushed values phone.battery / phone.charging / phone.temp,
//    so ordinary rules do "battery care" (charged to 80 % → smart plug off);
//  - the notification mirror → a notification on this computer;
//  - the clipboard bridge (opt-in on the computer too);
//  - USB: keeps `adb reverse` set up for plugged-in Android phones, so the
//    phone reaches this host at 127.0.0.1 with no Wi-Fi. The link stays the
//    same sealed, paired channel as over Wi-Fi.

import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { join, posix, win32 } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Where adb is: PATH, ANDROID_HOME / ANDROID_SDK_ROOT, or the default SDK folder. */
export function findAdb({ env = process.env, platform = process.platform, exists = existsSync } = {}) {
  const exe = platform === "win32" ? "adb.exe" : "adb";
  // Paths follow the target platform's rules (tests run every platform's case everywhere).
  const join = platform === "win32" ? win32.join : posix.join;
  const roots = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT, platform === "darwin" ? join(homedir(), "Library", "Android", "sdk") : platform === "win32" ? join(env.LOCALAPPDATA ?? "", "Android", "Sdk") : join(homedir(), "Android", "Sdk")].filter(Boolean);
  for (const r of roots) {
    const p = join(r, "platform-tools", exe);
    if (exists(p)) return p;
  }
  for (const dir of String(env.PATH ?? "").split(platform === "win32" ? ";" : ":")) {
    if (dir && exists(join(dir, exe))) return join(dir, exe);
  }
  return null;
}

/** This computer's wired-first MAC and the subnet broadcast, for the phone's "Wake" button. Pure given the interface list. */
export function wakeInfo(ifaces = networkInterfaces()) {
  const cands = [];
  for (const [name, addrs] of Object.entries(ifaces ?? {})) {
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" && a.family !== 4) continue;
      if (a.internal || !a.mac || a.mac === "00:00:00:00:00:00") continue;
      const ip = a.address.split(".").map(Number);
      const mask = a.netmask.split(".").map(Number);
      const broadcast = ip.map((b, i) => (b | (~mask[i] & 255)) & 255).join(".");
      // Wired adapters first: Wake-on-LAN usually works only over Ethernet.
      const wired = /^(en0|eth|Ethernet)/i.test(name) && !/wi-?fi|wlan|wireless/i.test(name);
      cands.push({ mac: a.mac.toUpperCase(), broadcast, iface: name, wired });
    }
  }
  cands.sort((a, b) => Number(b.wired) - Number(a.wired));
  return cands[0] ?? null;
}

/** `adb devices` → serials that are ready ("device" state). Pure. */
export function parseAdbDevices(stdout) {
  return String(stdout)
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === "device")
    .map(([serial]) => serial);
}

/** Is `tcp:port` already reversed in `adb reverse --list` output? Pure. */
export const hasReverse = (stdout, port) => String(stdout).split(/\r?\n/).some((l) => l.includes(`tcp:${port} tcp:${port}`));

export function createPhone({ pushes, getSettings = () => ({}), port = 8788, platform = process.platform, runImpl = run, adbPath = findAdb, log = console.log, dryRun = false } = {}) {
  const android = () => getSettings()?.android ?? {};
  let usb = { on: false, adb: null, phones: [], error: null, at: 0 };
  let timer = null;

  async function osNotify(title, text) {
    if (dryRun) return log(`  (dry-run) notification: ${title} — ${text}`);
    if (platform === "darwin") {
      // Text goes in as arguments, never into the script source.
      await runImpl("osascript", ["-e", "on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run", title, text], { timeout: 5000 });
    } else if (platform === "win32") {
      const ps = `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
$x = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$t = $x.GetElementsByTagName('text'); $t.Item(0).AppendChild($x.CreateTextNode($env:DA_T)) | Out-Null; $t.Item(1).AppendChild($x.CreateTextNode($env:DA_B)) | Out-Null
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('DeskAssist').Show([Windows.UI.Notifications.ToastNotification]::new($x))`;
      await runImpl("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { timeout: 10_000, windowsHide: true, env: { ...process.env, DA_T: title, DA_B: text } });
    }
  }

  function clipboardWrite(text) {
    if (platform !== "darwin" && platform !== "win32") throw new Error("The clipboard bridge works with macOS and Windows.");
    return new Promise((resolve, reject) => {
      const child = platform === "darwin" ? spawn("pbcopy") : spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "$input | Set-Clipboard"], { windowsHide: true });
      child.on("error", reject);
      child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("Couldn't set the clipboard."))));
      child.stdin.end(text);
    });
  }

  async function clipboardRead() {
    if (platform === "darwin") return (await runImpl("pbpaste", [], { timeout: 5000, maxBuffer: 1024 * 1024 })).stdout;
    if (platform === "win32") return (await runImpl("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Raw"], { timeout: 5000, windowsHide: true, maxBuffer: 1024 * 1024 })).stdout.replace(/\r?\n$/, "");
    throw new Error("The clipboard bridge works with macOS and Windows.");
  }

  async function usbTick() {
    if (!android().usb) {
      usb = { on: false, adb: null, phones: [], error: null, at: Date.now() };
      return;
    }
    const adb = typeof adbPath === "function" ? adbPath() : adbPath;
    if (!adb) {
      usb = { on: true, adb: null, phones: [], error: "adb isn't installed. Install Android's platform-tools (or Android Studio).", at: Date.now() };
      return;
    }
    try {
      const serials = parseAdbDevices((await runImpl(adb, ["devices"], { timeout: 8000, windowsHide: true })).stdout);
      for (const s of serials) {
        const list = (await runImpl(adb, ["-s", s, "reverse", "--list"], { timeout: 8000, windowsHide: true })).stdout;
        if (!hasReverse(list, port)) {
          await runImpl(adb, ["-s", s, "reverse", `tcp:${port}`, `tcp:${port}`], { timeout: 8000, windowsHide: true });
          log(`🔌 USB: phone ${s} can reach this computer at 127.0.0.1:${port}`);
        }
      }
      usb = { on: true, adb, phones: serials, error: null, at: Date.now() };
    } catch (err) {
      usb = { on: true, adb, phones: [], error: String(err.stderr || err.message).split("\n")[0], at: Date.now() };
    }
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => usbTick().catch(() => {}), 5000);
      timer.unref?.();
      usbTick().catch(() => {});
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
    usbStatus: async () => (await usbTick(), usb),
    usbTick,
    methods: {
      // The phone's battery as pushed values, for rules and widgets.
      "phone.report": ({ level, charging, tempC } = {}) => {
        const l = Number(level);
        if (!Number.isFinite(l) || l < 0 || l > 1) return { ok: false, error: "level must be 0–1." };
        pushes.set("phone.battery", { value: Math.round(l * 100), unit: "%", title: "Phone battery", progress: l, level: l < 0.2 ? "warn" : undefined }, 900);
        pushes.set("phone.charging", { value: charging ? "on" : "off", title: "Phone charging" }, 900);
        if (Number.isFinite(Number(tempC)) && tempC !== null) pushes.set("phone.temp", { value: Math.round(Number(tempC) * 10) / 10, unit: "°C", title: "Phone temperature", level: Number(tempC) >= 42 ? "warn" : undefined }, 900);
        return { ok: true };
      },
      "phone.notification": async ({ app, title, text } = {}) => {
        if (android().showNotifications === false) return { ok: false, error: "Phone notifications are turned off on this computer." };
        const t = String(app ?? "Phone").slice(0, 60);
        const head = [t, String(title ?? "").slice(0, 120)].filter(Boolean).join(" — ");
        const body = String(text ?? "").slice(0, 300);
        if (!head && !body) return { ok: false, error: "Empty notification." };
        await osNotify(head || "Phone", body || " ").catch((err) => log(`notification failed: ${err.message}`));
        return { ok: true };
      },
      "host.wakeInfo": () => ({ ok: true, ...(wakeInfo() ?? {}) }),
      "clipboard.set": async ({ text } = {}) => {
        if (!android().clipboard) return { ok: false, error: "Turn on the clipboard bridge on the computer (editor › Settings › Android phone)." };
        const t = String(text ?? "");
        if (t.length > 100_000) return { ok: false, error: "That's too much text (100,000 characters at most)." };
        if (dryRun) return log(`  (dry-run) clipboard ← ${t.length} characters`), { ok: true };
        await clipboardWrite(t);
        return { ok: true };
      },
      "clipboard.get": async () => {
        if (!android().clipboard) return { ok: false, error: "Turn on the clipboard bridge on the computer (editor › Settings › Android phone)." };
        const text = await clipboardRead();
        return { ok: true, text: text.slice(0, 100_000) };
      },
    },
  };
}
