import { test } from "node:test";
import assert from "node:assert/strict";
import { moonPhase, weatherLook, groupByDay } from "../src/widgets/web.js";

test("moon phase: known full and new moons", () => {
  const full = moonPhase(Date.UTC(2026, 0, 3, 10)); // full moon 3 Jan 2026
  assert.equal(full.name, "Full moon");
  assert.ok(full.illumination > 0.98);
  const fresh = moonPhase(Date.UTC(2026, 0, 18, 19)); // new moon 18 Jan 2026
  assert.equal(fresh.name, "New moon");
  assert.ok(fresh.illumination < 0.02);
});

test("weather codes map to words and day/night icons", () => {
  assert.deepEqual(weatherLook(0, true), ["☀️", "Clear"]);
  assert.equal(weatherLook(0, false)[0], "🌙");
  assert.equal(weatherLook(63)[1], "Rain");
  assert.equal(weatherLook(81)[1], "Showers");
  assert.equal(weatherLook(95)[1], "Thunderstorm");
});

test("agenda groups by day, skips finished events, caps the count", () => {
  const now = new Date(2026, 10, 27, 12).getTime();
  const at = (d, h) => new Date(2026, 10, 27 + d, h).getTime();
  const events = [
    { title: "done", start: at(0, 9), end: at(0, 10) },
    { title: "lunch", start: at(0, 13), end: at(0, 14) },
    { title: "all day", start: at(0, 0), end: at(1, 0), allDay: true },
    { title: "tomorrow", start: at(1, 9), end: at(1, 10) },
  ];
  const g = groupByDay(events, 16, now);
  assert.deepEqual(g.map((x) => x.events.map((e) => e.title)), [["lunch", "all day"], ["tomorrow"]]);
  assert.equal(groupByDay(events, 1, now).flatMap((x) => x.events).length, 1);
});
