// Steam, read from Steam's own local files (nothing is sent anywhere):
//   steamapps/libraryfolders.vdf          → library folders
//   steamapps/appmanifest_<id>.acf        → installed games (name)
//   userdata/<user>/config/localconfig.vdf → LastPlayed / Playtime per game
//   registry.vdf (macOS/Linux) or the Windows registry → RunningAppID
//   config/loginusers.vdf                 → the signed-in account (for the optional Web API)
// Covers come from Steam's local cache, else its public CDN.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";

const run = promisify(execFile);

/** Parse Valve KeyValues text (VDF/ACF) into nested objects; keys lower-cased. Pure. */
export function parseVdf(text) {
  const tokens = [];
  const re = /"((?:[^"\\]|\\.)*)"|([{}])|\/\/[^\n]*|([^\s{}"]+)/g;
  let m;
  while ((m = re.exec(String(text)))) {
    if (m[1] !== undefined) tokens.push({ s: m[1].replace(/\\(.)/g, (_, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c)) });
    else if (m[2]) tokens.push({ b: m[2] });
    else if (m[3]) tokens.push({ s: m[3] });
  }
  let i = 0;
  const obj = () => {
    const out = {};
    while (i < tokens.length) {
      const t = tokens[i++];
      if (t.b === "}") return out;
      if (t.s === undefined) continue;
      const key = t.s.toLowerCase();
      const v = tokens[i++];
      if (!v) break;
      out[key] = v.b === "{" ? obj() : v.s;
    }
    return out;
  };
  return obj();
}

export function steamRoot({ platform = process.platform, env = process.env, home = homedir(), exists = existsSync } = {}) {
  const c =
    platform === "darwin"
      ? [join(home, "Library", "Application Support", "Steam")]
      : platform === "win32"
        ? [join(env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Steam"), join(env.PROGRAMFILES ?? "C:\\Program Files", "Steam")]
        : [join(home, ".steam", "steam"), join(home, ".local", "share", "Steam")];
  return c.find((p) => exists(join(p, "steamapps"))) ?? null;
}

const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
};

/** Installed games across every library folder: [{appid, name, library}]. */
export function installedGames(root) {
  const lib = parseVdf(read(join(root, "steamapps", "libraryfolders.vdf")) ?? "").libraryfolders ?? {};
  const folders = [...new Set([root, ...Object.values(lib).map((f) => (typeof f === "object" ? f.path : f)).filter(Boolean)])];
  const out = [];
  for (const f of folders) {
    const dir = join(f, "steamapps");
    let files = [];
    try {
      files = readdirSync(dir).filter((n) => /^appmanifest_\d+\.acf$/.test(n));
    } catch {
      continue;
    }
    for (const n of files) {
      const a = parseVdf(read(join(dir, n)) ?? "").appstate ?? {};
      // Skip Steam's own runtimes and tools.
      if (!a.appid || /^(Steamworks Common Redistributables|Steam Linux Runtime|Proton)/i.test(a.name ?? "")) continue;
      out.push({ appid: String(a.appid), name: a.name ?? `App ${a.appid}`, library: f });
    }
  }
  return out;
}

/** The most recently signed-in account: { steamid64, accountId, name }. */
export function currentUser(root) {
  const users = parseVdf(read(join(root, "config", "loginusers.vdf")) ?? "").users ?? {};
  const entries = Object.entries(users);
  const [id, u] = entries.find(([, v]) => v.mostrecent === "1") ?? entries[0] ?? [];
  if (!id) return null;
  // userdata folders are named by the 32-bit account id.
  const accountId = String(BigInt(id) - 76561197960265728n);
  return { steamid64: id, accountId, name: u.personaname ?? u.accountname ?? "" };
}

/** LastPlayed (seconds) and Playtime (minutes) per appid for that account. */
export function playStats(root, accountId) {
  const cfg = parseVdf(read(join(root, "userdata", accountId, "config", "localconfig.vdf")) ?? "");
  const apps = cfg.userlocalconfigstore?.software?.valve?.steam?.apps ?? {};
  return Object.fromEntries(Object.entries(apps).map(([id, a]) => [id, { lastPlayed: Number(a.lastplayed) || 0, playtime: Number(a.playtime) || 0 }]));
}

/** The running game's appid, or null. */
export async function runningAppId(root, { platform = process.platform, runImpl = run } = {}) {
  if (platform === "win32") {
    try {
      const { stdout } = await runImpl("reg", ["query", "HKCU\\Software\\Valve\\Steam", "/v", "RunningAppID"], { timeout: 4000, windowsHide: true });
      const v = /RunningAppID\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(stdout);
      const id = v ? parseInt(v[1], 16) : 0;
      return id > 0 ? String(id) : null;
    } catch {
      return null;
    }
  }
  const reg = parseVdf(read(join(root, "registry.vdf")) ?? "");
  const id = reg.registry?.hkcu?.software?.valve?.steam?.runningappid;
  return id && id !== "0" ? String(id) : null;
}

/** A cover image file from Steam's local cache, if there is one. */
export function localCover(root, appid) {
  const c = [join(root, "appcache", "librarycache", appid, "library_600x900.jpg"), join(root, "appcache", "librarycache", `${appid}_library_600x900.jpg`), join(root, "appcache", "librarycache", appid, "header.jpg"), join(root, "appcache", "librarycache", `${appid}_header.jpg`)];
  return c.find((p) => {
    try {
      return statSync(p).size > 0;
    } catch {
      return false;
    }
  }) ?? null;
}

export const cdnCover = (appid) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;
