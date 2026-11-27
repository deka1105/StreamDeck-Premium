// Smart Stack: one tile, several widgets. Rotates on a timer or by swipe /
// tap on the dots; "smart" jumps to the one that matters now (something
// waiting for you, music playing, an event starting soon).

import { REGISTRY } from "./index.js";

const DEFAULT = "nowplaying, nextup, weather, agentalerts";
const parse = (s) => String(s ?? "").split(",").map((x) => x.trim()).filter((t) => t && t !== "stack");

/** Index of the widget that matters most right now, or -1. Pure. */
export function smartPick(types, data, now = Date.now()) {
  const want = [];
  if ((data.alerts?.alerts?.length ?? 0) + (data.alerts?.prompts?.length ?? 0) > 0) want.push("agentalerts", "sessions");
  const soon = (data.calendar?.events ?? []).some((e) => !e.allDay && e.start > now && e.start - now < 15 * 60_000);
  if (soon) want.push("nextup", "agenda");
  if (data.media?.state === "playing") want.push("nowplaying", "lyrics");
  for (const t of want) {
    const i = types.indexOf(t);
    if (i >= 0) return i;
  }
  return -1;
}

export const stack = {
  type: "stack",
  meta: {
    name: "Smart Stack",
    category: "layout",
    size: { w: 4, h: 3 },
    min: { w: 2, h: 2 },
    options: [
      { key: "types", type: "text", label: "Widgets, in order (comma-separated types)", default: DEFAULT, maxLength: 300 },
      { key: "seconds", type: "number", label: "Rotate every (s, 0 = only by swipe)", default: 12, min: 0, max: 600 },
      { key: "smart", type: "bool", label: "Jump to what matters now", default: true },
    ],
  },
  needs(options) {
    const kinds = parse(options.types).flatMap((t) => REGISTRY[t]?.needs?.({}) ?? []);
    return [...new Set([...kinds, ...(options.smart ? ["alerts"] : [])])];
  },
  mount(el, ctx) {
    el.classList.add("w-stack");
    const types = parse(ctx.options.types).filter((t) => REGISTRY[t]).slice(0, 8);
    if (!types.length) return void (el.innerHTML = `<div class="muted">Add widget types, e.g. ${DEFAULT}</div>`);
    const view = document.createElement("div");
    view.className = "stack-view";
    const dots = document.createElement("div");
    dots.className = "stack-dots";
    el.append(view, dots);
    let i = 0;
    let child = null;
    let lastManual = 0;
    let smartAt = -1;
    const show = (n) => {
      i = (n + types.length) % types.length;
      child?.destroy();
      view.replaceChildren();
      child = ctx.mountChild(view, { id: `s${i}`, type: types[i], options: {} });
      view.dataset.type = types[i];
      dots.innerHTML = types.map((t, k) => `<i data-k="${k}" ${k === i ? 'aria-current="true"' : ""}></i>`).join("");
    };
    show(0);
    dots.addEventListener("click", (e) => {
      const k = e.target.closest("i")?.dataset.k;
      if (k !== undefined) (lastManual = Date.now()), show(Number(k));
    });
    let x0 = null;
    el.addEventListener("pointerdown", (e) => (x0 = e.clientX));
    el.addEventListener("pointerup", (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 30) {
        e.stopPropagation();
        lastManual = Date.now();
        show(i + (dx < 0 ? 1 : -1));
      }
    });
    if (ctx.options.seconds > 0)
      ctx.every(ctx.options.seconds * 1000, () => {
        if (Date.now() - lastManual > 30_000 && smartAt < 0) show(i + 1);
      });
    if (ctx.options.smart) {
      const check = () => {
        const k = smartPick(types, { alerts: ctx.peek("alerts"), calendar: ctx.peek("calendar"), media: ctx.peek("media") });
        if (k >= 0 && k !== smartAt && Date.now() - lastManual > 30_000) show(k);
        smartAt = k;
      };
      for (const kind of ["alerts", "calendar", "media"]) ctx.subscribe(kind, check);
    }
  },
};
