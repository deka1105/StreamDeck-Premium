// Chart: one or two values over the last minutes. History comes from the
// computer (panel.history) so the chart is full the moment it appears.

import { SOURCES, SOURCE_CHOICES, formatValue } from "../sources.js";

const WINDOWS = [
  { value: "60", label: "1 minute" },
  { value: "180", label: "3 minutes" },
  { value: "360", label: "6 minutes" },
];

/** Build an SVG path through points scaled to a w×h box. Pure. */
export function pathFor(points, { w = 100, h = 40, t0, t1, max }) {
  const span = Math.max(1, t1 - t0);
  let d = "";
  for (const [t, v] of points) {
    if (!Number.isFinite(v)) continue;
    const x = ((t - t0) / span) * w;
    const y = h - (Math.max(0, Math.min(max, v)) / max) * h;
    d += `${d ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
  }
  return d;
}

export default {
  type: "chart",
  meta: {
    name: "History chart",
    category: "computer",
    size: { w: 4, h: 2 },
    min: { w: 2, h: 1 },
    options: [
      { key: "source", type: "choice", label: "Show", default: "cpu", choices: SOURCE_CHOICES },
      { key: "source2", type: "choice", label: "And (optional)", default: "none", choices: [{ value: "none", label: "Nothing" }, ...SOURCE_CHOICES] },
      { key: "window", type: "choice", label: "Time span", default: "60", choices: WINDOWS },
    ],
  },
  needs: (o) => [...new Set([SOURCES[o.source]?.kind, SOURCES[o.source2]?.kind].filter(Boolean))],
  mount(el, ctx) {
    const srcs = [ctx.options.source, ctx.options.source2].filter((k) => SOURCES[k]).map((k) => ({ id: k, ...SOURCES[k] }));
    const windowMs = Number(ctx.options.window || 60) * 1000;
    el.classList.add("w-chart");
    el.innerHTML = `
      <div class="chart-head"></div>
      <svg class="chart-svg" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
        ${srcs.map((_, i) => `<path class="chart-area s${i}"/><path class="chart-line s${i}"/>`).join("")}
      </svg>`;
    const head = el.querySelector(".chart-head");
    head.innerHTML = srcs.map((s, i) => `<span class="chart-key s${i}"><b></b><span class="chart-name"></span> <span class="chart-val">—</span></span>`).join("");
    srcs.forEach((s, i) => (head.querySelectorAll(".chart-name")[i].textContent = s.label));
    const series = srcs.map(() => []); // [t, v]

    const draw = () => {
      const t1 = Date.now();
      const t0 = t1 - windowMs;
      // Shared scale for same-unit series; fixed max for percentages.
      const all = series.flatMap((pts) => pts.filter(([t]) => t >= t0).map(([, v]) => v)).filter(Number.isFinite);
      const fixed = srcs[0].max && srcs.every((s) => s.max === srcs[0].max) ? srcs[0].max : null;
      const max = fixed ?? Math.max(1, ...all) * 1.15;
      srcs.forEach((s, i) => {
        const pts = series[i].filter(([t]) => t >= t0 - 5000);
        const d = pathFor(pts, { t0, t1, max });
        el.querySelector(`.chart-line.s${i}`).setAttribute("d", d);
        el.querySelector(`.chart-area.s${i}`).setAttribute("d", d ? `${d}L100,40L${(((pts.find(([, v]) => Number.isFinite(v))?.[0] ?? t1) - t0) / windowMs) * 100},40Z` : "");
        const last = [...series[i]].reverse().find(([, v]) => Number.isFinite(v))?.[1];
        el.querySelectorAll(".chart-val")[i].textContent = formatValue(s, last).join(" ").trim();
      });
    };

    const kinds = [...new Set(srcs.map((s) => s.kind))];
    for (const kind of kinds) {
      ctx
        .request("panel.history", { kind })
        .then((r) => {
          srcs.forEach((s, i) => {
            if (s.kind !== kind) return;
            const old = (r?.samples ?? []).map(({ at, value }) => [at, s.pick(value)]);
            series[i] = [...old, ...series[i].filter(([t]) => t > (old.at?.(-1)?.[0] ?? 0))];
          });
          draw();
        })
        .catch(() => {});
      ctx.subscribe(kind, (value) => {
        const t = value?.at ?? Date.now();
        srcs.forEach((s, i) => {
          if (s.kind !== kind) return;
          series[i].push([t, s.pick(value)]);
          while (series[i].length && series[i][0][0] < Date.now() - windowMs - 10_000) series[i].shift();
        });
        draw();
      });
    }
    ctx.every(1000, draw);
  },
};
