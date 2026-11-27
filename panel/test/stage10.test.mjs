import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLook, lookVars, PRESETS } from "../src/look.js";
import { inWindow, nightState, shiftFor } from "../src/display.js";

test("looks inherit: preset, then layout, then page; wallpaper null clears", () => {
  const l = resolveLook({ preset: "paper", accent: "#ff0000", wallpaper: { src: "https://x/y.jpg", dim: 0.2 } }, { radius: 4 });
  assert.equal(l.theme, "light");
  assert.equal(l.accent, "#ff0000");
  assert.equal(l.radius, 4);
  assert.equal(l.wallpaper.src, "https://x/y.jpg");
  assert.equal(resolveLook({ wallpaper: { src: "a" } }, { wallpaper: null }).wallpaper, undefined);
  assert.equal(resolveLook({}).accent, PRESETS.midnight.accent);
  const v = lookVars({ tile: "#ffffff", opacity: 0.1, border: false, scale: 1.2 });
  assert.equal(v["--surface"], "rgba(255, 255, 255, 0.1)");
  assert.equal(v["--tile-border"], "1px solid transparent");
  assert.equal(v["--scale"], "1.2");
  assert.equal(lookVars({ scale: 1.2 }, { widget: true })["--scale"], undefined);
});

test("night window wraps past midnight", () => {
  const at = (h, m) => new Date(2026, 10, 27, h, m);
  assert.equal(inWindow("22:30", "07:00", at(23, 0)), true);
  assert.equal(inWindow("22:30", "07:00", at(6, 59)), true);
  assert.equal(inWindow("22:30", "07:00", at(7, 0)), false);
  assert.equal(inWindow("09:00", "17:00", at(12, 0)), true);
  assert.equal(inWindow("09:00", "09:00", at(9, 0)), false);
});

test("night state: PC sleep → black; schedule/pc/rule → night; a tap wakes it", () => {
  const display = { followPcSleep: true, night: { mode: "schedule", from: "22:00", to: "06:00", style: "clock" } };
  const late = new Date(2026, 10, 27, 23, 0).getTime();
  assert.equal(nightState({ display, pc: { displayAsleep: true }, now: late }), "black");
  assert.equal(nightState({ display, pc: { displayAsleep: false }, now: late }), "night");
  assert.equal(nightState({ display, pc: {}, now: late, wokeUntil: late + 1 }), "off");
  const noon = new Date(2026, 10, 27, 12, 0).getTime();
  assert.equal(nightState({ display, pc: {}, now: noon }), "off");
  assert.equal(nightState({ display, pc: {}, now: noon, ruleNight: true }), "night");
  assert.equal(nightState({ display: { night: { mode: "pc", style: "black" } }, pc: { displayAsleep: true }, now: noon }), "black");
});

test("OLED shift stays within a few pixels and moves", () => {
  const seen = new Set();
  for (let i = 0; i < 14; i++) {
    const { x, y } = shiftFor(i);
    assert.ok(Math.abs(x) <= 3 && Math.abs(y) <= 3);
    seen.add(`${x},${y}`);
  }
  assert.ok(seen.size >= 6);
});
