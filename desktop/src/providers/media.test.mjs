import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseMacReply, parseWinReply, PS_READ } from "./media.mjs";
import { jellyfinSessions, plexSessions, createMediaServers, parseLrc, parseStations, createRadio, createLyrics } from "./mediaExtras.mjs";

const SEP = "<|>";

test("macOS replies: Spotify durations are ms, Music seconds; stopped → null", () => {
  const s = parseMacReply("Spotify", ["playing", "Song", "Artist", "Album", "215000", "12.5", "https://i.scdn.co/image/x", "spotify:track:1"].join(SEP));
  assert.deepEqual([s.app, s.state, s.duration, s.position, s.artUrl], ["Spotify", "playing", 215, 12.5, "https://i.scdn.co/image/x"]);
  const m = parseMacReply("Music", ["paused", "Tune", "Band", "LP", "180.5", "30", "", "ABC123"].join(SEP));
  assert.deepEqual([m.state, m.duration, m.artUrl, m.artId], ["paused", 180.5, null, "Music:ABC123"]);
  assert.equal(parseMacReply("Music", "stopped"), null);
});

test("Windows replies: status, app name and timeline", () => {
  const w = parseWinReply({ app: "Spotify.exe", title: "Song", artist: "A", album: "B", status: "Playing", pos: 10, dur: 200, canSeek: true });
  assert.deepEqual([w.app, w.state, w.position, w.duration, w.canSeek], ["Spotify", "playing", 10, 200, true]);
  assert.equal(parseWinReply({ app: "Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic", title: "X", status: "Paused", dur: 0 }).app, "ZuneMusic");
  assert.equal(parseWinReply({}), null);
});

test("Windows: the System Media Transport Controls script runs", { skip: process.platform !== "win32" }, async () => {
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PS_READ], { timeout: 30_000 });
  const j = JSON.parse(stdout.trim() || "{}");
  assert.equal(typeof j, "object"); // {} when nothing plays (CI), or a session
  console.log(`  win32 SMTC: ${JSON.stringify(j).slice(0, 120)}`);
});

test("Jellyfin and Plex sessions normalize; user filter applies", () => {
  const j = jellyfinSessions(
    [
      { Id: "s1", UserName: "alex", DeviceName: "TV", SupportsRemoteControl: true, NowPlayingItem: { Id: "i1", Name: "Pilot", SeriesName: "Show", ParentIndexNumber: 1, IndexNumber: 1, RunTimeTicks: 30 * 60 * 1e7, Type: "Episode" }, PlayState: { PositionTicks: 60 * 1e7, IsPaused: false, PlayMethod: "Transcode" } },
      { Id: "s2", UserName: "sam", NowPlayingItem: { Name: "Other" }, PlayState: {} },
      { Id: "s3", UserName: "alex" },
    ],
    ["alex"],
  );
  assert.equal(j.length, 1);
  assert.deepEqual([j[0].subtitle, j[0].duration, j[0].position, j[0].transcoding], ["Show · S1E1", 1800, 60, true]);
  const p = plexSessions({ MediaContainer: { Metadata: [{ sessionKey: "7", type: "track", title: "Song", grandparentTitle: "Band", duration: 200000, viewOffset: 5000, Player: { state: "paused", title: "Phone" }, User: { title: "Alex" } }] } });
  assert.deepEqual([p[0].subtitle, p[0].state, p[0].position, p[0].canControl], ["Band", "paused", 5, false]);
});

test("media servers: Jellyfin fixture server — sessions, library, control; refused token", async () => {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    if (req.headers.authorization !== 'MediaBrowser Token="good"') {
      res.writeHead(401);
      return res.end();
    }
    res.writeHead(200, { "content-type": "application/json" });
    if (req.url.startsWith("/Sessions?")) return res.end(JSON.stringify([{ Id: "abc", UserName: "me", DeviceName: "Living room", NowPlayingItem: { Id: "m1", Name: "Movie", ProductionYear: 2001, RunTimeTicks: 6e10 }, PlayState: { PositionTicks: 6e9 } }]));
    if (req.url === "/System/Info/Public") return res.end(JSON.stringify({ Version: "10.10.3" }));
    if (req.url === "/Items/Counts") return res.end(JSON.stringify({ MovieCount: 312, SeriesCount: 45 }));
    if (req.method === "POST") return res.end();
    res.end("{}");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  let token = "good";
  const ms = createMediaServers({ getSettings: () => ({ mediaServers: [{ id: "jf", type: "jellyfin", name: "Jellyfin", url }] }), secrets: { get: () => token } });
  try {
    const s = await ms.sample();
    const jf = s.servers[0];
    assert.deepEqual([jf.online, jf.version, jf.library, jf.sessions[0].title, jf.sessions[0].subtitle], [true, "10.10.3", "312 movies, 45 shows", "Movie", "2001"]);
    await ms.control("jf", "abc", "seek", 90);
    assert.ok(hits.includes("POST /Sessions/abc/Playing/Seek?SeekPositionTicks=900000000"));
    await assert.rejects(ms.control("jf", "not-seen", "playpause"), /ended/);
    token = "bad";
    const ms2 = createMediaServers({ getSettings: () => ({ mediaServers: [{ id: "jf", type: "jellyfin", name: "Jellyfin", url }] }), secrets: { get: () => token } });
    const s2 = await ms2.sample();
    assert.equal(s2.servers[0].online, false);
    assert.match(s2.servers[0].error, /refused the token/);
  } finally {
    server.close();
  }
});

test("lyrics: LRC parsing, a found song, and back-off after failure", async () => {
  assert.deepEqual(parseLrc("[00:12.50] Hello\n[01:02.00][01:30.00] Chorus\nno time"), [
    { t: 12.5, text: "Hello" },
    { t: 62, text: "Chorus" },
    { t: 90, text: "Chorus" },
  ]);
  let t = 0;
  let fail = false;
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (fail) throw new Error("down");
    return { ok: true, status: 200, json: async () => ({ syncedLyrics: "[00:01.00] Line one", plainLyrics: "Line one" }) };
  };
  const ly = createLyrics({ fetchImpl, now: () => t });
  const r = await ly.get({ title: "Song", artist: "A", album: "B", duration: 200 });
  assert.equal(r.found, true);
  assert.deepEqual(r.synced, [{ t: 1, text: "Line one" }]);
  await ly.get({ title: "Song", artist: "A", album: "B", duration: 200 }); // cached
  assert.equal(calls, 1);
  fail = true;
  assert.equal((await ly.get({ title: "Other" })).ok, false);
  assert.match((await ly.get({ title: "Third" })).error, /resting/); // backed off
  t += 61_000;
  await ly.get({ title: "Fourth" });
  assert.equal(calls, 3);
});

test("radio: stations parse; plays with the first player found; explains when none", async () => {
  assert.deepEqual(parseStations(["Jazz | https://stream.example/jazz", "bad", "https://stream.example/raw"]), [
    { name: "Jazz", url: "https://stream.example/jazz" },
    { name: "https://stream.example/raw", url: "https://stream.example/raw" },
  ]);
  const spawned = [];
  const fakeChild = () => ({ on() {}, kill() { this.killed = true; }, exitCode: null });
  const r = createRadio({ hasBin: (b) => b === "ffplay", spawnImpl: (bin, args) => (spawned.push([bin, args]), fakeChild()) });
  assert.deepEqual(r.play({ name: "Jazz", url: "https://stream.example/jazz" }), { ok: true, player: "ffplay" });
  assert.equal(spawned[0][0], "ffplay");
  assert.equal((await r.sample()).playing, "Jazz");
  r.stop();
  assert.equal((await r.sample()).playing, null);
  assert.throws(() => createRadio({ hasBin: () => false }).play({ name: "x", url: "https://x" }), /Install mpv/);
});
