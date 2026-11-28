// Stage 15: Steam from its local files (a fake Steam folder), non-Steam games
// by process, launch gating, covers; photo frame, camera snapshot, batteries.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseVdf, installedGames, currentUser, playStats, runningAppId, steamRoot } from "./steam.mjs";
import { createGames, matchGame } from "./index.mjs";
import { createExtras, listPictures, pictureIndex, parseIoregBatteries } from "../extras/index.mjs";

function fakeSteam() {
  const root = mkdtempSync(join(tmpdir(), "steam-"));
  const lib2 = mkdtempSync(join(tmpdir(), "steamlib-"));
  mkdirSync(join(root, "steamapps"), { recursive: true });
  mkdirSync(join(lib2, "steamapps"), { recursive: true });
  writeFileSync(join(root, "steamapps", "libraryfolders.vdf"), `"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"${root.replace(/\\/g, "\\\\")}"\n\t}\n\t"1"\n\t{\n\t\t"path"\t\t"${lib2.replace(/\\/g, "\\\\")}"\n\t}\n}\n`);
  const acf = (dir, id, name) => writeFileSync(join(dir, "steamapps", `appmanifest_${id}.acf`), `"AppState"\n{\n\t"appid"\t\t"${id}"\n\t"name"\t\t"${name}"\n\t"StateFlags"\t\t"4"\n}\n`);
  acf(root, "620", "Portal 2");
  acf(root, "228980", "Steamworks Common Redistributables");
  acf(lib2, "1145360", "Hades");
  acf(lib2, "413150", "Stardew Valley");
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(join(root, "config", "loginusers.vdf"), `"users"\n{\n\t"76561197960287930"\n\t{\n\t\t"AccountName"\t\t"gaben"\n\t\t"PersonaName"\t\t"Player One"\n\t\t"MostRecent"\t\t"1"\n\t}\n}\n`);
  mkdirSync(join(root, "userdata", "22202", "config"), { recursive: true });
  writeFileSync(join(root, "userdata", "22202", "config", "localconfig.vdf"), `"UserLocalConfigStore"\n{\n\t"Software"\n\t{\n\t\t"Valve"\n\t\t{\n\t\t\t"Steam"\n\t\t\t{\n\t\t\t\t"apps"\n\t\t\t\t{\n\t\t\t\t\t"620"\n\t\t\t\t\t{\n\t\t\t\t\t\t"LastPlayed"\t\t"1700000000"\n\t\t\t\t\t\t"Playtime"\t\t"1310"\n\t\t\t\t\t}\n\t\t\t\t\t"1145360"\n\t\t\t\t\t{\n\t\t\t\t\t\t"LastPlayed"\t\t"1760000000"\n\t\t\t\t\t\t"Playtime"\t\t"4022"\n\t\t\t\t\t}\n\t\t\t\t\t"413150"\n\t\t\t\t\t{\n\t\t\t\t\t\t"Playtime"\t\t"20"\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n}\n`);
  writeFileSync(join(root, "registry.vdf"), `"Registry"\n{\n\t"HKCU"\n\t{\n\t\t"Software"\n\t\t{\n\t\t\t"Valve"\n\t\t\t{\n\t\t\t\t"Steam"\n\t\t\t\t{\n\t\t\t\t\t"RunningAppID"\t\t"1145360"\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n}\n`);
  mkdirSync(join(root, "appcache", "librarycache", "1145360"), { recursive: true });
  writeFileSync(join(root, "appcache", "librarycache", "1145360", "library_600x900.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  return root;
}

test("VDF parsing: nesting, escapes, comments, case-insensitive keys", () => {
  const v = parseVdf(`// comment\n"Root" { "Name" "A \\"quoted\\" game" "Inner" { "X" "1" } }`);
  assert.equal(v.root.name, 'A "quoted" game');
  assert.equal(v.root.inner.x, "1");
});

test("Steam: libraries, installed games, account, play stats, running game", async () => {
  const root = fakeSteam();
  assert.equal(steamRoot({ platform: "darwin", home: "/nowhere", exists: () => false }), null);
  const games = installedGames(root);
  assert.deepEqual(games.map((g) => g.name).sort(), ["Hades", "Portal 2", "Stardew Valley"], "redistributables skipped, second library read");
  const u = currentUser(root);
  assert.deepEqual([u.accountId, u.name], ["22202", "Player One"]);
  assert.equal(playStats(root, "22202")["620"].playtime, 1310);
  assert.equal(await runningAppId(root, { platform: "darwin" }), "1145360");
  const win = await runningAppId(root, { platform: "win32", runImpl: async () => ({ stdout: "    RunningAppID    REG_DWORD    0x26c\r\n" }) });
  assert.equal(win, "620");
});

test("games: now playing with a session start, recent five, covers, launch is opt-in", async () => {
  const root = fakeSteam();
  const dir = mkdtempSync(join(tmpdir(), "games-"));
  const settings = { games: { launch: false, custom: [{ id: "mc", name: "Minecraft", match: "minecraft", launch: "/Applications/Minecraft.app" }] } };
  let procs = ["/usr/bin/zsh", "java -jar /Users/me/minecraft/launcher.jar"];
  const launched = [];
  let t = 1_000_000;
  const g = createGames({ dir, root, platform: "darwin", getSettings: () => settings, procs: async () => procs, execute: async (a) => launched.push(a), now: () => t, fetchImpl: async () => ({ ok: false }), log: () => {} });
  const s = await g.sample();
  assert.equal(s.playing.name, "Hades", "Steam's running game wins");
  assert.equal(s.playing.since, 1_000_000);
  assert.deepEqual(s.recent.map((r) => r.name), ["Hades", "Portal 2"]);
  assert.equal(s.friends, null, "no Web API key, no friends list");
  // Steam game ends; a matching non-Steam game is running.
  writeFileSync(join(root, "registry.vdf"), `"Registry" { "HKCU" { "Software" { "Valve" { "Steam" { "RunningAppID" "0" } } } } }`);
  t += 60_000;
  assert.equal((await g.sample()).playing.name, "Minecraft");
  t += 30 * 60_000;
  procs = [];
  const after = await g.sample();
  assert.equal(after.playing, null);
  assert.equal(after.recent[0].name, "Minecraft");
  assert.equal(after.recent[0].playtimeMin, 30);
  assert.match(await g.cover("steam:1145360"), /^data:image\/jpeg;base64,/);
  assert.match((await g.launch("steam:620")).error, /is off/);
  settings.games.launch = true;
  assert.equal((await g.launch("steam:620")).ok, true);
  assert.deepEqual(launched[0], { type: "url", target: "steam://rungameid/620" });
  assert.equal((await g.launch("steam:999999")).ok, false);
  assert.equal((await g.launch("custom:mc")).ok, true);
  assert.equal(launched[1].type, "app");
  assert.equal(matchGame(["C:\\Games\\EldenRing\\eldenring.exe"], "eldenring"), true);
  assert.equal(matchGame(["x"], ""), false);
});

test("Steam Web API (optional): friends in game", async () => {
  const root = fakeSteam();
  const fetchImpl = async (url) => ({
    ok: true,
    json: async () => (url.includes("GetFriendList") ? { friendslist: { friends: [{ steamid: "1" }, { steamid: "2" }] } } : { response: { players: [{ personaname: "Sam", gameextrainfo: "Hades", gameid: "1145360" }, { personaname: "Ida" }] } }),
  });
  const g = createGames({ root, platform: "darwin", getSecret: (n) => (n === "steam:key" ? "KEY" : null), procs: async () => [], fetchImpl, log: () => {} });
  assert.deepEqual((await g.sample()).friends, [{ name: "Sam", game: "Hades", appid: "1145360" }]);
});

test("photo frame: folder pictures rotate; camera: HTTP snapshot; batteries parse", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pics-"));
  writeFileSync(join(dir, "a.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  writeFileSync(join(dir, "b.png"), Buffer.from([0x89, 0x50]));
  writeFileSync(join(dir, "notes.txt"), "x");
  mkdirSync(join(dir, "trip"));
  writeFileSync(join(dir, "trip", "c.webp"), Buffer.from([1]));
  assert.equal(listPictures(dir).length, 3);
  assert.equal(pictureIndex(0, 60), -1);
  assert.notEqual(pictureIndex(3, 60, 0, false), pictureIndex(3, 60, 60_000, false), "changes each period");

  const srv = http.createServer((req, res) => (req.url === "/snap.jpg" ? res.writeHead(200, { "content-type": "image/jpeg" }).end(Buffer.from([0xff, 0xd8])) : res.writeHead(200, { "content-type": "text/html" }).end("<html>")));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const widgets = {
    pf: { id: "pf", type: "photoframe", options: { folder: dir, every: 60 } },
    cam: { id: "cam", type: "camera", options: { url: `${base}/snap.jpg` } },
    bad: { id: "bad", type: "camera", options: { url: `${base}/page` } },
    rtsp: { id: "rtsp", type: "camera", options: { url: "rtsp://10.0.0.5/live" } },
  };
  const ex = createExtras({ getWidget: (_c, _p, id) => widgets[id] ?? null, runImpl: async () => Promise.reject(Object.assign(new Error("nope"), { code: "ENOENT" })) });
  const pic = await ex.methods["frame.picture"]({ widgetId: "pf" }, { client: "x" });
  assert.match(pic.src, /^data:image\/(jpeg|png|webp);base64,/);
  assert.match((await ex.methods["camera.snapshot"]({ widgetId: "cam" }, { client: "x" })).src, /^data:image\/jpeg/);
  assert.match((await ex.methods["camera.snapshot"]({ widgetId: "bad" }, { client: "x" })).error, /Not a picture/);
  assert.match((await ex.methods["camera.snapshot"]({ widgetId: "rtsp" }, { client: "x" })).error, /need ffmpeg/);
  assert.match((await ex.methods["frame.picture"]({ widgetId: "cam" }, { client: "x" })).error, /No such widget/);
  srv.close();

  assert.deepEqual(parseIoregBatteries(`+-o AppleDeviceManagementHIDEventService  <class x>\n    {\n      "Product" = "Magic Mouse"\n      "BatteryPercent" = 64\n    }\n+-o Other\n    {\n      "Product" = "Magic Keyboard"\n      "BatteryPercent" = 9\n    }`), [{ name: "Magic Mouse", pct: 64 }, { name: "Magic Keyboard", pct: 9 }]);
});
