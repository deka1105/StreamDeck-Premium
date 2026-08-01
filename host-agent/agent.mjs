#!/usr/bin/env node
// streamPhoneDeck host agent
// -----------------------------------------------------------------------------
// Runs on the computer you want to control. It connects to the deck server's
// Server-Sent Events stream and executes each action locally: launching apps,
// opening URLs, sending keyboard shortcuts, or running shell commands.
//
// A browser tab (the /host monitor page) is sandboxed and cannot do any of
// this — that is why the agent is a separate Node process.
//
// Usage:
//   npm run agent                 # connects to http://localhost:3000
//   DECK_URL=http://192.168.1.153:3000 npm run agent
//
// macOS note: sending keystrokes uses AppleScript "System Events", which needs
// Accessibility permission. The first keystroke action will prompt; grant the
// terminal (or Node) under System Settings → Privacy & Security → Accessibility.

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const BASE_URL = (process.env.DECK_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EVENTS_URL = `${BASE_URL}/api/events`;
const FOREGROUND_URL = `${BASE_URL}/api/foreground`;
const APPS_URL = `${BASE_URL}/api/apps`;
const platform = process.platform; // 'darwin' | 'win32' | 'linux'
// How often to check the focused app for intuitive profile switching.
const FOREGROUND_POLL_MS = 1500;
// How often to report the list of running apps (changes slowly — slower cadence).
const APPS_POLL_MS = 3000;
// When set, resolve each action to the command it *would* run, but don't run it.
const DRY_RUN = ["1", "true", "yes"].includes((process.env.DECK_DRY_RUN ?? "").toLowerCase());

// --- Action execution --------------------------------------------------------

async function execute(action) {
  if (DRY_RUN) {
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
      return runShell(action.command);
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

async function launchApp(name) {
  if (platform === "darwin") return sh(`open -a ${q(name)}`);
  if (platform === "win32") return sh(`start "" ${q(name)}`);
  return sh(q(name)); // linux: assume it's on PATH
}

async function openUrl(url) {
  if (platform === "darwin") return sh(`open ${q(url)}`);
  if (platform === "win32") return sh(`start "" ${q(url)}`);
  return sh(`xdg-open ${q(url)}`); // linux
}

async function runShell(command) {
  return sh(command); // intentionally raw — see security note in README
}

async function sendKeys(combo) {
  if (platform !== "darwin") {
    throw new Error(`Key shortcuts are only implemented for macOS (got ${platform})`);
  }
  return sh(`osascript -e ${q(comboToAppleScript(combo))}`);
}

// --- macOS keystroke translation ---------------------------------------------

const MODIFIERS = {
  cmd: "command down",
  command: "command down",
  ctrl: "control down",
  control: "control down",
  alt: "option down",
  opt: "option down",
  option: "option down",
  shift: "shift down",
};

// key name -> macOS virtual key code, for keys that aren't a literal character.
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
    else key = part; // last non-modifier wins
  }
  if (!key) throw new Error(`No key in combo: "${combo}"`);

  const using = mods.length ? ` using {${mods.join(", ")}}` : "";

  if (key in KEY_CODES) {
    return `tell application "System Events" to key code ${KEY_CODES[key]}${using}`;
  }
  if (key.length === 1) {
    // A single literal character (letter, digit, punctuation).
    const esc = key === '"' ? '\\"' : key;
    return `tell application "System Events" to keystroke "${esc}"${using}`;
  }
  throw new Error(`Unknown key "${key}" in combo "${combo}"`);
}

// --- Helpers -----------------------------------------------------------------

// Quote an argument for /bin/sh (single-quote wrapping).
function q(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

async function sh(command) {
  const { stdout, stderr } = await execAsync(command);
  if (stderr && stderr.trim()) console.error("  stderr:", stderr.trim());
  return stdout;
}

// --- SSE client (no dependencies) --------------------------------------------

async function connect() {
  let res;
  try {
    res = await fetch(EVENTS_URL, { headers: { Accept: "text/event-stream" } });
  } catch {
    return false; // server not reachable yet
  }
  if (!res.ok || !res.body) return false;

  console.log(`✓ Connected to ${EVENTS_URL}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    let sep;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      handleFrame(frame);
    }
  }
  return true;
}

function handleFrame(frame) {
  let event = "message";
  const dataLines = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith(":")) continue; // heartbeat comment
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (event !== "action" || dataLines.length === 0) return;

  let payload;
  try {
    payload = JSON.parse(dataLines.join("\n"));
  } catch {
    return;
  }

  const { label, action } = payload;
  console.log(`▶ ${label}  [${action.type}]`);
  execute(action).catch((err) => console.error(`  ✗ ${err.message}`));
}

// --- Foreground app reporting (macOS) ----------------------------------------
// Powers "intuitive" mode: the deck maps focused apps to profiles. We only POST
// when the focused app changes, so the server holds the latest for the deck to
// poll. Observation-only — never executes anything.

async function frontmostApp() {
  if (platform !== "darwin") return null; // Windows/Linux: not implemented yet
  try {
    const out = await sh(
      `osascript -e 'tell application "System Events" to name of first application process whose frontmost is true'`,
    );
    return out.trim() || null;
  } catch {
    return null; // Accessibility not granted yet, or nothing frontmost
  }
}

function startForegroundReporter() {
  if (platform !== "darwin") {
    console.log("  (intuitive mode: focused-app reporting is macOS-only for now)");
    return;
  }
  let lastApp = null;
  const tick = async () => {
    const app = await frontmostApp();
    if (!app || app === lastApp) return;
    lastApp = app;
    try {
      await fetch(FOREGROUND_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ app }),
      });
      console.log(`  ◆ focus → ${app}`);
    } catch {
      lastApp = null; // server unreachable — re-report this app next tick
    }
  };
  setInterval(tick, FOREGROUND_POLL_MS);
}

// Names of the apps with a UI currently running (what you'd see in ⌘-Tab / Dock).
async function runningApps() {
  if (platform !== "darwin") return null; // Windows/Linux: not implemented yet
  try {
    const out = await sh(
      `osascript -e 'tell application "System Events" to get name of every application process whose background only is false'`,
    );
    const list = out.trim() ? out.trim().split(",").map((s) => s.trim()).filter(Boolean) : [];
    return [...new Set(list)].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  } catch {
    return null; // Accessibility not granted yet
  }
}

function startAppsReporter() {
  if (platform !== "darwin") {
    console.log("  (running-apps list is macOS-only for now)");
    return;
  }
  let lastKey = "";
  const tick = async () => {
    const apps = await runningApps();
    if (!apps) return;
    const frontmost = await frontmostApp();
    const key = `${frontmost}|${apps.join(",")}`;
    if (key === lastKey) return; // unchanged — skip the POST
    lastKey = key;
    try {
      await fetch(APPS_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apps, frontmost }),
      });
    } catch {
      lastKey = ""; // server unreachable — re-report next tick
    }
  };
  setInterval(tick, APPS_POLL_MS);
}

// --- Main loop with reconnect ------------------------------------------------

async function main() {
  console.log(`streamPhoneDeck agent — platform: ${platform}${DRY_RUN ? " (DRY RUN)" : ""}`);
  console.log(`Watching ${EVENTS_URL} … (Ctrl+C to stop)`);
  startForegroundReporter();
  for (;;) {
    const ok = await connect();
    if (!ok) process.stdout.write(".");
    // Either the server was unreachable or the stream ended; retry shortly.
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// Only start the agent when run directly (`node host-agent/agent.mjs`), so the
// pure helpers above can be imported by tests without launching the loop.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
