// The widget registry. Each widget module exports
//   { type, meta: {name, category, size, min?, max?, options[]}, needs(options) → kinds[], mount(el, ctx) }
// `meta` is the catalogue entry: the build writes dist/catalog.json from it for
// the editor and for the host's layout validation.

import clock from "./clock.js";
import metric from "./metric.js";
import deck from "./deck.js";

export const WIDGETS = [clock, metric, deck];

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
