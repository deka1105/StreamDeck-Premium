// OBS Studio over obs-websocket 5 (built into OBS 28+): scenes, the current
// scene's sources, record / stream / virtual camera, and audio input mutes.
// One connection, opened only while an OBS widget is on some layout, kept in
// sync by OBS's own events. The password lives in the secret store.

import { createHash } from "node:crypto";
import { connect } from "./ws.mjs";

const OP = { Hello: 0, Identify: 1, Identified: 2, Event: 5, Request: 6, RequestResponse: 7 };
// Event subscription bits: Scenes 4, Inputs 8, Outputs 64, SceneItems 128.
const SUBSCRIBE = 4 | 8 | 64 | 128;
const sha = (s) => createHash("sha256").update(s).digest("base64");

/** The Identify authentication string for a password and the Hello challenge. Pure. */
export const obsAuth = (password, salt, challenge) => sha(sha(password + salt) + challenge);

const AUDIO_KIND = /audio|wasapi|pulse|alsa|jack|coreaudio|sck_audio/i;

/** Shape the replies into what the widget shows. Pure. */
export function shapeObs({ scenes, record, stream, vcam, items, inputs }) {
  return {
    connected: true,
    current: scenes?.currentProgramSceneName ?? "",
    // OBS lists scenes bottom-up; the panel shows them as OBS's dock does (top first).
    scenes: [...(scenes?.scenes ?? [])].sort((a, b) => b.sceneIndex - a.sceneIndex).map((s) => s.sceneName),
    record: { active: !!record?.outputActive, paused: !!record?.outputPaused, time: record?.outputTimecode?.slice(0, 8) ?? "" },
    stream: { active: !!stream?.outputActive, time: stream?.outputTimecode?.slice(0, 8) ?? "" },
    vcam: { active: !!vcam?.outputActive, available: vcam !== null },
    sources: (items ?? []).map((i) => ({ id: i.sceneItemId, name: i.sourceName, on: !!i.sceneItemEnabled })),
    inputs: inputs ?? [],
  };
}

export function createObs({ getSettings, getSecret, isWanted, connectImpl = connect, log = console.log } = {}) {
  let ws = null;
  let state = null;
  let error = null;
  let pending = new Map();
  let seq = 0;
  let ready = null;
  let retryAt = 0;
  let onChange = () => {};

  const cfg = () => getSettings()?.control?.obs ?? {};

  function drop(reason) {
    for (const p of pending.values()) p.reject(new Error(reason));
    pending = new Map();
    ws = null;
    ready = null;
    state = null;
  }

  function open() {
    if (ready) return ready;
    const c = cfg();
    ready = new Promise((resolve, reject) => {
      const sock = connectImpl(`ws://${c.host || "127.0.0.1"}:${c.port || 4455}`, { protocols: ["obswebsocket.json"] });
      ws = sock;
      sock.on("error", (err) => {
        error = /Nothing is listening/.test(err.message) ? "OBS isn't running, or its WebSocket server is off (Tools › WebSocket Server Settings)." : err.message;
        reject(new Error(error));
      });
      sock.on("close", ({ code } = {}) => {
        if (code === 4009) error = "OBS rejected the password. Set it again in the editor.";
        if (ws === sock) drop(error ?? "OBS closed the connection.");
        retryAt = Date.now() + 10_000;
        reject(new Error(error ?? "OBS closed the connection."));
        onChange();
      });
      sock.on("message", (text) => {
        let m;
        try {
          m = JSON.parse(text);
        } catch {
          return;
        }
        if (m.op === OP.Hello) {
          const d = { rpcVersion: 1, eventSubscriptions: SUBSCRIBE };
          const a = m.d?.authentication;
          if (a) {
            const pw = getSecret("obs:password");
            if (!pw) {
              error = "OBS asks for a password. Add it in the editor (Settings › Control Deck).";
              sock.close();
              return reject(new Error(error));
            }
            d.authentication = obsAuth(pw, a.salt, a.challenge);
          }
          sock.send(JSON.stringify({ op: OP.Identify, d }));
        } else if (m.op === OP.Identified) {
          error = null;
          resolve();
        } else if (m.op === OP.RequestResponse) {
          const p = pending.get(m.d?.requestId);
          if (!p) return;
          pending.delete(m.d.requestId);
          if (m.d.requestStatus?.result) p.resolve(m.d.responseData ?? {});
          else p.reject(new Error(m.d.requestStatus?.comment || `OBS said no (${m.d.requestStatus?.code}).`));
        } else if (m.op === OP.Event) {
          // Anything that changes what the widget shows: refresh soon.
          onChange(m.d?.eventType);
        }
      });
    });
    ready.catch(() => {});
    return ready;
  }

  function request(requestType, requestData) {
    if (!ws) return Promise.reject(new Error("Not connected to OBS."));
    const requestId = `r${++seq}`;
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      try {
        ws.send(JSON.stringify({ op: OP.Request, d: { requestType, requestId, ...(requestData ? { requestData } : {}) } }));
      } catch (err) {
        pending.delete(requestId);
        reject(err);
      }
      setTimeout(() => pending.has(requestId) && (pending.delete(requestId), reject(new Error("OBS didn't answer."))), 5000);
    });
  }

  async function read() {
    const opt = (p) => p.catch(() => null);
    const [scenes, record, stream, vcam, inputList, special] = await Promise.all([
      request("GetSceneList"),
      opt(request("GetRecordStatus")),
      opt(request("GetStreamStatus")),
      opt(request("GetVirtualCamStatus")),
      opt(request("GetInputList")),
      opt(request("GetSpecialInputs")),
    ]);
    const items = scenes?.currentProgramSceneName ? (await opt(request("GetSceneItemList", { sceneName: scenes.currentProgramSceneName })))?.sceneItems : [];
    // Audio inputs: the special ones (Desktop Audio, Mic/Aux) first, then other audio sources.
    const names = [...new Set([...Object.values(special ?? {}).filter(Boolean), ...(inputList?.inputs ?? []).filter((i) => AUDIO_KIND.test(i.inputKind ?? "")).map((i) => i.inputName)])].slice(0, 8);
    const inputs = (await Promise.all(names.map(async (name) => ({ name, muted: (await opt(request("GetInputMute", { inputName: name })))?.inputMuted })))).filter((i) => typeof i.muted === "boolean");
    return shapeObs({ scenes, record, stream, vcam, items, inputs });
  }

  return {
    periodMs: 2000,
    setOnChange(fn) {
      onChange = fn;
    },
    async sample() {
      if (!isWanted() || !cfg().enabled) {
        if (ws) ws.close();
        return cfg().enabled ? null : { connected: false, error: "Turn on OBS in the editor (Settings › Control Deck)." };
      }
      if (!ws && Date.now() < retryAt) return { connected: false, error };
      try {
        await open();
        state = await read();
        return state;
      } catch (err) {
        return { connected: false, error: error ?? err.message };
      }
    },
    /** Run one control from the panel. Only these commands exist. */
    async control(command, arg) {
      await open();
      switch (command) {
        case "scene":
          if (!state?.scenes.includes(arg)) throw new Error("No such scene.");
          await request("SetCurrentProgramScene", { sceneName: arg });
          break;
        case "record":
          await request("ToggleRecord");
          break;
        case "pause":
          await request("ToggleRecordPause");
          break;
        case "stream":
          await request("ToggleStream");
          break;
        case "vcam":
          await request("ToggleVirtualCam");
          break;
        case "source": {
          const s = state?.sources.find((x) => x.id === Number(arg));
          if (!s) throw new Error("No such source.");
          await request("SetSceneItemEnabled", { sceneName: state.current, sceneItemId: s.id, sceneItemEnabled: !s.on });
          break;
        }
        case "mute":
          if (!state?.inputs.some((i) => i.name === arg)) throw new Error("No such input.");
          await request("ToggleInputMute", { inputName: arg });
          break;
        default:
          throw new Error("Unknown OBS command.");
      }
      log(`🎬 OBS ${command}${arg !== undefined ? ` ${arg}` : ""}`);
      state = await read();
      return state;
    },
    close: () => ws?.close(),
  };
}
