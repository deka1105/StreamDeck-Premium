// Two process widgets:
//   topprocs  — the heaviest apps by CPU or memory, read-only
//   processes — the same list; tap one to end an instance or all of them.
//               Ending is off unless the widget's "Allow ending processes"
//               option is on, and the computer checks that option itself.

import { fmtBytes } from "../sources.js";

const SORTS = [
  { value: "cpu", label: "CPU" },
  { value: "mem", label: "Memory" },
];

function sorted(list, by, n) {
  return [...(list ?? [])].sort((a, b) => (by === "mem" ? b.mem - a.mem : b.cpu - a.cpu)).slice(0, n);
}

function rowsFor(list, by) {
  return list.map((p) => {
    const r = document.createElement("button");
    r.className = "proc-row";
    r.dataset.name = p.name;
    r.innerHTML = `<span class="proc-name"></span><span class="proc-count"></span><span class="proc-val"></span>`;
    r.querySelector(".proc-name").textContent = p.name;
    r.querySelector(".proc-count").textContent = p.count > 1 ? `×${p.count}` : "";
    r.querySelector(".proc-val").textContent = by === "mem" ? fmtBytes(p.mem) : `${p.cpu.toFixed(p.cpu < 10 ? 1 : 0)}%`;
    return r;
  });
}

export const topprocs = {
  type: "topprocs",
  meta: {
    name: "Top processes",
    category: "computer",
    size: { w: 4, h: 3 },
    min: { w: 2, h: 2 },
    options: [
      { key: "sort", type: "choice", label: "Sort by", default: "cpu", choices: SORTS },
      { key: "count", type: "number", label: "How many", default: 5, min: 1, max: 15 },
    ],
  },
  needs: () => ["procs"],
  mount(el, ctx) {
    el.classList.add("w-list", "w-procs");
    el.innerHTML = `<div class="w-title">Top ${ctx.options.sort === "mem" ? "memory" : "CPU"}</div><div class="list"></div>`;
    const list = el.querySelector(".list");
    ctx.subscribe("procs", (d) => list.replaceChildren(...rowsFor(sorted(d?.list, ctx.options.sort, ctx.options.count), ctx.options.sort)));
  },
};

export const processes = {
  type: "processes",
  meta: {
    name: "Processes",
    category: "computer",
    size: { w: 6, h: 4 },
    min: { w: 3, h: 3 },
    options: [
      { key: "sort", type: "choice", label: "Sort by", default: "cpu", choices: SORTS },
      { key: "allowKill", type: "bool", label: "Allow ending processes from the phone", default: false },
    ],
  },
  needs: () => ["procs"],
  mount(el, ctx) {
    el.classList.add("w-list", "w-procs", "w-processes");
    el.innerHTML = `<div class="w-title">Processes <span class="muted proc-total"></span></div><div class="list" data-no-swipe></div><div class="proc-sheet" hidden></div>`;
    const list = el.querySelector(".list");
    const sheet = el.querySelector(".proc-sheet");
    const total = el.querySelector(".proc-total");
    let latest = [];

    const closeSheet = () => {
      sheet.hidden = true;
      holdUntil = 0;
    };
    const openSheet = (name) => {
      const p = latest.find((x) => x.name === name);
      if (!p) return;
      sheet.innerHTML = `<div class="sheet-title"></div><div class="sheet-meta muted"></div><div class="sheet-msg"></div><div class="sheet-actions"></div>`;
      sheet.querySelector(".sheet-title").textContent = p.name;
      sheet.querySelector(".sheet-meta").textContent = `${p.count} instance${p.count === 1 ? "" : "s"} · ${p.cpu.toFixed(1)}% CPU · ${fmtBytes(p.mem)}`;
      const actions = sheet.querySelector(".sheet-actions");
      const msg = sheet.querySelector(".sheet-msg");
      const btn = (label, cls, fn) => {
        const b = document.createElement("button");
        b.className = `sheet-btn ${cls}`;
        b.textContent = label;
        b.addEventListener("click", fn);
        actions.append(b);
        return b;
      };
      if (!ctx.options.allowKill) {
        msg.textContent = "Ending processes is off for this widget. Turn on “Allow ending processes” in the layout editor.";
      } else if (p.protected || !p.own) {
        msg.textContent = p.protected ? "This is part of the system and can't be ended from here." : "This belongs to another user.";
      } else {
        const run = async (all) => {
          msg.textContent = "Ending…";
          try {
            const r = await ctx.request("procs.kill", { name: p.name, pid: p.pids[0], all, widgetId: ctx.widgetId });
            msg.textContent = r?.ok ? `Ended ${r.ended ?? ""} ${r.ended === 1 ? "process" : "processes"}.` : r?.reason ?? "Couldn't end it.";
            if (r?.ok) setTimeout(closeSheet, 1200);
          } catch (err) {
            msg.textContent = err.message;
          }
        };
        btn(p.count > 1 ? "End one instance" : "End process", "danger", () => run(false));
        if (p.count > 1) btn(`End all ${p.count}`, "danger", () => run(true));
      }
      btn("Cancel", "", closeSheet);
      sheet.hidden = false;
    };

    // Never redraw the rows under a finger: a tap that lands while the list is
    // being replaced would hit a removed row and be lost.
    let holdUntil = 0;
    let pending = null;
    const draw = (d) => {
      latest = d?.list ?? [];
      total.textContent = d?.total ? `· ${d.total}` : "";
      list.replaceChildren(...rowsFor(sorted(latest, ctx.options.sort, 20), ctx.options.sort));
    };
    const flush = () => {
      if (pending && sheet.hidden && Date.now() >= holdUntil) {
        draw(pending);
        pending = null;
      }
    };
    list.addEventListener("pointerdown", () => (holdUntil = Infinity));
    const release = () => {
      holdUntil = Date.now() + 400;
      setTimeout(flush, 450);
    };
    list.addEventListener("pointerup", release);
    list.addEventListener("pointercancel", release);
    list.addEventListener("click", (e) => {
      const row = e.target.closest(".proc-row");
      if (row) openSheet(row.dataset.name);
    });
    ctx.subscribe("procs", (d) => {
      if (!latest.length) return draw(d); // first data: show it at once
      pending = d;
      flush();
    });
    ctx.every(1000, flush);
  },
};
