// Personal widgets. Notes, checklists and counters are saved on the computer
// (ctx.persisted); battery and computer switching are answered by the phone app.

import { QUOTES } from "../quotes.js";

const dayKey = (t = Date.now()) => new Date(t).toLocaleDateString("en-CA");

// ------------------------------------------------------------------- note ----

export const note = {
  type: "note",
  meta: {
    name: "Note",
    category: "personal",
    size: { w: 4, h: 3 },
    min: { w: 2, h: 2 },
    options: [{ key: "title", type: "text", label: "Title (optional)", default: "" }],
  },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-note");
    el.innerHTML = `<div class="w-title"></div><textarea class="note-text" placeholder="Tap to write…" maxlength="4000" data-no-swipe></textarea>`;
    el.querySelector(".w-title").textContent = ctx.options.title;
    el.querySelector(".w-title").hidden = !ctx.options.title;
    const ta = el.querySelector(".note-text");
    let typing = false;
    const st = ctx.persisted({ text: "" }, (v) => {
      if (!typing) ta.value = v?.text ?? "";
    });
    let t = null;
    ta.addEventListener("focus", () => (typing = true));
    ta.addEventListener("blur", () => {
      typing = false;
      clearTimeout(t);
      st.set({ text: ta.value });
    });
    ta.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => st.set({ text: ta.value }), 600);
    });
  },
};

// -------------------------------------------------------------- checklist ----

/** Items unchecked when the stored day isn't today. Pure (unit-tested). */
export function dailyReset(state, today = dayKey()) {
  if (!state || state.day === today) return state;
  return { ...state, day: today, done: [] };
}

export const checklist = {
  type: "checklist",
  meta: {
    name: "Checklist",
    category: "personal",
    size: { w: 4, h: 3 },
    min: { w: 2, h: 2 },
    options: [
      { key: "title", type: "text", label: "Title", default: "Today" },
      { key: "items", type: "list", label: "Items, one per line", default: ["Water the plants", "Stretch", "Inbox zero"] },
      { key: "daily", type: "bool", label: "Untick everything each morning", default: true },
    ],
  },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-list", "w-checklist");
    el.innerHTML = `<div class="w-title"><span class="cl-title"></span> <span class="muted cl-count"></span></div><div class="list" data-no-swipe></div>`;
    el.querySelector(".cl-title").textContent = ctx.options.title;
    const list = el.querySelector(".list");
    const items = (ctx.options.items ?? []).slice(0, 30);
    const st = ctx.persisted({ day: dayKey(), done: [] }, () => draw());
    const current = () => (ctx.options.daily ? dailyReset(st.value) : st.value) ?? { done: [] };
    function draw() {
      const s = current();
      const done = new Set(s.done ?? []);
      el.querySelector(".cl-count").textContent = items.length ? `${items.filter((i) => done.has(i)).length}/${items.length}` : "";
      list.replaceChildren(
        ...items.map((item) => {
          const row = document.createElement("label");
          row.className = `cl-row${done.has(item) ? " done" : ""}`;
          row.innerHTML = `<input type="checkbox"><span></span>`;
          row.querySelector("span").textContent = item;
          const box = row.querySelector("input");
          box.checked = done.has(item);
          box.addEventListener("change", () => {
            const next = new Set(current().done ?? []);
            box.checked ? next.add(item) : next.delete(item);
            st.set({ day: dayKey(), done: [...next] });
          });
          return row;
        }),
      );
      if (!items.length) list.innerHTML = `<div class="muted">Add items in the editor.</div>`;
    }
    ctx.every(60_000, () => ctx.options.daily && st.value?.day !== dayKey() && draw());
  },
};

// ---------------------------------------------------------------- counter ----

export const counter = {
  type: "counter",
  meta: {
    name: "Counter",
    category: "personal",
    size: { w: 3, h: 2 },
    min: { w: 2, h: 2 },
    options: [
      { key: "title", type: "text", label: "What you're counting", default: "Glasses of water" },
      { key: "step", type: "number", label: "Step", default: 1, min: 1, max: 1000 },
      { key: "daily", type: "bool", label: "Start from zero each morning", default: false },
    ],
  },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-counter");
    el.innerHTML = `<div class="w-title"></div><div class="ct-row"><button class="tbtn ct-minus" data-no-swipe>−</button><div class="ct-num">0</div><button class="tbtn primary ct-plus" data-no-swipe>+</button></div><button class="ct-reset muted" data-no-swipe>Reset</button>`;
    el.querySelector(".w-title").textContent = ctx.options.title;
    const num = el.querySelector(".ct-num");
    const value = () => (ctx.options.daily && st.value?.day !== dayKey() ? 0 : st.value?.n ?? 0);
    const st = ctx.persisted({ n: 0, day: dayKey() }, () => (num.textContent = String(value())));
    const set = (n) => st.set({ n, day: dayKey() });
    el.querySelector(".ct-plus").addEventListener("click", () => set(value() + ctx.options.step));
    el.querySelector(".ct-minus").addEventListener("click", () => set(Math.max(0, value() - ctx.options.step)));
    el.querySelector(".ct-reset").addEventListener("click", () => set(0));
  },
};

// ----------------------------------------------------------------- breathe ----

const PATTERNS = {
  box: { label: "Box (4-4-4-4)", steps: [["Breathe in", 4, 1], ["Hold", 4, 1], ["Breathe out", 4, 0], ["Hold", 4, 0]] },
  relax: { label: "Relax (4-7-8)", steps: [["Breathe in", 4, 1], ["Hold", 7, 1], ["Breathe out", 8, 0]] },
  calm: { label: "Calm (5-5)", steps: [["Breathe in", 5, 1], ["Breathe out", 5, 0]] },
};

export const breathe = {
  type: "breathe",
  meta: {
    name: "Breathe",
    category: "personal",
    size: { w: 4, h: 4 },
    min: { w: 2, h: 2 },
    options: [{ key: "pattern", type: "choice", label: "Pattern", default: "box", choices: Object.entries(PATTERNS).map(([value, p]) => ({ value, label: p.label })) }],
  },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-breathe");
    el.innerHTML = `<div class="br-circle"></div><div class="br-text"></div>`;
    const circle = el.querySelector(".br-circle");
    const text = el.querySelector(".br-text");
    const steps = (PATTERNS[ctx.options.pattern] ?? PATTERNS.box).steps;
    let i = -1;
    const next = () => {
      i = (i + 1) % steps.length;
      const [label, secs, big] = steps[i];
      text.textContent = label;
      circle.style.transitionDuration = `${secs}s`;
      circle.style.transform = `scale(${big ? 1 : 0.45})`;
      timer = setTimeout(next, secs * 1000);
    };
    let timer = null;
    next();
    return { unmount: () => clearTimeout(timer) };
  },
};

// ------------------------------------------------------------- quote / title ----

export const quote = {
  type: "quote",
  meta: {
    name: "Quote",
    category: "personal",
    size: { w: 6, h: 2 },
    min: { w: 3, h: 1 },
    options: [{ key: "every", type: "choice", label: "New quote", default: "day", choices: [{ value: "hour", label: "Every hour" }, { value: "day", label: "Every day" }] }],
  },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-quote");
    el.innerHTML = `<blockquote class="q-text"></blockquote><div class="q-by muted"></div>`;
    const render = () => {
      const now = ctx.now();
      const slot = ctx.options.every === "hour" ? Math.floor(now / 3600_000) : Math.floor((now - now.getTimezoneOffset() * 60_000) / 86400_000);
      const [t, by] = QUOTES[slot % QUOTES.length];
      el.querySelector(".q-text").textContent = `“${t}”`;
      el.querySelector(".q-by").textContent = `— ${by}`;
    };
    render();
    ctx.every(60_000, render);
  },
};

export const title = {
  type: "title",
  meta: {
    name: "Title",
    category: "personal",
    size: { w: 6, h: 1 },
    min: { w: 1, h: 1 },
    options: [
      { key: "text", type: "text", label: "Text", default: "Focus" },
      { key: "align", type: "choice", label: "Align", default: "center", choices: [{ value: "left", label: "Left" }, { value: "center", label: "Centre" }] },
      { key: "card", type: "bool", label: "Show as a card", default: false },
    ],
  },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-titletext");
    el.dataset.align = ctx.options.align;
    el.closest(".w")?.classList.toggle("bare", !ctx.options.card);
    el.textContent = ctx.options.text;
  },
};

// ---------------------------------------------- answered by the phone app ----

export const battery = {
  type: "battery",
  meta: { name: "Phone battery", category: "personal", size: { w: 2, h: 2 }, min: { w: 1, h: 1 }, options: [] },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-battery");
    el.innerHTML = `<div class="bat-icon"><i></i></div><div class="bat-pct">—</div><div class="bat-state muted"></div>`;
    const show = (b) => {
      const ok = b && Number.isFinite(b.level);
      el.querySelector(".bat-pct").textContent = ok ? `${Math.round(b.level * 100)}%` : "—";
      el.querySelector(".bat-icon i").style.width = ok ? `${Math.round(b.level * 100)}%` : "0";
      el.querySelector(".bat-state").textContent = !ok ? "Only on the phone" : b.charging ? "Charging" : b.lowPower ? "Low Power Mode" : "On battery";
      el.dataset.level = ok && b.level < 0.2 && !b.charging ? "low" : "";
    };
    ctx.request("phone.battery").then(show, () => show(null));
    ctx.subscribe("battery", show);
  },
};

export const computers = {
  type: "computers",
  meta: { name: "Computers", category: "personal", size: { w: 4, h: 2 }, min: { w: 2, h: 1 }, options: [] },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-list", "w-computers");
    el.innerHTML = `<div class="w-title">Computers</div><div class="list" data-no-swipe></div>`;
    const list = el.querySelector(".list");
    const show = (r) => {
      const hosts = r?.hosts ?? [];
      if (!hosts.length) {
        list.innerHTML = `<div class="muted">Switching computers works in the phone app.</div>`;
        return;
      }
      list.replaceChildren(
        ...hosts.map((h) => {
          const b = document.createElement("button");
          b.className = `pc-row${h.active ? " active" : ""}`;
          b.innerHTML = `<span class="pc-dot"></span><span class="pc-name"></span><span class="muted pc-tag"></span>`;
          b.querySelector(".pc-name").textContent = h.name;
          b.querySelector(".pc-tag").textContent = h.active ? "in use" : "switch";
          if (!h.active) b.addEventListener("click", () => ctx.request("phone.switchHost", { id: h.id }));
          return b;
        }),
      );
    };
    ctx.request("phone.hosts").then(show, () => show(null));
  },
};
