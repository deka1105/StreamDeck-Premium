// Metric tile: one live number from the computer (CPU %, memory %, …) with a bar.
// Grows its list of sources as providers land (Stage 4).

export const METRIC_SOURCES = {
  cpu: { label: "CPU", kind: "system", unit: "%", pick: (s) => s?.cpu, max: 100 },
  mem: { label: "Memory", kind: "system", unit: "%", pick: (s) => (s?.mem?.total ? (100 * s.mem.used) / s.mem.total : undefined), max: 100 },
};

export default {
  type: "metric",
  meta: {
    name: "Metric",
    category: "computer",
    size: { w: 3, h: 2 },
    min: { w: 2, h: 1 },
    options: [
      {
        key: "source",
        type: "choice",
        label: "Show",
        default: "cpu",
        choices: Object.entries(METRIC_SOURCES).map(([value, s]) => ({ value, label: s.label })),
      },
      { key: "label", type: "text", label: "Label (optional)", default: "" },
    ],
  },
  needs: (options) => [METRIC_SOURCES[options.source]?.kind ?? "system"],
  mount(el, ctx) {
    const src = METRIC_SOURCES[ctx.options.source] ?? METRIC_SOURCES.cpu;
    el.classList.add("w-metric");
    el.innerHTML = `
      <div class="metric-label"></div>
      <div class="metric-value"><span class="num">—</span><span class="unit"></span></div>
      <div class="metric-bar"><div class="metric-fill"></div></div>`;
    el.querySelector(".metric-label").textContent = ctx.options.label || src.label;
    const num = el.querySelector(".num");
    const unit = el.querySelector(".unit");
    const fill = el.querySelector(".metric-fill");
    ctx.subscribe(src.kind, (data) => {
      const v = src.pick(data);
      if (!Number.isFinite(v)) {
        num.textContent = "—";
        unit.textContent = "";
        fill.style.width = "0%";
        return;
      }
      num.textContent = String(Math.round(v));
      unit.textContent = src.unit;
      const pct = Math.max(0, Math.min(100, (100 * v) / src.max));
      fill.style.width = `${pct}%`;
      el.dataset.level = pct >= 90 ? "high" : pct >= 70 ? "mid" : "low";
    });
  },
};
