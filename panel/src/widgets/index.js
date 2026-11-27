// The widget registry. Each widget module exports
//   { type, meta: {name, category, size, min?, max?, options[]}, needs(options) → kinds[], mount(el, ctx) }
// `meta` is the catalogue entry: the build writes dist/catalog.json from it for
// the editor and for the host's layout validation.

import clock from "./clock.js";
import metric from "./metric.js";
import deck from "./deck.js";
import gauge from "./gauge.js";
import chart from "./chart.js";
import gpu from "./gpu.js";
import storage from "./storage.js";
import { topprocs, processes } from "./procs.js";
import internet from "./internet.js";
import { analog, wordclock, worldclocks, calendar, progress, countdown } from "./time.js";
import { timer, stopwatch, pomodoro, focushistory } from "./timers.js";
import { note, checklist, counter, breathe, quote, title, battery, computers } from "./personal.js";
import { weather, forecast, sunmoon, moon, airquality, rates, crypto, hackernews, news, image, agendaWidget, nextup } from "./web.js";
import { nowplaying, volume, radio, lyrics, mediaserver } from "./media.js";
import { pushvalue, notifications, bigbutton, shortcutgrid, command, ruleswidget, customhtml } from "./automation.js";
import { sessions, aiquota, tokenuse, agentalerts, contributions, prs } from "./ai.js";

export const WIDGETS = [
  // time
  clock, analog, wordclock, worldclocks, calendar, agendaWidget, nextup, progress, countdown, timer, stopwatch, pomodoro, focushistory,
  // weather & web
  weather, forecast, sunmoon, moon, airquality, rates, crypto, hackernews, news, image,
  // computer
  metric, gauge, chart, gpu, storage, topprocs, processes, internet,
  // media
  nowplaying, volume, radio, lyrics, mediaserver,
  // personal
  note, checklist, counter, breathe, quote, title, battery, computers,
  // controls & automation
  deck, bigbutton, shortcutgrid, pushvalue, notifications, command, ruleswidget,
  // ai & code
  sessions, aiquota, tokenuse, agentalerts, contributions, prs,
  // layout
  customhtml,
];

export const REGISTRY = Object.fromEntries(WIDGETS.map((w) => [w.type, w]));

export const CATEGORIES = [
  { id: "time", name: "Time" },
  { id: "computer", name: "Computer" },
  { id: "personal", name: "Personal" },
  { id: "web", name: "Weather & web" },
  { id: "media", name: "Media" },
  { id: "controls", name: "Controls" },
  { id: "ai", name: "AI & code" },
  { id: "layout", name: "Layout" },
];

/** Options with defaults filled in from the widget's meta. */
export function withDefaults(def, options = {}) {
  const out = {};
  for (const o of def.meta.options ?? []) out[o.key] = options[o.key] ?? o.default;
  return { ...options, ...out };
}

/** The catalogue as plain data (no functions). */
export function catalog() {
  return {
    version: 1,
    categories: CATEGORIES,
    widgets: WIDGETS.map((w) => ({ type: w.type, ...w.meta })),
  };
}
