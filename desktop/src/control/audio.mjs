// Stage 12 audio: output and input devices, per-app volume (Windows), levels,
// push-to-talk with a lease, ducking other apps, and audio profiles.
//
// Windows does everything through the native helper (Core Audio).
// macOS gives what AppleScript allows without a driver: output volume and
// mute, input level (0 = "muted"), and a read-only device list. Per-app volume
// and switching devices on macOS would need an audio driver, so those report
// "Windows only" instead of pretending.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

/** A lease that calls `onExpire` unless renewed in time. Pure apart from timers. */
export function createLease({ ms = 1500, onExpire, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer = null;
  return {
    get active() {
      return timer !== null;
    },
    renew() {
      clearTimer(timer);
      timer = setTimer(() => {
        timer = null;
        onExpire();
      }, ms);
    },
    end() {
      clearTimer(timer);
      timer = null;
    },
  };
}

/** Parse `system_profiler SPAudioDataType -json` into input and output device names. Pure. */
export function parseMacAudio(json) {
  const out = { output: [], input: [] };
  for (const group of json?.SPAudioDataType ?? []) {
    for (const d of group._items ?? []) {
      const name = d._name ?? "Audio device";
      if (d.coreaudio_device_output) out.output.push({ id: name, name, default: d.coreaudio_default_audio_output_device === "spaudio_yes" });
      if (d.coreaudio_device_input) out.input.push({ id: name, name, default: d.coreaudio_default_audio_input_device === "spaudio_yes" });
    }
  }
  return out;
}

export function createAudio({ platform = process.platform, helper, getSettings = () => ({}), runImpl = run, log = console.log, leaseMs = 1500 } = {}) {
  const win = platform === "win32";
  const mac = platform === "darwin";
  const settings = () => getSettings()?.audio ?? {};
  let macDevices = { at: 0, value: { output: [], input: [] } };
  let ducked = null; // { name: volumeBefore }
  let ptt = null; // { before: {muted|volume}, ducked }
  let onChange = () => {};

  async function osa(script) {
    const { stdout } = await runImpl("osascript", ["-e", script], { timeout: 5000 });
    return stdout.trim();
  }

  async function macState() {
    const [outVol, outMuted, inVol] = (await osa("set s to get volume settings\nreturn ((output volume of s) as text) & \",\" & ((output muted of s) as text) & \",\" & ((input volume of s) as text)")).split(",");
    if (Date.now() - macDevices.at > 30_000) {
      try {
        const { stdout } = await runImpl("system_profiler", ["SPAudioDataType", "-json"], { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 });
        macDevices = { at: Date.now(), value: parseMacAudio(JSON.parse(stdout)) };
      } catch {
        macDevices.at = Date.now();
      }
    }
    return {
      output: { volume: Number(outVol) / 100, muted: outMuted === "true", devices: macDevices.value.output },
      input: { volume: Number(inVol) / 100, muted: Number(inVol) === 0, devices: macDevices.value.input },
    };
  }

  const unsupported = () => {
    throw new Error(mac ? "Per-app volume and switching devices need Windows (macOS would need an audio driver)." : "Audio control works on Windows and macOS.");
  };

  async function micMuted() {
    if (win) return (await helper.call("deviceState", { flow: "capture" })).muted;
    if (mac) return Number(await osa("input volume of (get volume settings)")) === 0;
    return unsupported();
  }

  async function setMic(on, restoreVolume) {
    if (win) return helper.call("setDeviceMute", { flow: "capture", muted: !on });
    if (mac) return osa(`set volume input volume ${on ? Math.max(1, Math.round((restoreVolume ?? 0.7) * 100)) : 0}`);
    return unsupported();
  }

  async function duck(on) {
    if (!win) unsupported();
    if (on && !ducked) {
      const level = Math.max(0, Math.min(100, Number(settings().duckLevel ?? 30))) / 100;
      const except = new Set((settings().duckExcept ?? []).map((s) => String(s).toLowerCase()));
      ducked = {};
      for (const s of await helper.call("sessions")) {
        if (s.system || except.has(s.name.toLowerCase()) || except.has(s.display.toLowerCase())) continue;
        ducked[s.name] = s.volume;
        await helper.call("setSessionVolume", { name: s.name, volume: s.volume * level }).catch(() => {});
      }
      log(`🔉 ducked ${Object.keys(ducked).length} apps`);
    } else if (!on && ducked) {
      const before = ducked;
      ducked = null;
      for (const [name, volume] of Object.entries(before)) await helper.call("setSessionVolume", { name, volume }).catch(() => {});
      log("🔊 ducking off");
    }
    return { ok: true, ducked: !!ducked };
  }

  // Push-to-talk: the phone holds a lease while the button is down. If the
  // phone goes quiet (app closed, Wi-Fi drop) the lease runs out and the mic
  // goes back to how it was.
  async function pttEnd(reason) {
    if (!ptt) return { ok: true };
    const p = ptt;
    ptt = null;
    lease.end();
    try {
      if (p.wasMuted) await setMic(false);
      if (p.ducked) await duck(false);
    } catch (err) {
      log(`push-to-talk restore failed: ${err.message}`);
    }
    log(`🎙 push-to-talk off (${reason})`);
    onChange();
    return { ok: true };
  }
  const lease = createLease({ ms: leaseMs, onExpire: () => pttEnd("lease expired") });

  return {
    periodMs: 1500,
    setOnChange(fn) {
      onChange = fn;
    },
    async sample() {
      const base = { platform, ptt: !!ptt, ducked: !!ducked, profiles: (settings().profiles ?? []).map(({ id, name }) => ({ id, name })), at: Date.now() };
      try {
        if (win) {
          if (!helper?.available) return { ...base, available: false, error: "The Windows helper isn't installed with this copy of DeskAssist." };
          const [outputs, inputs, sessions] = await Promise.all([helper.call("devices", { flow: "render" }), helper.call("devices", { flow: "capture" }).catch(() => []), helper.call("sessions").catch(() => [])]);
          const def = (l) => l.find((d) => d.default) ?? null;
          return {
            ...base,
            available: true,
            canSwitch: true,
            perApp: true,
            output: { devices: outputs.map(({ id, name, default: d }) => ({ id, name, default: d })), volume: def(outputs)?.volume ?? null, muted: !!def(outputs)?.muted, peak: def(outputs)?.peak ?? 0 },
            input: { devices: inputs.map(({ id, name, default: d }) => ({ id, name, default: d })), volume: def(inputs)?.volume ?? null, muted: !!def(inputs)?.muted, peak: def(inputs)?.peak ?? 0 },
            sessions,
          };
        }
        if (mac) return { ...base, available: true, canSwitch: false, perApp: false, ...(await macState()), sessions: [] };
        return { ...base, available: false, error: "Audio control works on Windows and macOS." };
      } catch (err) {
        return { ...base, available: false, error: err.message };
      }
    },
    /** Just the levels, sampled faster for meters (Windows). */
    levels: {
      periodMs: 250,
      async sample() {
        if (!win || !helper?.available) return null;
        try {
          const [sessions, out, inp] = await Promise.all([helper.call("sessions"), helper.call("devices", { flow: "render" }), helper.call("devices", { flow: "capture" }).catch(() => [])]);
          return { sessions: Object.fromEntries(sessions.map((s) => [s.name, s.peak])), output: out.find((d) => d.default)?.peak ?? 0, input: inp.find((d) => d.default)?.peak ?? 0, at: Date.now() };
        } catch {
          return null;
        }
      },
    },
    methods: {
      async setDefault({ id }) {
        if (!win) unsupported();
        await helper.call("setDefault", { id: String(id ?? "") });
        log("🔈 default audio device changed");
        return { ok: true };
      },
      async setDeviceVolume({ flow, id, volume }) {
        const v = clamp01(volume);
        if (win) await helper.call("setDeviceVolume", { flow: flow === "capture" ? "capture" : "render", ...(id ? { id: String(id) } : {}), volume: v });
        else if (mac) await osa(`set volume ${flow === "capture" ? "input" : "output"} volume ${Math.round(v * 100)}`);
        else unsupported();
        return { ok: true };
      },
      async setDeviceMute({ flow, id, muted }) {
        if (win) await helper.call("setDeviceMute", { flow: flow === "capture" ? "capture" : "render", ...(id ? { id: String(id) } : {}), muted: !!muted });
        else if (mac && flow !== "capture") await osa(`set volume output muted ${!!muted}`);
        else if (mac) await setMic(!muted);
        else unsupported();
        return { ok: true };
      },
      async setSessionVolume({ name, volume }) {
        if (!win) unsupported();
        await helper.call("setSessionVolume", { name: String(name ?? ""), volume: clamp01(volume) });
        return { ok: true };
      },
      async setSessionMute({ name, muted }) {
        if (!win) unsupported();
        await helper.call("setSessionMute", { name: String(name ?? ""), muted: !!muted });
        return { ok: true };
      },
      duck: ({ on }) => duck(!!on),
      async pttDown() {
        if (ptt) {
          lease.renew();
          return { ok: true, active: true };
        }
        const wasMuted = await micMuted();
        let before = null;
        if (mac) before = Number(await osa("input volume of (get volume settings)")) / 100;
        ptt = { wasMuted, ducked: false };
        lease.renew();
        if (wasMuted) await setMic(true, before || 0.7);
        if (settings().pttDuck && win) {
          await duck(true).catch(() => {});
          ptt.ducked = true;
        }
        log("🎙 push-to-talk on");
        onChange();
        return { ok: true, active: true, leaseMs };
      },
      pttHold() {
        if (!ptt) return { ok: false, error: "Push-to-talk isn't held." };
        lease.renew();
        return { ok: true };
      },
      pttUp: () => pttEnd("released"),
      async applyProfile({ id }) {
        if (!win) unsupported();
        const p = (settings().profiles ?? []).find((x) => x.id === id);
        if (!p) return { ok: false, error: "No such profile." };
        const notes = [];
        for (const [flow, want] of [["render", p.output], ["capture", p.input]]) {
          if (!want) continue;
          const list = await helper.call("devices", { flow });
          const d = list.find((x) => x.name.toLowerCase() === want.toLowerCase()) ?? list.find((x) => x.name.toLowerCase().includes(want.toLowerCase()));
          if (d) await helper.call("setDefault", { id: d.id });
          else notes.push(`${want} isn't connected`);
        }
        for (const a of p.apps ?? []) await helper.call("setSessionVolume", { name: a.name, volume: clamp01(a.volume / 100) }).catch(() => notes.push(`${a.name} isn't playing`));
        log(`🎚 audio profile ${p.name}`);
        return { ok: true, notes };
      },
    },
    /** Editor: the current state, to save as a profile. */
    async snapshot() {
      if (!win) unsupported();
      const [outs, ins, sessions] = await Promise.all([helper.call("devices", { flow: "render" }), helper.call("devices", { flow: "capture" }).catch(() => []), helper.call("sessions").catch(() => [])]);
      return { output: outs.find((d) => d.default)?.name ?? "", input: ins.find((d) => d.default)?.name ?? "", apps: sessions.filter((s) => !s.system).map((s) => ({ name: s.name, volume: Math.round(s.volume * 100) })) };
    },
    stop: () => pttEnd("host stopping"),
  };
}
