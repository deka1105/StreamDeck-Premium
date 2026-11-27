# Media helpers (Stage 7)

What the host uses to read and control what's playing. No new native binary is
added, so nothing changes in signing or notarization (PLAN 7.0 stop condition:
not triggered).

## macOS

- **Source:** the public AppleScript dictionaries of **Spotify** and **Music**
  (`name/artist/album/duration of current track`, `player position`,
  `player state`; Spotify also has `artwork url`). Run with `osascript`.
- **Why not "everything that plays":** the system-wide Now Playing data lives
  in the private MediaRemote framework, which macOS 15.4+ no longer lets other
  apps read. Tools built on it (`nowplaying-cli`) stopped working. Browsers and
  other players are therefore not shown on macOS; the panel says which players
  are supported.
- **Control:** `playpause`, `next track`, `previous track`,
  `set player position to N` (seek), and the existing `set volume`.
- **Artwork:** Spotify gives an https URL (the host fetches it); Music gives raw
  image data (`data of artwork 1`), written to a temp file once per track.

## Windows

- **Source:** the public WinRT API
  `Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager`
  (System Media Transport Controls), called from **Windows PowerShell 5.1**,
  which can await WinRT async calls. This covers any app that publishes to the
  Windows media overlay: Spotify, browsers, VLC, Groove/Media Player…
- **Control:** `TryTogglePlayPauseAsync`, `TrySkipNextAsync`,
  `TrySkipPreviousAsync`, `TryChangePlaybackPositionAsync` (seek).
- **Volume:** media keys via `WScript.Shell.SendKeys` (volume up / down /
  mute). Setting an exact level needs Core Audio → Stage 12.
- **Artwork:** `TryGetMediaPropertiesAsync().Thumbnail` read to bytes.

## Not built (needs a native helper — owner decision)

- **Spectrum bars** need WASAPI loopback capture and an FFT on Windows. That is
  a native sidecar (C#/.NET or Rust) with its own build, signing and
  installer changes. Per PLAN 7.0 this stops for the owner; the widget is not
  shipped until that decision.

## Other sources

- **Synced lyrics:** `GET https://lrclib.net/api/get?track_name&artist_name&album_name&duration`
  → `{syncedLyrics, plainLyrics}` (LRC format). Opt-in per widget; asked by the
  host once per song; in memory only; back-off 1 → 30 min on failures.
- **Radio:** a direct stream URL is played **on the computer** with the first
  of `mpv`, `ffplay`, `cvlc`/`vlc` found on PATH. Without one, the widget says
  which to install.
- **Jellyfin:** `GET /Sessions`, `GET /Items/Counts`, `GET /System/Info/Public`,
  `POST /Sessions/{id}/Playing/{PlayPause|NextTrack|PreviousTrack|Seek}`;
  header `Authorization: MediaBrowser Token="…"`.
- **Plex:** `GET /status/sessions`, `GET /library/sections`, `GET /identity`
  with `X-Plex-Token`, `Accept: application/json`. Display only (most Plex
  players don't accept remote commands).
