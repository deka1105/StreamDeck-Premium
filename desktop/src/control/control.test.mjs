// Stage 11: every Control Deck integration against a local fixture.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import dgram from "node:dgram";
import { createHash } from "node:crypto";
import { acceptUpgrade, connect, encodeFrame, decodeFrames } from "./ws.mjs";
import { createObs, obsAuth } from "./obs.mjs";
import { createHa, tapService } from "./ha.mjs";
import { createDocker, parseContainers } from "./docker.mjs";
import { magicPacket, parseMac, wake, encodeOsc, decodeOsc, parseOscArgs, sendOsc } from "./udp.mjs";
import { createServices } from "./services.mjs";
import { createMeeting, meetingCombo } from "./meeting.mjs";
import { pointerLine } from "./pointer.mjs";
import { createControl } from "./index.mjs";
import { cleanControl } from "../panel/schema.mjs";

const quiet = () => {};
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const until = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("timed out");
};

// ------------------------------------------------------------- WebSocket ----

test("ws frames round-trip, masked and unmasked, small and large", () => {
  for (const size of [5, 300, 70_000]) {
    for (const mask of [true, false]) {
      const text = "x".repeat(size);
      const { frames, rest } = decodeFrames(encodeFrame(text, { mask }));
      assert.equal(frames[0].data.toString(), text);
      assert.equal(rest.length, 0);
    }
  }
  // A partial frame waits for more bytes.
  const f = encodeFrame("hello");
  assert.equal(decodeFrames(f.subarray(0, 4)).frames.length, 0);
});

// ------------------------------------------------------------ fake OBS ----

function fakeObs({ password = null } = {}) {
  const st = {
    scenes: ["Intro", "Camera", "Screen"],
    current: "Camera",
    record: false,
    stream: false,
    vcam: false,
    items: { Camera: [{ sceneItemId: 1, sourceName: "Webcam", sceneItemEnabled: true }, { sceneItemId: 2, sourceName: "Overlay", sceneItemEnabled: false }] },
    mutes: { "Mic/Aux": false, "Desktop Audio": true },
    requests: [],
  };
  const salt = "c2FsdA==";
  const challenge = "Y2hhbGxlbmdl";
  const srv = http.createServer();
  srv.on("upgrade", (req, socket) => {
    const ws = acceptUpgrade(req, socket);
    const event = (eventType, eventData = {}) => ws.send(JSON.stringify({ op: 5, d: { eventType, eventIntent: 1, eventData } }));
    ws.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: "5.5.0", rpcVersion: 1, ...(password ? { authentication: { salt, challenge } } : {}) } }));
    ws.on("message", (text) => {
      const m = JSON.parse(text);
      if (m.op === 1) {
        if (password && m.d.authentication !== obsAuth(password, salt, challenge)) return socket.end(encodeFrame(Buffer.from([0x0f, 0xa9]), { opcode: 8, mask: false })); // 4009
        return ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
      }
      if (m.op !== 6) return;
      const { requestType: t, requestId, requestData: q = {} } = m.d;
      st.requests.push(t);
      let data = {};
      let ok = true;
      if (t === "GetSceneList") data = { currentProgramSceneName: st.current, scenes: st.scenes.map((sceneName, i) => ({ sceneName, sceneIndex: st.scenes.length - 1 - i })) };
      else if (t === "GetRecordStatus") data = { outputActive: st.record, outputPaused: false, outputTimecode: "00:01:02.345" };
      else if (t === "GetStreamStatus") data = { outputActive: st.stream, outputTimecode: "00:00:00.000" };
      else if (t === "GetVirtualCamStatus") data = { outputActive: st.vcam };
      else if (t === "GetSpecialInputs") data = { desktop1: "Desktop Audio", mic1: "Mic/Aux", desktop2: null };
      else if (t === "GetInputList") data = { inputs: [{ inputName: "Mic/Aux", inputKind: "coreaudio_input_capture" }, { inputName: "Webcam", inputKind: "av_capture_input" }] };
      else if (t === "GetInputMute") data = { inputMuted: st.mutes[q.inputName] };
      else if (t === "GetSceneItemList") data = { sceneItems: st.items[q.sceneName] ?? [] };
      else if (t === "SetCurrentProgramScene") (st.current = q.sceneName), event("CurrentProgramSceneChanged", { sceneName: q.sceneName });
      else if (t === "ToggleRecord") st.record = !st.record;
      else if (t === "ToggleStream") st.stream = !st.stream;
      else if (t === "ToggleVirtualCam") st.vcam = !st.vcam;
      else if (t === "ToggleInputMute") data = { inputMuted: (st.mutes[q.inputName] = !st.mutes[q.inputName]) };
      else if (t === "SetSceneItemEnabled") st.items[q.sceneName].find((i) => i.sceneItemId === q.sceneItemId).sceneItemEnabled = q.sceneItemEnabled;
      else ok = false;
      ws.send(JSON.stringify({ op: 7, d: { requestType: t, requestId, requestStatus: { result: ok, code: ok ? 100 : 204, comment: ok ? undefined : "unknown" }, responseData: data } }));
    });
  });
  return { srv, st };
}

test("OBS auth string matches the obs-websocket 5 recipe", () => {
  const sha = (s) => createHash("sha256").update(s).digest("base64");
  assert.equal(obsAuth("pw", "salt", "ch"), sha(sha("pwsalt") + "ch"));
});

test("OBS: connects with a password, reads state, and every control works", async () => {
  const { srv, st } = fakeObs({ password: "s3cret" });
  const port = await listen(srv);
  const settings = { control: { obs: { enabled: true, host: "127.0.0.1", port } } };
  const obs = createObs({ getSettings: () => settings, getSecret: (n) => (n === "obs:password" ? "s3cret" : null), isWanted: () => true, log: quiet });
  let events = 0;
  obs.setOnChange(() => events++);
  try {
    const s = await obs.sample();
    assert.equal(s.connected, true, s.error);
    assert.deepEqual(s.scenes, ["Intro", "Camera", "Screen"]);
    assert.equal(s.current, "Camera");
    assert.deepEqual(s.sources.map((x) => [x.name, x.on]), [["Webcam", true], ["Overlay", false]]);
    assert.deepEqual(s.inputs, [{ name: "Desktop Audio", muted: true }, { name: "Mic/Aux", muted: false }]);
    assert.equal(s.record.time, "00:01:02");

    assert.equal((await obs.control("scene", "Screen")).current, "Screen");
    await until(() => events > 0);
    assert.equal((await obs.control("record")).record.active, true);
    assert.equal((await obs.control("stream")).stream.active, true);
    assert.equal((await obs.control("vcam")).vcam.active, true);
    assert.equal((await obs.control("mute", "Mic/Aux")).inputs.find((i) => i.name === "Mic/Aux").muted, true);
    await obs.control("scene", "Camera");
    assert.equal((await obs.control("source", 2)).sources.find((x) => x.id === 2).on, true);
    await assert.rejects(obs.control("scene", "Nope"), /No such scene/);
    await assert.rejects(obs.control("mute", "Webcam"), /No such input/);
    await assert.rejects(obs.control("shutdown"), /Unknown OBS command/);
  } finally {
    obs.close();
    srv.close();
  }
});

test("OBS: a wrong password and a stopped OBS give plain answers", async () => {
  const { srv } = fakeObs({ password: "right" });
  const port = await listen(srv);
  const settings = { control: { obs: { enabled: true, host: "127.0.0.1", port } } };
  const bad = createObs({ getSettings: () => settings, getSecret: () => "wrong", isWanted: () => true, log: quiet });
  assert.match((await bad.sample()).error, /rejected the password/);
  const none = createObs({ getSettings: () => settings, getSecret: () => null, isWanted: () => true, log: quiet });
  assert.match((await none.sample()).error, /asks for a password/);
  srv.close();
  const off = createObs({ getSettings: () => ({ control: { obs: { enabled: true, host: "127.0.0.1", port: 1 } } }), getSecret: () => null, isWanted: () => true, log: quiet });
  assert.match((await off.sample()).error, /OBS isn't running/);
  const disabled = createObs({ getSettings: () => ({ control: { obs: { enabled: false } } }), getSecret: () => null, isWanted: () => true });
  assert.match((await disabled.sample()).error, /Turn on OBS/);
});

// ------------------------------------------------------ Home Assistant ----

function fakeHa() {
  const states = {
    "light.desk": { entity_id: "light.desk", state: "off", attributes: { friendly_name: "Desk lamp", brightness: 128 } },
    "sensor.office_temp": { entity_id: "sensor.office_temp", state: "21.5", attributes: { friendly_name: "Office", unit_of_measurement: "°C" } },
    "lock.front": { entity_id: "lock.front", state: "locked", attributes: { friendly_name: "Front door" } },
  };
  const calls = [];
  const srv = http.createServer((req, res) => {
    if (req.headers.authorization !== "Bearer good") return res.writeHead(401).end();
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const json = (v) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(v));
      if (req.url === "/api/states") return json(Object.values(states));
      const one = /^\/api\/states\/(.+)$/.exec(req.url);
      if (one) return json(states[decodeURIComponent(one[1])]);
      const svc = /^\/api\/services\/(\w+)\/(\w+)$/.exec(req.url);
      if (svc && req.method === "POST") {
        const { entity_id } = JSON.parse(body);
        calls.push(`${svc[1]}.${svc[2]} ${entity_id}`);
        if (svc[2] === "toggle") states[entity_id].state = states[entity_id].state === "on" ? "off" : "on";
        return json([]);
      }
      res.writeHead(404).end();
    });
  });
  return { srv, calls };
}

test("Home Assistant: shows the listed entities and taps call the right service", async () => {
  const { srv, calls } = fakeHa();
  const port = await listen(srv);
  let token = "good";
  const settings = { control: { ha: { url: `http://127.0.0.1:${port}/` } } };
  const ha = createHa({ getSettings: () => settings, getSecret: () => token, getWidgets: () => [{ entities: ["light.desk", "sensor.office_temp", "lock.front", "switch.gone"] }], log: quiet });
  try {
    const s = await ha.sample();
    assert.deepEqual(s.entities.map((e) => [e.id, e.name, e.state, e.tappable]), [
      ["light.desk", "Desk lamp", "off", true],
      ["sensor.office_temp", "Office", "21.5", false],
      ["lock.front", "Front door", "locked", true],
      ["switch.gone", "switch.gone", "missing", undefined],
    ]);
    assert.equal(s.entities[0].brightness, 50);
    assert.equal(s.entities[1].unit, "°C");
    await ha.tap("light.desk");
    await ha.tap("lock.front");
    assert.deepEqual(calls, ["light.toggle light.desk", "lock.unlock lock.front"]);
    assert.equal((await ha.sample()).entities[0].on, true);
    await assert.rejects(ha.tap("sensor.office_temp"), /only be shown/);
    await assert.rejects(ha.tap("light.kitchen"), /isn't on any widget/);
    assert.equal((await ha.test()).count, 3);
    token = "bad";
    assert.match((await ha.sample()).error, /rejected the token/);
  } finally {
    srv.close();
  }
  assert.deepEqual(tapService("scene.movie", "scening"), { domain: "scene", service: "turn_on" });
  assert.equal(tapService("sensor.x", "1"), null);
});

// ------------------------------------------------------------ containers ----

const PS = [
  JSON.stringify({ ID: "aaa111bbb222ccc", Names: "web", Image: "nginx:1.27", State: "running", Status: "Up 3 hours" }),
  JSON.stringify({ ID: "ddd333", Names: ["db"], Image: "postgres:17", State: "Exited", Status: "Exited (0) 2 days ago" }),
  "not json",
].join("\n");

test("containers: Docker and Podman output parse the same way", () => {
  const c = parseContainers(PS);
  assert.deepEqual(c.map((x) => [x.id, x.name, x.running]), [["aaa111bbb222", "web", true], ["ddd333", "db", false]]);
});

test("containers: falls back to Podman, controls only listed ids, explains a stopped daemon", async () => {
  const calls = [];
  const runImpl = async (bin, args) => {
    calls.push(`${bin} ${args.join(" ")}`);
    if (bin === "docker") throw Object.assign(new Error("spawn docker ENOENT"), { code: "ENOENT" });
    return { stdout: args[0] === "ps" ? PS : "" };
  };
  const d = createDocker({ getSettings: () => ({}), isWanted: () => true, runImpl, log: quiet });
  const s = await d.sample();
  assert.equal(s.engine, "podman");
  await d.control("ddd333", "start");
  assert.equal(calls.at(-1), "podman start ddd333");
  await assert.rejects(d.control("zzz", "stop"), /gone/);
  await assert.rejects(d.control("ddd333", "rm"), /Unknown action/);

  const down = createDocker({ getSettings: () => ({ control: { containers: "docker" } }), isWanted: () => true, runImpl: async () => { throw Object.assign(new Error("x"), { code: 1, stderr: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock" }); }, log: quiet });
  assert.match((await down.sample()).error, /Docker isn't running/);
  assert.equal(await createDocker({ getSettings: () => ({}), isWanted: () => false }).sample(), null);
});

// ---------------------------------------------------------- Wake-on-LAN ----

test("Wake-on-LAN: magic packet layout and delivery", async () => {
  assert.equal(parseMac("zz"), null);
  const p = magicPacket("3c:22:fb:12:34:56");
  assert.equal(p.length, 102);
  assert.ok(p.subarray(0, 6).every((b) => b === 0xff));
  for (let i = 0; i < 16; i++) assert.equal(p.subarray(6 + i * 6, 12 + i * 6).toString("hex"), "3c22fb123456");
  assert.throws(() => magicPacket("12:34"), /MAC address/);

  const sock = dgram.createSocket("udp4");
  const got = [];
  sock.on("message", (m) => got.push(m));
  await new Promise((r) => sock.bind(0, "127.0.0.1", r));
  await wake({ mac: "3C-22-FB-12-34-56", address: "127.0.0.1", port: sock.address().port });
  await until(() => got.length === 3);
  assert.deepEqual(got[0], p);
  sock.close();
});

// ------------------------------------------------------------------ OSC ----

test("OSC: arguments parse, encode to 4-byte boundaries, and arrive intact", async () => {
  assert.deepEqual(parseOscArgs('1 0.5 "two words" go true'), [
    { type: "i", value: 1 },
    { type: "f", value: 0.5 },
    { type: "s", value: "two words" },
    { type: "s", value: "go" },
    { type: "T" },
  ]);
  const b = encodeOsc("/cue", [{ type: "i", value: 7 }]);
  assert.equal(b.length % 4, 0);
  assert.equal(b.subarray(0, 8).toString("hex"), "2f63756500000000"); // "/cue" + 4 NULs
  assert.throws(() => encodeOsc("no slash"), /starts with/);

  const sock = dgram.createSocket("udp4");
  const got = [];
  sock.on("message", (m) => got.push(decodeOsc(m)));
  await new Promise((r) => sock.bind(0, "127.0.0.1", r));
  await sendOsc({ host: "127.0.0.1", port: sock.address().port, address: "/scene/go", args: '3 0.25 "Main stage" false' });
  await until(() => got.length);
  assert.deepEqual(got[0], { address: "/scene/go", args: [3, 0.25, "Main stage", false] });
  sock.close();
});

// -------------------------------------------------------------- services ----

test("services: start shows output, stop ends it, only configured ids run", async () => {
  const script = "console.log('ready on 3000'); setInterval(() => console.log('tick'), 50)";
  const settings = { control: { services: [{ id: "web", name: "Web", cmd: process.execPath, args: `-e "${script}"`, cwd: "", url: "http://localhost:3000" }, { id: "bad", name: "Bad", cmd: process.execPath, args: '-e "process.exit(3)"', cwd: "" }] } };
  const svc = createServices({ getSettings: () => settings, log: quiet });
  let changes = 0;
  svc.setOnChange(() => changes++);
  try {
    await svc.control("web", "start");
    const s = await until(async () => {
      const v = (await svc.sample()).services[0];
      return v.lines.includes("ready on 3000") && v;
    });
    assert.equal(s.state, "running");
    assert.equal(s.url, "http://localhost:3000");
    assert.deepEqual(await svc.control("web", "start"), { ok: true, already: true });
    await svc.control("web", "restart");
    assert.equal((await svc.sample()).services[0].state, "running");
    await svc.control("web", "stop");
    await until(async () => (await svc.sample()).services[0].state !== "running");

    await svc.control("bad", "start");
    const bad = await until(async () => {
      const v = (await svc.sample()).services[1];
      return v.state === "failed" && v;
    });
    assert.equal(bad.code, 3);
    assert.ok(changes >= 2);
    await assert.rejects(svc.control("rm-rf", "start"), /No such service/);
  } finally {
    svc.stopAll();
  }
});

// --------------------------------------------------------------- meeting ----

test("meeting: per-OS shortcuts, app focused first, mute-everything restores", async () => {
  assert.equal(meetingCombo("zoom", "mic", "darwin"), "cmd+shift+a");
  assert.equal(meetingCombo("zoom", "mic", "win32"), "alt+a");
  assert.equal(meetingCombo("teams", "leave", "win32"), "ctrl+shift+h");
  assert.equal(meetingCombo("meet", "share", "darwin"), null);
  assert.equal(meetingCombo("skype", "mic"), null);

  const ran = [];
  const sent = [];
  let vol = { input: 60, muted: false };
  const runImpl = async (_bin, args) => {
    const script = args.at(-1);
    ran.push(script);
    if (/get volume settings/.test(script)) return { stdout: `${vol.input},${vol.muted}\n` };
    const iv = /input volume (\d+)/.exec(script);
    if (iv) vol.input = Number(iv[1]);
    const om = /output muted (true|false)/.exec(script);
    if (om) vol.muted = om[1] === "true";
    return { stdout: "" };
  };
  const m = createMeeting({ execute: async (a) => sent.push(a.combo), platform: "darwin", runImpl, log: quiet });
  await m.press("teams", "camera");
  assert.match(ran[0], /tell application "Microsoft Teams" to activate/);
  assert.deepEqual(sent, ["cmd+shift+o"]);
  await m.press("meet", "mic"); // browser app: nothing to focus
  assert.equal(ran.length, 1);
  assert.deepEqual(sent, ["cmd+shift+o", "cmd+d"]);

  assert.equal((await m.muteAll()).allMuted, true);
  assert.deepEqual(vol, { input: 0, muted: true });
  assert.equal((await m.sample()).allMuted, true);
  assert.equal((await m.muteAll()).allMuted, false);
  assert.deepEqual(vol, { input: 60, muted: false });

  const win = createMeeting({ execute: async () => {}, platform: "win32", runImpl, log: quiet });
  await assert.rejects(win.muteAll(), /Stage 12/);
});

// -------------------------------------------------------------- trackpad ----

test("trackpad: commands are clamped; it's off unless turned on", async () => {
  assert.equal(pointerLine({ op: "move", dx: 9999, dy: -3.6 }), "move 400 -4");
  assert.equal(pointerLine({ op: "click", button: "middle" }), "click left");
  assert.equal(pointerLine({ op: "scroll", dx: 0, dy: -80 }), "scroll 0 -50");
  assert.equal(pointerLine({ op: "exec" }), null);

  const settings = { control: cleanControl({}) };
  const sent = [];
  const c = createControl({
    getSettings: () => settings,
    getWidgets: () => [],
    publish: () => {},
    widgetAllows: () => false,
    execute: async () => {},
    log: quiet,
    overrides: { pointer: { send: async (r) => (sent.push(r), { ok: true }), stop() {} }, containers: { sample: async () => null, control: async () => ({ ok: true }) } },
  });
  assert.match((await c.methods["pointer.send"]({ op: "move", dx: 1, dy: 1 })).error, /trackpad is off/);
  settings.control.trackpad = true;
  assert.equal((await c.methods["pointer.send"]({ op: "move", dx: 1, dy: 1 })).ok, true);
  assert.equal(sent.length, 1);
  // Containers: refused unless that widget allows it.
  assert.match((await c.methods["containers.control"]({ widgetId: "w1", id: "x", action: "stop" }, { client: "phone" })).error, /turned off for this widget/);
  // Wake / OSC: only ids from the editor.
  assert.match((await c.methods["wol.wake"]({ id: "nope" })).error, /No such computer/);
  assert.match((await c.methods["osc.send"]({ id: "nope" })).error, /No such OSC/);
  c.stop();
});

test("settings: Control Deck config is cleaned", () => {
  const c = cleanControl({
    obs: { enabled: true, host: "bad host!", port: 99999 },
    ha: { url: "javascript:alert(1)" },
    wol: [{ name: "Tower", mac: "3c-22-fb-12-34-56" }, { name: "x", mac: "nope" }],
    osc: [{ host: "10.0.0.2", port: 53000, address: "/go", args: "1" }, { host: "10.0.0.2", address: "go" }],
    services: [{ name: "Web", cmd: "npm", args: "run dev" }, { name: "empty", cmd: "  " }],
    trackpad: "yes",
  });
  assert.deepEqual(c.obs, { enabled: true, host: "127.0.0.1", port: 65535 });
  assert.equal(c.ha.url, "");
  assert.deepEqual(c.wol.map((m) => m.mac), ["3C:22:FB:12:34:56"]);
  assert.deepEqual(c.osc.map((o) => o.address), ["/go"]);
  assert.deepEqual(c.services.map((s) => s.id), ["svc1"]);
  assert.equal(c.trackpad, false);
});

test("ws client: refuses a non-WebSocket server and reports nothing listening", async () => {
  const srv = http.createServer((_q, r) => r.end("hi"));
  const port = await listen(srv);
  const err = await new Promise((r) => connect(`ws://127.0.0.1:${port}/`).on("error", r));
  assert.match(err.message, /Not a WebSocket server/);
  srv.close();
  const err2 = await new Promise((r) => connect("ws://127.0.0.1:1/").on("error", r));
  assert.match(err2.message, /Nothing is listening/);
});
