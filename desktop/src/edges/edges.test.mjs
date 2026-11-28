// Stage 16: desk-edge geometry on fake display layouts, dial maths,
// profiles per frontmost app, settings cleaning, Dock from the work area.
import { test } from "node:test";
import assert from "node:assert/strict";
import { zoneAt, createPressure, controlRect, trayBesideDock, sliderValue, dialValue, dialDistance, floatingDialValue, profileFor, locate, clampToDisplay } from "./geometry.mjs";
import { cleanEdges, effectiveProfile, dockFromWorkArea } from "./config.mjs";
import { parseLightTheme, createEdgeControls } from "./controls.mjs";

const D = { width: 1512, height: 982 };

test("zones: edges, corners, the Dock's own edge, the hidden-dock strip", () => {
  assert.equal(zoneAt({ x: 0, y: 500 }, D), "left");
  assert.equal(zoneAt({ x: 1511, y: 500 }, D), "right");
  assert.equal(zoneAt({ x: 0, y: 50 }, D), null, "outside the middle span of the edge");
  assert.equal(zoneAt({ x: 2, y: 3 }, D), "tl");
  assert.equal(zoneAt({ x: 1510, y: 980 }, D), "br");
  assert.equal(zoneAt({ x: 700, y: 500 }, D), null);
  const dock = { side: "left", x: 0, y: 300, width: 70, height: 380 };
  assert.equal(zoneAt({ x: 1, y: 400 }, D, { dock }), null, "never over the Dock");
  const tray = trayBesideDock(D, { side: "bottom", x: 500, y: 912, width: 512, height: 70 }, { apps: 3 });
  assert.ok(tray.x + tray.width <= 500, "left of the Dock");
  assert.equal(zoneAt({ x: tray.x + 10, y: 981 }, D, { dockTray: tray }), "dock");
  assert.equal(zoneAt({ x: tray.x + 10, y: 950 }, D, { dockTray: tray }), null, "only at the edge");
});

test("tray placement: beside a left/right Dock, above a full-width taskbar, right of a wide Dock", () => {
  assert.equal(trayBesideDock(D, { side: "left", x: 0, y: 300, width: 70, height: 380 }).side, "left");
  assert.equal(trayBesideDock(D, { side: "right", x: 1442, y: 300, width: 70, height: 380 }).x, 1442 - 68 - 4);
  const bar = trayBesideDock({ width: 1920, height: 1080 }, { side: "bottom", x: 0, y: 1032, width: 1920, height: 48 });
  assert.ok(bar.y + bar.height <= 1032);
  const right = trayBesideDock(D, { side: "bottom", x: 100, y: 912, width: 600, height: 70 }, { apps: 4 });
  assert.ok(right.x >= 700, "no room on the left, so on the right");
});

test("pressure: must push into the zone for the set time", () => {
  const p = createPressure(300);
  assert.equal(p("left", 0), null);
  assert.equal(p("left", 200), null);
  assert.equal(p("left", 320), "left");
  assert.equal(p(null, 330), null);
  assert.equal(p("left", 340), null, "restarts after leaving");
  assert.equal(createPressure(0)("tr", 5), "tr");
});

test("value maths: slider, corner dial, detach distance, floating dial", () => {
  const r = controlRect("left", D);
  assert.equal(sliderValue(r.y, r), 1);
  assert.equal(sliderValue(r.y + r.height, r), 0);
  assert.equal(Math.round(sliderValue(r.y + r.height / 4, r) * 100), 75);
  assert.equal(dialValue({ x: 100, y: 0 }, "tl", D), 0);
  assert.equal(dialValue({ x: 0, y: 100 }, "tl", D), 1);
  assert.equal(Math.round(dialValue({ x: D.width - 50, y: D.height - 50 }, "br", D) * 100), 50);
  assert.equal(Math.round(dialDistance({ x: 30, y: 40 }, "tl", D)), 50);
  const c = { x: 100, y: 100 };
  assert.equal(floatingDialValue({ x: 100 - 50 * Math.sin(Math.PI / 6), y: 100 + 50 * Math.cos(Math.PI / 6) }, c), 0, "7 o'clock = 0");
  assert.equal(Math.round(floatingDialValue({ x: 100, y: 50 }, c) * 100), 50, "12 o'clock = half");
  assert.equal(floatingDialValue({ x: 100, y: 160 }, c) === 0 || floatingDialValue({ x: 100, y: 160 }, c) === 1, true, "the gap snaps to an end");
  assert.deepEqual(clampToDisplay({ x: 5000, y: -10 }, D), { x: D.width - 160, y: 0 });
});

test("displays: locate a global point on a two-monitor layout with mixed scale", () => {
  const displays = [
    { id: 1, bounds: { x: 0, y: 0, width: 1512, height: 982 }, scaleFactor: 2 },
    { id: 2, bounds: { x: 1512, y: -200, width: 2560, height: 1440 }, scaleFactor: 1 },
  ];
  assert.deepEqual(locate({ x: 1600, y: -100 }, displays), { display: displays[1], local: { x: 88, y: 100 } });
  assert.equal(locate({ x: 100, y: 1200 }, displays), null);
});

test("Dock / taskbar from bounds vs work area", () => {
  const b = { x: 0, y: 0, width: 1512, height: 982 };
  assert.equal(dockFromWorkArea(b, { x: 0, y: 33, width: 1512, height: 879 }).side, "bottom");
  assert.equal(dockFromWorkArea(b, { x: 70, y: 33, width: 1442, height: 949 }).side, "left");
  assert.equal(dockFromWorkArea(b, { x: 0, y: 33, width: 1442, height: 949 }).side, "right");
  assert.equal(dockFromWorkArea(b, { x: 0, y: 33, width: 1512, height: 949 }), null, "auto-hidden Dock");
});

test("profiles per frontmost app, settings cleaned", () => {
  const e = cleanEdges({
    enabled: true,
    base: { left: "volume", right: "nope", corners: { br: "music", tl: "bogus" }, dock: ["Safari", "", "Notes"] },
    profiles: [{ name: "Design", apps: "Figma|Photoshop", left: "brightness", corners: { br: "timer" } }],
    style: { tint: "red", frost: 99 },
    floating: [{ kind: "volume", x: 10, y: 20 }, { kind: "explode" }],
  });
  assert.equal(e.base.right, "none");
  assert.equal(e.base.corners.tl, "timer", "invalid → default");
  assert.deepEqual(e.base.dock, ["Safari", "Notes"]);
  assert.equal(e.style.tint, "#0f172a");
  assert.equal(e.style.frost, 40);
  assert.equal(e.floating.length, 1);
  const base = effectiveProfile(e, "Safari");
  assert.deepEqual([base.profile, base.left, base.corners.br], [null, "volume", "music"]);
  const fig = effectiveProfile(e, "Figma");
  assert.deepEqual([fig.profile, fig.left, fig.right, fig.corners.br, fig.dock], ["Design", "brightness", "none", "timer", ["Safari", "Notes"]]);
  assert.equal(profileFor("photoshop.exe", e.profiles)?.name, "Design");
});

test("controls: appearance and volume per OS; unavailable things say why", async () => {
  assert.equal(parseLightTheme("    AppsUseLightTheme    REG_DWORD    0x0"), true);
  assert.equal(parseLightTheme("    AppsUseLightTheme    REG_DWORD    0x1"), false);
  const ran = [];
  const sent = [];
  const runImpl = async (bin, args) => {
    ran.push([bin, ...args].join(" "));
    if (/output volume of/.test(args.at(-1))) return { stdout: "42\n" };
    if (/get dark mode/.test(args.at(-1))) return { stdout: "true\n" };
    return { stdout: "" };
  };
  const mac = createEdgeControls({ platform: "darwin", runImpl, execute: async (a) => sent.push(a), log: () => {} });
  assert.deepEqual(await mac.get("volume"), { value: 0.42 });
  assert.deepEqual(await mac.get("appearance"), { value: 1 });
  assert.match((await mac.get("brightness")).reason, /private Apple API/);
  assert.equal((await mac.get("keyboard")).unavailable, true);
  await mac.set("volume", 0.7);
  assert.deepEqual(sent[0], { type: "media", command: "setvol", value: 70 });
  await mac.set("appearance", 0);
  assert.match(ran.at(-1), /set dark mode to false/);
  const t = await mac.act("timer", "start", 90);
  assert.ok(t.endsAt - Date.now() <= 60 * 60_000 + 50, "clamped to 60 minutes");
  assert.equal((await mac.act("timer", "state")).endsAt, t.endsAt);
});
