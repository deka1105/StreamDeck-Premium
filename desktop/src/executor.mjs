// OS action executor — ported from host-agent/agent.mjs.
//
// Kept as a dependency-free ESM module so it can run inside the Electron main
// process (later) and be imported by tests. Dispatches by action type:
//   app   -> open -a / start / bare exec
//   url   -> open / start / xdg-open
//   keys  -> AppleScript System Events (macOS) / PowerShell SendKeys (Windows)
//   text  -> type a literal string into the focused app (keystroke / SendKeys)
//   shell -> raw exec (arbitrary — gated behind pairing at the network layer)

import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const platform = process.platform; // 'darwin' | 'win32' | 'linux'

const FIELD_BY_TYPE = { app: "target", url: "target", keys: "combo", shell: "command", text: "text" };

/** Minimal shape check mirroring the Next app's validateAction intent. */
export function validateAction(action) {
  if (!action || typeof action !== "object") return null;
  const field = FIELD_BY_TYPE[action.type];
  if (!field) return null;
  const value = action[field];
  if (typeof value !== "string" || value.length === 0 || value.length > 4096) return null;
  return { type: action.type, [field]: value };
}

/**
 * Decide whether a shell command may run, given the host's policy.
 *   allowShell=false           → blocked (shell is opt-in; off by default)
 *   allowShell=true, no list    → allowed (any command)
 *   allowShell=true, allowlist  → allowed only if the exact (trimmed) command is listed
 * Returns { ok, reason }. Kept pure + exported so it's unit-testable and reusable.
 */
export function shellDecision(command, { allowShell = false, shellAllowlist = null } = {}) {
  if (!allowShell) {
    return { ok: false, reason: "Shell commands are disabled on this host. Enable “Allow shell commands” in the tray menu." };
  }
  if (Array.isArray(shellAllowlist) && shellAllowlist.length > 0) {
    const cmd = String(command).trim();
    if (!shellAllowlist.some((a) => String(a).trim() === cmd)) {
      return { ok: false, reason: "Command is not in the host's shell allowlist." };
    }
  }
  return { ok: true, reason: "" };
}

export async function execute(action, { dryRun = false, allowShell = false, shellAllowlist = null } = {}) {
  // Gate the shell RCE path *before* dry-run, so a blocked command is reported as
  // blocked even in a preview run.
  if (action.type === "shell") {
    const d = shellDecision(action.command, { allowShell, shellAllowlist });
    if (!d.ok) throw new Error(d.reason);
  }
  if (dryRun) {
    console.log(`  (dry-run) ${JSON.stringify(action)}`);
    return;
  }
  switch (action.type) {
    case "app":
      return launchApp(action.target);
    case "url":
      return openUrl(action.target);
    case "keys":
      return sendKeys(action.combo);
    case "shell":
      return sh(action.command);
    case "text":
      return typeText(action.text);
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

async function launchApp(name) {
  if (platform === "darwin") return sh(`open -a ${q(name)}`);
  if (platform === "win32") return sh(`start "" ${q(name)}`);
  return sh(q(name));
}

async function openUrl(url) {
  if (platform === "darwin") return sh(`open ${q(url)}`);
  if (platform === "win32") return sh(`start "" ${q(url)}`);
  return sh(`xdg-open ${q(url)}`);
}

async function sendKeys(combo) {
  if (platform === "darwin") return sh(`osascript -e ${q(comboToAppleScript(combo))}`);
  if (platform === "win32") return winSendKeys(comboToSendKeys(combo));
  throw new Error(`Key shortcuts aren't implemented for ${platform}`);
}

// Type a literal string into the focused app on the host.
async function typeText(text) {
  if (platform === "darwin") {
    const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return sh(`osascript -e ${q(`tell application "System Events" to keystroke "${escaped}"`)}`);
  }
  if (platform === "win32") {
    // Escape SendKeys metacharacters; turn newlines into Enter presses.
    const sk = text.replace(/([+^%~(){}\[\]])/g, "{$1}").replace(/\r?\n/g, "{ENTER}");
    return winSendKeys(sk);
  }
  throw new Error(`Typing text isn't implemented for ${platform}`);
}

// Name of the focused application on the host — powers the phone's "intuitive"
// auto profile switching. Observation-only; never executes anything.
export async function frontmostApp() {
  if (platform === "darwin") {
    try {
      const out = await sh(
        `osascript -e 'tell application "System Events" to name of first application process whose frontmost is true'`,
      );
      return out.trim() || null;
    } catch {
      return null; // Accessibility not granted, or nothing frontmost
    }
  }
  return null; // Windows/Linux: not implemented yet
}

// Names of the apps with a UI currently running (what you'd see in ⌘-Tab / Dock),
// sorted and de-duped. Powers the phone's "Apps" screen. Observation-only.
export async function runningApps() {
  if (platform === "darwin") {
    try {
      const out = await sh(
        `osascript -e 'tell application "System Events" to get name of every application process whose background only is false'`,
      );
      const list = out.trim() ? out.trim().split(",").map((s) => s.trim()).filter(Boolean) : [];
      return [...new Set(list)].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    } catch {
      return []; // Accessibility not granted
    }
  }
  return []; // Windows/Linux: not implemented yet
}

// The SendKeys string is passed via an env var so we never have to escape it
// through the shell — PowerShell reads $env:SPD_KEYS.
async function winSendKeys(sendKeysString) {
  const script =
    "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait($env:SPD_KEYS)";
  const { stderr } = await execFileAsync("powershell", ["-NoProfile", "-STA", "-Command", script], {
    env: { ...process.env, SPD_KEYS: sendKeysString },
    windowsHide: true,
  });
  if (stderr && stderr.trim()) console.error("  stderr:", stderr.trim());
}

// --- macOS keystroke translation (kept in sync with src/lib/keys.ts) ---------

const MODIFIERS = {
  cmd: "command down", command: "command down",
  ctrl: "control down", control: "control down",
  alt: "option down", opt: "option down", option: "option down",
  shift: "shift down",
};

const KEY_CODES = {
  return: 36, enter: 36, tab: 48, space: 49, delete: 51, backspace: 51,
  escape: 53, esc: 53, left: 123, right: 124, down: 125, up: 126,
  home: 115, end: 119, pageup: 116, pagedown: 121,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100,
  f9: 101, f10: 109, f11: 103, f12: 111,
};

export function comboToAppleScript(combo) {
  const parts = combo.toLowerCase().split("+").map((p) => p.trim()).filter(Boolean);
  const mods = [];
  let key = null;
  for (const part of parts) {
    if (part in MODIFIERS) mods.push(MODIFIERS[part]);
    else key = part;
  }
  if (!key) throw new Error(`No key in combo: "${combo}"`);
  const using = mods.length ? ` using {${mods.join(", ")}}` : "";
  if (key in KEY_CODES) {
    return `tell application "System Events" to key code ${KEY_CODES[key]}${using}`;
  }
  if (key.length === 1) {
    const esc = key === '"' ? '\\"' : key;
    return `tell application "System Events" to keystroke "${esc}"${using}`;
  }
  throw new Error(`Unknown key "${key}" in combo "${combo}"`);
}

// --- Windows keystroke translation (System.Windows.Forms.SendKeys) -----------
// SendKeys prefixes: ^ = Ctrl, % = Alt, + = Shift. macOS "cmd" maps to Ctrl.
// Limitations: no Windows/Super key, and secure sequences (Ctrl+Alt+Del) can't
// be synthesized.

const WIN_MODIFIERS = {
  cmd: "^", command: "^", ctrl: "^", control: "^",
  alt: "%", opt: "%", option: "%", shift: "+",
};

const WIN_KEYS = {
  return: "{ENTER}", enter: "{ENTER}", tab: "{TAB}", space: " ",
  delete: "{DELETE}", backspace: "{BACKSPACE}", escape: "{ESC}", esc: "{ESC}",
  left: "{LEFT}", right: "{RIGHT}", down: "{DOWN}", up: "{UP}",
  home: "{HOME}", end: "{END}", pageup: "{PGUP}", pagedown: "{PGDN}",
  f1: "{F1}", f2: "{F2}", f3: "{F3}", f4: "{F4}", f5: "{F5}", f6: "{F6}",
  f7: "{F7}", f8: "{F8}", f9: "{F9}", f10: "{F10}", f11: "{F11}", f12: "{F12}",
};

// Characters that are special in SendKeys and must be wrapped in braces.
const WIN_ESCAPE = new Set(["+", "^", "%", "~", "(", ")", "{", "}", "[", "]"]);

export function comboToSendKeys(combo) {
  const parts = combo.toLowerCase().split("+").map((p) => p.trim()).filter(Boolean);
  const mods = [];
  let key = null;
  for (const part of parts) {
    if (part in WIN_MODIFIERS) mods.push(WIN_MODIFIERS[part]);
    else key = part;
  }
  if (!key) throw new Error(`No key in combo: "${combo}"`);

  let token;
  if (key in WIN_KEYS) token = WIN_KEYS[key];
  else if (key.length === 1) token = WIN_ESCAPE.has(key) ? `{${key}}` : key;
  else throw new Error(`Unknown key "${key}" in combo "${combo}"`);

  return [...new Set(mods)].join("") + token;
}

// --- helpers -----------------------------------------------------------------

function q(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

async function sh(command) {
  const { stdout, stderr } = await execAsync(command);
  if (stderr && stderr.trim()) console.error("  stderr:", stderr.trim());
  return stdout;
}
