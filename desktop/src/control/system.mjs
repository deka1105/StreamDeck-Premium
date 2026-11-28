// Stage 12 system controls: Windows power plans and services, display
// brightness (external monitors over DDC/CI through the helper, a laptop's
// own panel through WMI), and lock / sleep. macOS gets lock and sleep.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Parse `powercfg /list` (any Windows language: GUID, then the name in brackets, `*` = active). Pure. */
export function parsePowercfgList(stdout) {
  const plans = [];
  for (const line of String(stdout).split(/\r?\n/)) {
    const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s+\((.+?)\)\s*(\*)?\s*$/i.exec(line);
    if (m) plans.push({ guid: m[1].toLowerCase(), name: m[2], active: !!m[3] });
  }
  return plans;
}

/** Parse `Get-Service | ConvertTo-Json` output (one object or an array). Pure. */
export function parseServices(json) {
  const list = Array.isArray(json) ? json : json ? [json] : [];
  // Status is 4 (Running) / 1 (Stopped) as numbers, or strings on newer PowerShell.
  const state = (s) => ({ 4: "running", 1: "stopped", 2: "starting", 3: "stopping", 7: "paused" })[s] ?? String(s ?? "").toLowerCase();
  return list.map((s) => ({ name: s.Name, display: s.DisplayName ?? s.Name, state: state(s.Status) }));
}

const SVC_RE = /^[A-Za-z0-9_.\- ]{1,80}$/;

export function createSystemControls({ platform = process.platform, helper, getSettings = () => ({}), runImpl = run, dryRun = false, log = console.log } = {}) {
  const win = platform === "win32";
  const mac = platform === "darwin";
  const ps = (script, env = {}) => runImpl("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 15_000, windowsHide: true, env: { ...process.env, ...env } });
  const services = () => (getSettings()?.system?.services ?? []).filter((n) => SVC_RE.test(n));

  async function laptopBrightness() {
    try {
      const { stdout } = await ps("(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness");
      const v = Number(stdout.trim());
      return Number.isFinite(v) && stdout.trim() !== "" ? v : null;
    } catch {
      return null;
    }
  }

  return {
    periodMs: 5000,
    async sample() {
      const out = { platform, at: Date.now(), canLock: win || mac, canSleep: win || mac };
      if (!win) return { ...out, plans: [], services: [], displays: [] };
      const [plans, svc, monitors, laptop] = await Promise.all([
        runImpl("powercfg", ["/list"], { timeout: 10_000, windowsHide: true }).then((r) => parsePowercfgList(r.stdout), () => []),
        services().length
          ? ps("Get-Service -Name ($env:DA_SVC -split '\\|') -ErrorAction SilentlyContinue | Select-Object Name,DisplayName,Status | ConvertTo-Json -Compress", { DA_SVC: services().join("|") }).then((r) => parseServices(r.stdout.trim() ? JSON.parse(r.stdout) : null), () => [])
          : [],
        helper?.available ? helper.call("monitors").catch(() => []) : [],
        laptopBrightness(),
      ]);
      const displays = [...(laptop !== null ? [{ index: -1, name: "Built-in display", percent: laptop }] : []), ...monitors];
      return { ...out, plans, services: svc, displays };
    },
    methods: {
      async setPlan({ guid }) {
        if (!win) throw new Error("Power plans are a Windows feature.");
        const plans = parsePowercfgList((await runImpl("powercfg", ["/list"], { timeout: 10_000, windowsHide: true })).stdout);
        if (!plans.some((p) => p.guid === String(guid).toLowerCase())) return { ok: false, error: "No such power plan." };
        if (dryRun) return log(`  (dry-run) power plan ${guid}`), { ok: true };
        await runImpl("powercfg", ["/setactive", String(guid)], { timeout: 10_000, windowsHide: true });
        log(`⚡ power plan → ${plans.find((p) => p.guid === String(guid).toLowerCase()).name}`);
        return { ok: true };
      },
      async service({ name, action }) {
        if (!win) throw new Error("Services are a Windows feature.");
        if (!services().includes(name)) return { ok: false, error: "That service isn't on your list (Settings › Windows)." };
        const verb = { start: "Start-Service", stop: "Stop-Service", restart: "Restart-Service" }[action];
        if (!verb) return { ok: false, error: "Unknown action." };
        if (dryRun) return log(`  (dry-run) ${verb} ${name}`), { ok: true };
        try {
          await ps(`${verb} -Name $env:DA_SVC -ErrorAction Stop`, { DA_SVC: name });
        } catch (err) {
          const msg = String(err.stderr || err.message);
          return { ok: false, error: /denied|access|elevat/i.test(msg) ? "Windows needs administrator rights for that service. Run DeskAssist as administrator, or pick a service your account can control." : msg.split("\n")[0].slice(0, 200) };
        }
        log(`⚙ ${action} service ${name}`);
        return { ok: true };
      },
      async setBrightness({ index, percent }) {
        if (!win) throw new Error("Brightness from the panel works on Windows for now (macOS comes with desk edges).");
        const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
        if (Number(index) === -1) {
          await ps("$m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | Select-Object -First 1; Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{Timeout=1; Brightness=[byte]$env:DA_B} | Out-Null", { DA_B: String(p) });
        } else await helper.call("setBrightness", { index: Number(index), percent: p });
        return { ok: true };
      },
      // Lock and sleep need a confirmed hold on the panel; the host checks the flag too.
      async power({ action, confirm }) {
        if (confirm !== true) return { ok: false, error: "Hold the button to confirm." };
        if (!["lock", "sleep"].includes(action)) return { ok: false, error: "Unknown action." };
        if (dryRun) return log(`  (dry-run) ${action}`), { ok: true };
        log(`⏻ ${action} from the panel`);
        if (win) await helper.call(action);
        else if (mac) await runImpl("pmset", [action === "lock" ? "displaysleepnow" : "sleepnow"], { timeout: 5000 });
        else throw new Error("Lock and sleep work on Windows and macOS.");
        return { ok: true };
      },
    },
  };
}
