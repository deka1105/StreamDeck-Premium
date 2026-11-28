// Stage 14: every printer brand against a local fixture, plus the manager.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { createHash } from "node:crypto";
import { BRANDS, shapeMoonraker, shapeBambu, mergeBambu, shapeFlashforgeGcode, digestHeader, shapeSdcp, shapePrusaLink } from "./brands.mjs";
import { readPackets, parsePublish, packet, publishPacket, varint } from "./mqtt.mjs";
import { createPrinters, cleanPrinters } from "./index.mjs";
import { acceptUpgrade } from "../control/ws.mjs";

const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const json = (res, v, status = 200) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(v));
const until = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("timed out");
};

test("Klipper/Moonraker: status, layers, time left, colours, API key", async () => {
  const srv = http.createServer((req, res) => {
    if (req.headers["x-api-key"] !== "k") return json(res, {}, 401);
    if (req.url.startsWith("/printer/objects/query")) {
      assert.match(decodeURIComponent(req.url), /temperature_sensor chamber/);
      return json(res, { result: { status: { print_stats: { state: "printing", filename: "benchy.gcode", print_duration: 600, info: { current_layer: 42, total_layer: 120 } }, virtual_sdcard: { progress: 0.35 }, extruder: { temperature: 214.6, target: 215 }, heater_bed: { temperature: 60, target: 60 }, gcode_move: { speed_factor: 1.2 }, "temperature_sensor chamber": { temperature: 38 } } } });
    }
    if (req.url.startsWith("/server/files/metadata")) return json(res, { result: { estimated_time: 3600, filament_colors: ["#FF5500"], filament_type: "PLA" } });
    json(res, {}, 404);
  });
  const port = await listen(srv);
  const s = await BRANDS.klipper.poll({ host: "127.0.0.1", port }, "k");
  srv.close();
  assert.equal(s.state, "printing");
  assert.equal(s.pct, 35);
  assert.equal(s.remainingMin, 39);
  assert.deepEqual([s.layer, s.layers], [42, 120]);
  assert.equal(s.temps.chamber, 38);
  assert.equal(s.speed, 120);
  assert.deepEqual(s.slots, [{ color: "#FF5500", material: "PLA", active: true }]);
  assert.equal(shapeMoonraker({ print_stats: { state: "error", message: "Heater fault" } }).error, "Heater fault");
});

test("OctoPrint: job + printer, and an offline printer (409) still reports", async () => {
  let operational = true;
  const srv = http.createServer((req, res) => {
    if (req.headers["x-api-key"] !== "octo") return json(res, {}, 403);
    if (req.url === "/api/job") return json(res, { state: operational ? "Printing" : "Offline", job: { file: { name: "part.gcode" } }, progress: { completion: 61.4, printTimeLeft: 1500 } });
    if (req.url === "/api/printer") return operational ? json(res, { temperature: { tool0: { actual: 200, target: 205 }, bed: { actual: 55, target: 60 } } }) : json(res, {}, 409);
  });
  const port = await listen(srv);
  const a = await BRANDS.octoprint.poll({ host: "127.0.0.1", port }, "octo");
  assert.deepEqual([a.state, a.pct, a.remainingMin, a.file, a.temps.nozzle], ["printing", 61, 25, "part.gcode", 200]);
  operational = false;
  const b = await BRANDS.octoprint.poll({ host: "127.0.0.1", port }, "octo");
  assert.equal(b.state, "offline");
  await assert.rejects(BRANDS.octoprint.poll({ host: "127.0.0.1", port }, "wrong"), /refused the key/);
  srv.close();
});

test("PrusaLink: HTTP Digest login, status and job", async () => {
  const realm = "Printer API";
  const nonce = "abc123";
  const md5 = (s) => createHash("md5").update(s).digest("hex");
  const srv = http.createServer((req, res) => {
    const a = req.headers.authorization ?? "";
    const p = Object.fromEntries([...a.matchAll(/(\w+)="?([^",]*)"?/g)].map((m) => [m[1], m[2]]));
    const want = md5(`${md5(`maker:${realm}:secretpw`)}:${nonce}:${p.nc}:${p.cnonce}:auth:${md5(`GET:${p.uri}`)}`);
    if (!a.startsWith("Digest") || p.response !== want) return res.writeHead(401, { "www-authenticate": `Digest realm="${realm}", nonce="${nonce}", qop="auth"` }).end();
    if (req.url === "/api/v1/status") return json(res, { printer: { state: "PRINTING", temp_nozzle: 215.2, target_nozzle: 215, temp_bed: 60.1, target_bed: 60, speed: 100 }, job: { id: 7, progress: 48, time_remaining: 1260 } });
    if (req.url === "/api/v1/job") return json(res, { file: { display_name: "Shelf bracket.bgcode" } });
  });
  const port = await listen(srv);
  const s = await BRANDS.prusalink.poll({ host: "127.0.0.1", port, user: "maker" }, "secretpw");
  assert.deepEqual([s.state, s.pct, s.remainingMin, s.file, s.temps.bed], ["printing", 48, 21, "Shelf bracket.bgcode", 60.1]);
  await assert.rejects(BRANDS.prusalink.poll({ host: "127.0.0.1", port, user: "maker" }, "nope"), /refused the user name/);
  srv.close();
  assert.equal(shapePrusaLink({ printer: { state: "ATTENTION" } }).error, "Needs attention");
  assert.match(digestHeader({ method: "GET", uri: "/x", user: "u", password: "p", challenge: 'Digest realm="r", nonce="n"' }), /response="[0-9a-f]{32}"/);
});

test("MQTT packets: varint, publish round-trip, partial buffers", () => {
  assert.deepEqual([...varint(321)], [0xc1, 0x02]);
  const pk = publishPacket("device/X/report", { a: 1 });
  const { packets, rest } = readPackets(Buffer.concat([pk, pk.subarray(0, 3)]));
  assert.equal(packets.length, 1);
  assert.equal(rest.length, 3);
  const { topic, payload } = parsePublish(packets[0].body);
  assert.equal(topic, "device/X/report");
  assert.deepEqual(JSON.parse(payload), { a: 1 });
});

test("Bambu Lab: MQTT login with the access code, pushall, incremental reports, AMS slots", async () => {
  const seen = { user: null, pass: null, subscribed: null, requested: null };
  const broker = net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      const { packets, rest } = readPackets(buf);
      buf = rest;
      for (const p of packets) {
        if (p.type === 1) {
          // CONNECT: protocol name, level, flags, keepalive, client id, user, password.
          let o = 10;
          const str = () => {
            const n = p.body.readUInt16BE(o);
            const s = p.body.subarray(o + 2, o + 2 + n).toString();
            o += 2 + n;
            return s;
          };
          str();
          seen.user = str();
          seen.pass = str();
          sock.write(packet(2, 0, Buffer.from([0, seen.pass === "12345678" ? 0 : 5])));
        } else if (p.type === 8) {
          seen.subscribed = p.body.subarray(4, 4 + p.body.readUInt16BE(2)).toString();
          sock.write(packet(9, 0, Buffer.from([p.body[0], p.body[1], 0])));
        } else if (p.type === 3) {
          seen.requested = JSON.parse(parsePublish(p.body).payload);
          sock.write(publishPacket("device/01S00A123/report", { print: { gcode_state: "RUNNING", mc_percent: 57, mc_remaining_time: 83, layer_num: 120, total_layer_num: 300, nozzle_temper: 219.8, nozzle_target_temper: 220, bed_temper: 55, bed_target_temper: 55, chamber_temper: 31, spd_lvl: 2, print_error: 0, subtask_name: "Vase", ams: { tray_now: "1", ams: [{ id: "0", tray: [{ id: "0", tray_color: "FFFFFFFF", tray_type: "PLA" }, { id: "1", tray_color: "1E90FFFF", tray_type: "PETG" }] }] } } }));
          setTimeout(() => sock.write(publishPacket("device/01S00A123/report", { print: { mc_percent: 58 } })), 50);
        }
      }
    });
    sock.on("error", () => {});
  });
  const port = await listen(broker);
  const cfg = { host: "127.0.0.1", port, serial: "01S00A123", tls: false, model: "P1S" };
  const session = BRANDS.bambu.session(cfg, "12345678");
  const s = await until(async () => {
    const r = await session.poll();
    return r.online && r.pct === 58 && r;
  });
  assert.equal(seen.user, "bblp");
  assert.equal(seen.subscribed, "device/01S00A123/report");
  assert.equal(seen.requested.pushing.command, "pushall");
  assert.deepEqual([s.state, s.remainingMin, s.layer, s.layers, s.speed, s.temps.chamber, s.file], ["printing", 83, 120, 300, "Standard", 31, "Vase"]);
  assert.deepEqual(s.slots, [{ color: "#FFFFFF", material: "PLA", active: false }, { color: "#1E90FF", material: "PETG", active: true }]);
  session.close();
  const bad = BRANDS.bambu.session({ ...cfg }, "wrong");
  const r = await until(async () => {
    const x = await bad.poll();
    return /refused the access code/.test(x.error ?? "") && x;
  });
  assert.equal(r.online, false);
  bad.close();
  broker.close();
  assert.equal(shapeBambu(mergeBambu({}, { print: { gcode_state: "FAILED", print_error: 50348044 } })).state, "error");
});

test("Elegoo SDCP over WebSocket", async () => {
  const srv = http.createServer();
  let asked = 0;
  srv.on("upgrade", (req, sock) => {
    const ws = acceptUpgrade(req, sock);
    ws.on("message", (t) => {
      const m = JSON.parse(t);
      if (m.Data?.Cmd === 0) {
        asked++;
        ws.send(JSON.stringify({ Topic: "sdcp/status/ABC", MainboardID: "ABC", Status: { CurrentStatus: [1], PrintInfo: { Status: 13, CurrentLayer: 30, TotalLayer: 200, CurrentTicks: 1200, TotalTicks: 4800, Filename: "gear.gcode" }, TempOfNozzle: 220, TempTargetNozzle: 220, TempOfHotbed: 60, TempTargetHotbed: 60, TempOfBox: 35 } }));
      }
    });
  });
  const port = await listen(srv);
  const session = BRANDS.elegoo.session({ host: "127.0.0.1", port, serial: "ABC" }, null);
  const s = await until(async () => {
    const r = await session.poll();
    return r.online && r;
  });
  assert.ok(asked >= 1);
  assert.deepEqual([s.state, s.pct, s.remainingMin, s.layer, s.layers, s.temps.chamber], ["printing", 25, 60, 30, 200, 35]);
  session.close();
  srv.close();
  assert.equal(shapeSdcp({ Status: { CurrentStatus: [1], PrintInfo: { Status: 6 } } }).state, "paused");
});

test("Flashforge: HTTP API with a check code, and the older G-code port", async () => {
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const b = JSON.parse(body);
      if (b.checkCode !== "cc12") return json(res, { code: 1, message: "check code error" });
      json(res, { code: 0, detail: { name: "Adventurer 5M Pro", status: "printing", printProgress: 0.4, estimatedTime: 1800, printFileName: "clip.gx", printLayer: 10, targetPrintLayer: 50, rightTemp: 210, rightTargetTemp: 210, platTemp: 55, platTargetTemp: 55, chamberTemp: 30, printSpeedAdjust: 100, errorCode: "0" } });
    });
  });
  const port = await listen(srv);
  const s = await BRANDS.flashforge.poll({ host: "127.0.0.1", port, serial: "SN1" }, "cc12");
  assert.deepEqual([s.state, s.pct, s.remainingMin, s.layer, s.model], ["printing", 40, 30, 10, "Adventurer 5M Pro"]);
  await assert.rejects(BRANDS.flashforge.poll({ host: "127.0.0.1", port, serial: "SN1" }, "bad"), /check code/);
  srv.close();

  const replies = { "~M601": "CMD M601 Received.\r\nControl Success.\r\nok\r\n", "~M105": "CMD M105 Received.\r\nT0:205 /210 B:58/60\r\nok\r\n", "~M27": "CMD M27 Received.\r\nSD printing byte 30/100\r\nok\r\n", "~M119": "CMD M119 Received.\r\nMachineStatus: BUILDING_FROM_SD\r\nMoveMode: MOVING\r\nCurrentFile: bracket.g\r\nok\r\n" };
  const tcp = net.createServer((sock) => sock.on("data", (d) => sock.write(replies[String(d).trim().split(" ")[0]] ?? "ok\r\n")));
  const tport = await listen(tcp);
  const g = await BRANDS.flashforge.poll({ host: "127.0.0.1", port: tport }, null);
  tcp.close();
  assert.deepEqual([g.state, g.pct, g.temps.nozzle, g.temps.bedTarget, g.file], ["printing", 30, 205, 60, "bracket.g"]);
  assert.equal(shapeFlashforgeGcode({ m119: "MachineStatus: READY" }).state, "idle");
});

test("Snapmaker 2.0: token from the touchscreen approval, then status", async () => {
  let approved = false;
  const srv = http.createServer((req, res) => {
    if (req.url === "/api/v1/connect") return approved ? json(res, { token: "tok-1" }) : res.writeHead(403).end();
    if (req.url.startsWith("/api/v1/status?token=tok-1")) return json(res, { status: "RUNNING", progress: 0.2, remainingTime: 600, fileName: "lid.gcode", nozzleTemperature: 205, heatedBedTemperature: 60 });
    res.writeHead(401).end();
  });
  const port = await listen(srv);
  const secrets = {};
  const settings = { printers: cleanPrinters([{ id: "sm", brand: "snapmaker", host: "127.0.0.1", port }]) };
  const m = createPrinters({ getSettings: () => settings, getSecret: (n) => secrets[n] ?? null, log: () => {} });
  const first = await m.test("sm", { setSecret: (n, v) => (secrets[n] = v) });
  assert.match(first.error, /Approve DeskAssist/);
  approved = true;
  const second = await m.test("sm", { setSecret: (n, v) => (secrets[n] = v) });
  assert.equal(second.ok, true);
  assert.equal(secrets["printer:sm"], "tok-1");
  const s = (await m.sample()).printers[0];
  assert.deepEqual([s.state, s.pct, s.remainingMin, s.file], ["printing", 20, 10, "lid.gcode"]);
  m.stop();
  srv.close();
});

test("manager: only while wanted, back-off on failures, settings cleaned", async () => {
  let calls = 0;
  const brands = { fake: { name: "Fake", poll: async () => (calls++, Promise.reject(new Error("No route to host"))) } };
  let wanted = false;
  const m = createPrinters({ getSettings: () => ({ printers: [{ id: "a", brand: "fake", name: "Garage", host: "10.0.0.9" }] }), getSecret: () => null, isWanted: () => wanted, brands, log: () => {} });
  assert.equal((await m.sample()).printers[0].state, "offline");
  assert.equal(calls, 0, "not polled while no widget shows it");
  wanted = true;
  const s = (await m.sample()).printers[0];
  assert.match(s.error, /No route/);
  await m.sample();
  await m.sample();
  assert.equal(calls, 1, "backed off after a failure");
  assert.deepEqual(cleanPrinters([{ brand: "bambu", host: "192.168.1.9", serial: "01S-00A!" }, { brand: "nope", host: "x" }, { brand: "klipper", host: "bad host" }]).map((p) => [p.brand, p.serial]), [["bambu", "01S-00A"]]);
});
