// Stage 15 — games and the long tail: now playing, recent games (tap to
// launch, if allowed), friends in game, photo frame, camera, device batteries.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dur = (ms) => {
  const m = Math.max(0, Math.floor(ms / 60_000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
const hours = (min) => (min >= 60 ? `${Math.round(min / 60)} h played` : `${min} min played`);
const ago = (t) => {
  const d = (Date.now() - t) / 86_400_000;
  return d < 1 ? "today" : d < 2 ? "yesterday" : d < 30 ? `${Math.floor(d)} days ago` : new Date(t).toLocaleDateString();
};
// Placeholder cover: the title on a colour derived from it (no network needed).
const hue = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

const coverCache = new Map();
function cover(ctx, id, el, name) {
  el.style.setProperty("--h", String(hue(name)));
  el.dataset.title = name;
  const apply = (src) => {
    if (src) el.style.backgroundImage = `url("${src}")`;
    el.classList.toggle("has-art", !!src);
  };
  if (coverCache.has(id)) return apply(coverCache.get(id));
  ctx.request("games.cover", { id }).then(
    (r) => (coverCache.set(id, r?.src ?? null), apply(r?.src)),
    () => {},
  );
}

export const nowgame = {
  type: "nowgame",
  meta: { name: "Now playing (game)", category: "media", size: { w: 4, h: 3 }, min: { w: 2, h: 2 }, options: [] },
  needs: () => ["games"],
  mount(el, ctx) {
    el.classList.add("w-nowgame");
    el.innerHTML = `<div class="ng-art"></div><div class="ng-shade"></div><div class="ng-text"><div class="ng-label">Playing</div><div class="ng-name"></div><div class="ng-time"></div></div>`;
    const art = el.querySelector(".ng-art");
    let key = null;
    let since = 0;
    const tick = () => (el.querySelector(".ng-time").textContent = since ? dur(Date.now() - since) : "");
    const t = setInterval(tick, 30_000);
    ctx.subscribe("games", (d) => {
      const p = d?.playing ?? null;
      el.dataset.idle = p ? "" : "1";
      const show = p ?? d?.recent?.[0] ?? null;
      el.querySelector(".ng-label").textContent = p ? "Playing" : show ? `Last played ${ago(show.lastPlayed)}` : d?.steam === false ? "Steam isn't installed" : "Nothing played yet";
      el.querySelector(".ng-name").textContent = show?.name ?? "";
      since = p?.since ?? 0;
      tick();
      if (show && show.id !== key) cover(ctx, (key = show.id), art, show.name);
    });
    return { unmount: () => clearInterval(t) };
  },
};

export const recentgames = {
  type: "recentgames",
  meta: { name: "Recent games", category: "media", size: { w: 8, h: 3 }, min: { w: 3, h: 2 }, options: [{ key: "friends", type: "bool", label: "Show friends in game (needs a Steam Web API key)", default: true }] },
  needs: () => ["games"],
  mount(el, ctx) {
    el.classList.add("w-games");
    el.innerHTML = `<div class="w-title">Recent games</div><div class="gm-row" data-no-swipe></div><div class="gm-friends muted"></div><div class="cd-msg muted"></div>`;
    const row = el.querySelector(".gm-row");
    const msg = el.querySelector(".cd-msg");
    let sig = "";
    ctx.subscribe("games", (d) => {
      const list = d?.recent ?? [];
      const next = JSON.stringify([list.map((g) => g.id), d?.playing?.id, d?.launch]);
      if (next !== sig) {
        sig = next;
        row.innerHTML = list.length ? "" : `<div class="muted setup">${d?.steam === false ? "Steam isn't installed. Add other games in the editor (Settings › Games)." : "Play something and it shows up here."}</div>`;
        for (const g of list) {
          const b = document.createElement("button");
          b.className = `gm-tile${d?.playing?.id === g.id ? " on" : ""}`;
          b.innerHTML = `<span class="gm-art"></span><span class="gm-name"></span><span class="gm-meta muted"></span>`;
          b.querySelector(".gm-name").textContent = g.name;
          b.querySelector(".gm-meta").textContent = g.playtimeMin ? hours(g.playtimeMin) : ago(g.lastPlayed);
          cover(ctx, g.id, b.querySelector(".gm-art"), g.name);
          b.addEventListener("click", async () => {
            if (!d?.launch) return (msg.textContent = "Launching from the panel is off (editor › Settings › Games).");
            const r = await ctx.request("games.launch", { id: g.id }).catch((e) => ({ ok: false, error: e.message }));
            msg.textContent = r?.ok ? `Starting ${g.name}…` : r?.error ?? "";
          });
          row.append(b);
        }
      }
      const f = el.querySelector(".gm-friends");
      f.textContent = ctx.options.friends && d?.friends?.length ? `Friends in game: ${d.friends.map((x) => `${x.name} (${x.game})`).join(", ")}` : "";
    });
  },
};

export const photoframe = {
  type: "photoframe",
  meta: {
    name: "Photo frame",
    category: "personal",
    size: { w: 6, h: 4 },
    min: { w: 2, h: 2 },
    options: [
      { key: "source", type: "choice", label: "Pictures from", default: "folder", choices: [{ value: "folder", label: "A folder on this computer" }, { value: "immich", label: "Immich" }] },
      { key: "folder", type: "text", label: "Folder (e.g. /Users/me/Pictures/Frame)", default: "", maxLength: 500 },
      { key: "immich", type: "text", label: "Immich address (https://…)", default: "", maxLength: 300 },
      { key: "album", type: "text", label: "Immich album id (empty = random)", default: "", maxLength: 80 },
      { key: "every", type: "number", label: "Change every (seconds)", default: 60, min: 10, max: 3600 },
      { key: "shuffle", type: "bool", label: "Shuffle", default: true },
      { key: "fit", type: "choice", label: "Fit", default: "cover", choices: [{ value: "cover", label: "Fill the tile" }, { value: "contain", label: "Show the whole picture" }] },
    ],
  },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-frame");
    el.dataset.fit = ctx.options.fit ?? "cover";
    el.innerHTML = `<div class="pf-img a"></div><div class="pf-img b"></div><div class="muted setup pf-msg"></div>`;
    const [a, b] = el.querySelectorAll(".pf-img");
    let front = a;
    const show = async () => {
      const r = await ctx.request("frame.picture", { pageId: ctx.pageId, widgetId: ctx.widgetId }).catch((e) => ({ ok: false, error: e.message }));
      el.querySelector(".pf-msg").textContent = r?.ok ? "" : r?.error ?? "";
      if (!r?.ok) return;
      const back = front === a ? b : a;
      back.style.backgroundImage = `url("${r.src}")`;
      back.classList.add("on");
      front.classList.remove("on");
      front = back; // cross-fade
    };
    show();
    const t = setInterval(show, Math.max(10, Number(ctx.options.every) || 60) * 1000);
    return { unmount: () => clearInterval(t) };
  },
};

export const camera = {
  type: "camera",
  meta: {
    name: "Camera",
    category: "personal",
    size: { w: 6, h: 4 },
    min: { w: 2, h: 2 },
    options: [
      { key: "url", type: "text", label: "rtsp:// stream or http(s):// snapshot address", default: "", maxLength: 500 },
      { key: "title", type: "text", label: "Title", default: "" },
      { key: "every", type: "number", label: "Refresh every (seconds)", default: 3, min: 2, max: 600 },
    ],
  },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-camera");
    el.innerHTML = `<div class="cam-img"></div><div class="cam-bar"><span class="cam-title">${esc(ctx.options.title || "Camera")}</span><span class="cam-at muted"></span></div><div class="muted setup cam-msg"></div>`;
    let busy = false;
    const grab = async () => {
      if (busy || document.hidden) return;
      busy = true;
      const r = await ctx.request("camera.snapshot", { pageId: ctx.pageId, widgetId: ctx.widgetId }).catch((e) => ({ ok: false, error: e.message }));
      busy = false;
      el.querySelector(".cam-msg").textContent = r?.ok ? "" : r?.error ?? "";
      if (r?.ok) {
        el.querySelector(".cam-img").style.backgroundImage = `url("${r.src}")`;
        el.querySelector(".cam-at").textContent = new Date(r.at ?? Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      }
    };
    grab();
    const t = setInterval(grab, Math.max(2, Number(ctx.options.every) || 3) * 1000);
    return { unmount: () => clearInterval(t) };
  },
};

export const devbatteries = {
  type: "devbatteries",
  meta: { name: "Device batteries", category: "computer", size: { w: 4, h: 2 }, min: { w: 2, h: 1 }, options: [] },
  needs: () => ["devbatteries"],
  mount(el, ctx) {
    el.classList.add("w-list");
    el.innerHTML = `<div class="w-title">Batteries</div><div class="list"></div>`;
    ctx.subscribe("devbatteries", (d) => {
      const list = d?.devices ?? [];
      el.querySelector(".list").innerHTML = list.length
        ? list.map((x) => `<div class="kv" data-level="${x.pct <= 15 ? "error" : x.pct <= 30 ? "warn" : "ok"}"><span class="k">${esc(x.name)}</span><span class="v">${x.pct}%</span><div class="minibar"><i style="width:${x.pct}%"></i></div></div>`).join("")
        : `<div class="muted">No Bluetooth device reports a battery.</div>`;
    });
  },
};
