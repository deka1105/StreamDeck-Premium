// Gauge: a 270° dial for one percentage-like value.

import { SOURCES, SOURCE_CHOICES, formatValue } from "../sources.js";

const NS = "http://www.w3.org/2000/svg";
const R = 40;
const SWEEP = 270;
const C = 2 * Math.PI * R;

export default {
  type: "gauge",
  meta: {
    name: "Gauge",
    category: "computer",
    size: { w: 2, h: 2 },
    min: { w: 2, h: 2 },
    options: [
      { key: "source", type: "choice", label: "Show", default: "cpu", choices: SOURCE_CHOICES.filter((c) => SOURCES[c.value].max) },
      { key: "label", type: "text", label: "Label (optional)", default: "" },
    ],
  },
  needs: (o) => [SOURCES[o.source]?.kind ?? "system"],
  mount(el, ctx) {
    const src = SOURCES[ctx.options.source] ?? SOURCES.cpu;
    el.classList.add("w-gauge");
    const arcLen = (C * SWEEP) / 360;
    el.innerHTML = `
      <svg viewBox="0 0 100 100" class="gauge-svg" aria-hidden="true">
        <circle class="gauge-track" cx="50" cy="50" r="${R}" stroke-dasharray="${arcLen} ${C}" transform="rotate(135 50 50)"/>
        <circle class="gauge-fill" cx="50" cy="50" r="${R}" stroke-dasharray="0 ${C}" transform="rotate(135 50 50)"/>
      </svg>
      <div class="gauge-center"><div class="gauge-num"><span class="num">—</span><span class="unit"></span></div><div class="gauge-label"></div></div>`;
    el.querySelector(".gauge-label").textContent = ctx.options.label || src.label;
    const fill = el.querySelector(".gauge-fill");
    const num = el.querySelector(".num");
    const unit = el.querySelector(".unit");
    ctx.subscribe(src.kind, (d) => {
      const v = src.pick(d);
      const [n, u] = formatValue(src, v);
      num.textContent = n;
      unit.textContent = u;
      const p = Number.isFinite(v) ? Math.max(0, Math.min(1, v / src.max)) : 0;
      fill.setAttribute("stroke-dasharray", `${arcLen * p} ${C}`);
      el.dataset.level = p >= 0.9 ? "high" : p >= 0.7 ? "mid" : "low";
    });
  },
};
export { NS };
