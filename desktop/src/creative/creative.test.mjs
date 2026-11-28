// Stage 17: tool shortcuts per app and OS, fixed script templates with
// validated numbers, the ≤4/s limit, colours, and the Blender link.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { TOOLS, toolCombo, CONTROLS, cleanValue, hexToRgb, colorScript, scriptCommand, createCreative } from "./index.mjs";

test("tool keys: documented shortcuts, per OS", () => {
  assert.equal(toolCombo("photoshop", "brush", "darwin"), "b");
  assert.equal(toolCombo("aftereffects", "type", "darwin"), "cmd+t");
  assert.equal(toolCombo("aftereffects", "type", "win32"), "ctrl+t");
  assert.equal(toolCombo("photoshop", "exec", "darwin"), null);
  for (const [app, list] of Object.entries(TOOLS)) {
    assert.ok(list.length >= 9, `${app} has at least 9 tools to pick from`);
    assert.equal(new Set(list.map((t) => t[0])).size, list.length, `${app} tool ids unique`);
  }
});

test("values: clamped to range and step; scripts only ever contain numbers", () => {
  const stroke = CONTROLS.illustrator.stroke;
  assert.equal(cleanValue(stroke, 3.1), 3);
  assert.equal(cleanValue(stroke, 1000), 100);
  assert.equal(cleanValue(stroke, "2;app.quit()"), null);
  assert.match(stroke.set(cleanValue(stroke, 4.5)), /strokeWidth=4\.5;/);
  assert.deepEqual(hexToRgb("#1e90ff"), { r: 30, g: 144, b: 255 });
  assert.equal(hexToRgb("red"), null);
  assert.match(colorScript("photoshop", { r: 1, g: 2, b: 3 }), /c\.rgb\.red=1;c\.rgb\.green=2;c\.rgb\.blue=3/);
  assert.equal(colorScript("premiere", { r: 1, g: 2, b: 3 }), null);
});

test("scripts go to the app as arguments, never inside AppleScript source", () => {
  const [bin, args] = scriptCommand("illustrator", "Adobe Illustrator 2025", "x=1", "darwin");
  assert.equal(bin, "osascript");
  assert.deepEqual(args.slice(-2), ["Adobe Illustrator 2025", "x=1"]);
  assert.match(args[1], /do javascript \(item 2 of argv\)/);
  assert.match(scriptCommand("aftereffects", "Adobe After Effects 2025", "x", "darwin")[1][1], /DoScript/);
  const win = scriptCommand("photoshop", "Photoshop", "x=2", "win32");
  assert.equal(win[2].env.DA_JS, "x=2");
  assert.equal(scriptCommand("premiere", "x", "y", "win32"), null);
});

test("creative methods: running app found, tool sent after focusing, ≤4 sets a second", async () => {
  const sent = [];
  const ran = [];
  let t = 1000;
  const c = createCreative({
    platform: "darwin",
    execute: async (a) => sent.push(a),
    runningApps: async () => ["Finder", "Adobe Illustrator 2025"],
    frontmost: async () => "Finder",
    runImpl: async (bin, args) => (ran.push(args.at(-1)), { stdout: /strokeWidth:''/.test(args.at(-1)) ? "2.5\n" : "ok\n" }),
    now: () => t,
    log: () => {},
  });
  assert.equal((await c.methods["creative.tool"]({ app: "illustrator", tool: "pen" })).ok, true);
  assert.deepEqual(sent, [{ type: "app", target: "Adobe Illustrator 2025" }, { type: "keys", combo: "p" }]);
  assert.match((await c.methods["creative.tool"]({ app: "photoshop", tool: "brush" })).error, /isn't running/);
  assert.equal((await c.methods["creative.get"]({ app: "illustrator", control: "stroke" })).value, 2.5);
  assert.equal((await c.methods["creative.set"]({ app: "illustrator", control: "stroke", value: 6 })).ok, true);
  assert.equal((await c.methods["creative.set"]({ app: "illustrator", control: "stroke", value: 7 })).busy, true, "a second set within 250 ms waits");
  t += 300;
  assert.equal((await c.methods["creative.set"]({ app: "illustrator", control: "stroke", value: 7 })).value, 7);
  assert.equal((await c.methods["creative.set"]({ app: "illustrator", control: "script", value: 7 })).ok, false);
  assert.equal((await c.methods["creative.color"]({ app: "illustrator", hex: "#ff0000" })).ok, true);
  assert.match(ran.at(-1), /c\.red=255;c\.green=0;c\.blue=0/);
});

test("Blender link: token header, ops forwarded, a stopped Blender explained", async () => {
  const secrets = {};
  let got = null;
  const srv = http.createServer((req, res) => {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", () => {
      got = { token: req.headers["x-deskassist-token"], body: JSON.parse(b) };
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  const c = createCreative({ getSecret: (n) => secrets[n], setSecret: (n, v) => (secrets[n] = v), fetchImpl: (url, init) => fetch(url.replace(":18790", `:${port}`), init), log: () => {} });
  const r = await c.methods["blender.op"]({ op: "focal", value: 85 });
  assert.equal(r.ok, true);
  assert.equal(got.token, secrets["blender:token"]);
  assert.match(secrets["blender:token"], /^[0-9a-f]{32}$/);
  assert.deepEqual(got.body, { op: "focal", value: 85 });
  srv.close();
  const off = createCreative({ getSecret: () => "t", fetchImpl: async () => Promise.reject(new Error("ECONNREFUSED")) });
  assert.match((await off.methods["blender.op"]({ op: "xray" })).error, /Blender isn't running/);
});
