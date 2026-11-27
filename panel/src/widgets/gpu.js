// GPU details: each graphics adapter with load, temperature and VRAM — or a
// plain "not reported" where the computer doesn't expose them.

import { fmtBytes } from "../sources.js";

const row = (label, value, pct) =>
  `<div class="kv"><span class="k">${label}</span><span class="v">${value}</span>${pct === null ? "" : `<div class="minibar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`}</div>`;

export default {
  type: "gpu",
  meta: { name: "GPU details", category: "computer", size: { w: 4, h: 3 }, min: { w: 2, h: 2 }, options: [] },
  needs: () => ["gpu"],
  mount(el, ctx) {
    el.classList.add("w-list", "w-gpu");
    el.innerHTML = `<div class="w-title">GPU</div><div class="list"></div>`;
    const list = el.querySelector(".list");
    ctx.subscribe("gpu", (g) => {
      const gpus = g?.gpus ?? [];
      if (!gpus.length) {
        list.innerHTML = `<div class="muted">No graphics adapter reported.</div>`;
        return;
      }
      list.innerHTML = gpus
        .map((x) => {
          const na = "not reported";
          const vram = x.memUsed !== null && x.memTotal ? `${fmtBytes(x.memUsed)} / ${fmtBytes(x.memTotal)}` : x.memTotal ? `${fmtBytes(x.memTotal)} total` : na;
          return `<div class="gpu-card"><div class="gpu-name"></div>
            ${row("Load", x.util === null ? na : `${Math.round(x.util)}%`, x.util)}
            ${row("Temperature", x.temp === null ? na : `${Math.round(x.temp)} °C`, x.temp === null ? null : x.temp)}
            ${row("VRAM", vram, x.memUsed !== null && x.memTotal ? (100 * x.memUsed) / x.memTotal : null)}</div>`;
        })
        .join("");
      list.querySelectorAll(".gpu-name").forEach((n, i) => (n.textContent = gpus[i].name));
    });
  },
};
