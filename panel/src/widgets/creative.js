// Stage 17 — creative app controls: nine tool keys, a precision slider read
// back from the app, a colour control, and a Blender pad. The computer holds
// the shortcuts and the fixed scripts; the panel sends ids and numbers only.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const APPS = [
  { value: "photoshop", label: "Photoshop" },
  { value: "illustrator", label: "Illustrator" },
  { value: "aftereffects", label: "After Effects" },
  { value: "premiere", label: "Premiere Pro" },
];
const DEFAULT_TOOLS = {
  photoshop: ["move", "marquee", "lasso", "brush", "eraser", "clone", "eyedropper", "type", "crop"],
  illustrator: ["selection", "direct", "pen", "type", "rectangle", "ellipse", "paintbrush", "eyedropper", "shapebuilder"],
  aftereffects: ["selection", "hand", "zoom", "rotation", "camera", "shape", "pen", "type", "puppet"],
  premiere: ["selection", "trackselect", "ripple", "rolling", "ratestretch", "razor", "slip", "slide", "hand"],
};
// Our own small glyphs for tools (no vendor icons).
const GLYPH = { move: "✥", marquee: "⬚", lasso: "➰", quickselect: "✎", crop: "⌗", eyedropper: "💧", healing: "✚", brush: "🖌", clone: "⎘", historybrush: "↺", eraser: "⌫", gradient: "▤", dodge: "◐", pen: "✒", type: "T", pathselect: "➤", shape: "▭", hand: "✋", rotateview: "⟳", zoom: "🔍", swapcolors: "⇄", defaultcolors: "◩", brushsmaller: "−", brushbigger: "+", selection: "➤", direct: "▹", magicwand: "✦", rectangle: "▭", ellipse: "◯", paintbrush: "🖌", pencil: "✏", shaper: "✐", rotate: "⟳", scale: "⤡", width: "⟷", freetransform: "⤢", shapebuilder: "⊕", blend: "◑", artboard: "▦", camera: "🎥", panbehind: "⌖", roto: "✂", puppet: "📍", trackselect: "⇥", ripple: "⇹", rolling: "⇼", ratestretch: "⇿", razor: "✂", slip: "⇆", slide: "⇄" };

function appOption(def = "photoshop") {
  return { key: "app", type: "choice", label: "App", default: def, choices: APPS };
}

export const creativekeys = {
  type: "creativekeys",
  meta: {
    name: "Creative tool keys",
    category: "deck",
    size: { w: 6, h: 3 },
    min: { w: 3, h: 2 },
    options: [appOption(), { key: "tools", type: "list", label: "Nine tool ids, one per line (empty = a good default set)", default: [] }],
  },
  needs: () => [],
  async mount(el, ctx) {
    el.classList.add("w-cr-keys");
    const app = ctx.options.app ?? "photoshop";
    el.innerHTML = `<div class="cr-grid" data-no-swipe></div><div class="cd-msg muted"></div>`;
    const grid = el.querySelector(".cr-grid");
    const msg = el.querySelector(".cd-msg");
    const r = await ctx.request("creative.tools", { app }).catch(() => ({ tools: [] }));
    const all = new Map((r.tools ?? []).map((t) => [t.id, t.label]));
    const want = (ctx.options.tools?.length ? ctx.options.tools : DEFAULT_TOOLS[app] ?? []).map(String).filter((id) => all.has(id)).slice(0, 9);
    if (!want.length) return (grid.innerHTML = `<div class="muted setup">No tools for this app.</div>`);
    for (const id of want) {
      const b = document.createElement("button");
      b.className = "cd-btn cr-key";
      b.innerHTML = `<span class="cd-ico">${esc(GLYPH[id] ?? "•")}</span><span class="cd-lbl">${esc(all.get(id))}</span>`;
      b.addEventListener("click", async () => {
        const res = await ctx.request("creative.tool", { app, tool: id }).catch((e) => ({ ok: false, error: e.message }));
        b.dataset.result = res?.ok ? "ok" : "fail";
        msg.textContent = res?.ok ? "" : res?.error ?? "";
        grid.querySelectorAll(".cr-key.on").forEach((x) => x.classList.remove("on"));
        if (res?.ok) b.classList.add("on");
        setTimeout(() => delete b.dataset.result, 800);
      });
      grid.append(b);
    }
  },
};

export const creativeslider = {
  type: "creativeslider",
  meta: {
    name: "Creative precision slider",
    category: "deck",
    size: { w: 6, h: 2 },
    min: { w: 3, h: 1 },
    options: [
      appOption("illustrator"),
      { key: "control", type: "choice", label: "Control", default: "stroke", choices: [{ value: "stroke", label: "Illustrator: stroke weight" }, { value: "opacity", label: "Opacity (Illustrator selection / Photoshop layer)" }, { value: "value", label: "After Effects: selected property" }] },
    ],
  },
  needs: () => [],
  async mount(el, ctx) {
    el.classList.add("w-cr-slider");
    const app = ctx.options.app;
    const control = ctx.options.control;
    const r = await ctx.request("creative.tools", { app }).catch(() => ({ controls: [] }));
    const c = (r.controls ?? []).find((x) => x.id === control);
    if (!c) return (el.innerHTML = `<div class="muted setup">That app has no “${esc(control)}” control.</div>`);
    // A sensible slider range: After Effects values are open-ended, so ±range around the current value.
    el.innerHTML = `<div class="cr-head"><span class="w-title">${esc(c.label)}</span><span class="cr-val">—</span></div><div class="cr-row" data-no-swipe><button class="ibtn" data-d="-1">−</button><input type="range"><button class="ibtn" data-d="1">+</button><button class="ibtn cr-read" title="Read from the app">↻</button></div><div class="cd-msg muted"></div>`;
    const input = el.querySelector("input");
    const val = el.querySelector(".cr-val");
    const msg = el.querySelector(".cd-msg");
    const open = c.max - c.min > 2000;
    const setRange = (center) => {
      const lo = open ? Math.round(center - 200) : c.min;
      const hi = open ? Math.round(center + 200) : c.max;
      Object.assign(input, { min: lo, max: hi, step: c.step });
    };
    const show = (v) => (val.textContent = v === null || v === undefined ? "—" : `${Math.round(v * 100) / 100}`);
    const read = async () => {
      const g = await ctx.request("creative.get", { app, control }).catch((e) => ({ ok: false, error: e.message }));
      msg.textContent = g?.ok ? (g.value === null ? "Select something in the app first." : "") : g?.error ?? "";
      if (g?.ok && g.value !== null) {
        setRange(g.value);
        input.value = String(g.value);
        show(g.value);
      }
    };
    setRange(open ? 0 : (c.min + c.max) / 2);
    read();
    // At most 4 updates a second; the last value is always sent.
    let pending = null;
    let timer = null;
    const flush = async () => {
      timer = null;
      if (pending === null) return;
      const v = pending;
      pending = null;
      const s = await ctx.request("creative.set", { app, control, value: v }).catch((e) => ({ ok: false, error: e.message }));
      if (s?.busy) return ((pending ??= v), (timer = setTimeout(flush, 260)));
      msg.textContent = s?.ok ? "" : s?.error ?? "";
      if (pending !== null && !timer) timer = setTimeout(flush, 260);
    };
    const send = (v) => {
      pending = v;
      show(v);
      if (!timer) timer = setTimeout(flush, 0);
    };
    input.addEventListener("input", () => send(Number(input.value)));
    el.querySelectorAll("[data-d]").forEach((b) => b.addEventListener("click", () => {
      input.value = String(Number(input.value) + Number(b.dataset.d) * c.step * (open ? 10 : 4));
      send(Number(input.value));
    }));
    el.querySelector(".cr-read").addEventListener("click", read);
  },
};

const SWATCHES = ["#000000", "#ffffff", "#ef4444", "#f97316", "#facc15", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#78716c", "#94a3b8"];

export const creativecolor = {
  type: "creativecolor",
  meta: { name: "Creative colour", category: "deck", size: { w: 4, h: 3 }, min: { w: 2, h: 2 }, options: [{ key: "app", type: "choice", label: "App", default: "photoshop", choices: APPS.filter((a) => a.value !== "premiere") }] },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-cr-color");
    const app = ctx.options.app;
    const target = app === "photoshop" ? "Foreground colour" : app === "illustrator" ? "Fill of the selection" : "Selected colour property";
    el.innerHTML = `<div class="cr-head"><span class="w-title">${esc(target)}</span><span class="cr-chip"></span></div><div class="cr-sw" data-no-swipe>${SWATCHES.map((c) => `<button class="sw" style="--c:${c}" data-c="${c}"></button>`).join("")}</div><div class="cr-row" data-no-swipe><input type="range" min="0" max="359" value="200" class="cr-hue" aria-label="Hue"><input type="range" min="10" max="90" value="50" class="cr-light" aria-label="Lightness"></div><div class="cd-msg muted"></div>`;
    const msg = el.querySelector(".cd-msg");
    const chip = el.querySelector(".cr-chip");
    const hsl = (h, l) => {
      const a = (1 * Math.min(l, 1 - l));
      const f = (n) => {
        const k = (n + h / 30) % 12;
        return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
      };
      return `#${[f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
    };
    let t = null;
    const apply = (hex) => {
      chip.style.background = hex;
      clearTimeout(t);
      t = setTimeout(async () => {
        const r = await ctx.request("creative.color", { app, hex }).catch((e) => ({ ok: false, error: e.message }));
        msg.textContent = r?.ok ? "" : r?.error ?? "";
      }, 250);
    };
    el.querySelectorAll(".sw").forEach((b) => b.addEventListener("click", () => apply(b.dataset.c)));
    const h = el.querySelector(".cr-hue");
    const l = el.querySelector(".cr-light");
    const fromSliders = () => apply(hsl(Number(h.value), Number(l.value) / 100));
    h.addEventListener("input", fromSliders);
    l.addEventListener("input", fromSliders);
  },
};

export const blender = {
  type: "blender",
  meta: { name: "Blender", category: "deck", size: { w: 6, h: 4 }, min: { w: 3, h: 2 }, options: [] },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-blender");
    const btn = (op, label, ico, value) => `<button class="cd-btn" data-op="${op}"${value ? ` data-v="${value}"` : ""}><span class="cd-ico">${ico}</span><span class="cd-lbl">${label}</span></button>`;
    const slider = (op, label, min, max, step, value, axis = "") => `<label class="bl-sl"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-op="${op}" data-axis="${axis}"><b>${value}</b></label>`;
    el.innerHTML = `<div class="w-title">Blender</div><div class="bl-modes" data-no-swipe>${btn("mode", "Object", "◻", "OBJECT")}${btn("mode", "Edit", "◇", "EDIT")}${btn("mode", "Sculpt", "◍", "SCULPT")}${btn("frame_selected", "Frame", "⌖")}${btn("camera_view", "Camera", "🎥")}${btn("xray", "X-ray", "◫")}</div><div class="bl-sliders" data-no-swipe>${slider("rotation", "Rot X", -180, 180, 1, 0, "X")}${slider("rotation", "Rot Y", -180, 180, 1, 0, "Y")}${slider("rotation", "Rot Z", -180, 180, 1, 0, "Z")}${slider("focal", "Focal mm", 10, 200, 1, 50)}${slider("light_power", "Light W", 0, 5000, 10, 1000)}${slider("brush_size", "Brush px", 1, 500, 1, 50)}${slider("brush_strength", "Strength", 0, 1, 0.05, 0.5)}</div><div class="cd-msg muted"></div>`;
    const msg = el.querySelector(".cd-msg");
    const op = async (body, b) => {
      const r = await ctx.request("blender.op", body).catch((e) => ({ ok: false, error: e.message }));
      msg.textContent = r?.ok ? "" : r?.error ?? "";
      if (b) {
        b.dataset.result = r?.ok ? "ok" : "fail";
        setTimeout(() => delete b.dataset.result, 800);
      }
    };
    el.querySelectorAll("button[data-op]").forEach((b) => b.addEventListener("click", () => op({ op: b.dataset.op, value: b.dataset.v }, b)));
    el.querySelectorAll("input[data-op]").forEach((i) => {
      let t = null;
      i.addEventListener("input", () => {
        i.nextElementSibling.textContent = i.value;
        clearTimeout(t);
        t = setTimeout(() => op({ op: i.dataset.op, value: Number(i.value), axis: i.dataset.axis || undefined }), 120);
      });
    });
  },
};
