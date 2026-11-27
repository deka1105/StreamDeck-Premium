// `media` kind: what's playing on the computer, plus transport, seek and
// artwork (docs/media-helpers.md). macOS reads Spotify / Music through their
// AppleScript dictionaries; Windows reads the System Media Transport Controls
// through PowerShell + WinRT. Artwork is fetched once per track and served by
// id (media.art), so it never rides along every 2-second sample.

import { execFile } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const SEP = "<|>";

// ------------------------------------------------------------------- macOS ----

const osa = async (script, timeout = 4000) => (await run("osascript", ["-e", script], { timeout })).stdout.trim();

async function runningPlayers() {
  const out = await osa(`tell application "System Events" to get name of every process whose name is "Spotify" or name is "Music"`);
  return out.split(/,\s*/).filter(Boolean);
}

/** Parse the AppleScript reply. Pure (unit-tested). */
export function parseMacReply(player, raw) {
  const [state, title, artist, album, duration, position, artUrl, id] = raw.split(SEP);
  if (!title) return null;
  const dur = Number(duration);
  return {
    app: player,
    state: state === "playing" ? "playing" : state === "paused" ? "paused" : "stopped",
    title,
    artist: artist ?? "",
    album: album ?? "",
    duration: Number.isFinite(dur) ? (player === "Spotify" ? dur / 1000 : dur) : null, // Spotify reports ms
    position: Number.isFinite(Number(position)) ? Number(position) : null,
    artUrl: /^https:\/\//.test(artUrl ?? "") ? artUrl : null,
    artId: `${player}:${id || `${title}|${artist}`}`,
    canSeek: true,
  };
}

async function macNowPlaying() {
  const players = await runningPlayers().catch(() => []);
  let fallback = null; // a paused player, used if none is playing
  // Prefer the one that's playing; Spotify first when both are.
  for (const player of players.sort((a) => (a === "Spotify" ? -1 : 1))) {
    const art = player === "Spotify" ? `(artwork url of t)` : `""`;
    const id = player === "Spotify" ? `(id of t)` : `(persistent ID of t)`;
    try {
      const raw = await osa(
        `tell application "${player}"\nif player state is stopped then return "stopped"\nset t to current track\nreturn (player state as text) & "${SEP}" & (name of t) & "${SEP}" & (artist of t) & "${SEP}" & (album of t) & "${SEP}" & (duration of t) & "${SEP}" & (player position) & "${SEP}" & ${art} & "${SEP}" & ${id}\nend tell`,
      );
      const m = parseMacReply(player, raw);
      if (m && (m.state === "playing" || players.length === 1)) return m;
      if (m) fallback ??= m;
    } catch {
      /* nothing queued in this player */
    }
  }
  return fallback;
}

async function macArtwork(m) {
  if (m.artUrl) {
    const r = await fetch(m.artUrl, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return `data:${r.headers.get("content-type") ?? "image/jpeg"};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  }
  if (m.app !== "Music") return null;
  const file = join(tmpdir(), `deskassist-art-${process.pid}.bin`);
  try {
    await osa(
      `tell application "Music" to set d to data of artwork 1 of current track\nset f to open for access (POSIX file "${file}") with write permission\nset eof f to 0\nwrite d to f\nclose access f`,
      6000,
    );
    const buf = readFileSync(file);
    const type = buf[0] === 0x89 ? "image/png" : "image/jpeg";
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  } finally {
    rmSync(file, { force: true });
  }
}

const MAC_VERBS = { playpause: "playpause", next: "next track", previous: "previous track" };

async function macControl(m, command, value) {
  if (!m) throw new Error("Nothing is playing in Spotify or Music.");
  if (command === "seek") return osa(`tell application "${m.app}" to set player position to ${Math.max(0, Number(value) || 0)}`);
  if (MAC_VERBS[command]) return osa(`tell application "${m.app}" to ${MAC_VERBS[command]}`);
  throw new Error(`unknown command ${command}`);
}

// ----------------------------------------------------------------- Windows ----

const PS_PRELUDE = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$s = $mgr.GetCurrentSession()
if (-not $s) { '{}'; exit 0 }
`;

export const PS_READ = `${PS_PRELUDE}
$p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
$tl = $s.GetTimelineProperties(); $pi = $s.GetPlaybackInfo()
[pscustomobject]@{ app = $s.SourceAppUserModelId; title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle; status = $pi.PlaybackStatus.ToString(); pos = $tl.Position.TotalSeconds; dur = $tl.EndTime.TotalSeconds; canSeek = [bool]$pi.Controls.IsPlaybackPositionEnabled } | ConvertTo-Json -Compress`;

const PS_ART = `${PS_PRELUDE}
$p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
if (-not $p.Thumbnail) { '{}'; exit 0 }
$st = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
$ms = New-Object System.IO.MemoryStream
[System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($st).CopyTo($ms)
[pscustomobject]@{ type = $st.ContentType; b64 = [Convert]::ToBase64String($ms.ToArray()) } | ConvertTo-Json -Compress`;

const psControl = (cmd) => `${PS_PRELUDE}
$r = Await (${cmd}) ([bool]); [pscustomobject]@{ ok = $r } | ConvertTo-Json -Compress`;

async function ps(script, timeout = 8000) {
  const { stdout } = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { timeout, windowsHide: true, maxBuffer: 8_000_000 });
  return JSON.parse(stdout.trim() || "{}");
}

/** Normalize the PowerShell reply. Pure (unit-tested). */
export function parseWinReply(j) {
  if (!j || !j.title) return null;
  const state = { Playing: "playing", Paused: "paused" }[j.status] ?? "stopped";
  // "Spotify.exe", or a Store app id "Publisher.App_hash!Publisher.App": the part after "!" is readable.
  const rawId = String(j.app ?? "");
  const app = (rawId.includes("!") ? rawId.split("!").pop() : rawId).replace(/\.exe$/i, "").split(".").filter(Boolean).pop() ?? "";
  return {
    app: app ? app[0].toUpperCase() + app.slice(1) : "Media",
    state,
    title: j.title,
    artist: j.artist ?? "",
    album: j.album ?? "",
    duration: j.dur > 0 ? j.dur : null,
    position: j.dur > 0 ? j.pos : null,
    artUrl: null,
    artId: `win:${j.app}:${j.title}|${j.artist}`,
    canSeek: !!j.canSeek,
  };
}

const WIN_CMD = { playpause: "$s.TryTogglePlayPauseAsync()", next: "$s.TrySkipNextAsync()", previous: "$s.TrySkipPreviousAsync()" };

// ------------------------------------------------------------------ shared ----

export function createMedia({ platform = process.platform, getVolume = async () => ({}) } = {}) {
  let last = null;
  const art = new Map(); // artId -> data URI (last few)

  async function read() {
    if (platform === "darwin") return macNowPlaying();
    if (platform === "win32") return parseWinReply(await ps(PS_READ));
    return null;
  }

  return {
    periodMs: 2000,
    async sample() {
      const [m, vol] = await Promise.all([read().catch(() => null), getVolume().catch(() => ({}))]);
      last = m;
      const supported = platform === "darwin" || platform === "win32";
      return {
        ...(m ? { ...m, artUrl: undefined } : { state: "stopped" }),
        playing: !!m,
        volume: vol?.volume ?? null,
        muted: !!vol?.muted,
        players: platform === "darwin" ? "Spotify and Music" : platform === "win32" ? "any app in the Windows media overlay" : null,
        supported,
        at: Date.now(),
      };
    },
    async art(artId) {
      if (!last || last.artId !== artId) return null;
      if (art.has(artId)) return art.get(artId);
      let src = null;
      try {
        if (platform === "darwin") src = await macArtwork(last);
        else if (platform === "win32") {
          const j = await ps(PS_ART, 10_000);
          if (j.b64) src = `data:${j.type || "image/jpeg"};base64,${j.b64}`;
        }
      } catch {
        src = null;
      }
      if (src && src.length < 4_000_000) {
        art.set(artId, src);
        if (art.size > 6) art.delete(art.keys().next().value);
      }
      return src;
    },
    async control(command, value) {
      if (platform === "darwin") return macControl(last ?? (await read()), command, value);
      if (platform === "win32") {
        if (command === "seek") return ps(psControl(`$s.TryChangePlaybackPositionAsync([long]([double]${Math.max(0, Number(value) || 0)} * 10000000))`));
        if (WIN_CMD[command]) return ps(psControl(WIN_CMD[command]));
      }
      throw new Error("Media control isn't available on this computer.");
    },
  };
}
