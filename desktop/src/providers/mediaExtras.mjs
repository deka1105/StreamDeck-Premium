// Stage 7 extras: Plex / Jellyfin servers, radio played on the computer, and
// synced lyrics from LRCLIB. See docs/media-helpers.md.

import { spawn, execFileSync } from "node:child_process";

// ------------------------------------------------------------ media servers ----

const TICKS = 10_000_000; // Jellyfin: 100 ns ticks

/** Normalize a Jellyfin /Sessions reply. Pure (unit-tested). */
export function jellyfinSessions(list = [], users = []) {
  return list
    .filter((s) => s.NowPlayingItem && (!users.length || users.includes(String(s.UserName ?? "").toLowerCase())))
    .map((s) => {
      const it = s.NowPlayingItem;
      return {
        id: s.Id,
        title: it.Name,
        subtitle: it.SeriesName ? `${it.SeriesName}${it.ParentIndexNumber ? ` · S${it.ParentIndexNumber}E${it.IndexNumber}` : ""}` : it.Artists?.join(", ") || (it.ProductionYear ? String(it.ProductionYear) : ""),
        kind: it.Type,
        duration: it.RunTimeTicks ? it.RunTimeTicks / TICKS : null,
        position: s.PlayState?.PositionTicks ? s.PlayState.PositionTicks / TICKS : 0,
        state: s.PlayState?.IsPaused ? "paused" : "playing",
        device: s.DeviceName ?? "",
        user: s.UserName ?? "",
        transcoding: s.PlayState?.PlayMethod === "Transcode",
        poster: it.Id ? `/Items/${it.Id}/Images/Primary?maxHeight=300` : null,
        canControl: s.SupportsRemoteControl !== false,
      };
    });
}

/** Normalize a Plex /status/sessions reply. Pure (unit-tested). */
export function plexSessions(json, users = []) {
  return (json?.MediaContainer?.Metadata ?? [])
    .filter((m) => !users.length || users.includes(String(m.User?.title ?? "").toLowerCase()))
    .map((m) => ({
      id: m.sessionKey ?? m.ratingKey,
      title: m.title,
      subtitle: m.type === "episode" ? `${m.grandparentTitle} · S${m.parentIndex}E${m.index}` : m.type === "track" ? m.grandparentTitle ?? m.parentTitle ?? "" : m.year ? String(m.year) : "",
      kind: m.type,
      duration: m.duration ? m.duration / 1000 : null,
      position: m.viewOffset ? m.viewOffset / 1000 : 0,
      state: m.Player?.state === "paused" ? "paused" : "playing",
      device: m.Player?.title ?? "",
      user: m.User?.title ?? "",
      transcoding: !!m.TranscodeSession,
      poster: m.thumb ?? null,
      canControl: false, // most Plex players don't take remote commands
    }));
}

export function createMediaServers({ getSettings, secrets, fetchImpl = globalThis.fetch, now = Date.now }) {
  const backoff = new Map(); // server id -> retry time
  const info = new Map(); // id -> { version, library, at }
  const lastSeen = new Map(); // id -> [sessions]

  async function call(server, path, { method = "GET" } = {}) {
    const token = secrets?.get(`media:${server.id}`) ?? "";
    const headers = server.type === "plex" ? { "X-Plex-Token": token, Accept: "application/json" } : { Authorization: `MediaBrowser Token="${token}"`, Accept: "application/json" };
    const r = await fetchImpl(new URL(path, server.url).href, { method, headers, signal: AbortSignal.timeout(6000) });
    if (r.status === 401) throw new Error("The server refused the token.");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return method === "GET" ? r.json() : null;
  }

  async function serverInfo(s) {
    const cached = info.get(s.id);
    if (cached && now() - cached.at < 10 * 60_000) return cached;
    let version = "";
    let library = "";
    if (s.type === "jellyfin") {
      version = (await call(s, "/System/Info/Public").catch(() => ({}))).Version ?? "";
      const c = await call(s, "/Items/Counts").catch(() => ({}));
      library = [[c.MovieCount, "movies"], [c.SeriesCount, "shows"], [c.EpisodeCount, "episodes"], [c.SongCount, "songs"]].filter(([n]) => n).map(([n, w]) => `${n.toLocaleString()} ${w}`).join(", ");
    } else {
      version = (await call(s, "/identity").catch(() => ({}))).MediaContainer?.version ?? "";
      const secs = (await call(s, "/library/sections").catch(() => ({}))).MediaContainer?.Directory ?? [];
      library = secs.map((d) => d.title).join(", ");
    }
    const v = { version, library, at: now() };
    info.set(s.id, v);
    return v;
  }

  return {
    periodMs: 3000,
    async sample() {
      const servers = getSettings().mediaServers ?? [];
      const users = (getSettings().mediaUsers ?? []).map((u) => u.toLowerCase());
      const out = [];
      for (const s of servers.slice(0, 4)) {
        if ((backoff.get(s.id) ?? 0) > now()) {
          out.push({ id: s.id, name: s.name, type: s.type, online: false, sessions: [] });
          continue;
        }
        try {
          const sessions = s.type === "jellyfin" ? jellyfinSessions(await call(s, "/Sessions?activeWithinSeconds=120"), users) : plexSessions(await call(s, "/status/sessions"), users);
          lastSeen.set(s.id, sessions);
          const meta = await serverInfo(s);
          out.push({ id: s.id, name: s.name, type: s.type, online: true, version: meta.version, library: meta.library, sessions: [...sessions].sort((a, b) => (a.state === "playing" ? -1 : 1) - (b.state === "playing" ? -1 : 1)) });
        } catch (err) {
          backoff.set(s.id, now() + 60_000);
          out.push({ id: s.id, name: s.name, type: s.type, online: false, error: err.message, sessions: [] });
        }
      }
      return { servers: out, configured: servers.length > 0, at: now() };
    },
    /** Jellyfin transport for a session the host has seen. */
    async control(serverId, sessionId, command, value) {
      const s = (getSettings().mediaServers ?? []).find((x) => x.id === serverId);
      if (!s || s.type !== "jellyfin") throw new Error("Remote control works with Jellyfin servers.");
      if (!(lastSeen.get(serverId) ?? []).some((x) => x.id === sessionId)) throw new Error("That session has ended.");
      const id = encodeURIComponent(sessionId);
      const verb = { playpause: "PlayPause", next: "NextTrack", previous: "PreviousTrack" }[command];
      if (verb) return call(s, `/Sessions/${id}/Playing/${verb}`, { method: "POST" });
      if (command === "seek") return call(s, `/Sessions/${id}/Playing/Seek?SeekPositionTicks=${Math.round(Math.max(0, Number(value) || 0) * TICKS)}`, { method: "POST" });
      throw new Error("unknown command");
    },
    /** A session poster as a data URI (only for sessions the host has seen). */
    async poster(serverId, sessionId) {
      const s = (getSettings().mediaServers ?? []).find((x) => x.id === serverId);
      const sess = (lastSeen.get(serverId) ?? []).find((x) => x.id === sessionId);
      if (!s || !sess?.poster) return null;
      const token = secrets?.get(`media:${s.id}`) ?? "";
      const u = new URL(sess.poster, s.url);
      const headers = s.type === "plex" ? { "X-Plex-Token": token } : { Authorization: `MediaBrowser Token="${token}"` };
      const r = await fetchImpl(u.href, { headers, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      return buf.length < 3_000_000 ? `data:${r.headers.get("content-type") ?? "image/jpeg"};base64,${buf.toString("base64")}` : null;
    },
  };
}

// ------------------------------------------------------------------- radio ----

const PLAYERS = [
  ["mpv", (u) => ["--no-video", "--really-quiet", u]],
  ["ffplay", (u) => ["-nodisp", "-loglevel", "quiet", u]],
  ["cvlc", (u) => ["--intf", "dummy", u]],
  ["vlc", (u) => ["--intf", "dummy", u]],
];

function which(bin) {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [bin], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Parse "Name | https://stream" lines. Pure. */
export function parseStations(lines = []) {
  return lines
    .map((l) => String(l).split("|").map((x) => x.trim()))
    .map((p) => (p.length >= 2 ? { name: p[0], url: p.at(-1) } : { name: p[0], url: p[0] }))
    .filter((s) => /^https?:\/\/\S+$/.test(s.url))
    .slice(0, 20);
}

export function createRadio({ dryRun = false, spawnImpl = spawn, hasBin = which } = {}) {
  let child = null;
  let playing = null;
  const stop = () => {
    if (child) {
      child.kill();
      child = null;
    }
    playing = null;
  };
  return {
    periodMs: 3000,
    async sample() {
      return { playing, player: PLAYERS.find(([b]) => hasBin(b))?.[0] ?? null, at: Date.now() };
    },
    play(station) {
      stop();
      const found = PLAYERS.find(([b]) => hasBin(b));
      if (!found) throw new Error("Install mpv (or ffplay / VLC) on the computer to play radio.");
      playing = station.name;
      if (dryRun) {
        console.log(`  (dry-run) radio ${found[0]} ${station.url}`);
        return { ok: true, player: found[0] };
      }
      child = spawnImpl(found[0], found[1](station.url), { stdio: "ignore", windowsHide: true });
      child.on("exit", () => {
        if (child && child.exitCode !== null) {
          child = null;
          playing = null;
        }
      });
      return { ok: true, player: found[0] };
    },
    stop,
  };
}

// ------------------------------------------------------------------ lyrics ----

/** Parse LRC "[mm:ss.xx] line" into [{t (s), text}] sorted. Pure (unit-tested). */
export function parseLrc(lrc) {
  const out = [];
  for (const line of String(lrc ?? "").split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d+):(\d{1,2}(?:\.\d+)?)\]/g)];
    const text = line.replace(/\[[^\]]*\]/g, "").trim();
    for (const m of stamps) out.push({ t: Number(m[1]) * 60 + Number(m[2]), text });
  }
  return out.sort((a, b) => a.t - b.t);
}

export function createLyrics({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const cache = new Map(); // song key -> result
  let blockedUntil = 0;
  let fails = 0;
  return {
    async get({ title, artist, album, duration }) {
      const key = `${title}|${artist}|${album}|${Math.round(duration ?? 0)}`;
      if (cache.has(key)) return cache.get(key);
      if (now() < blockedUntil) return { ok: false, error: "Lyrics service is resting after an error; trying again soon." };
      const q = new URLSearchParams({ track_name: title ?? "", artist_name: artist ?? "", album_name: album ?? "" });
      if (duration) q.set("duration", String(Math.round(duration)));
      try {
        const r = await fetchImpl(`https://lrclib.net/api/get?${q}`, { headers: { "user-agent": "DeskAssist/1.2 (desk panel)" }, signal: AbortSignal.timeout(8000) });
        let result;
        if (r.status === 404) result = { ok: true, found: false };
        else if (!r.ok) throw new Error(`HTTP ${r.status}`);
        else {
          const j = await r.json();
          result = { ok: true, found: !!(j.syncedLyrics || j.plainLyrics), synced: parseLrc(j.syncedLyrics), plain: j.plainLyrics ?? "" };
        }
        fails = 0;
        cache.set(key, result);
        if (cache.size > 50) cache.delete(cache.keys().next().value);
        return result;
      } catch (err) {
        fails++;
        blockedUntil = now() + Math.min(30, 2 ** (fails - 1)) * 60_000;
        return { ok: false, error: err.message };
      }
    },
  };
}
