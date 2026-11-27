// Metric tile: one live number from the computer with a bar.

import { SOURCES, SOURCE_CHOICES, formatValue } from "../sources.js";

export default {
  type: "metric",
  meta: {
    name: "Metric",
    category: "computer",
    size: { w: 3, h: 2 },
    min: { w: 2, h: 1 },
    options: [
      { key: "source", type: "choice", label: "Show", default: "cpu", choices: SOURCE_CHOICES },
      { key: "label", type: "text", label: "Label (optional)", default: "" },
    ],
  },
  needs: (options) => [SOURCES[options.source]?.kind ?? "system"],
  mount(el, ctx) {
    const src = SOURCES[ctx.options.source] ?? SOURCES.cpu;
    el.classList.add("w-metric");
    el.innerHTML = `
      <div class="metric-label"></div>
      <div class="metric-value"><span class="num">—</span><span class="unit"></span></div>
      <div class="metric-bar"><div class="metric-fill"></div></div>`;
    el.querySelector(".metric-label").textContent = ctx.options.label || src.label;
    const num = el.querySelector(".num");
    const unit = el.querySelector(".unit");
    const bar = el.querySelector(".metric-bar");
    const fill = el.querySelector(".metric-fill");
    bar.hidden = !src.max;
    ctx.subscribe(src.kind, (data) => {
      const v = src.pick(data);
      const [n, u] = formatValue(src, v);
      num.textContent = n;
      unit.textContent = u;
      el.dataset.na = Number.isFinite(v) ? "" : "1";
      el.title = Number.isFinite(v) ? "" : "Not available on this computer";
      if (!src.max || !Number.isFinite(v)) {
        fill.style.width = "0%";
        delete el.dataset.level;
        return;
      }
      const p = Math.max(0, Math.min(100, (100 * v) / src.max));
      fill.style.width = `${p}%`;
      el.dataset.level = p >= 90 ? "high" : p >= 70 ? "mid" : "low";
    });
  },
};
