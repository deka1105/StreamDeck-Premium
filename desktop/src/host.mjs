// streamPhoneDeck host core — the server the phone pairs with and talks to.
//
// Transport is plain HTTP; ALL security is application-layer.
//
// PAIRING (spd2, forward secret): the QR carries the host's EPHEMERAL X25519
// public key — never a secret. The phone generates its own ephemeral key, does
// ECDH, and HKDF-derives the shared device key. It proves it actually saw the QR
// (knows the host public key) with an HMAC confirmation tag, which also stops an
// on-path attacker from hijacking the pairing. A screenshot of the QR alone can't
// derive the key, and a later key leak doesn't expose past pairings.
//
// MESSAGES: every request/response is an AES-256-GCM envelope keyed by the device
// key, with a monotonic counter. An attacker on the Wi-Fi can't read, forge,
// modify, replay, or inject — the GCM tag fails on tamper, the counter on resend.

import http from "node:http";
import crypto from "node:crypto";
import os from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import qrcode from "qrcode";
import { execute, validateAction, frontmostApp, runningApps, hostStatus } from "./executor.mjs";
import { createEventBus } from "./events.mjs";
import { createSampler } from "./sampler.mjs";
import { createPanelApi } from "./panelApi.mjs";
import { createProviders } from "./providers/index.mjs";
import { createLocalServer } from "./local.mjs";
import { createPanelStore } from "./panel/store.mjs";
import { createEditorRoutes } from "./panel/editorRoutes.mjs";
import { createWidgetState } from "./panel/widgetState.mjs";
import { createSecrets } from "./secrets.mjs";
import { createLyrics, parseStations } from "./providers/mediaExtras.mjs";
import { createPushes, isOn } from "./panel/pushes.mjs";
import { createShortcutRunner, createCommandRunner, publicShortcut } from "./panel/shortcuts.mjs";
import { createWebhooks, keyMatches, readBody as readHookBody } from "./panel/webhooks.mjs";
import { createRules } from "./panel/rules.mjs";
import { idleSeconds } from "./providers/idle.mjs";
import { createAi } from "./providers/ai.mjs";
import { createGithub } from "./providers/github.mjs";
import { createAgents } from "./panel/agents.mjs";
import { createControl } from "./control/index.mjs";
import { createPhone } from "./control/phone.mjs";
import { createPrinters } from "./printers/index.mjs";
import { createGames } from "./games/index.mjs";
import { createExtras } from "./extras/index.mjs";

const PROTOCOL = "spd2";
const PROTOCOL_VERSION = 2;
const HKDF_INFO = Buffer.from("spd-pair-v2", "utf8");

function lanIPv4() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return "127.0.0.1";
}

// --- AES-256-GCM envelope (the phone mirrors these two functions) ------------

export function seal(keyBuf, obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuf, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(obj), "utf8")), cipher.final()]);
  return { n: iv.toString("base64"), ct: Buffer.concat([ct, cipher.getAuthTag()]).toString("base64") };
}

export function unseal(keyBuf, n, ctB64) {
  const iv = Buffer.from(n, "base64");
  const buf = Buffer.from(ctB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuf, iv);
  decipher.setAuthTag(buf.subarray(buf.length - 16));
  return JSON.parse(Buffer.concat([decipher.update(buf.subarray(0, buf.length - 16)), decipher.final()]).toString("utf8"));
}

// --- X25519 key agreement ----------------------------------------------------

function rawPub(keyObject) {
  return Buffer.from(keyObject.export({ format: "jwk" }).x, "base64url");
}

function importPub(raw32) {
  return crypto.createPublicKey({
    key: { kty: "OKP", crv: "X25519", x: Buffer.from(raw32).toString("base64url") },
    format: "jwk",
  });
}

/** ECDH + HKDF-SHA256 → 32-byte device key, salted by the pairing id. */
function deriveKey(hostPrivKey, peerRawPub, pid) {
  const shared = crypto.diffieHellman({ privateKey: hostPrivKey, publicKey: importPub(peerRawPub) });
  return Buffer.from(crypto.hkdfSync("sha256", shared, Buffer.from(pid, "utf8"), HKDF_INFO, 32));
}

/** HMAC binding pid + both public keys — proves the phone saw the QR. */
function confirmTag(keyBuf, pid, hostRawPub, peerRawPub) {
  return crypto.createHmac("sha256", keyBuf).update(Buffer.concat([Buffer.from(pid, "utf8"), hostRawPub, peerRawPub])).digest();
}

// --- device store ------------------------------------------------------------

function loadDevices(dir) {
  const p = join(dir, "devices.json");
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return [];
  }
}

function saveDevices(dir, devices) {
  writeFileSync(join(dir, "devices.json"), JSON.stringify(devices, null, 2), { mode: 0o600 });
}

// --- host settings (shell policy) --------------------------------------------
// `shell` tiles are arbitrary RCE, so they are OFF by default and only run when
// the host operator opts in. An optional allowlist restricts which commands run
// even when enabled. Persisted next to devices.json.

function loadSettings(dir) {
  const p = join(dir, "settings.json");
  const defaults = { allowShell: false, shellAllowlist: null };
  if (!existsSync(p)) return defaults;
  try {
    const s = JSON.parse(readFileSync(p, "utf8"));
    return {
      allowShell: s.allowShell === true,
      shellAllowlist: Array.isArray(s.shellAllowlist) ? s.shellAllowlist.filter((c) => typeof c === "string") : null,
    };
  } catch {
    return defaults;
  }
}

function saveSettings(dir, settings) {
  writeFileSync(join(dir, "settings.json"), JSON.stringify(settings, null, 2), { mode: 0o600 });
}

// --- allowed-apps store (which apps the phone is permitted to launch) ---------

const DEFAULT_ALLOWED_APPS = ["Safari", "Finder", "Notes", "Visual Studio Code"];

function loadApps(dir) {
  const p = join(dir, "apps.json");
  if (!existsSync(p)) return [...DEFAULT_ALLOWED_APPS];
  try {
    const list = JSON.parse(readFileSync(p, "utf8"));
    return Array.isArray(list) ? list.filter((a) => typeof a === "string") : [...DEFAULT_ALLOWED_APPS];
  } catch {
    return [...DEFAULT_ALLOWED_APPS];
  }
}

function saveApps(dir, apps) {
  writeFileSync(join(dir, "apps.json"), JSON.stringify(apps, null, 2));
}

// --- host --------------------------------------------------------------------

export function createHost({ dir, port = 8788, localPort = 8789, claudeDir = process.env.CLAUDE_CONFIG_DIR || join(os.homedir(), ".claude"), codexDir, name = os.hostname(), dryRun = false, allowShell, providers, secretCrypto = null } = {}) {
  mkdirSync(dir, { recursive: true });
  // Panel plumbing: an event queue, an on-demand sampler feeding it, and the
  // method table both the phone (RPC) and browser panels (loopback) call.
  const bus = createEventBus();
  const widgetState = createWidgetState({ dir, publish: bus.publish });
  const panelStore = createPanelStore({ dir, onChange: (rev) => bus.publish("layout", { rev }) });
  const secrets = createSecrets({ dir, crypto: secretCrypto });
  /** Options of every widget of `type` anywhere in the config (what to fetch). */
  const widgetsOfType = (type) => {
    const cfg = panelStore.config();
    const layouts = [cfg.default, ...Object.values(cfg.devices)];
    return layouts.flatMap((l) => l.pages.flatMap((p) => p.widgets.filter((w) => w.type === type).map((w) => w.options ?? {})));
  };
  const findWidget = (client, pageId, widgetId) =>
    panelStore.layoutFor(client).pages.find((p) => p.id === pageId)?.widgets.find((w) => w.id === widgetId) ?? null;
  const pushes = createPushes({ dir, publish: bus.publish });
  const agents = createAgents({ dir, claudeDir, port: localPort, publish: bus.publish, getSettings: () => panelStore.config().settings, idleSeconds });
  const control = createControl({
    getSettings: () => panelStore.config().settings,
    getWidgets: widgetsOfType,
    secrets,
    execute: (action) => execute(action, { dryRun }),
    publish: bus.publish,
    widgetAllows: (...a) => widgetAllows(...a),
    dryRun,
  });
  const phone = createPhone({ pushes, getSettings: () => panelStore.config().settings, port, dryRun });
  const printers = createPrinters({ getSettings: () => panelStore.config().settings, getSecret: (n) => secrets.get(n), isWanted: () => widgetsOfType("printer").length + widgetsOfType("printers").length > 0 });
  const games = createGames({ dir, getSettings: () => panelStore.config().settings, getSecret: (n) => secrets.get(n), isWanted: () => ["nowgame", "recentgames"].some((t) => widgetsOfType(t).length), execute: (a) => execute(a, { dryRun }) });
  const extras = createExtras({ getWidget: (client, pageId, widgetId) => findWidget(client, pageId, widgetId), getSecret: (n) => secrets.get(n) });
  const provs = {
    printers,
    games,
    ...extras.providers,
    ...control.providers,
    ...(providers ?? createProviders({ dir, getSettings: () => panelStore.config().settings, getWidgets: widgetsOfType, secrets, dryRun })),
    ...pushes.providers(),
    ai: createAi({ claudeDir, ...(codexDir ? { codexDir } : {}), limitsFile: agents.limitsFile }),
    alerts: agents.provider(),
    github: createGithub({ secrets, getWidgets: widgetsOfType }),
  };
  const runner = createShortcutRunner({ getShortcuts: () => panelStore.config().shortcuts, execute, dryRun });
  const commands = createCommandRunner({ getCommands: () => panelStore.config().commands });
  const webhooks = createWebhooks({ pushes, publish: bus.publish, runner });
  // Facts the rules engine reads, each fetched only when a rule needs it.
  const memo = (ms, fn) => {
    let at = 0;
    let v;
    return async () => (Date.now() - at < ms ? v : ((at = Date.now()), (v = await fn().catch(() => v))));
  };
  const startedAt = Date.now();
  const facts = {
    apps: memo(3000, async () => await runningApps()),
    frontmost: memo(1500, async () => await frontmostApp()),
    mediaNow: memo(2000, async () => provs.media?.sample()),
    cpuNow: memo(2000, async () => provs.system?.sample()),
    idle: memo(5000, async () => idleSeconds()),
  };
  let lastMedia = null;
  let lastCpu = null;
  const rules = createRules({
    getRules: () => panelStore.config().rules,
    publish: bus.publish,
    read: {
      apps: facts.apps,
      frontmost: facts.frontmost,
      media: () => lastMedia,
      cpu: () => lastCpu,
      push: (k) => pushes.get(k),
      isOn,
      idleSec: async () => (await facts.idle()) ?? 0,
      uptimeSec: () => (Date.now() - startedAt) / 1000,
      now: () => Date.now(),
    },
    act: async (r, phase) => {
      const t = r.then;
      console.log(`⚙ rule "${r.name}" ${phase}`);
      if (t.type === "show_page") bus.publish(phase === "start" ? "rule" : "rule_end", { id: r.id, name: r.name, page: t.page, countdown: r.countdownSec, priority: r.priority, whileLasts: r.whileLasts });
      else if (t.type === "notify" && phase === "start") pushes.notify({ title: t.title || r.name, text: t.text, level: t.level, page: t.page || undefined });
      else if (t.type === "push_value") phase === "start" ? pushes.set(t.key, t.value) : pushes.delete(t.key);
      else if (t.type === "run_shortcut" && phase === "start") await runner.run(t.id);
      else if (t.type === "night_screen") bus.publish("night", { on: phase === "start", rule: r.id });
    },
  });
  // Keep the media / CPU facts fresh only while some rule uses them.
  const ruleFacts = setInterval(async () => {
    const types = new Set(panelStore.config().rules.filter((r) => r.enabled).map((r) => r.when.type));
    if (types.has("media_playing")) lastMedia = await facts.mediaNow();
    if (types.has("cpu_above")) lastCpu = (await facts.cpuNow())?.cpu ?? null;
  }, 2000);
  ruleFacts.unref?.();
  const lyrics = createLyrics();
  const sampler = createSampler({ providers: provs, publish: bus.publish });
  /** Does this client's layout contain a widget of `type` (id `widgetId`) with option `key` on? */
  const widgetAllows = (client, widgetId, type, key) =>
    panelStore.layoutFor(client).pages.some((p) => p.widgets.some((w) => w.id === widgetId && w.type === type && w.options?.[key] === true));
  const panelApi = createPanelApi({
    bus,
    sampler,
    hostName: name,
    extra: {
      "panel.layout": (_params, ctx) => panelStore.layoutFor(ctx.client),
      "panel.history": ({ kind } = {}) => ({ kind, samples: sampler.history(kind) }),
      // Ending a process is allowed only from a processes widget whose
      // "allow ending processes" option is on, in this client's own layout —
      // checked here, so a phone can't just claim permission (PLAN 4.3).
      "procs.kill": async ({ name: procName, pid, all, widgetId } = {}, ctx) => {
        if (!provs.procs?.kill) return { ok: false, reason: "Not available." };
        if (!widgetAllows(ctx.client, widgetId, "processes", "allowKill")) {
          return { ok: false, reason: "Ending processes is turned off for this widget. Turn it on in the layout editor." };
        }
        const r = await provs.procs.kill({ name: String(procName ?? ""), pid: Number(pid), all: all === true });
        console.log(`${r.ok ? "■" : "⛔"} end ${all ? "all" : `pid ${pid}`} of "${procName}" from ${ctx.client}: ${r.ok ? `ended ${r.ended}` : r.reason}`);
        return r;
      },
      // Open a news article on the computer — only links the panel was shown.
      "feeds.open": async ({ url } = {}) => {
        if (!provs.feeds?.isKnownLink?.(url)) return { ok: false, error: "Unknown link." };
        await execute({ type: "url", target: url }, { dryRun });
        return { ok: true };
      },
      // An image widget's picture, fetched by the computer from the URL set in
      // the editor (the phone can't make the computer fetch anything else).
      "image.fetch": async ({ pageId, widgetId } = {}, ctx) => {
        const w = findWidget(ctx.client, pageId, widgetId);
        if (!w || w.type !== "image" || !/^https?:\/\//.test(w.options?.url ?? "")) return { ok: false, error: "No image set." };
        const r = await fetch(w.options.url, { signal: AbortSignal.timeout(15_000), headers: { "user-agent": "DeskAssist/1.2" } });
        const type = r.headers.get("content-type") ?? "";
        if (!r.ok || !/^image\/(png|jpeg|gif|webp)/.test(type)) return { ok: false, error: `Not an image (HTTP ${r.status}).` };
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 3_000_000) return { ok: false, error: "Image is larger than 3 MB." };
        return { ok: true, src: `data:${type.split(";")[0]};base64,${buf.toString("base64")}` };
      },
      // ---- media (Stage 7) ----
      "media.control": async ({ command, value } = {}) => {
        const cmd = String(command ?? "");
        if (["playpause", "next", "previous", "seek"].includes(cmd)) {
          if (dryRun) return console.log(`  (dry-run) media ${cmd} ${value ?? ""}`), { ok: true };
          await provs.media.control(cmd, value);
        } else if (["mute", "volup", "voldown", "setvol"].includes(cmd)) {
          await execute({ type: "media", command: cmd, value: Number(value) }, { dryRun });
        } else return { ok: false, error: "unknown command" };
        bus.publish("data", { kind: "media", value: await provs.media.sample() });
        return { ok: true };
      },
      "media.art": async ({ artId } = {}) => ({ src: await provs.media.art(String(artId ?? "")) }),
      // Lyrics only for a lyrics widget whose "look up lyrics" option is on.
      "lyrics.get": async ({ pageId, widgetId } = {}, ctx) => {
        const w = findWidget(ctx.client, pageId, widgetId);
        if (!w || w.type !== "lyrics" || w.options?.lookup !== true) return { ok: false, error: "Turn on “Look up lyrics on LRCLIB” for this widget." };
        const m = sampler.latest("media");
        if (!m?.title) return { ok: true, found: false, idle: true };
        return lyrics.get(m);
      },
      // Radio plays a station from the widget's own list (set in the editor).
      "radio.play": async ({ pageId, widgetId, index } = {}, ctx) => {
        const w = findWidget(ctx.client, pageId, widgetId);
        const station = w?.type === "radio" ? parseStations(w.options?.stations)[Number(index)] : null;
        if (!station) return { ok: false, error: "No such station." };
        try {
          const r = provs.radio.play(station);
          bus.publish("data", { kind: "radio", value: await provs.radio.sample() });
          return r;
        } catch (err) {
          return { ok: false, error: err.message };
        }
      },
      "radio.stop": async () => {
        provs.radio.stop();
        bus.publish("data", { kind: "radio", value: await provs.radio.sample() });
        return { ok: true };
      },
      "mediaServer.control": async ({ server, session, command, value } = {}) => {
        try {
          if (dryRun) return console.log(`  (dry-run) media server ${server} ${command}`), { ok: true };
          await provs.mediaServer.control(String(server), String(session), String(command), value);
          return { ok: true };
        } catch (err) {
          return { ok: false, error: err.message };
        }
      },
      "mediaServer.poster": async ({ server, session } = {}) => ({ src: await provs.mediaServer.poster(String(server), String(session)).catch(() => null) }),
      // ---- shortcuts, commands, rules (Stage 8) ----
      "shortcuts.list": () => ({ shortcuts: panelStore.config().shortcuts.map(publicShortcut) }),
      "shortcut.run": async ({ id, value } = {}) => {
        const r = await runner.run(String(id ?? ""), value === undefined || value === null ? undefined : String(value));
        console.log(`${r.ok ? "▶" : "⛔"} shortcut ${id}${value !== undefined ? ` = ${value}` : ""}${r.ok ? "" : `: ${r.error}`}`);
        return r;
      },
      // A command widget's output — the phone never sees the command itself.
      "command.output": async ({ pageId, widgetId } = {}, ctx) => {
        const w = findWidget(ctx.client, pageId, widgetId);
        if (!w || w.type !== "command") return { ok: false, error: "No such widget." };
        return commands.output(String(w.options?.command ?? ""));
      },
      // Claude Code permission prompts and waiting alerts (Stage 9).
      "agent.answer": ({ id, decision } = {}) => agents.answer(String(id ?? ""), decision),
      "agent.dismiss": ({ session } = {}) => agents.dismiss(session),
      // Focus only a session the ai provider currently lists — never an arbitrary pid.
      "agent.focus": async ({ id } = {}) => {
        const s = (await provs.ai.sample()).sessions.find((x) => x.id === id && x.pid);
        return s ? agents.focus(s.pid) : { ok: false, error: "That session has ended." };
      },
      "github.open": async ({ url } = {}) => {
        const gh = await provs.github.sample();
        const known = [...(gh?.prs ?? []), ...(gh?.reviews?.items ?? [])].some((p) => p.url === url);
        if (!known) return { ok: false, error: "Unknown link." };
        await execute({ type: "url", target: url }, { dryRun });
        return { ok: true };
      },
      // ---- Control Deck (Stage 11) ----
      ...control.methods,
      // ---- games and the long tail (Stage 15) ----
      "games.cover": async ({ id } = {}) => ({ ok: true, src: await games.cover(String(id ?? "")) }),
      "games.launch": async ({ id } = {}) => games.launch(String(id ?? "")),
      ...extras.methods,
      // ---- Android phone (Stage 13) ----
      ...phone.methods,
      "rules.pause": ({ minutes } = {}) => rules.pause(Math.max(0, Math.min(24 * 60, Number(minutes) || 0))),
      "rules.state": () => ({ pausedUntil: rules.pausedUntil(), active: rules.active() }),
      "state.get": ({ key } = {}) => ({ key, value: widgetState.get(key) }),
      "state.set": ({ key, value } = {}, ctx) => widgetState.set(key, value, ctx.client),
      "netq.speedtest": async () => {
        if (!provs.netq?.speedtest) return { ok: false, error: "Not available." };
        const r = await provs.netq.speedtest();
        if (r.ok) bus.publish("data", { kind: "netq", value: await provs.netq.sample() });
        return r;
      },
    },
  });
  let devices = loadDevices(dir);
  const settings = loadSettings(dir);
  // An explicit `allowShell` option (e.g. from an env var) overrides the stored setting.
  if (typeof allowShell === "boolean") settings.allowShell = allowShell;
  let allowedApps = loadApps(dir);
  const pendings = new Map(); // pid -> { hostKp, hostRawPub, expiresAt }
  // The last shortcut captured in the desktop "Record a shortcut" UI. Served to
  // phones via the status cmd for ~10 min so the tile editor can offer it.
  const recorded = { combo: null, at: 0 };

  const isAppAllowed = (n) => allowedApps.some((a) => a.toLowerCase() === String(n).toLowerCase());
  function setAppAllowed(nameRaw, on) {
    const nm = String(nameRaw).trim();
    if (!nm) return allowedApps;
    const without = allowedApps.filter((a) => a.toLowerCase() !== nm.toLowerCase());
    allowedApps = (on ? [...without, nm] : without).sort((a, b) => a.localeCompare(b));
    saveApps(dir, allowedApps);
    return allowedApps;
  }

  function startPairing(ttlMs = 120_000) {
    for (const [k, v] of pendings) if (v.expiresAt < Date.now()) pendings.delete(k);

    const pid = crypto.randomBytes(8).toString("hex");
    const hostKp = crypto.generateKeyPairSync("x25519");
    const hostRawPub = rawPub(hostKp.publicKey);
    const expiresAt = Date.now() + ttlMs;
    pendings.set(pid, { hostKp, hostRawPub, expiresAt });

    const payload = { v: PROTOCOL_VERSION, proto: PROTOCOL, name, host: lanIPv4(), port, pid, hpk: hostRawPub.toString("base64") };
    writeFileSync(join(dir, "pairing.json"), JSON.stringify(payload, null, 2)); // dev/test only
    return { payload, expiresAt, deviceId: pid };
  }

  function handlePair(body) {
    if (!body || typeof body.pid !== "string" || typeof body.ppk !== "string" || typeof body.mac !== "string") {
      return { status: 400, json: { error: "bad request" } };
    }
    const pending = pendings.get(body.pid);
    if (!pending || pending.expiresAt < Date.now()) {
      pendings.delete(body.pid);
      return { status: 403, json: { error: "no active pairing" } };
    }
    const peerRawPub = Buffer.from(body.ppk, "base64");
    let key;
    try {
      key = deriveKey(pending.hostKp.privateKey, peerRawPub, body.pid);
    } catch {
      return { status: 400, json: { error: "bad public key" } };
    }
    const expected = confirmTag(key, body.pid, pending.hostRawPub, peerRawPub);
    const got = Buffer.from(body.mac, "base64");
    if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) {
      return { status: 401, json: { error: "bad confirmation" } }; // didn't see the QR
    }

    pendings.delete(body.pid); // single use
    const device = {
      deviceId: body.pid,
      kid: body.pid,
      key: key.toString("base64"),
      name: typeof body.name === "string" ? body.name.slice(0, 64) : "phone",
      lastCtr: 0,
      activated: true,
      createdAt: new Date().toISOString(),
    };
    devices = [...devices, device];
    saveDevices(dir, devices);
    console.log(`✓ Paired "${device.name}" (${device.deviceId})`);
    return { status: 200, sealed: seal(key, { ok: true, host: name }) };
  }

  async function handleRpc(body) {
    if (!body || typeof body.kid !== "string" || typeof body.n !== "string" || typeof body.ct !== "string") {
      return { status: 400, json: { error: "bad request" } };
    }
    const device = devices.find((d) => d.kid === body.kid);
    if (!device) return { status: 404, json: { error: "unknown key" } };

    let msg;
    try {
      msg = unseal(Buffer.from(device.key, "base64"), body.n, body.ct);
    } catch {
      return { status: 401, json: { error: "auth failed" } };
    }
    // Two independent counter channels. The main channel ("cmd") carries every
    // command, exactly as before. The event channel ("ev") carries ONLY the
    // panel's events.wait long-poll, so a 25-second wait never blocks a button
    // press waiting its turn for the next counter. Each channel is strictly
    // increasing on its own; ev can only read events, never act.
    const evChannel = msg.ch === "ev";
    if (evChannel && !(msg.cmd === "panel" && msg.method === "events.wait")) {
      return { status: 400, json: { error: "event channel only carries events.wait" } };
    }
    const lastKey = evChannel ? "lastEvCtr" : "lastCtr";
    if (typeof msg.ctr !== "number" || msg.ctr <= (device[lastKey] ?? 0)) {
      return { status: 409, json: { error: "replay" } };
    }
    device[lastKey] = msg.ctr;

    let reply;
    if (msg.cmd === "panel") {
      try {
        reply = { ok: true, result: await panelApi.call(msg.method, msg.params, { client: device.deviceId }) };
      } catch (err) {
        reply = { ok: false, error: err.message };
      }
    } else if (msg.cmd === "hello") {
      reply = { ok: true, host: name };
    } else if (msg.cmd === "foreground") {
      // Report the focused app so the phone can auto-switch profiles.
      reply = { ok: true, app: await frontmostApp() };
    } else if (msg.cmd === "apps") {
      // Report the running apps for the phone's "Apps" screen.
      reply = { ok: true, apps: await runningApps(), frontmost: await frontmostApp() };
    } else if (msg.cmd === "status") {
      // Live host state: volume, now playing, and any freshly recorded shortcut.
      const s = await hostStatus();
      const fresh = recorded.combo && Date.now() - recorded.at < 10 * 60_000 ? recorded.combo : null;
      reply = { ok: true, ...s, recordedCombo: fresh };
    } else if (msg.cmd === "action") {
      const action = validateAction(msg.action);
      // Every app the action could launch — a macro is walked so a buried step
      // can't bypass the allowlist.
      const appTargets = !action ? []
        : action.type === "app" ? [action.target]
        : action.type === "macro" ? action.steps.filter((s) => s.action.type === "app").map((s) => s.action.target)
        : [];
      const blockedApp = appTargets.find((t) => !isAppAllowed(t));
      if (!action) {
        reply = { ok: false, error: "invalid action" };
      } else if (blockedApp !== undefined) {
        console.log(`⛔ blocked launch of "${blockedApp}" (not in Allowed apps)`);
        reply = { ok: false, error: `“${blockedApp}” isn't allowed — enable it in the desktop app → Allowed apps.` };
      } else {
        console.log(`▶ ${msg.label ?? action.type} [${action.type}] from ${device.name}`);
        try {
          await execute(action, { dryRun, allowShell: settings.allowShell, shellAllowlist: settings.shellAllowlist });
          reply = { ok: true };
        } catch (err) {
          reply = { ok: false, error: err.message };
        }
      }
    } else {
      reply = { ok: false, error: "unknown cmd" };
    }

    saveDevices(dir, devices);
    return { status: 200, sealed: seal(Buffer.from(device.key, "base64"), reply) };
  }

  function send(res, status, obj) {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  }

  function readBody(req) {
    return new Promise((resolve) => {
      let raw = "";
      req.on("data", (c) => {
        raw += c;
        if (raw.length > 1_000_000) req.destroy();
      });
      req.on("end", () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          resolve(null);
        }
      });
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { ok: true, name, v: PROTOCOL_VERSION, proto: PROTOCOL });
    }
    if (req.method === "POST" && url.pathname === "/pair") {
      const r = handlePair(await readBody(req));
      if (r.sealed) return send(res, 200, { pid: undefined, ...r.sealed });
      return send(res, r.status, r.json);
    }
    // Webhooks from other machines: only when turned on, only with the webhook key.
    if (url.pathname.startsWith("/hook/")) {
      const settingsNow = panelStore.config().settings;
      if (!settingsNow.webhooks?.lan) return send(res, 404, { error: "not found" });
      const presented = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || url.searchParams.get("token") || "";
      if (!keyMatches(presented, secrets.get("webhook:key"))) return send(res, 401, { error: "bad webhook key" });
      const r = await webhooks(req.method, url.pathname.slice(5), await readHookBody(req), url.searchParams);
      return send(res, r.status, r.json);
    }
    if (req.method === "POST" && url.pathname === "/rpc") {
      const body = await readBody(req);
      const r = await handleRpc(body);
      if (r.sealed) return send(res, 200, { kid: body?.kid, ...r.sealed });
      return send(res, r.status, r.json);
    }
    return send(res, 404, { error: "not found" });
  });

  function revoke(deviceId) {
    devices = devices.filter((d) => d.deviceId !== deviceId);
    saveDevices(dir, devices);
  }

  return {
    server,
    port,
    name,
    startPairing,
    revoke,
    listDevices: () => devices.map(({ key, ...rest }) => rest),
    listAllowedApps: () => [...allowedApps],
    setAppAllowed,
    getAllowShell: () => settings.allowShell,
    setAllowShell: (on) => {
      settings.allowShell = !!on;
      saveSettings(dir, settings);
    },
    getShellAllowlist: () => settings.shellAllowlist,
    setRecordedCombo: (combo) => {
      recorded.combo = typeof combo === "string" && combo.trim() ? combo.trim().slice(0, 64) : null;
      recorded.at = Date.now();
    },
    bus,
    sampler,
    panelApi,
    panelStore,
    secrets,
    providers: provs,
    pushes,
    webhooks,
    rules,
    runner,
    agents,
    control,
    phone,
    printers,
    games,
    listen: () =>
      new Promise((r) => {
        sampler.start();
        rules.start();
        phone.start();
        provs.netq?.startUsage?.();
        server.listen(port, r);
      }),
    stop: () =>
      new Promise((r) => {
        sampler.stop();
        rules.stop();
        clearInterval(ruleFacts);
        runner.stopAll();
        control.stop();
        phone.stop();
        printers.stop();
        provs.netq?.stopUsage?.();
        provs.radio?.stop?.();
        widgetState.flush();
        bus.close(); // release held long-polls so close() can finish
        server.close(r);
      }),
  };
}

/** Loopback routes for Claude Code hooks and the editor's AI section. */
export function agentRoutes(host) {
  const body = async (req, readJson) => (await readJson(req, 64_000).catch(() => null)) ?? {};
  return {
    "POST /api/agent/permission": async (req, res, { send, readJson }) => {
      const r = await host.agents.permission(await body(req, readJson));
      send(res, r.status, r.json);
    },
    "POST /api/agent/event": async (req, res, { send, readJson }) => {
      const r = host.agents.event(await body(req, readJson));
      send(res, r.status, r.json);
    },
    "GET /api/editor/agents": (_req, res, { send }) => send(res, 200, { ok: true, ...host.agents.status() }),
    "POST /api/editor/agents/install": (_req, res, { send }) => {
      try {
        send(res, 200, { ok: true, ...host.agents.install() });
      } catch (err) {
        send(res, 400, { ok: false, error: err.message });
      }
    },
    "POST /api/editor/agents/remove": (_req, res, { send }) => send(res, 200, { ok: true, ...host.agents.remove() }),
    "POST /api/editor/printers/test": async (req, res, { send, readJson }) => {
      const b = await body(req, readJson);
      try {
        send(res, 200, await host.printers.test(String(b.id ?? ""), { setSecret: (n, v) => host.secrets.set(n, v) }));
      } catch (err) {
        send(res, 200, { ok: false, error: err.message });
      }
    },
    "GET /api/editor/games/running": async (_req, res, { send }) => send(res, 200, { ok: true, programs: await host.games.running() }),
    "GET /api/editor/usb": async (_req, res, { send }) => send(res, 200, { ok: true, ...(await host.phone.usbStatus()) }),
    "POST /api/editor/audio/snapshot": async (_req, res, { send }) => {
      try {
        send(res, 200, { ok: true, ...(await host.control.audioSnapshot()) });
      } catch (err) {
        send(res, 200, { ok: false, error: err.message });
      }
    },
    "POST /api/editor/ha/test": async (_req, res, { send }) => {
      try {
        send(res, 200, await host.control.testHa());
      } catch (err) {
        send(res, 200, { ok: false, error: err.message });
      }
    },
    "POST /api/editor/github-token": async (req, res, { send, readJson }) => {
      const b = await body(req, readJson);
      if (typeof b.token !== "string") return send(res, 400, { ok: false, error: "token required" });
      if (b.token.trim()) host.secrets.set("github:token", b.token.trim());
      else host.secrets.set("github:token", null);
      send(res, 200, { ok: true });
    },
  };
}

/** Loopback webhook routes: /api/push/…, /api/notify, /api/goto/…, /api/refresh, /api/run/…. */
export function webhookRoutes(host) {
  const handler = async (req, res, { send, url }) => {
    const r = await host.webhooks(req.method, url.pathname.slice(4), await readHookBody(req), url.searchParams);
    send(res, r.status, r.json);
  };
  const out = {};
  for (const m of ["GET", "POST", "DELETE"]) for (const p of ["/api/push/*", "/api/goto/*", "/api/run/*"]) out[`${m} ${p}`] = handler;
  out["GET /api/push"] = handler;
  out["POST /api/notify"] = handler;
  out["POST /api/refresh"] = handler;
  return out;
}

// --- CLI: run the host and print a pairing QR to the terminal -----------------

async function main() {
  const dir = join(process.cwd(), ".data");
  const dryRun = ["1", "true", "yes"].includes((process.env.DECK_DRY_RUN ?? "").toLowerCase());
  const port = process.env.DECK_PORT ? Number(process.env.DECK_PORT) : undefined;
  // Shell tiles are opt-in (arbitrary RCE). Enable headless with DECK_ALLOW_SHELL=1.
  const allowShell = process.env.DECK_ALLOW_SHELL
    ? ["1", "true", "yes"].includes(process.env.DECK_ALLOW_SHELL.toLowerCase())
    : undefined;
  const localPort = process.env.DECK_LOCAL_PORT ? Number(process.env.DECK_LOCAL_PORT) : 8789;
  const host = createHost({ dir, dryRun, port, localPort, allowShell });
  await host.listen();
  const local = createLocalServer({
    port: localPort,
    panelApi: host.panelApi,
    routes: { ...createEditorRoutes({ store: host.panelStore, listDevices: host.listDevices, secrets: host.secrets, providers: host.providers, rules: host.rules, runner: host.runner }), ...webhookRoutes(host), ...agentRoutes(host) },
  });
  await local.listen().then(
    () => console.log(`Browser panel (this computer only): http://127.0.0.1:${localPort}/panel/  ·  editor: http://127.0.0.1:${localPort}/editor/`),
    (err) => console.warn(`Browser panel unavailable: ${err.message}`),
  );

  const { payload } = host.startPairing();
  const qr = await qrcode.toString(JSON.stringify(payload), { type: "terminal", small: true });
  console.log(`\nstreamPhoneDeck host — "${host.name}"${dryRun ? " (DRY RUN)" : ""}`);
  console.log(`Listening (HTTP) on http://${payload.host}:${payload.port}`);
  console.log(`Pairing id: ${payload.pid}  (QR carries a public key only — safe to show)`);
  console.log(`Pairing valid ~2 min\n`);
  console.log(qr);
  console.log("Scan with the phone app, or press Ctrl+C to stop.\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
