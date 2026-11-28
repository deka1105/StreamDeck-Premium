// Stage 12: Windows audio, push-to-talk, ducking, profiles, power plans,
// services, brightness, lock/sleep — against a fake helper everywhere, and
// against the real DeskAssistHelper.exe on Windows CI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createAudio, createLease, parseMacAudio } from "./audio.mjs";
import { createSystemControls, parsePowercfgList, parseServices } from "./system.mjs";
import { createWinHelper, helperPath } from "./winhelper.mjs";

const quiet = () => {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** An in-memory stand-in for the helper with two outputs, a mic and three apps. */
function fakeHelper() {
  const st = {
    render: [{ id: "spk", name: "Speakers (Realtek)", default: true, volume: 0.5, muted: false, peak: 0.2 }, { id: "hp", name: "Headphones (USB)", default: false, volume: 0.8, muted: false, peak: 0 }],
    capture: [{ id: "mic", name: "Microphone (USB)", default: true, volume: 0.9, muted: true, peak: 0 }],
    sessions: [
      { name: "Spotify", display: "Spotify", volume: 0.6, muted: false, peak: 0.4, system: false },
      { name: "chrome", display: "Chrome", volume: 1, muted: false, peak: 0.1, system: false },
      { name: "Teams", display: "Teams", volume: 0.9, muted: false, peak: 0, system: false },
      { name: "System sounds", display: "System sounds", volume: 1, muted: false, peak: 0, system: true },
    ],
    calls: [],
  };
  const dev = (flow, id) => (id ? st[flow].find((d) => d.id === id) : st[flow].find((d) => d.default));
  return {
    st,
    available: true,
    async call(op, a = {}) {
      st.calls.push(op);
      const flow = a.flow === "capture" ? "capture" : "render";
      switch (op) {
        case "devices":
          return st[flow].map((d) => ({ ...d }));
        case "deviceState":
          return { volume: dev(flow, a.id).volume, muted: dev(flow, a.id).muted };
        case "setDefault": {
          const f = st.render.some((d) => d.id === a.id) ? "render" : "capture";
          st[f].forEach((d) => (d.default = d.id === a.id));
          return true;
        }
        case "setDeviceVolume":
          dev(flow, a.id).volume = a.volume;
          return true;
        case "setDeviceMute":
          dev(flow, a.id).muted = a.muted;
          return true;
        case "sessions":
          return st.sessions.map((s) => ({ ...s }));
        case "setSessionVolume": {
          const s = st.sessions.find((x) => x.name === a.name);
          if (!s) throw new Error(`${a.name} isn't playing any audio right now.`);
          s.volume = a.volume;
          return true;
        }
        case "setSessionMute":
          st.sessions.find((x) => x.name === a.name).muted = a.muted;
          return true;
        case "monitors":
          return [{ index: 0, name: "DELL U2723QE", percent: 40 }];
        case "setBrightness":
        case "lock":
        case "sleep":
          return true;
        default:
          throw new Error("Unknown request.");
      }
    },
  };
}

test("lease: renewals keep it alive; silence expires it", async () => {
  let expired = 0;
  const l = createLease({ ms: 60, onExpire: () => expired++ });
  l.renew();
  for (let i = 0; i < 4; i++) {
    await wait(30);
    l.renew();
  }
  assert.equal(expired, 0);
  assert.equal(l.active, true);
  await wait(100);
  assert.equal(expired, 1);
  assert.equal(l.active, false);
});

test("Windows audio: devices, per-app volume, switching the default", async () => {
  const h = fakeHelper();
  const a = createAudio({ platform: "win32", helper: h, log: quiet });
  const s = await a.sample();
  assert.equal(s.available, true);
  assert.equal(s.perApp, true);
  assert.equal(s.output.volume, 0.5);
  assert.equal(s.input.muted, true);
  assert.deepEqual(s.sessions.map((x) => x.name), ["Spotify", "chrome", "Teams", "System sounds"]);

  await a.methods.setSessionVolume({ name: "Spotify", volume: 0.25 });
  assert.equal(h.st.sessions[0].volume, 0.25);
  assert.equal(h.st.sessions[1].volume, 1, "only Spotify moved");
  await a.methods.setSessionVolume({ name: "Spotify", volume: 7 });
  assert.equal(h.st.sessions[0].volume, 1, "volume clamped to 1");
  await a.methods.setDefault({ id: "hp" });
  assert.equal((await a.sample()).output.devices.find((d) => d.default).id, "hp");
  await a.methods.setDeviceMute({ flow: "render", muted: true });
  assert.equal(h.st.render.find((d) => d.id === "hp").muted, true);
  const lv = await a.levels.sample();
  assert.equal(lv.sessions.Spotify, 0.4);
});

test("push-to-talk: unmutes while held, restores on release and when the phone goes quiet", async () => {
  const h = fakeHelper();
  const a = createAudio({ platform: "win32", helper: h, log: quiet, leaseMs: 80, getSettings: () => ({ audio: { pttDuck: true, duckLevel: 20, duckExcept: ["Teams"] } }) });
  const mic = () => h.st.capture[0].muted;

  await a.methods.pttDown();
  assert.equal(mic(), false, "mic open while held");
  assert.equal(h.st.sessions[0].volume, 0.6 * 0.2, "Spotify ducked");
  assert.equal(h.st.sessions[2].volume, 0.9, "Teams (excepted) untouched");
  assert.equal((await a.sample()).ptt, true);
  for (let i = 0; i < 4; i++) {
    await wait(40);
    a.methods.pttHold();
  }
  assert.equal(mic(), false, "still open while renewed");
  await a.methods.pttUp();
  assert.equal(mic(), true, "muted again on release");
  assert.equal(h.st.sessions[0].volume, 0.6, "Spotify restored");

  // Lease expiry: no renewals → the mic goes back on its own.
  await a.methods.pttDown();
  assert.equal(mic(), false);
  await wait(150);
  assert.equal(mic(), true, "lease expired and restored");
  assert.equal(a.methods.pttHold().ok, false);

  // A mic that was already open stays open after release.
  h.st.capture[0].muted = false;
  await a.methods.pttDown();
  await a.methods.pttUp();
  assert.equal(mic(), false);
});

test("audio profiles switch devices by name and set app levels", async () => {
  const h = fakeHelper();
  const profiles = [{ id: "music", name: "Music", output: "headphones", input: "", apps: [{ name: "Spotify", volume: 80 }, { name: "Winamp", volume: 50 }] }];
  const a = createAudio({ platform: "win32", helper: h, log: quiet, getSettings: () => ({ audio: { profiles } }) });
  const r = await a.methods.applyProfile({ id: "music" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.notes, ["Winamp isn't playing"]);
  assert.equal(h.st.render.find((d) => d.default).id, "hp");
  assert.equal(h.st.sessions[0].volume, 0.8);
  assert.equal((await a.methods.applyProfile({ id: "nope" })).ok, false);
  const snap = await a.snapshot();
  assert.equal(snap.output, "Headphones (USB)");
  assert.ok(snap.apps.some((x) => x.name === "Spotify" && x.volume === 80));
  assert.equal(snap.apps.some((x) => x.name === "System sounds"), false);
});

test("macOS audio: output and input through AppleScript, Windows-only parts say so", async () => {
  let vol = { out: 40, muted: false, in: 0 };
  const runImpl = async (bin, args) => {
    if (bin === "system_profiler") return { stdout: JSON.stringify({ SPAudioDataType: [{ _items: [{ _name: "MacBook Pro Speakers", coreaudio_device_output: 2, coreaudio_default_audio_output_device: "spaudio_yes" }, { _name: "MacBook Pro Microphone", coreaudio_device_input: 1, coreaudio_default_audio_input_device: "spaudio_yes" }] }] }) };
    const sc = args.at(-1);
    if (/get volume settings\nreturn/.test(sc)) return { stdout: `${vol.out},${vol.muted},${vol.in}\n` };
    if (/input volume of/.test(sc)) return { stdout: `${vol.in}\n` };
    let m;
    if ((m = /set volume input volume (\d+)/.exec(sc))) vol.in = Number(m[1]);
    if ((m = /set volume output volume (\d+)/.exec(sc))) vol.out = Number(m[1]);
    if ((m = /set volume output muted (true|false)/.exec(sc))) vol.muted = m[1] === "true";
    return { stdout: "" };
  };
  const a = createAudio({ platform: "darwin", runImpl, log: quiet, leaseMs: 1000 });
  const s = await a.sample();
  assert.equal(s.perApp, false);
  assert.equal(s.output.volume, 0.4);
  assert.equal(s.input.muted, true);
  assert.equal(s.output.devices[0].name, "MacBook Pro Speakers");
  await a.methods.setDeviceVolume({ flow: "render", volume: 0.75 });
  assert.equal(vol.out, 75);
  await a.methods.pttDown();
  assert.ok(vol.in > 0, "mic opened");
  await a.methods.pttUp();
  assert.equal(vol.in, 0, "mic closed again");
  await assert.rejects(a.methods.setSessionVolume({ name: "Spotify", volume: 1 }), /need Windows/);
  assert.deepEqual(parseMacAudio({}), { output: [], input: [] });
});

test("power plans and services parse; controls refuse what isn't configured", async () => {
  const list = parsePowercfgList(`Existing Power Schemes (* Active)
-----------------------------------
Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced) *
Power Scheme GUID: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c  (High performance)
Energieschema-GUID: a1841308-3541-4fab-bc81-f71556f20b4a  (Energiesparmodus)`);
  assert.deepEqual(list.map((p) => [p.name, p.active]), [["Balanced", true], ["High performance", false], ["Energiesparmodus", false]]);
  assert.deepEqual(parseServices({ Name: "Spooler", DisplayName: "Print Spooler", Status: 4 }), [{ name: "Spooler", display: "Print Spooler", state: "running" }]);
  assert.equal(parseServices([{ Name: "x", Status: "Stopped" }])[0].state, "stopped");

  const ran = [];
  const runImpl = async (bin, args) => {
    ran.push([bin, ...args].join(" "));
    if (bin === "powercfg" && args[0] === "/list") return { stdout: "GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced) *\nGUID: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c  (High performance)" };
    if (bin === "powershell.exe" && /WmiMonitorBrightness /.test(args.at(-1))) return { stdout: "70\r\n" };
    if (bin === "powershell.exe" && /Get-Service/.test(args.at(-1))) return { stdout: JSON.stringify([{ Name: "Spooler", DisplayName: "Print Spooler", Status: 4 }]) };
    return { stdout: "" };
  };
  const sys = createSystemControls({ platform: "win32", helper: fakeHelper(), runImpl, getSettings: () => ({ system: { services: ["Spooler"] } }), log: quiet });
  const s = await sys.sample();
  assert.equal(s.plans.length, 2);
  assert.deepEqual(s.services.map((x) => x.state), ["running"]);
  assert.deepEqual(s.displays.map((d) => [d.index, d.percent]), [[-1, 70], [0, 40]]);
  assert.equal((await sys.methods.setPlan({ guid: "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c" })).ok, true);
  assert.ok(ran.includes("powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"));
  assert.equal((await sys.methods.setPlan({ guid: "00000000-0000-0000-0000-000000000000" })).ok, false);
  assert.match((await sys.methods.service({ name: "WinDefend", action: "stop" })).error, /isn't on your list/);
  assert.equal((await sys.methods.service({ name: "Spooler", action: "restart" })).ok, true);
  assert.match((await sys.methods.power({ action: "sleep" })).error, /Hold the button/);
  assert.equal((await sys.methods.power({ action: "lock", confirm: true })).ok, true);
  assert.equal((await sys.methods.power({ action: "shutdown", confirm: true })).ok, false);
});

test("helper client: request/response by id, errors, restart after a crash", async () => {
  // A stand-in process speaking the helper's line protocol.
  const script = `
    process.stdout.write(JSON.stringify({ready:true,version:"test"})+"\\n");
    require("readline").createInterface({input:process.stdin}).on("line", (l) => {
      const m = JSON.parse(l);
      if (m.op === "crash") process.exit(3);
      const reply = m.op === "ping" ? {id:m.id,ok:true,result:{version:"test"}} : {id:m.id,ok:false,error:"Unknown request."};
      setTimeout(() => process.stdout.write(JSON.stringify(reply)+"\\n"), m.op === "ping" ? 5 : 1);
    });`;
  const h = createWinHelper({ path: process.execPath, spawnImpl: (_p, _a, o) => spawn(process.execPath, ["-e", script], o), log: quiet });
  const [a, b] = await Promise.all([h.call("ping"), h.call("ping")]);
  assert.deepEqual([a.version, b.version], ["test", "test"]);
  await assert.rejects(h.call("nope"), /Unknown request/);
  await assert.rejects(h.call("crash"), /stopped/);
  assert.equal((await h.call("ping")).version, "test", "restarted");
  h.stop();
  assert.equal(createWinHelper({ path: null }).available, false);
});

const real = process.platform === "win32" ? helperPath() : null;
test("the real Windows helper answers (Windows CI)", { skip: !real && "needs DeskAssistHelper.exe on Windows" }, async () => {
  const h = createWinHelper({ path: real, log: quiet });
  try {
    assert.equal((await h.call("ping")).version, "1.0.0");
    await assert.rejects(h.call("explode"), /Unknown request/);
    // CI runners may have no sound card: a list, or a plain "no device" answer.
    for (const flow of ["render", "capture"]) {
      try {
        const list = await h.call("devices", { flow });
        assert.ok(Array.isArray(list));
        for (const d of list) assert.ok(d.id && typeof d.volume === "number");
      } catch (err) {
        assert.match(err.message, /No audio device|audio refused/);
      }
    }
    try {
      assert.ok(Array.isArray(await h.call("sessions")));
    } catch (err) {
      assert.match(err.message, /No audio device|audio refused/);
    }
    assert.ok(Array.isArray(await h.call("monitors")));
    await assert.rejects(h.call("setSessionVolume", { name: "definitely-not-running", volume: 0.5 }), /isn't playing|No audio device|audio refused/);
    await assert.rejects(h.call("setDeviceVolume", { flow: "speaker", volume: 1 }), /flow must be/);
  } finally {
    h.stop();
  }
});
