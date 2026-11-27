import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNumber, checkValue, formatNumber, splitArgs, buildArgs, sanitizeShortcuts, publicShortcut, createShortcutRunner, sanitizeCommands, createCommandRunner } from "./shortcuts.mjs";
import { normalizePush, isOn, createPushes } from "./pushes.mjs";
import { sanitizeRules, inHours, holds, createRules } from "./rules.mjs";
import { createWebhooks, keyMatches } from "./webhooks.mjs";

// -------------------------------------------------------------- shortcuts ----

test("numbers: plain digits only, range and step checked", () => {
  assert.equal(parseNumber("37"), 37);
  assert.equal(parseNumber("-5.25"), -5.25);
  for (const bad of ["+3", "1e3", " 4", "1,000", "0x10", "3.", "", "NaN"]) assert.equal(parseNumber(bad), null, bad);
  assert.deepEqual(checkValue({ min: 1, max: 9, step: 2 }, "5"), { ok: true, value: 5 });
  assert.equal(checkValue({ min: 1, max: 9, step: 2 }, "4").ok, false);
  assert.equal(checkValue({ min: 0, max: 100, step: 0.5 }, "101").ok, false);
  assert.equal(checkValue(null, "1").ok, false);
  assert.equal(formatNumber(37.5), "37.5");
  assert.equal(formatNumber(40), "40");
});

test("arguments: quoting, {value} as its own argument, appended otherwise", () => {
  assert.deepEqual(splitArgs(`--name "Two words" 'x y' z`), ["--name", "Two words", "x y", "z"]);
  assert.deepEqual(buildArgs("--percent {value}", 37.5), ["--percent", "37.5"]);
  assert.deepEqual(buildArgs("--go", 3), ["--go", "3"]);
  assert.deepEqual(buildArgs("--percent {value}"), ["--percent"]);
  assert.throws(() => buildArgs("--percent={value}", 1), /own/);
  assert.throws(() => buildArgs(`"at {value}"`, 1), /own/);
});

test("registry: unknown kinds dropped; the phone sees no commands", () => {
  const list = sanitizeShortcuts([
    { id: "seek", label: "Seek", kind: "program", cmd: "/usr/local/bin/seek", args: "--percent {value}", value: { min: 0, max: 100, step: 0.5 } },
    { id: "bad", kind: "rm-rf" },
    { id: "seek", kind: "url", cmd: "dup" },
  ]);
  assert.equal(list.length, 1);
  const pub = publicShortcut(list[0]);
  assert.deepEqual(pub, { id: "seek", label: "Seek", icon: "", color: "#334155", kind: "program", takesNumber: true, toggle: "" });
  assert.ok(!JSON.stringify(pub).includes("/usr/local/bin"));
});

test("runner: program without a shell, URL {value}, rate limit 429, macros", async () => {
  let t = 0;
  const ran = [];
  const executed = [];
  const shortcuts = sanitizeShortcuts([
    { id: "vol", kind: "program", cmd: "/bin/echo", args: "set {value}", value: { min: 0, max: 100, step: 1 } },
    { id: "watch", kind: "url", cmd: "https://example.org/watch?t={value}", value: { min: 0, max: 600, step: 1 } },
    { id: "plain", kind: "url", cmd: "https://example.org/" },
    { id: "combo", kind: "macro", steps: ["plain", 10, "plain"] },
  ]);
  const r = createShortcutRunner({ getShortcuts: () => shortcuts, now: () => t, execute: async (a) => executed.push(a), runProgram: async (cmd, args) => ran.push([cmd, ...args]) });
  assert.deepEqual(await r.run("vol", "40"), { ok: true });
  assert.deepEqual(ran[0], ["/bin/echo", "set", "40"]);
  for (let i = 0; i < 3; i++) await r.run("vol", "41");
  assert.equal((await r.run("vol", "42")).status, 429); // 5th in the same second
  t += 1001;
  assert.equal((await r.run("vol", "42")).ok, true);
  assert.equal((await r.run("vol", "abc")).status, 400);
  await r.run("watch", "90");
  assert.deepEqual(executed.at(-1), { type: "url", target: "https://example.org/watch?t=90" });
  assert.equal((await r.run("plain", "3")).status, 400); // takes no number
  await r.run("combo");
  assert.equal(executed.filter((e) => e.target === "https://example.org/").length, 2);
  assert.equal((await r.run("nope")).status, 404);
});

test("command widgets: output cached for its interval", async () => {
  let t = 0;
  let calls = 0;
  const cmds = sanitizeCommands([{ id: "up", shell: "bash", script: "uptime", every: 30 }, { id: "x", shell: "cmd.exe" }]);
  assert.equal(cmds.length, 1);
  const runner = createCommandRunner({ getCommands: () => cmds, now: () => t, exec: (bin, args, opts, cb) => (calls++, cb(null, "up 3 days\n", "")) });
  assert.equal((await runner.output("up")).output, "up 3 days\n");
  await runner.output("up");
  assert.equal(calls, 1);
  t += 31_000;
  await runner.output("up");
  assert.equal(calls, 2);
});

// ----------------------------------------------------------------- pushes ----

test("pushes: text, numbers, JSON payloads; auto levels; ttl; on/off", () => {
  assert.deepEqual(normalizePush("21.5"), { value: "21.5" });
  assert.deepEqual(normalizePush("passed"), { value: "passed", level: "ok" });
  const p = normalizePush({ value: "running", sub: "main · 3m", progress: 45, items: ["a", { label: "b", value: "2", level: "warn" }], evil: "x" });
  assert.deepEqual(p, { value: "running", sub: "main · 3m", level: "info", progress: 0.45, items: [{ label: "a" }, { label: "b", value: "2", level: "warn" }] });
  assert.equal(isOn("off"), false);
  assert.equal(isOn("RU", "ru"), true);
  assert.equal(isOn("EN", "ru"), false);
  let t = 0;
  const events = [];
  const store = createPushes({ publish: (type, d) => events.push([type, d]), now: () => t });
  store.set("door", "open", 600);
  assert.equal(store.get("door").value, "open");
  t += 601_000;
  assert.equal(store.get("door"), null); // expired
  assert.throws(() => store.set("../x", 1), /bad key/);
  const n = store.notify({ title: "Deploy", text: "live", level: "ok", page: "feeds" });
  assert.equal(events.find(([type]) => type === "notify")[1].title, "Deploy");
  assert.equal(n.page, "feeds");
  assert.throws(() => store.notify({}), /needs a title/);
});

// ------------------------------------------------------------------ rules ----

test("rules: hours window wraps midnight", () => {
  assert.equal(inHours("22:00-07:00", new Date(2026, 0, 1, 23, 30)), true);
  assert.equal(inHours("22:00-07:00", new Date(2026, 0, 1, 12, 0)), false);
  assert.equal(inHours("09:00-17:00", new Date(2026, 0, 1, 17, 0)), false);
  assert.equal(inHours("", new Date()), true);
});

test("rules: each trigger type", async () => {
  const read = {
    apps: async () => ["Safari", "zoom.us"],
    frontmost: async () => "Code",
    media: () => ({ playing: true, state: "playing", app: "Spotify" }),
    push: (k) => ({ temp: { value: "31", at: 0 }, layout: { value: "RU", at: 0 } })[k] ?? null,
    isOn,
    cpu: () => 92,
    idleSec: async () => 400,
    uptimeSec: () => 1000,
    now: () => 120_000,
  };
  const w = (when) => sanitizeRules([{ id: "r", when, then: { type: "notify" } }])[0].when;
  assert.equal(await holds(w({ type: "app_running", apps: "zoom|Teams" }), read), true);
  assert.equal(await holds(w({ type: "app_front", apps: "Code|obs64" }), read), true);
  assert.equal(await holds(w({ type: "media_playing", apps: "Spotify|Music" }), read), true);
  assert.equal(await holds(w({ type: "push_value", key: "temp", op: "gt", value: "30" }), read), true);
  assert.equal(await holds(w({ type: "push_value", key: "layout", op: "on", value: "RU" }), read), true);
  assert.equal(await holds(w({ type: "push_stale", key: "temp", seconds: 60 }), read), true);
  assert.equal(await holds(w({ type: "push_stale", key: "missing", seconds: 60 }), read), true);
  assert.equal(await holds(w({ type: "cpu_above", pct: 90 }), read), true);
  assert.equal(await holds(w({ type: "away", minutes: 5 }), read), true);
  assert.equal(await holds(w({ type: "away", minutes: 10 }), read), false);
});

test("rules: lasts, rest, while-it-lasts, days and pause", async () => {
  let t = new Date(2026, 10, 27, 12, 0).getTime(); // a Friday
  let cond = true;
  const acts = [];
  const list = sanitizeRules([
    { id: "music", when: { type: "always" }, then: { type: "show_page", page: "music" }, lastsSec: 10, restSec: 60, whileLasts: true },
    { id: "weekend", when: { type: "always" }, then: { type: "notify" }, days: [0, 6] },
  ]);
  const read = { now: () => t };
  const rules = createRules({ getRules: () => list.map((r) => (r.id === "music" ? { ...r, when: { type: cond ? "always" : "push_value", key: "nope", op: "on" } } : r)), read: { ...read, push: () => null, isOn }, act: async (r, phase) => acts.push(`${r.id}:${phase}`), now: () => t });
  await rules.tick();
  assert.deepEqual(acts, []); // must last 10 s first; weekend rule is off on a Friday
  t += 11_000;
  await rules.tick();
  assert.deepEqual(acts, ["music:start"]);
  cond = false;
  t += 2000;
  await rules.tick();
  assert.deepEqual(acts, ["music:start", "music:end"]); // ends with its condition
  cond = true;
  t += 12_000;
  await rules.tick();
  assert.equal(acts.length, 2); // resting (60 s since it last fired)
  t += 60_000;
  await rules.tick();
  assert.equal(acts.at(-1), "music:start");
  rules.pause(60);
  cond = false;
  await rules.tick();
  cond = true;
  t += 30_000;
  await rules.tick();
  assert.equal(acts.filter((a) => a === "music:start").length, 2); // paused: no new start
});

// --------------------------------------------------------------- webhooks ----

test("webhooks: push, list, delete, notify, goto, run; key check", async () => {
  const published = [];
  const pushes = createPushes({ publish: (type, d) => published.push([type, d]) });
  const runs = [];
  const hooks = createWebhooks({ pushes, publish: (type, d) => published.push([type, d]), runner: { run: async (id, v) => (runs.push([id, v]), { ok: true }) } });
  const q = (s = "") => new URLSearchParams(s);
  assert.equal((await hooks("POST", "/push/temperature", "21.5", q())).status, 200);
  assert.equal((await hooks("GET", "/push", null, q())).json.values.temperature.value, "21.5");
  assert.equal((await hooks("POST", "/push/build", { value: "passed", sub: "main" }, q("ttl=60"))).json.value.level, "ok");
  assert.equal((await hooks("DELETE", "/push/build", null, q())).json.deleted, true);
  assert.equal((await hooks("POST", "/notify", { title: "Deploy" }, q())).status, 200);
  await hooks("POST", "/goto/music", null, q("countdown=0"));
  assert.deepEqual(published.find(([t]) => t === "goto")[1], { page: "music", countdown: 0 });
  await hooks("POST", "/run/seek", null, q("value=37"));
  assert.deepEqual(runs[0], ["seek", "37"]);
  assert.equal((await hooks("POST", "/push/../../x", "1", q())).status, 404);
  assert.equal(keyMatches("abc", "abc"), true);
  assert.equal(keyMatches("abd", "abc"), false);
  assert.equal(keyMatches("abc", null), false);
});
