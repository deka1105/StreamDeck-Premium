// DeskAssist layout editor. Served by the desktop host on 127.0.0.1 only.
//
// Edits a working copy of the panel config; nothing reaches phones until Save.
// Live preview shows the working copy in the real panel renderer with live data.

import { COLS, ROWS, clampBox, overlaps } from "../src/grid.js";
import { renderSettings } from "./settings.js";

const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
};
const rid = (p) => `${p}${Math.random().toString(36).slice(2, 8)}`;
const clone = (v) => JSON.parse(JSON.stringify(v));

const state = {
  rev: 0,
  config: null,
  saved: "",
  catalog: { widgets: [], categories: [] },
  templates: [],
  clients: [],
  target: "default",
  pageId: null,
  selected: null,
  preview: false,
  search: "",
  view: "layout", // or "settings"
};

const byType = () => new Map(state.catalog.widgets.map((w) => [w.type, w]));
const dirty = () => JSON.stringify(state.config) !== state.saved;

/** The layout being edited (default, or a device's own). Null if the device inherits. */
function layout() {
  if (state.target === "default") return state.config.default;
  return state.config.devices[state.target] ?? null;
}
function page() {
  const l = layout();
  return l?.pages.find((p) => p.id === state.pageId) ?? l?.pages[0] ?? null;
}
function widget() {
  return page()?.widgets.find((w) => w.id === state.selected) ?? null;
}

// ---------------------------------------------------------------- api ----

async function api(path, body) {
  const res = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    const err = new Error(json.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

async function load() {
  const s = await api("/api/editor/state");
  state.rev = s.rev;
  state.config = s.config;
  state.saved = JSON.stringify(s.config);
  state.catalog = s.catalog;
  state.templates = s.templates?.templates ?? [];
  state.clients = s.clients ?? [];
  if (!layout()) state.target = "default";
  state.pageId = layout()?.pages[0]?.id ?? null;
  state.selected = null;
  render();
}

async function save() {
  try {
    const r = await api("/api/editor/config", { config: state.config, baseRev: state.rev });
    state.rev = r.rev;
    state.config = r.config; // the host's sanitized copy is the truth
    state.saved = JSON.stringify(r.config);
    if (!page()) state.pageId = layout()?.pages[0]?.id ?? null;
    flash(`Saved · revision ${r.rev}. Phones update within a few seconds.`);
  } catch (err) {
    flash(err.message, true);
  }
  render();
}

let flashTimer;
function flash(msg, bad = false) {
  const el = $("#flash");
  el.textContent = msg;
  el.dataset.bad = bad ? "1" : "0";
  el.hidden = false;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (el.hidden = true), bad ? 8000 : 4000);
}

// ------------------------------------------------------------ mutations ----

function change(fn) {
  fn();
  render();
}

function addPage(from) {
  const l = layout();
  if (!l) return;
  const p = from
    ? { ...clone(from), id: rid("p"), widgets: (from.widgets ?? []).map((w) => ({ ...clone(w), id: rid("w"), options: { ...(w.options ?? {}) } })) }
    : { id: rid("p"), name: `Page ${l.pages.length + 1}`, hidden: false, staySec: null, widgets: [] };
  p.name = p.name || `Page ${l.pages.length + 1}`;
  p.hidden = !!p.hidden;
  p.staySec = p.staySec ?? null;
  l.pages.push(p);
  if (!l.home) l.home = p.id;
  state.pageId = p.id;
  state.selected = null;
}

function movePage(id, delta) {
  const l = layout();
  const i = l.pages.findIndex((p) => p.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= l.pages.length) return;
  [l.pages[i], l.pages[j]] = [l.pages[j], l.pages[i]];
}

function deletePage(id) {
  const l = layout();
  l.pages = l.pages.filter((p) => p.id !== id);
  if (l.home === id) l.home = l.pages.find((p) => !p.hidden)?.id ?? l.pages[0]?.id ?? null;
  state.pageId = l.pages[0]?.id ?? null;
  state.selected = null;
}

function freeSpot(p, w, hgt, ignoreId) {
  for (let y = 0; y + hgt <= ROWS; y++)
    for (let x = 0; x + w <= COLS; x++) {
      const box = { x, y, w, h: hgt };
      if (!p.widgets.some((o) => o.id !== ignoreId && overlaps(o, box))) return box;
    }
  return null;
}

function addWidget(type, at) {
  const p = page();
  const def = byType().get(type);
  if (!p || !def) return;
  const size = clampBox({ x: 0, y: 0, ...def.size }, COLS, ROWS);
  let box = at ? clampBox({ ...at, w: size.w, h: size.h }) : null;
  if (box && p.widgets.some((o) => overlaps(o, box))) box = null;
  box = box ?? freeSpot(p, size.w, size.h) ?? freeSpot(p, def.min?.w ?? 1, def.min?.h ?? 1);
  if (!box) return flash("No room on this page — make space or add a page.", true);
  const options = {};
  for (const o of def.options ?? []) options[o.key] = o.default;
  const w = { id: rid("w"), type, ...box, options };
  p.widgets.push(w);
  state.selected = w.id;
}

/** Try to give widget `w` a new box; refuses overlaps. Returns true on success. */
function placeWidget(w, box) {
  const def = byType().get(w.type) ?? {};
  const b = clampBox(box, COLS, ROWS, { min: def.min, max: def.max });
  if (page().widgets.some((o) => o.id !== w.id && overlaps(o, b))) return false;
  Object.assign(w, b);
  return true;
}

// --------------------------------------------------------------- render ----

function render() {
  if (!state.config) return;
  renderHeader();
  renderPages();
  renderCenter();
  renderPalette();
  renderInspector();
  postPreview();
}

function renderHeader() {
  const sel = $("#target");
  sel.innerHTML = "";
  sel.append(h("option", { value: "default", text: "Every device (default pages)" }));
  const known = new Map(state.clients.map((c) => [c.id, c.name]));
  for (const id of Object.keys(state.config.devices)) if (!known.has(id)) known.set(id, state.config.devices[id].name || id);
  for (const [id, name] of known) sel.append(h("option", { value: id, text: `${name}${state.config.devices[id] ? "" : " (uses default)"}` }));
  sel.value = state.target;
  $("#rev").textContent = `rev ${state.rev}${dirty() ? " · unsaved changes" : ""}`;
  $("#save").disabled = !dirty();
  $("#revert").disabled = !dirty();
  $("#previewToggle").setAttribute("aria-pressed", state.preview ? "true" : "false");
}

function renderPages() {
  const box = $("#pages");
  box.innerHTML = "";
  const l = layout();
  if (!l) {
    box.append(
      h("p", { class: "muted", text: "This device shows the default pages." }),
      h("button", {
        class: "btn",
        id: "ownPages",
        text: "Give it its own pages",
        onclick: () =>
          change(() => {
            state.config.devices[state.target] = { ...clone(state.config.default), name: state.clients.find((c) => c.id === state.target)?.name ?? "" };
            state.pageId = layout().pages[0]?.id ?? null;
          }),
      }),
    );
    $("#pageSettings").innerHTML = "";
    return;
  }
  const list = h("ol", { class: "page-list" });
  for (const p of l.pages) {
    list.append(
      h(
        "li",
        { class: p.id === page()?.id ? "active" : "", dataset: { id: p.id } },
        h("button", { class: "page-name", text: p.name, onclick: () => change(() => ((state.pageId = p.id), (state.selected = null))) }),
        p.id === l.home ? h("span", { class: "tag", title: "Home page", text: "home" }) : null,
        p.hidden ? h("span", { class: "tag dim", text: "hidden" }) : null,
        h("button", { class: "icon", title: "Move up", "aria-label": `Move ${p.name} up`, text: "↑", onclick: () => change(() => movePage(p.id, -1)) }),
        h("button", { class: "icon", title: "Move down", "aria-label": `Move ${p.name} down`, text: "↓", onclick: () => change(() => movePage(p.id, 1)) }),
      ),
    );
  }
  const tplSelect = h(
    "select",
    { id: "template", "aria-label": "New page from template" },
    h("option", { value: "", text: "New page from template…" }),
    state.templates.map((t) => h("option", { value: t.id, text: `${t.name} — ${t.description ?? ""}` })),
  );
  tplSelect.addEventListener("change", () => {
    const t = state.templates.find((x) => x.id === tplSelect.value);
    if (t) change(() => addPage(t.page));
  });
  const importInput = h("input", { type: "file", accept: "application/json,.json", hidden: true, id: "importFile" });
  importInput.addEventListener("change", async () => {
    const f = importInput.files?.[0];
    importInput.value = "";
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data?.kind !== "deskassist.page" || !data.page) throw new Error("That file isn't a DeskAssist page export.");
      change(() => addPage(data.page));
      flash(`Imported “${data.page.name ?? "page"}”. Save to keep it.`);
    } catch (err) {
      flash(err.message, true);
    }
  });
  box.append(
    list,
    h("div", { class: "row" }, h("button", { class: "btn", id: "addPage", text: "+ Blank page", onclick: () => change(() => addPage()) }), h("button", { class: "btn", text: "Import…", onclick: () => importInput.click() })),
    tplSelect,
    importInput,
  );
  renderPageSettings();
}

function renderPageSettings() {
  const box = $("#pageSettings");
  box.innerHTML = "";
  const p = page();
  const l = layout();
  if (!p) return;
  const name = h("input", { id: "pageName", value: p.name, maxlength: 40, "aria-label": "Page name" });
  name.addEventListener("input", () => {
    p.name = name.value;
    renderHeader();
    const li = $(`.page-list li[data-id="${p.id}"]`);
    if (li) {
      li.querySelector(".page-name").textContent = name.value;
      const [up, down] = li.querySelectorAll(".icon");
      up?.setAttribute("aria-label", `Move ${name.value} up`);
      down?.setAttribute("aria-label", `Move ${name.value} down`);
    }
    postPreview();
  });
  const stay = h(
    "select",
    { id: "pageStay", "aria-label": "Return home" },
    h("option", { value: "default", text: "Return home after the panel default" }),
    h("option", { value: "never", text: "Never return home from this page" }),
    h("option", { value: "custom", text: "Return home after…" }),
  );
  stay.value = p.staySec === null ? "default" : p.staySec === 0 ? "never" : "custom";
  const staySecs = h("input", { type: "number", min: 5, max: 86400, value: p.staySec || 600, id: "staySec", hidden: stay.value !== "custom", "aria-label": "Seconds" });
  stay.addEventListener("change", () =>
    change(() => (p.staySec = stay.value === "default" ? null : stay.value === "never" ? 0 : Math.max(5, Number(staySecs.value) || 600))),
  );
  staySecs.addEventListener("change", () => change(() => (p.staySec = Math.max(5, Number(staySecs.value) || 600))));
  box.append(
    h("h3", { text: "Page" }),
    h("label", {}, "Name", name),
    h("label", { class: "check" }, h("input", { type: "checkbox", id: "pageHidden", checked: p.hidden, onchange: (e) => change(() => (p.hidden = e.target.checked)) }), "Hidden"),
    h("label", { class: "check" }, h("input", { type: "radio", name: "home", id: "pageHome", checked: l.home === p.id, onchange: () => change(() => (l.home = p.id)) }), "Home page"),
    stay,
    staySecs,
    h(
      "div",
      { class: "row" },
      h("button", { class: "btn", id: "exportPage", text: "Export…", onclick: () => exportPage(p) }),
      h("button", { class: "btn danger", id: "deletePage", text: "Delete page", onclick: () => confirm(`Delete “${p.name}”?`) && change(() => deletePage(p.id)) }),
    ),
    h("h3", { text: "Panel" }),
    (() => {
      const idle = h("input", { type: "number", id: "idleSec", min: 0, max: 14400, value: state.config.settings.idleSec, "aria-label": "Idle seconds" });
      idle.addEventListener("change", () => change(() => (state.config.settings.idleSec = Math.max(0, Number(idle.value) || 0))));
      return h("label", {}, "Return to home after this many idle seconds (0 = never)", idle);
    })(),
  );
}

function exportPage(p) {
  const blob = new Blob([JSON.stringify({ kind: "deskassist.page", version: 1, page: p }, null, 2)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `${(p.name || "page").replace(/[^\w-]+/g, "-")}.deskassist-page.json` });
  document.body.append(a);
  a.click();
  setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
}

function renderCenter() {
  const canvas = $("#canvas");
  const frame = $("#previewFrame");
  const settings = $("#settingsView");
  const inSettings = state.view === "settings";
  settings.hidden = !inSettings;
  document.body.dataset.view = state.view;
  $("#settingsToggle").setAttribute("aria-pressed", inSettings ? "true" : "false");
  if (inSettings) {
    canvas.hidden = true;
    frame.hidden = true;
    renderSettings(settings, { state, h, change, api, flash });
    return;
  }
  canvas.hidden = state.preview;
  frame.hidden = !state.preview;
  if (state.preview) {
    if (!frame.src) frame.src = `/panel/?preview=1&device=preview`;
    return;
  }
  renderCanvas();
}

function renderCanvas() {
  const canvas = $("#canvas");
  canvas.innerHTML = "";
  const p = page();
  if (!p) {
    canvas.append(h("div", { class: "canvas-empty", text: layout() ? "No pages. Add one on the left." : "" }));
    return;
  }
  const grid = h("div", { class: "canvas-grid", id: "grid" });
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const cell = h("div", { class: "cell", dataset: { x, y } });
      cell.style.gridColumn = String(x + 1);
      cell.style.gridRow = String(y + 1);
      grid.append(cell);
    }
  const defs = byType();
  for (const w of p.widgets) {
    const def = defs.get(w.type);
    const el = h(
      "div",
      { class: `wbox${w.id === state.selected ? " selected" : ""}`, dataset: { id: w.id, type: w.type }, tabindex: 0, role: "button", "aria-label": `${def?.name ?? w.type} widget` },
      h("span", { class: "wname", text: def?.name ?? `${w.type} (unknown)` }),
      h("span", { class: "wsize", text: `${w.w}×${w.h}` }),
      h("span", { class: "resize", title: "Drag to resize", dataset: { resize: "1" } }),
    );
    el.style.gridColumn = `${w.x + 1} / span ${w.w}`;
    el.style.gridRow = `${w.y + 1} / span ${w.h}`;
    el.addEventListener("pointerdown", (e) => startDrag(e, w, el, e.target.dataset.resize ? "resize" : "move"));
    grid.append(el);
  }
  grid.addEventListener("dragover", (e) => e.preventDefault());
  grid.addEventListener("drop", (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("text/x-widget");
    if (type) change(() => addWidget(type, cellAt(e)));
  });
  canvas.append(grid);
}

function cellAt(e) {
  const r = $("#grid").getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(COLS - 1, Math.floor(((e.clientX - r.left) / r.width) * COLS))),
    y: Math.max(0, Math.min(ROWS - 1, Math.floor(((e.clientY - r.top) / r.height) * ROWS))),
  };
}

function startDrag(e, w, el, mode) {
  e.preventDefault();
  state.selected = w.id;
  const grid = $("#grid");
  const r = grid.getBoundingClientRect();
  const cw = r.width / COLS;
  const ch = r.height / ROWS;
  const start = { x: e.clientX, y: e.clientY, box: { x: w.x, y: w.y, w: w.w, h: w.h } };
  let moved = false;
  el.setPointerCapture(e.pointerId);
  document.querySelectorAll(".wbox.selected").forEach((n) => n.classList.remove("selected"));
  el.classList.add("selected", "dragging");
  const onMove = (ev) => {
    const dx = Math.round((ev.clientX - start.x) / cw);
    const dy = Math.round((ev.clientY - start.y) / ch);
    if (dx || dy) moved = true;
    const next = mode === "move" ? { ...start.box, x: start.box.x + dx, y: start.box.y + dy } : { ...start.box, w: start.box.w + dx, h: start.box.h + dy };
    const def = byType().get(w.type) ?? {};
    const b = clampBox(next, COLS, ROWS, { min: def.min, max: def.max });
    const blocked = page().widgets.some((o) => o.id !== w.id && overlaps(o, b));
    el.style.gridColumn = `${b.x + 1} / span ${b.w}`;
    el.style.gridRow = `${b.y + 1} / span ${b.h}`;
    el.classList.toggle("blocked", blocked);
    el.querySelector(".wsize").textContent = `${b.w}×${b.h}`;
    el._box = b;
  };
  const onUp = () => {
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);
    if (moved && el._box && !placeWidget(w, el._box)) flash("Widgets can't overlap — moved back.", true);
    render();
  };
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
  renderInspector();
}

function renderPalette() {
  const box = $("#palette");
  box.innerHTML = "";
  const q = state.search.trim().toLowerCase();
  const search = h("input", { type: "search", id: "paletteSearch", placeholder: "Search widgets", value: state.search, "aria-label": "Search widgets" });
  search.addEventListener("input", () => {
    state.search = search.value;
    renderPalette();
    $("#paletteSearch").focus();
    const s = $("#paletteSearch");
    s.setSelectionRange(s.value.length, s.value.length);
  });
  box.append(search);
  const cats = state.catalog.categories ?? [];
  const groups = new Map(cats.map((c) => [c.id, { name: c.name, items: [] }]));
  for (const w of state.catalog.widgets) {
    if (q && !`${w.name} ${w.type} ${w.category}`.toLowerCase().includes(q)) continue;
    if (!groups.has(w.category)) groups.set(w.category, { name: w.category, items: [] });
    groups.get(w.category).items.push(w);
  }
  for (const [, g] of groups) {
    if (!g.items.length) continue;
    box.append(
      h("h4", { text: g.name }),
      h(
        "div",
        { class: "palette-items" },
        g.items.map((w) =>
          h("button", {
            class: "pitem",
            draggable: "true",
            dataset: { type: w.type },
            text: w.name,
            title: `Add ${w.name} (${w.size.w}×${w.size.h})`,
            disabled: !page(),
            onclick: () => change(() => addWidget(w.type)),
            ondragstart: (e) => e.dataTransfer.setData("text/x-widget", w.type),
          }),
        ),
      ),
    );
  }
}

function optionField(o, value, set) {
  const id = `opt-${o.key}`;
  switch (o.type) {
    case "bool":
      return h("label", { class: "check" }, h("input", { type: "checkbox", id, checked: !!value, onchange: (e) => set(e.target.checked) }), o.label);
    case "number": {
      const i = h("input", { type: "number", id, value: value ?? o.default ?? 0, min: o.min, max: o.max, step: o.step ?? 1 });
      i.addEventListener("change", () => set(Number(i.value)));
      return h("label", {}, o.label, i);
    }
    case "choice": {
      const s = h("select", { id }, (o.choices ?? []).map((c) => h("option", { value: c.value, text: c.label ?? c.value })));
      s.value = value ?? o.default;
      s.addEventListener("change", () => set(s.value));
      return h("label", {}, o.label, s);
    }
    case "textarea":
    case "list": {
      const t = h("textarea", { id, rows: 4 });
      t.value = o.type === "list" ? (value ?? []).join("\n") : value ?? "";
      t.addEventListener("change", () => set(o.type === "list" ? t.value.split("\n").map((s) => s.trim()).filter(Boolean) : t.value));
      return h("label", {}, o.label, t);
    }
    case "text": {
      const i = h("input", { id, value: value ?? "", maxlength: o.maxLength ?? 200 });
      i.addEventListener("input", () => set(i.value, true));
      return h("label", {}, o.label, i);
    }
    default:
      return null; // json and other structured options aren't hand-edited here
  }
}

function renderInspector() {
  const box = $("#inspector");
  box.innerHTML = "";
  const w = widget();
  if (!w) {
    box.append(h("p", { class: "muted", text: "Select a widget to change it, or pick one above to add it." }));
    return;
  }
  const def = byType().get(w.type);
  box.append(h("h3", { text: def?.name ?? w.type }));
  const num = (k, max) => {
    const i = h("input", { type: "number", id: `box-${k}`, value: w[k], min: k === "w" || k === "h" ? 1 : 0, max });
    i.addEventListener("change", () => {
      if (!placeWidget(w, { ...w, [k]: Number(i.value) })) flash("That would overlap another widget.", true);
      render();
    });
    return h("label", { class: "mini" }, k.toUpperCase(), i);
  };
  box.append(h("div", { class: "row boxrow" }, num("x", COLS - 1), num("y", ROWS - 1), num("w", COLS), num("h", ROWS)));
  for (const o of def?.options ?? []) {
    // A key missing from the saved widget means "use the default", not "off".
    const f = optionField(o, w.options?.[o.key] ?? o.default, (v, quiet) => {
      w.options = { ...(w.options ?? {}), [o.key]: v };
      if (quiet) {
        renderHeader();
        postPreview();
      } else render();
    });
    if (f) box.append(f);
  }
  // Per-widget look: overrides the page and panel look for this tile only.
  const lk = w.look ?? {};
  const color = (key, label) => {
    const i = h("input", { type: "color", id: `look-${key}`, value: lk[key] ?? "#000000" });
    const on = h("input", { type: "checkbox", checked: !!lk[key], "aria-label": `Own ${label}` });
    const set = () => change(() => {
      w.look = { ...(w.look ?? {}) };
      if (on.checked) w.look[key] = i.value;
      else delete w.look[key];
      if (!Object.keys(w.look).length) delete w.look;
    });
    i.addEventListener("change", () => ((on.checked = true), set()));
    on.addEventListener("change", set);
    return h("label", { class: "mini" }, on, label, i);
  };
  box.append(h("h4", { text: "This tile's look" }), h("div", { class: "row" }, color("tile", "Tile"), color("accent", "Accent")));
  box.append(
    h(
      "div",
      { class: "row" },
      h("button", {
        class: "btn",
        text: "Duplicate",
        onclick: () =>
          change(() => {
            const spot = freeSpot(page(), w.w, w.h);
            if (!spot) return flash("No room for a copy on this page.", true);
            const copy = { ...clone(w), id: rid("w"), ...spot };
            page().widgets.push(copy);
            state.selected = copy.id;
          }),
      }),
      h("button", {
        class: "btn danger",
        id: "deleteWidget",
        text: "Remove",
        onclick: () =>
          change(() => {
            page().widgets = page().widgets.filter((x) => x.id !== w.id);
            state.selected = null;
          }),
      }),
    ),
  );
}

// -------------------------------------------------------------- preview ----

function previewLayout() {
  const l = layout() ?? state.config.default;
  return { rev: 0, pages: l.pages, home: l.home, look: l.look, display: l.display, settings: state.config.settings };
}
function postPreview() {
  const frame = $("#previewFrame");
  if (!state.preview || !frame.contentWindow) return;
  frame.contentWindow.postMessage({ type: "deskassist-preview", layout: clone(previewLayout()), pageId: page()?.id }, location.origin);
}
window.addEventListener("message", (e) => {
  if (e.origin === location.origin && e.data?.type === "deskassist-preview-ready") postPreview();
});

// ---------------------------------------------------------------- boot ----

function boot() {
  $("#save").addEventListener("click", save);
  $("#revert").addEventListener("click", () => confirm("Discard unsaved changes?") && load());
  $("#previewToggle").addEventListener("click", () => change(() => ((state.preview = !state.preview), (state.view = "layout"))));
  $("#settingsToggle").addEventListener("click", () => change(() => (state.view = state.view === "settings" ? "layout" : "settings")));
  $("#target").addEventListener("change", (e) =>
    change(() => {
      state.target = e.target.value;
      state.pageId = layout()?.pages[0]?.id ?? null;
      state.selected = null;
    }),
  );
  window.addEventListener("keydown", (e) => {
    if ((e.key === "Delete" || e.key === "Backspace") && state.selected && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) {
      change(() => {
        page().widgets = page().widgets.filter((x) => x.id !== state.selected);
        state.selected = null;
      });
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      if (dirty()) save();
    }
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty()) e.preventDefault();
  });
  load().catch((err) => flash(`Couldn't load the layout: ${err.message}`, true));
  window.__editor = { state, save, load };
}

boot();
