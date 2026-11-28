// 3D printer drivers. Each turns its printer's own status into one shape:
//   { online, state, pct, remainingMin, layer, layers, file, model,
//     temps: { nozzle, nozzleTarget, bed, bedTarget, chamber }, speed, error,
//     slots: [{ color, material, active }] }
// state is one of idle | printing | paused | finished | error | busy | offline.
//
// Sources (docs/printers.md): Moonraker, OctoPrint and PrusaLink publish their
// HTTP APIs; Bambu Lab LAN MQTT and Flashforge are documented by the community
// in prose; Elegoo publishes SDCP; Snapmaker 2.0's HTTP API is documented.
// None of these has been tried on real hardware here ("untested").

import { createHash, randomBytes } from "node:crypto";
import net from "node:net";
import { connect as wsConnect } from "../control/ws.mjs";
import { mqttConnect } from "./mqtt.mjs";

const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10) / 10);
const pct = (v) => (num(v) === null ? null : Math.max(0, Math.min(100, Math.round(Number(v)))));
const base = (cfg, defPort) => `http://${cfg.host}:${cfg.port || defPort}`;
export const blank = () => ({ online: false, state: "offline", pct: null, remainingMin: null, layer: null, layers: null, file: "", model: "", temps: { nozzle: null, nozzleTarget: null, bed: null, bedTarget: null, chamber: null }, speed: null, error: null, slots: [] });

async function getJson(fetchImpl, url, init = {}) {
  const r = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(6000) });
  if (r.status === 401 || r.status === 403) throw new Error("The printer refused the key or password.");
  if (!r.ok) throw Object.assign(new Error(`The printer answered ${r.status}.`), { status: r.status });
  return r.json();
}

// ------------------------------------------------------------- Moonraker ----

export function shapeMoonraker(status, meta = {}) {
  const ps = status.print_stats ?? {};
  const st = { printing: "printing", paused: "paused", complete: "finished", cancelled: "idle", error: "error", standby: "idle" }[ps.state] ?? "idle";
  const progress = status.virtual_sdcard?.progress ?? status.display_status?.progress ?? null;
  const dur = ps.print_duration ?? 0;
  let remaining = null;
  if (st === "printing" || st === "paused") {
    if (meta.estimated_time && progress !== null) remaining = (meta.estimated_time * (1 - progress)) / 60;
    else if (progress > 0.01) remaining = (dur / progress - dur) / 60;
  }
  const chamber = Object.entries(status).find(([k]) => /^temperature_sensor .*chamber/i.test(k))?.[1]?.temperature;
  return {
    ...blank(),
    online: true,
    state: st,
    pct: progress === null ? null : pct(progress * 100),
    remainingMin: remaining === null ? null : Math.round(remaining),
    layer: ps.info?.current_layer ?? null,
    layers: ps.info?.total_layer ?? meta.layer_count ?? null,
    file: ps.filename ?? "",
    temps: { nozzle: num(status.extruder?.temperature), nozzleTarget: num(status.extruder?.target), bed: num(status.heater_bed?.temperature), bedTarget: num(status.heater_bed?.target), chamber: num(chamber) },
    speed: status.gcode_move?.speed_factor ? Math.round(status.gcode_move.speed_factor * 100) : null, // can exceed 100 %
    error: st === "error" ? ps.message || "Error" : null,
    slots: (meta.filament_colors ?? []).map((c, i) => ({ color: String(c).startsWith("#") ? c : `#${c}`, material: (meta.filament_type ?? "").split(";")[i] ?? "", active: i === 0 && (meta.filament_colors ?? []).length === 1 })),
  };
}

async function moonraker(cfg, secret, { fetchImpl = fetch } = {}) {
  const headers = secret ? { "x-api-key": secret } : {};
  const b = base(cfg, 7125);
  const objs = ["print_stats", "virtual_sdcard", "display_status", "extruder", "heater_bed", "gcode_move", "temperature_sensor chamber", "temperature_sensor chamber_temp"].map(encodeURIComponent).join("&");
  const q = await getJson(fetchImpl, `${b}/printer/objects/query?${objs}`, { headers });
  const status = q.result?.status ?? {};
  let meta = {};
  const f = status.print_stats?.filename;
  if (f) meta = (await getJson(fetchImpl, `${b}/server/files/metadata?filename=${encodeURIComponent(f)}`, { headers }).catch(() => null))?.result ?? {};
  return shapeMoonraker(status, meta);
}

// -------------------------------------------------------------- OctoPrint ----

export function shapeOctoprint(job, printer) {
  const s = String(job?.state ?? "").toLowerCase();
  const state = s.startsWith("printing") ? "printing" : s.startsWith("paus") ? "paused" : s.includes("error") ? "error" : s.startsWith("offline") ? "offline" : s.includes("cancel") || s.includes("finish") ? "idle" : "idle";
  const t = printer?.temperature ?? {};
  return {
    ...blank(),
    online: state !== "offline",
    state,
    pct: pct(job?.progress?.completion),
    remainingMin: job?.progress?.printTimeLeft ? Math.round(job.progress.printTimeLeft / 60) : null,
    file: job?.job?.file?.display ?? job?.job?.file?.name ?? "",
    temps: { nozzle: num(t.tool0?.actual), nozzleTarget: num(t.tool0?.target), bed: num(t.bed?.actual), bedTarget: num(t.bed?.target), chamber: num(t.chamber?.actual) },
    error: state === "error" ? job?.state : null,
  };
}

async function octoprint(cfg, secret, { fetchImpl = fetch } = {}) {
  const headers = { "x-api-key": secret ?? "" };
  const b = base(cfg, 80);
  const job = await getJson(fetchImpl, `${b}/api/job`, { headers });
  const printer = await getJson(fetchImpl, `${b}/api/printer`, { headers }).catch((e) => (e.status === 409 ? null : Promise.reject(e)));
  return shapeOctoprint(job, printer);
}

// -------------------------------------------------------------- PrusaLink ----

/** HTTP Digest (RFC 7616, MD5 + qop=auth) Authorization header. Pure apart from the cnonce. */
export function digestHeader({ method, uri, user, password, challenge, nc = 1, cnonce = randomBytes(8).toString("hex") }) {
  const p = Object.fromEntries([...challenge.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g)].map((m) => [m[1], m[2] ?? m[3]]));
  const md5 = (s) => createHash("md5").update(s).digest("hex");
  const ha1 = md5(`${user}:${p.realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const ncs = String(nc).padStart(8, "0");
  const qop = (p.qop ?? "").split(",").map((x) => x.trim()).includes("auth") ? "auth" : null;
  const response = qop ? md5(`${ha1}:${p.nonce}:${ncs}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${p.nonce}:${ha2}`);
  return `Digest username="${user}", realm="${p.realm}", nonce="${p.nonce}", uri="${uri}", response="${response}"${qop ? `, qop=${qop}, nc=${ncs}, cnonce="${cnonce}"` : ""}${p.opaque ? `, opaque="${p.opaque}"` : ""}`;
}

async function digestGet(fetchImpl, url, user, password) {
  const first = await fetchImpl(url, { signal: AbortSignal.timeout(6000) });
  if (first.status !== 401) {
    if (!first.ok) throw new Error(`The printer answered ${first.status}.`);
    return first.json();
  }
  const challenge = first.headers.get("www-authenticate") ?? "";
  const u = new URL(url);
  const r = await fetchImpl(url, { headers: { authorization: digestHeader({ method: "GET", uri: u.pathname + u.search, user, password, challenge }) }, signal: AbortSignal.timeout(6000) });
  if (r.status === 401) throw new Error("The printer refused the user name or password.");
  if (!r.ok) throw new Error(`The printer answered ${r.status}.`);
  return r.status === 204 ? {} : r.json();
}

export function shapePrusaLink(status, job) {
  const s = String(status?.printer?.state ?? "").toUpperCase();
  const state = { PRINTING: "printing", PAUSED: "paused", FINISHED: "finished", STOPPED: "idle", ERROR: "error", ATTENTION: "error", BUSY: "busy", IDLE: "idle", READY: "idle" }[s] ?? "idle";
  const pr = status?.printer ?? {};
  return {
    ...blank(),
    online: true,
    state,
    pct: pct(status?.job?.progress),
    remainingMin: status?.job?.time_remaining ? Math.round(status.job.time_remaining / 60) : null,
    file: job?.file?.display_name ?? job?.file?.name ?? "",
    temps: { nozzle: num(pr.temp_nozzle), nozzleTarget: num(pr.target_nozzle), bed: num(pr.temp_bed), bedTarget: num(pr.target_bed), chamber: null },
    speed: num(pr.speed),
    error: state === "error" ? (s === "ATTENTION" ? "Needs attention" : "Error") : null,
  };
}

async function prusalink(cfg, secret, { fetchImpl = fetch } = {}) {
  const b = base(cfg, 80);
  const get = (path) => (cfg.user ? digestGet(fetchImpl, `${b}${path}`, cfg.user, secret ?? "") : getJson(fetchImpl, `${b}${path}`, { headers: { "x-api-key": secret ?? "" } }));
  const status = await get("/api/v1/status");
  const job = status?.job?.id ? await get("/api/v1/job").catch(() => null) : null;
  return shapePrusaLink(status, job);
}

// ------------------------------------------------------------- Bambu Lab ----

const BAMBU_STATE = { IDLE: "idle", RUNNING: "printing", PREPARE: "busy", SLICING: "busy", PAUSE: "paused", FINISH: "finished", FAILED: "error" };
const SPEED = { 1: "Silent", 2: "Standard", 3: "Sport", 4: "Ludicrous" };

/** Merge one report into the running state (newer P1/A1 firmware sends only what changed). Pure. */
export function mergeBambu(prev, report) {
  const p = report?.print;
  if (!p) return prev;
  const out = { ...prev, ...p };
  if (p.ams) out.ams = { ...(prev.ams ?? {}), ...p.ams };
  return out;
}

export function shapeBambu(p, model = "") {
  const state = BAMBU_STATE[p.gcode_state] ?? (p.gcode_state ? "idle" : "busy");
  const trays = (p.ams?.ams ?? []).flatMap((unit) => (unit.tray ?? []).map((t) => ({ unit: Number(unit.id), id: Number(t.id), t })));
  const now = Number(p.ams?.tray_now);
  const slots = trays.map(({ unit, id, t }) => ({ color: t.tray_color ? `#${String(t.tray_color).slice(0, 6)}` : null, material: t.tray_type ?? "", active: unit * 4 + id === now })).filter((s) => s.color || s.material);
  if (p.vt_tray?.tray_type) slots.push({ color: p.vt_tray.tray_color ? `#${String(p.vt_tray.tray_color).slice(0, 6)}` : null, material: p.vt_tray.tray_type, active: now === 254 });
  return {
    ...blank(),
    online: true,
    model,
    state,
    pct: pct(p.mc_percent),
    remainingMin: num(p.mc_remaining_time),
    layer: num(p.layer_num),
    layers: num(p.total_layer_num),
    file: p.subtask_name || p.gcode_file || "",
    temps: { nozzle: num(p.nozzle_temper), nozzleTarget: num(p.nozzle_target_temper), bed: num(p.bed_temper), bedTarget: num(p.bed_target_temper), chamber: num(p.chamber_temper) },
    speed: SPEED[p.spd_lvl] ?? null,
    error: p.print_error ? `Error ${Number(p.print_error).toString(16).toUpperCase()}` : state === "error" ? "Print failed" : null,
    slots,
  };
}

/** Bambu keeps a live MQTT link (the printer pushes changes). */
function bambuSession(cfg, secret, { connectImpl = mqttConnect, log = () => {} } = {}) {
  let state = {};
  let client = null;
  let error = null;
  let lastMsg = 0;
  let retryAt = 0;
  function open() {
    if (client || Date.now() < retryAt) return;
    if (!cfg.serial || !secret) {
      error = "Add the printer's serial number and LAN access code.";
      return;
    }
    client = connectImpl({ host: cfg.host, port: cfg.port || 8883, username: "bblp", password: secret, useTls: cfg.tls !== false });
    client.on("connect", () => {
      error = null;
      client.subscribe(`device/${cfg.serial}/report`);
      client.publish(`device/${cfg.serial}/request`, { pushing: { sequence_id: "0", command: "pushall" } });
    });
    client.on("message", (_t, payload) => {
      try {
        state = mergeBambu(state, JSON.parse(payload.toString("utf8")));
        lastMsg = Date.now();
      } catch {}
    });
    client.on("error", (err) => (error = err.message));
    client.on("close", () => {
      client = null;
      retryAt = Date.now() + 15_000;
    });
  }
  return {
    async poll() {
      open();
      if (!lastMsg || Date.now() - lastMsg > 120_000) return { ...blank(), error: error ?? "Waiting for the printer…" };
      return shapeBambu(state, cfg.model ?? "");
    },
    close: () => client?.end(),
  };
}

// --------------------------------------------------------- Elegoo (SDCP) ----

export function shapeSdcp(msg) {
  const s = msg?.Status ?? msg?.Data?.Status ?? {};
  const pi = s.PrintInfo ?? {};
  const cur = Array.isArray(s.CurrentStatus) ? s.CurrentStatus : [s.CurrentStatus];
  // SDCP: CurrentStatus 1 = printing; PrintInfo.Status 5/6 = pausing/paused, 9 = complete.
  const state = cur.includes(1) ? ([5, 6].includes(pi.Status) ? "paused" : pi.Status === 9 ? "finished" : "printing") : "idle";
  const ticksLeft = pi.TotalTicks > 0 ? Math.max(0, pi.TotalTicks - pi.CurrentTicks) : null;
  return {
    ...blank(),
    online: true,
    state,
    pct: pct(pi.Progress ?? (pi.TotalTicks > 0 ? (100 * pi.CurrentTicks) / pi.TotalTicks : null)),
    remainingMin: ticksLeft === null ? null : Math.round(ticksLeft / 60),
    layer: num(pi.CurrentLayer),
    layers: num(pi.TotalLayer),
    file: pi.Filename ?? "",
    temps: { nozzle: num(s.TempOfNozzle), nozzleTarget: num(s.TempTargetNozzle), bed: num(s.TempOfHotbed), bedTarget: num(s.TempTargetHotbed), chamber: num(s.TempOfBox) },
    speed: num(pi.PrintSpeedPct),
    error: pi.ErrorNumber ? `Error ${pi.ErrorNumber}` : null,
  };
}

function sdcpSession(cfg, _secret, { connectImpl = wsConnect } = {}) {
  let last = null;
  let lastAt = 0;
  let ws = null;
  let error = null;
  let retryAt = 0;
  const ask = () => {
    try {
      ws?.send(JSON.stringify({ Id: "", Data: { Cmd: 0, Data: {}, RequestID: randomBytes(8).toString("hex"), MainboardID: cfg.serial ?? "", TimeStamp: Math.floor(Date.now() / 1000), From: 1 }, Topic: `sdcp/request/${cfg.serial ?? ""}` }));
    } catch {}
  };
  function open() {
    if (ws || Date.now() < retryAt) return;
    ws = connectImpl(`ws://${cfg.host}:${cfg.port || 3030}/websocket`);
    ws.on("open", () => ((error = null), ask()));
    ws.on("message", (text) => {
      if (text === "pong") return;
      try {
        const m = JSON.parse(text);
        if (m.Status || m.Data?.Status) (last = m), (lastAt = Date.now());
      } catch {}
    });
    ws.on("error", (e) => (error = e.message));
    ws.on("close", () => ((ws = null), (retryAt = Date.now() + 15_000)));
  }
  return {
    async poll() {
      open();
      ask();
      if (!last || Date.now() - lastAt > 60_000) return { ...blank(), error: error ?? "Waiting for the printer…" };
      return shapeSdcp(last);
    },
    close: () => ws?.close(),
  };
}

// ------------------------------------------------------------- Flashforge ----

export function shapeFlashforgeHttp(d) {
  const s = String(d?.status ?? "").toLowerCase();
  const state = { printing: "printing", pausing: "paused", paused: "paused", completed: "finished", ready: "idle", busy: "busy", error: "error", cancel: "idle", heating: "busy" }[s] ?? "idle";
  const slots = (d?.matlStationInfo?.slotInfos ?? []).map((x) => ({ color: x.materialColor || null, material: x.materialName ?? "", active: x.slotId === d?.matlStationInfo?.currentSlot }));
  return {
    ...blank(),
    online: true,
    model: d?.name ?? "",
    state,
    pct: d?.printProgress !== undefined ? pct(Number(d.printProgress) * 100) : null,
    remainingMin: d?.estimatedTime ? Math.round(d.estimatedTime / 60) : null,
    layer: num(d?.printLayer),
    layers: num(d?.targetPrintLayer),
    file: d?.printFileName ?? "",
    temps: { nozzle: num(d?.rightTemp), nozzleTarget: num(d?.rightTargetTemp), bed: num(d?.platTemp), bedTarget: num(d?.platTargetTemp), chamber: num(d?.chamberTemp) },
    speed: num(d?.printSpeedAdjust),
    error: d?.errorCode && d.errorCode !== "0" ? `Error ${d.errorCode}` : null,
    slots,
  };
}

/** Older Flashforge printers: G-code over TCP 8899 (M105 temps, M27 progress, M119 status). Pure parse. */
export function shapeFlashforgeGcode({ m105 = "", m27 = "", m119 = "" }) {
  const t = /T0:\s*([\d.]+)\s*\/\s*([\d.]+)/.exec(m105);
  const b = /B:\s*([\d.]+)\s*\/\s*([\d.]+)/.exec(m105);
  const prog = /(\d+)\/(\d+)/.exec(m27);
  const ms = /MachineStatus:\s*(\w+)/.exec(m119)?.[1] ?? "";
  const paused = /PAUSED/.test(/MoveMode:\s*(\w+)/.exec(m119)?.[1] ?? "");
  const state = ms === "BUILDING_FROM_SD" ? (paused ? "paused" : "printing") : ms === "BUILDING_COMPLETED" ? "finished" : "idle";
  return {
    ...blank(),
    online: true,
    state,
    pct: prog && Number(prog[2]) > 0 ? pct((100 * Number(prog[1])) / Number(prog[2])) : null,
    file: /CurrentFile:\s*(.*)/.exec(m119)?.[1]?.trim() ?? "",
    temps: { nozzle: num(t?.[1]), nozzleTarget: num(t?.[2]), bed: num(b?.[1]), bedTarget: num(b?.[2]), chamber: null },
  };
}

function gcodeQuery(host, port, cmds, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host, port });
    const out = {};
    let i = -1;
    let buf = "";
    const next = () => {
      i++;
      if (i >= cmds.length) return sock.end(), resolve(out);
      buf = "";
      sock.write(`~${cmds[i]}\r\n`);
    };
    const t = setTimeout(() => (sock.destroy(), reject(new Error("The printer didn't answer."))), timeoutMs);
    sock.on("connect", () => {
      cmds.unshift("M601 S1");
      next();
    });
    sock.on("data", (d) => {
      buf += d;
      if (/\bok\r?\n/.test(buf)) {
        out[cmds[i].split(" ")[0].toLowerCase()] = buf;
        next();
      }
    });
    sock.on("close", () => clearTimeout(t));
    sock.on("error", (e) => (clearTimeout(t), reject(e.code === "ECONNREFUSED" ? new Error(`Nothing is listening on ${host}:${port}.`) : e)));
  });
}

async function flashforge(cfg, secret, { fetchImpl = fetch } = {}) {
  if (cfg.serial && secret) {
    const r = await getJson(fetchImpl, `${base(cfg, 8898)}/detail`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ serialNumber: cfg.serial, checkCode: secret }) });
    if (r.code !== 0) throw new Error(r.message || "The printer refused the check code.");
    return shapeFlashforgeHttp(r.detail);
  }
  const r = await gcodeQuery(cfg.host, cfg.port || 8899, ["M105", "M27", "M119"]);
  return shapeFlashforgeGcode({ m105: r.m105, m27: r.m27, m119: r.m119 });
}

// ---------------------------------------------------------- Snapmaker 2.0 ----

export function shapeSnapmaker(s) {
  const st = String(s?.status ?? "").toUpperCase();
  const state = { RUNNING: "printing", PAUSED: "paused", IDLE: "idle", STOPPED: "idle" }[st] ?? "idle";
  return {
    ...blank(),
    online: true,
    state,
    pct: s?.progress !== undefined ? pct(Number(s.progress) * 100) : null,
    remainingMin: s?.remainingTime ? Math.round(s.remainingTime / 60) : null,
    file: s?.fileName ?? "",
    temps: { nozzle: num(s?.nozzleTemperature), nozzleTarget: num(s?.nozzleTargetTemperature), bed: num(s?.heatedBedTemperature), bedTarget: num(s?.heatedBedTargetTemperature), chamber: null },
    speed: null,
  };
}

async function snapmaker(cfg, secret, { fetchImpl = fetch } = {}) {
  if (!secret) throw new Error("Use “Test connection” in the editor and approve DeskAssist on the printer's screen.");
  const s = await getJson(fetchImpl, `${base(cfg, 8080)}/api/v1/status?token=${encodeURIComponent(secret)}`);
  return shapeSnapmaker(s);
}

/** Snapmaker pairing: asks for a token; the user approves it on the touchscreen. */
export async function snapmakerConnect(cfg, token, { fetchImpl = fetch } = {}) {
  const r = await fetchImpl(`${base(cfg, 8080)}/api/v1/connect`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: token ? `token=${encodeURIComponent(token)}` : "", signal: AbortSignal.timeout(8000) });
  if (r.status === 403) return { ok: false, waiting: true, error: "Approve DeskAssist on the printer's screen, then test again." };
  if (!r.ok) return { ok: false, error: `The printer answered ${r.status}.` };
  const j = await r.json();
  return { ok: true, token: j.token ?? token };
}

// ------------------------------------------------------------------ table ----

export const BRANDS = {
  klipper: { name: "Klipper (Moonraker)", poll: moonraker, port: 7125, fields: ["host", "port"], secret: "API key (optional)", doc: "Moonraker HTTP API" },
  octoprint: { name: "OctoPrint", poll: octoprint, port: 80, fields: ["host", "port"], secret: "API key", doc: "OctoPrint REST API" },
  prusalink: { name: "Prusa (PrusaLink)", poll: prusalink, port: 80, fields: ["host", "port", "user"], secret: "Password (user “maker”) or API key", doc: "PrusaLink OpenAPI" },
  bambu: { name: "Bambu Lab (LAN)", session: bambuSession, port: 8883, fields: ["host", "serial"], secret: "LAN access code", doc: "Bambu LAN MQTT (community-documented)" },
  elegoo: { name: "Elegoo Centauri Carbon (SDCP)", session: sdcpSession, port: 3030, fields: ["host", "serial"], secret: null, doc: "SDCP v3 (Elegoo)" },
  flashforge: { name: "Flashforge", poll: flashforge, port: 8898, fields: ["host", "port", "serial"], secret: "Check code (newer models; empty = G-code port 8899)", doc: "Flashforge HTTP / G-code (community-documented)" },
  snapmaker: { name: "Snapmaker 2.0", poll: snapmaker, port: 8080, fields: ["host", "port"], secret: "Token (filled in by Test connection)", doc: "Snapmaker 2.0 HTTP API" },
};

/** Brands with no clean public source yet (R9): shown in the editor as not available. */
export const NO_CLEAN_SOURCE = ["Creality (stock firmware)", "Anycubic (LAN mode)", "Snapmaker J1 / Artisan (SACP)"];
