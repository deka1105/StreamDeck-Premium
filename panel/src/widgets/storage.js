// Memory & disks: RAM and swap, then every user-facing volume.

import { fmtBytes } from "../sources.js";

function bar(name, used, total) {
  const p = total > 0 ? (100 * used) / total : 0;
  const level = p >= 90 ? "high" : p >= 75 ? "mid" : "low";
  const d = document.createElement("div");
  d.className = "store-row";
  d.dataset.level = level;
  d.innerHTML = `<div class="store-top"><span class="store-name"></span><span class="store-val"></span></div><div class="minibar"><i style="width:${p.toFixed(1)}%"></i></div>`;
  d.querySelector(".store-name").textContent = name;
  d.querySelector(".store-val").textContent = total > 0 ? `${fmtBytes(used)} of ${fmtBytes(total)}` : "—";
  return d;
}

export default {
  type: "storage",
  meta: { name: "Memory & disks", category: "computer", size: { w: 4, h: 3 }, min: { w: 2, h: 2 }, options: [] },
  needs: () => ["system", "disks"],
  mount(el, ctx) {
    el.classList.add("w-list", "w-storage");
    el.innerHTML = `<div class="w-title">Memory & disks</div><div class="list"></div>`;
    const list = el.querySelector(".list");
    let sys = null;
    let dsk = null;
    const render = () => {
      list.innerHTML = "";
      if (sys) {
        list.append(bar("Memory", sys.mem?.used, sys.mem?.total));
        if (sys.swap?.total > 0) list.append(bar("Swap", sys.swap.used, sys.swap.total));
      }
      for (const v of dsk?.volumes ?? []) list.append(bar(v.name, v.used, v.size));
    };
    ctx.subscribe("system", (s) => ((sys = s), render()));
    ctx.subscribe("disks", (d) => ((dsk = d), render()));
  },
};
