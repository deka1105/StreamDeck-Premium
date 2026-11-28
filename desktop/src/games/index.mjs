// `games` kind: the game being played (Steam or one you added), the five most
// recent, and optionally friends in game (Steam Web API key). Read only while
// a games widget is shown. Launching is opt-in and only for listed games.

import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { steamRoot, installedGames, currentUser, playStats, runningAppId, localCover, cdnCover } from "./steam.mjs";

const run = promisify(execFile);

/** Process names (and command lines where cheap) for matching non-Steam games. */
export async function processList({ platform = process.platform, runImpl = run } = {}) {
  if (platform === "win32") {
    const { stdout } = await runImpl("tasklist", ["/fo", "csv", "/nh"], { timeout: 8000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    return stdout.split(/\r?\n/).map((l) => /^"([^"]+)"/.exec(l)?.[1]).filter(Boolean);
  }
  const { stdout } = await runImpl("ps", ["-axo", "args="], { timeout: 8000, maxBuffer: 8 * 1024 * 1024 });
  return stdout.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Does any running process match this game's text (name, path or command line)? Pure. */
export const matchGame = (procs, match) => {
  const m = String(match ?? "").trim().toLowerCase();
  return !!m && procs.some((p) => p.toLowerCase().includes(m));
};

export function createGames({ dir, getSettings = () => ({}), getSecret = () => null, isWanted = () => true, platform = process.platform, root = steamRoot({ platform }), procs = processList, fetchImpl = fetch, execute = async () => {}, now = Date.now, log = console.log } = {}) {
  const file = dir ? join(dir, "games.json") : null;
  let custom = {}; // id -> { lastPlayed, totalMin }
  try {
    custom = file ? JSON.parse(readFileSync(file, "utf8")) : {};
  } catch {
    custom = {};
  }
  const save = () => {
    if (!file) return;
    writeFileSync(`${file}.tmp`, JSON.stringify(custom));
    renameSync(`${file}.tmp`, file);
  };
  const cfg = () => getSettings()?.games ?? {};
  let session = null; // { key, since }
  let friends = { at: 0, list: [], error: null };
  const covers = new Map();

  async function steamState() {
    if (!root) return null;
    const user = currentUser(root);
    const games = installedGames(root);
    const stats = user ? playStats(root, user.accountId) : {};
    const byId = new Map(games.map((g) => [g.appid, g]));
    const running = await runningAppId(root, { platform });
    const recent = Object.entries(stats)
      .filter(([id, s]) => s.lastPlayed > 0 && byId.has(id))
      .sort((a, b) => b[1].lastPlayed - a[1].lastPlayed)
      .slice(0, 5)
      .map(([id, s]) => ({ id: `steam:${id}`, appid: id, name: byId.get(id).name, lastPlayed: s.lastPlayed * 1000, playtimeMin: s.playtime }));
    return { user, running: running ? { id: `steam:${running}`, appid: running, name: byId.get(running)?.name ?? `App ${running}` } : null, recent, installed: games.length };
  }

  async function friendsInGame(steamid64) {
    const key = getSecret("steam:key");
    if (!key || !steamid64) return friends;
    if (now() - friends.at < 60_000) return friends;
    friends.at = now();
    try {
      const fl = await (await fetchImpl(`https://api.steampowered.com/ISteamUser/GetFriendList/v1/?key=${encodeURIComponent(key)}&steamid=${steamid64}&relationship=friend`, { signal: AbortSignal.timeout(8000) })).json();
      const ids = (fl.friendslist?.friends ?? []).map((f) => f.steamid).slice(0, 100);
      if (!ids.length) return (friends = { at: now(), list: [], error: null });
      const ps = await (await fetchImpl(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(key)}&steamids=${ids.join(",")}`, { signal: AbortSignal.timeout(8000) })).json();
      const list = (ps.response?.players ?? []).filter((p) => p.gameextrainfo).map((p) => ({ name: p.personaname, game: p.gameextrainfo, appid: p.gameid ?? null }));
      friends = { at: now(), list, error: null };
    } catch (err) {
      friends = { at: now(), list: friends.list, error: `Steam Web API: ${err.message}` };
    }
    return friends;
  }

  return {
    periodMs: 5000,
    async sample() {
      if (!isWanted()) return null;
      const steam = await steamState().catch(() => null);
      // Non-Steam games: matched against running programs.
      const list = cfg().custom ?? [];
      let playing = steam?.running ?? null;
      if (list.length) {
        const ps = await procs({ platform }).catch(() => []);
        const hit = list.find((g) => matchGame(ps, g.match));
        if (hit && !playing) playing = { id: `custom:${hit.id}`, name: hit.name, custom: true };
      }
      // Session bookkeeping (start time; last played / total for non-Steam games).
      const key = playing?.id ?? null;
      if (key !== session?.key) {
        if (session?.key?.startsWith("custom:")) {
          const id = session.key.slice(7);
          const c = (custom[id] ??= { lastPlayed: 0, totalMin: 0 });
          c.lastPlayed = now();
          c.totalMin += Math.round((now() - session.since) / 60_000);
          save();
        }
        session = key ? { key, since: now() } : null;
        if (key) log(`🎮 playing ${playing.name}`);
      }
      const customRecent = list
        .filter((g) => custom[g.id]?.lastPlayed)
        .map((g) => ({ id: `custom:${g.id}`, name: g.name, lastPlayed: custom[g.id].lastPlayed, playtimeMin: custom[g.id].totalMin, custom: true }));
      const recent = [...(steam?.recent ?? []), ...customRecent].sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 5);
      const f = steam?.user ? await friendsInGame(steam.user.steamid64) : friends;
      return {
        steam: !!steam,
        user: steam?.user?.name ?? "",
        playing: playing ? { ...playing, since: session?.since ?? now() } : null,
        recent,
        launch: cfg().launch === true,
        friends: getSecret("steam:key") ? f.list : null,
        friendsError: f.error,
        at: now(),
      };
    },
    /** Cover art as a data URI: local cache first, then Steam's CDN (or the URL set for a custom game). */
    async cover(id) {
      if (covers.has(id)) return covers.get(id);
      let src = null;
      try {
        if (id.startsWith("steam:") && /^\d+$/.test(id.slice(6))) {
          const appid = id.slice(6);
          const local = root ? localCover(root, appid) : null;
          if (local) src = `data:image/jpeg;base64,${readFileSync(local).toString("base64")}`;
          else {
            const r = await fetchImpl(cdnCover(appid), { signal: AbortSignal.timeout(8000) });
            if (r.ok) src = `data:image/jpeg;base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
          }
        } else if (id.startsWith("custom:")) {
          const g = (cfg().custom ?? []).find((x) => x.id === id.slice(7));
          if (g?.cover && /^https:\/\//.test(g.cover)) {
            const r = await fetchImpl(g.cover, { signal: AbortSignal.timeout(8000) });
            const type = r.headers.get("content-type") ?? "";
            if (r.ok && /^image\//.test(type)) src = `data:${type.split(";")[0]};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
          }
        }
      } catch {
        src = null;
      }
      if (covers.size > 60) covers.clear();
      covers.set(id, src);
      return src;
    },
    /** Launch a game from the recent list — only if launching is turned on. */
    async launch(id) {
      if (cfg().launch !== true) return { ok: false, error: "Launching games from the panel is off (editor › Settings › Games)." };
      if (id.startsWith("steam:") && /^\d+$/.test(id.slice(6))) {
        const steam = await steamState();
        if (!steam?.recent.some((g) => g.id === id) && !installedGames(root).some((g) => g.appid === id.slice(6))) return { ok: false, error: "That game isn't installed." };
        await execute({ type: "url", target: `steam://rungameid/${id.slice(6)}` });
        return { ok: true };
      }
      const g = (cfg().custom ?? []).find((x) => `custom:${x.id}` === id);
      if (!g?.launch) return { ok: false, error: "No launch target set for this game." };
      await execute(/^[a-z][a-z0-9+.-]*:\/\//i.test(g.launch) ? { type: "url", target: g.launch } : { type: "app", target: g.launch });
      return { ok: true };
    },
    /** Editor: running programs to pick a non-Steam game from. */
    async running() {
      const ps = await procs({ platform }).catch(() => []);
      const names = ps.map((p) => p.split(/[\\/]/).pop().split(" ")[0]).filter((n) => n && !/^(kernel|launchd|svchost|System|Registry|smss|csrss|wininit|services|lsass|winlogon|dwm|explorer|zsh|bash|sh|node)/i.test(n));
      return [...new Set(names)].sort((a, b) => a.localeCompare(b)).slice(0, 300);
    },
  };
}
