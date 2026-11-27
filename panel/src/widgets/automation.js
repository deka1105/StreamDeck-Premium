// Stage 8 widgets: pushed value, notifications, big button, shortcut grid,
// command output, rules, and sandboxed Custom HTML.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ago = (t) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : new Date(t).toLocaleDateString();
};

// ----------------------------------------------------------- pushed value ----

export const pushvalue = {
  type: "pushvalue",
  meta: {
    name: "Pushed value",
    category: "controls",
    size: { w: 3, h: 2 },
    min: { w: 1, h: 1 },
    options: [
      { key: "key", type: "text", label: "Key (POST /api/push/<key>)", default: "temperature", maxLength: 64 },
      { key: "title", type: "text", label: "Title (optional)", default: "" },
      { key: "style", type: "choice", label: "Style", default: "value", choices: [{ value: "value", label: "Value" }, { value: "progress", label: "Value with a bar" }, { value: "gauge", label: "Ring" }, { value: "list", label: "List" }] },
    ],
  },
  needs: () => ["pushes"],
  mount(el, ctx) {
    el.classList.add("w-push");
    ctx.subscribe("pushes", (d) => {
      const p = d?.values?.[ctx.options.key];
      el.dataset.level = p?.level ?? "";
      const title = esc(ctx.options.title || p?.title || ctx.options.key);
      if (!p) return (el.innerHTML = `<div class="w-title">${title}</div><div class="muted push-empty">No value yet — POST to /api/push/${esc(ctx.options.key)}</div>`);
      const value = `<span class="push-num">${p.icon ? `${esc(p.icon)} ` : ""}${esc(p.value)}</span>${p.unit ? `<span class="push-unit">${esc(p.unit)}</span>` : ""}`;
      const sub = p.sub ? `<div class="muted push-sub">${esc(p.sub)}</div>` : "";
      const meta = `<div class="muted push-at">${ago(p.at)}</div>`;
      if (ctx.options.style === "list" && p.items) {
        el.innerHTML = `<div class="w-title">${title}</div><div class="list">${p.items.map((i) => `<div class="kv" data-level="${esc(i.level ?? "")}"><span class="k">${esc(i.label)}</span><span class="v">${esc(i.value ?? "")}</span></div>`).join("")}</div>${meta}`;
      } else if (ctx.options.style === "gauge" && Number.isFinite(p.progress)) {
        const C = 2 * Math.PI * 40;
        el.innerHTML = `<svg viewBox="0 0 100 100" class="push-ring"><circle cx="50" cy="50" r="40" class="t-track"/><circle cx="50" cy="50" r="40" class="t-fill" transform="rotate(-90 50 50)" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - p.progress)}"/></svg><div class="push-center"><div class="push-value">${value}</div><div class="muted">${title}</div></div>`;
      } else {
        el.innerHTML = `<div class="w-title">${title}</div><div class="push-value">${value}</div>${sub}${ctx.options.style === "progress" && Number.isFinite(p.progress) ? `<div class="minibar"><i style="width:${p.progress * 100}%"></i></div>` : ""}${meta}`;
      }
      if (p.color) el.style.setProperty("--push", p.color);
    });
  },
};

export const notifications = {
  type: "notifications",
  meta: { name: "Notifications", category: "controls", size: { w: 4, h: 3 }, min: { w: 2, h: 2 }, options: [] },
  needs: () => ["notifications"],
  mount(el, ctx) {
    el.classList.add("w-list", "w-notes");
    ctx.subscribe("notifications", (d) => {
      const items = d?.items ?? [];
      el.innerHTML = `<div class="w-title">Notifications</div><div class="list">${
        items.length
          ? items.map((n) => `<div class="note-row" data-level="${esc(n.level)}"><b>${esc(n.title || n.text)}</b>${n.title && n.text ? `<span>${esc(n.text)}</span>` : ""}<span class="muted">${ago(n.at)}</span></div>`).join("")
          : `<div class="muted">Nothing yet. Send one with POST /api/notify.</div>`
      }</div>`;
    });
  },
};

// --------------------------------------------------- shortcuts by id ----

let shortcutCache = null;
function loadShortcuts(ctx) {
  shortcutCache ??= ctx.request("shortcuts.list").then((r) => r?.shortcuts ?? [], () => ((shortcutCache = null), []));
  return shortcutCache;
}

function key(s, ctx, cls = "sc-key") {
  const b = document.createElement("button");
  b.className = cls;
  b.style.setProperty("--tile", s.color);
  b.innerHTML = `<span class="deck-icon">${esc(s.icon || "⚡")}</span><span class="deck-label">${esc(s.label)}</span>`;
  b.addEventListener("click", async () => {
    b.classList.add("pressed");
    setTimeout(() => b.classList.remove("pressed"), 160);
    const r = await ctx.request("shortcut.run", { id: s.id }).catch((e) => ({ ok: false, error: e.message }));
    b.dataset.result = r?.ok ? "ok" : "fail";
    if (!r?.ok) b.title = r?.error ?? "";
    setTimeout(() => delete b.dataset.result, 900);
  });
  return b;
}

export const bigbutton = {
  type: "bigbutton",
  meta: { name: "Big button", category: "controls", size: { w: 3, h: 3 }, min: { w: 1, h: 1 }, options: [{ key: "shortcut", type: "text", label: "Shortcut id", default: "", maxLength: 40 }] },
  needs: () => ["pushes"],
  async mount(el, ctx) {
    el.classList.add("w-bigbutton");
    const all = await loadShortcuts(ctx);
    const s = all.find((x) => x.id === ctx.options.shortcut);
    if (!s) return (el.innerHTML = `<div class="muted setup">Pick a shortcut id in the editor (Shortcuts lists them).</div>`);
    const b = key(s, ctx, "sc-key big");
    el.append(b);
    if (s.toggle) {
      // A toggle shortcut lights up from a pushed value, e.g. "layout=RU" or "onair".
      const [k, want] = s.toggle.split("=");
      ctx.subscribe("pushes", (d) => {
        const v = d?.values?.[k]?.value;
        const on = want ? String(v ?? "").toLowerCase() === want.toLowerCase() : !["", "0", "false", "off", "no"].includes(String(v ?? "").toLowerCase());
        b.classList.toggle("on", on);
      });
    }
  },
};

export const shortcutgrid = {
  type: "shortcutgrid",
  meta: { name: "Shortcut grid", category: "controls", size: { w: 6, h: 3 }, min: { w: 2, h: 1 }, options: [{ key: "ids", type: "list", label: "Shortcut ids, one per line (empty = all)", default: [] }] },
  needs: () => [],
  async mount(el, ctx) {
    el.classList.add("w-deck", "w-scgrid");
    const all = await loadShortcuts(ctx);
    const pick = ctx.options.ids?.length ? ctx.options.ids.map((id) => all.find((s) => s.id === id)).filter(Boolean) : all;
    if (!pick.length) return (el.innerHTML = `<div class="deck-msg">Add shortcuts in the editor (Shortcuts tab).</div>`);
    const grid = document.createElement("div");
    grid.className = "deck-grid";
    const cols = Math.ceil(Math.sqrt((pick.length * el.clientWidth) / Math.max(1, el.clientHeight)));
    grid.style.gridTemplateColumns = `repeat(${Math.max(1, Math.min(pick.length, cols))}, minmax(0, 1fr))`;
    grid.append(...pick.map((s) => key(s, ctx, "deck-tile")));
    el.append(grid);
  },
};

export const command = {
  type: "command",
  meta: { name: "Command output", category: "controls", size: { w: 6, h: 3 }, min: { w: 2, h: 1 }, options: [{ key: "command", type: "text", label: "Command id (defined in the editor's Shortcuts tab)", default: "", maxLength: 40 }, { key: "title", type: "text", label: "Title", default: "" }] },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-command");
    el.innerHTML = `<div class="w-title"></div><pre class="cmd-out"></pre><div class="muted cmd-at"></div>`;
    el.querySelector(".w-title").textContent = ctx.options.title || ctx.options.command;
    const load = async () => {
      const r = await ctx.request("command.output", { pageId: ctx.pageId, widgetId: ctx.widgetId }).catch((e) => ({ ok: false, error: e.message }));
      el.querySelector(".cmd-out").textContent = r?.ok ? (r.error ? `${r.output}\n${r.error}` : r.output) || "(no output)" : r?.error ?? "";
      el.querySelector(".cmd-at").textContent = r?.at ? `updated ${ago(r.at)}` : "";
    };
    load();
    ctx.every(10_000, load);
  },
};

export const ruleswidget = {
  type: "rules",
  meta: { name: "Rules", category: "controls", size: { w: 3, h: 2 }, min: { w: 2, h: 1 }, options: [] },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-rules");
    const render = async () => {
      const r = await ctx.request("rules.state").catch(() => null);
      const paused = r?.pausedUntil > Date.now();
      el.innerHTML = `<div class="w-title">Rules</div><div class="rules-state">${paused ? `Paused until ${new Date(r.pausedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : `${r?.active?.length ?? 0} active`}</div>`;
      const b = document.createElement("button");
      b.className = "tbtn";
      b.dataset.noSwipe = "";
      b.textContent = paused ? "Resume" : "Pause for an hour";
      b.addEventListener("click", async () => {
        await ctx.request("rules.pause", { minutes: paused ? 0 : 60 });
        render();
      });
      el.append(b);
    };
    render();
    ctx.every(15_000, render);
  },
};

// -------------------------------------------------------------- custom HTML ----

/** The bootstrap injected before the user's HTML: the only API it gets. */
export const CUSTOM_BOOT = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:"><script>(function(){var L={},D={};window.deskassist={data:D,on:function(n,f){(L[n]=L[n]||[]).push(f);if(D[n]!==undefined){try{f(D[n])}catch(e){}}},goto:function(p){parent.postMessage({da:"goto",page:String(p)},"*")},run:function(id,v){parent.postMessage({da:"run",id:String(id),value:v===undefined?undefined:Number(v)},"*")}};addEventListener("message",function(e){if(e.source!==parent)return;var m=e.data;if(!m||m.da!=="data")return;D[m.name]=m.value;(L[m.name]||[]).forEach(function(f){try{f(m.value)}catch(x){}})})})();</script>`;

const FEEDS = { state: "system", push: "pushes", weather: "weather", media: "media", calendar: "calendar" };

export const customhtml = {
  type: "customhtml",
  meta: {
    name: "Custom HTML",
    category: "layout",
    size: { w: 4, h: 3 },
    min: { w: 1, h: 1 },
    options: [{ key: "html", type: "textarea", label: "Your HTML, CSS and JavaScript (window.deskassist: on, data, goto, run)", default: "<h3 style='color:#fff;font-family:sans-serif'>Hello</h3>", maxLength: 20000 }],
  },
  needs: () => Object.values(FEEDS),
  mount(el, ctx) {
    el.classList.add("w-custom");
    const frame = document.createElement("iframe");
    // No allow-same-origin: the page gets an opaque origin and can't reach the panel.
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("title", "Custom widget");
    frame.srcdoc = `<!doctype html><html><head>${CUSTOM_BOOT}<style>html,body{margin:0;background:transparent;color:#e8eef9}</style></head><body>${ctx.options.html ?? ""}</body></html>`;
    el.append(frame);
    const post = (name, value) => frame.contentWindow?.postMessage({ da: "data", name, value }, "*");
    for (const [name, kind] of Object.entries(FEEDS)) ctx.subscribe(kind, (v) => post(name, v));
    // Runs from the page: newest number per shortcut, at most one every 300 ms.
    const lastSent = new Map();
    const pending = new Map();
    const onMsg = (e) => {
      if (e.source !== frame.contentWindow || !e.data || typeof e.data !== "object") return;
      const m = e.data;
      if (m.da === "goto" && typeof m.page === "string") ctx.goto?.(m.page.slice(0, 40));
      if (m.da === "run" && typeof m.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(m.id)) {
        const value = Number.isFinite(m.value) ? m.value : undefined;
        const send = () => {
          lastSent.set(m.id, Date.now());
          pending.delete(m.id);
          ctx.request("shortcut.run", value === undefined ? { id: m.id } : { id: m.id, value: String(value) }).catch(() => {});
        };
        const wait = 300 - (Date.now() - (lastSent.get(m.id) ?? 0));
        clearTimeout(pending.get(m.id));
        if (wait <= 0) send();
        else pending.set(m.id, setTimeout(send, wait));
      }
    };
    window.addEventListener("message", onMsg);
    return {
      unmount() {
        window.removeEventListener("message", onMsg);
        for (const t of pending.values()) clearTimeout(t);
      },
    };
  },
};
