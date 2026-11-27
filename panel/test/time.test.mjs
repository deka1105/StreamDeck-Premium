import { test } from "node:test";
import assert from "node:assert/strict";
import { wordsFor, monthGrid, progressOf, partsIn } from "../src/widgets/time.js";
import { remaining, nextPhase, fmtClock } from "../src/widgets/timers.js";
import { dailyReset } from "../src/widgets/personal.js";
import { cancels } from "../src/alarms.js";

test("word clock wording", () => {
  assert.deepEqual(wordsFor(3, 0), ["IT", "IS", "THREE", "OCLOCK"]);
  assert.deepEqual(wordsFor(3, 7), ["IT", "IS", "FIVE_M", "PAST", "THREE"]);
  assert.deepEqual(wordsFor(3, 15), ["IT", "IS", "A", "QUARTER", "PAST", "THREE"]);
  assert.deepEqual(wordsFor(3, 30), ["IT", "IS", "HALF", "PAST", "THREE"]);
  assert.deepEqual(wordsFor(3, 40), ["IT", "IS", "TWENTY", "TO", "FOUR"]);
  assert.deepEqual(wordsFor(11, 55), ["IT", "IS", "FIVE_M", "TO", "TWELVE"]);
  assert.deepEqual(wordsFor(0, 0), ["IT", "IS", "TWELVE", "OCLOCK"]);
});

test("month grid: starts on the right weekday and marks today", () => {
  const weeks = monthGrid(new Date(2026, 10, 27), 1); // Nov 2026, Mondays first
  assert.equal(weeks[0][0].day, 26); // Mon 26 Oct
  assert.equal(weeks[0][6].day, 1); // Sun 1 Nov
  assert.equal(weeks.flat().filter((c) => c.today).length, 1);
  assert.equal(weeks.flat().find((c) => c.today).day, 27);
  assert.equal(weeks.flat().filter((c) => c.inMonth).length, 30);
});

test("time progress", () => {
  const p = progressOf(new Date(2026, 0, 1, 12, 0)); // Thu 1 Jan, noon
  assert.equal(p.day, 0.5);
  assert.ok(Math.abs(p.year - 0.5 / 365) < 1e-9);
  assert.ok(p.week > 3 / 7 && p.week < 4 / 7);
});

test("time zones", () => {
  const d = new Date(Date.UTC(2026, 5, 1, 23, 30, 5));
  assert.deepEqual([partsIn(d, "UTC").h, partsIn(d, "UTC").m], [23, 30]);
  assert.equal(partsIn(d, "Asia/Tokyo").h, 8);
});

test("timers: remaining time, paused and running", () => {
  assert.equal(remaining({ running: true, endAt: 10_000 }, 4_000), 6_000);
  assert.equal(remaining({ running: true, endAt: 10_000 }, 12_000), 0);
  assert.equal(remaining({ running: false, remainingMs: 7_000 }, 99), 7_000);
  assert.equal(fmtClock(65_000), "1:05");
  assert.equal(fmtClock(3_725_000), "1:02:05");
});

test("pomodoro phases", () => {
  assert.equal(nextPhase("focus", 1), "short");
  assert.equal(nextPhase("focus", 4), "long");
  assert.equal(nextPhase("short", 2), "focus");
});

test("checklist resets on a new day", () => {
  assert.deepEqual(dailyReset({ day: "2026-11-26", done: ["a"] }, "2026-11-27"), { day: "2026-11-27", done: [] });
  assert.deepEqual(dailyReset({ day: "2026-11-27", done: ["a"] }, "2026-11-27"), { day: "2026-11-27", done: ["a"] });
});

test("alarms: pausing early cancels; a reset at the end doesn't", () => {
  assert.equal(cancels(10_000, { running: false }, 4_000), true); // paused early
  assert.equal(cancels(10_000, { running: false }, 9_800), false); // finished
  assert.equal(cancels(10_000, { running: true, endAt: 10_000 }, 4_000), false); // same alarm
  assert.equal(cancels(null, { running: false }, 1), false);
});
