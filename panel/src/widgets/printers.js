// Stage 14 — 3D printers: a page widget showing up to four printers at once,
// and a compact single-printer widget. Data comes from the computer (the
// phone never talks to a printer).

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const STATE = { printing: "Printing", paused: "Paused", idle: "Idle", finished: "Finished", error: "Error", busy: "Preparing", offline: "Offline" };
const t = (v) => (v === null || v === undefined ? "—" : `${Math.round(v)}°`);
const left = (m) => (m === null || m === undefined ? "" : m < 60 ? `${m} min left` : `${Math.floor(m / 60)} h ${m % 60} min left`);
const eta = (m) => (m ? new Date(Date.now() + m * 60_000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
const ring = (p) => {
  const C = 2 * Math.PI * 42;
  return `<svg viewBox="0 0 100 100" class="pr-ring"><circle cx="50" cy="50" r="42" class="t-track"/><circle cx="50" cy="50" r="42" class="t-fill" transform="rotate(-90 50 50)" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - (p ?? 0) / 100)}"/></svg>`;
};

function card(p, { compact = false } = {}) {
  const active = p.state === "printing" || p.state === "paused";
  const slots = (p.slots ?? []).length ? `<div class="pr-slots">${p.slots.map((s) => `<i class="pr-slot${s.active ? " on" : ""}" style="--c:${esc(s.color ?? "#64748b")}" title="${esc(s.material)}"><b>${esc(s.material || "")}</b></i>`).join("")}</div>` : "";
  const temps = `<div class="pr-temps"><span title="Nozzle">🔥 ${t(p.temps?.nozzle)}${p.temps?.nozzleTarget ? `<small>/${Math.round(p.temps.nozzleTarget)}°</small>` : ""}</span><span title="Bed">▭ ${t(p.temps?.bed)}${p.temps?.bedTarget ? `<small>/${Math.round(p.temps.bedTarget)}°</small>` : ""}</span>${p.temps?.chamber !== null && p.temps?.chamber !== undefined ? `<span title="Chamber">◫ ${t(p.temps.chamber)}</span>` : ""}${p.speed !== null && p.speed !== undefined ? `<span title="Speed">⏩ ${esc(typeof p.speed === "number" ? `${p.speed}%` : p.speed)}</span>` : ""}</div>`;
  return `<div class="pr-card" data-state="${esc(p.state)}" data-id="${esc(p.id)}">
    <div class="pr-head"><span class="pr-name">${esc(p.name)}</span><span class="pr-state">${STATE[p.state] ?? esc(p.state)}</span></div>
    ${compact ? "" : `<div class="muted pr-brand">${esc(p.model || p.brandName || "")}</div>`}
    <div class="pr-main">${active || p.state === "finished" ? `<div class="pr-progress">${ring(p.state === "finished" ? 100 : p.pct)}<span class="pr-pct">${p.state === "finished" ? "✓" : `${p.pct ?? 0}<small>%</small>`}</span></div>` : `<div class="pr-idle">${p.state === "offline" ? "⏻" : "◎"}</div>`}
      <div class="pr-info">${active ? `<div class="pr-left">${left(p.remainingMin)}</div><div class="muted pr-eta">${p.remainingMin ? `Done ≈ ${eta(p.remainingMin)}` : ""}</div>` : ""}${p.layers ? `<div class="pr-layer">Layer ${p.layer ?? 0} / ${p.layers}</div>` : ""}${p.file ? `<div class="muted pr-file">${esc(p.file)}</div>` : ""}${p.error ? `<div class="pr-error">${esc(p.error)}</div>` : ""}</div>
    </div>
    ${p.state === "offline" ? "" : temps}${slots}
  </div>`;
}

export const printers = {
  type: "printers",
  meta: { name: "3D printers", category: "deck", size: { w: 12, h: 6 }, min: { w: 4, h: 3 }, options: [] },
  needs: () => ["printers"],
  mount(el, ctx) {
    el.classList.add("w-printers");
    ctx.subscribe("printers", (d) => {
      const list = (d?.printers ?? []).slice(0, 4);
      el.dataset.count = String(list.length);
      el.innerHTML = list.length ? `<div class="pr-grid">${list.map((p) => card(p)).join("")}</div>` : `<div class="muted setup">Add printers in the editor (Settings › 3D printers).</div>`;
    });
  },
};

export const printer = {
  type: "printer",
  meta: { name: "Printer", category: "deck", size: { w: 4, h: 3 }, min: { w: 2, h: 2 }, options: [{ key: "printer", type: "text", label: "Printer name (empty = the first one)", default: "" }] },
  needs: () => ["printers"],
  mount(el, ctx) {
    el.classList.add("w-printers", "w-printer");
    ctx.subscribe("printers", (d) => {
      const want = String(ctx.options.printer ?? "").trim().toLowerCase();
      const all = d?.printers ?? [];
      const p = want ? all.find((x) => x.name.toLowerCase() === want || x.id === want) : all[0];
      el.innerHTML = p ? card(p, { compact: true }) : `<div class="muted setup">${all.length ? "No printer by that name." : "Add a printer in the editor (Settings › 3D printers)."}</div>`;
    });
  },
};
