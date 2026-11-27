// Stage 6 widgets: weather and sky, air quality, markets, Hacker News, news
// feeds, images, agenda and "next up". The computer fetches everything; these
// only render, and mark data "as of …" when it is stale.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const hm = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");
const round = (v) => (Number.isFinite(v) ? Math.round(v) : "—");

/** WMO weather code → [icon, words]. Our own wording; codes per WMO 4677 as Open-Meteo uses them. */
export function weatherLook(code, isDay = true) {
  const c = Number(code);
  if (c === 0) return [isDay ? "☀️" : "🌙", "Clear"];
  if (c === 1) return [isDay ? "🌤️" : "🌙", "Mostly clear"];
  if (c === 2) return ["⛅", "Partly cloudy"];
  if (c === 3) return ["☁️", "Overcast"];
  if (c === 45 || c === 48) return ["🌫️", "Fog"];
  if (c >= 51 && c <= 57) return ["🌦️", "Drizzle"];
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return ["🌧️", c >= 80 ? "Showers" : "Rain"];
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return ["🌨️", "Snow"];
  if (c >= 95) return ["⛈️", "Thunderstorm"];
  return ["🌡️", "—"];
}

/** Moon phase 0..1 (0 = new, 0.5 = full) at time t, and its name. Pure. */
export function moonPhase(t = Date.now()) {
  const SYNODIC = 29.530588853 * 86400_000;
  const KNOWN_NEW = Date.UTC(2000, 0, 6, 18, 14);
  const p = ((((t - KNOWN_NEW) % SYNODIC) + SYNODIC) % SYNODIC) / SYNODIC;
  const names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
  return { phase: p, name: names[Math.round(p * 8) % 8], illumination: (1 - Math.cos(2 * Math.PI * p)) / 2 };
}

function moonSvg(p) {
  // Lit part: a half disc plus an ellipse that grows/shrinks with the phase.
  const k = Math.cos(2 * Math.PI * p); // 1 at new, -1 at full
  const rx = Math.abs(k) * 40;
  const waxing = p < 0.5;
  const sweepHalf = waxing ? 1 : 0;
  const sweepEll = k > 0 ? (waxing ? 0 : 1) : waxing ? 1 : 0;
  return `<svg viewBox="0 0 100 100" class="moon-svg" aria-hidden="true"><circle cx="50" cy="50" r="40" class="moon-dark"/><path class="moon-lit" d="M50 10 A40 40 0 0 ${sweepHalf} 50 90 A${rx.toFixed(2)} 40 0 0 ${sweepEll} 50 10Z"/></svg>`;
}

function staleNote(d) {
  return d?.stale && d?.fetchedAt ? `<div class="stale">as of ${hm(d.fetchedAt)}</div>` : d?.stale ? `<div class="stale">offline</div>` : "";
}

function needsSetup(el, what) {
  el.innerHTML = `<div class="muted setup">${esc(what)}</div>`;
}

// ---------------------------------------------------------------- weather ----

export const weather = {
  type: "weather",
  meta: { name: "Weather", category: "web", size: { w: 4, h: 2 }, min: { w: 1, h: 1 }, options: [] },
  needs: () => ["weather"],
  mount(el, ctx) {
    el.classList.add("w-weather");
    ctx.subscribe("weather", (w) => {
      if (w?.missing) return needsSetup(el, "Set your location in the editor (Settings › Location).");
      if (!w?.current) return needsSetup(el, w?.error ? `Weather unavailable: ${w.error}` : "Loading weather…");
      const [icon, words] = weatherLook(w.current.code, w.current.isDay);
      const today = w.daily?.[0] ?? {};
      el.innerHTML = `<div class="wx-main"><span class="wx-icon">${icon}</span><span class="wx-temp">${round(w.current.temp)}°</span></div>
        <div class="wx-words">${esc(words)} · H ${round(today.max)}° L ${round(today.min)}°</div>
        <div class="wx-place muted">${esc(w.place ?? "")} · feels ${round(w.current.feels)}° · ${round(w.current.wind)} ${esc(w.units?.wind ?? "")}</div>${staleNote(w)}`;
    });
  },
};

export const forecast = {
  type: "forecast",
  meta: {
    name: "Forecast",
    category: "web",
    size: { w: 6, h: 2 },
    min: { w: 3, h: 2 },
    options: [{ key: "mode", type: "choice", label: "Show", default: "daily", choices: [{ value: "daily", label: "Next 7 days" }, { value: "hourly", label: "Next 24 hours" }] }],
  },
  needs: () => ["weather"],
  mount(el, ctx) {
    el.classList.add("w-forecast");
    ctx.subscribe("weather", (w) => {
      if (w?.missing) return needsSetup(el, "Set your location in the editor.");
      if (!w?.daily) return needsSetup(el, "Loading forecast…");
      const cells =
        ctx.options.mode === "hourly"
          ? (w.hourly ?? []).filter((_, i) => i % 3 === 0).slice(0, 8).map((h) => [new Date(h.t).toLocaleTimeString([], { hour: "numeric" }), weatherLook(h.code)[0], `${round(h.temp)}°`, h.pop ? `${h.pop}%` : ""])
          : w.daily.map((d, i) => [i === 0 ? "Today" : new Date(`${d.date}T12:00`).toLocaleDateString([], { weekday: "short" }), weatherLook(d.code)[0], `${round(d.max)}°`, `${round(d.min)}°`]);
      el.innerHTML = `<div class="fc-row">${cells.map(([a, b, c, d]) => `<div class="fc-cell"><span class="muted">${esc(a)}</span><span class="fc-icon">${b}</span><b>${esc(c)}</b><span class="muted">${esc(d)}</span></div>`).join("")}</div>${staleNote(w)}`;
    });
  },
};

export const sunmoon = {
  type: "sunmoon",
  meta: { name: "Sun & moon", category: "web", size: { w: 4, h: 2 }, min: { w: 2, h: 2 }, options: [] },
  needs: () => ["weather"],
  mount(el, ctx) {
    el.classList.add("w-sunmoon");
    let last = null;
    const render = () => {
      const w = last;
      const m = moonPhase(Date.now());
      const d = w?.daily?.[0];
      const left = d?.sunset ? d.sunset - Date.now() : null;
      el.innerHTML = `<div class="sm-grid">
        <div><span class="muted">Sunrise</span><b>${hm(d?.sunrise)}</b></div>
        <div><span class="muted">Sunset</span><b>${hm(d?.sunset)}</b></div>
        <div><span class="muted">Daylight left</span><b>${left === null ? "—" : left > 0 ? `${Math.floor(left / 3600_000)} h ${Math.floor((left % 3600_000) / 60_000)} min` : "after sunset"}</b></div>
        <div><span class="muted">UV max</span><b>${d?.uv ?? "—"}</b></div>
        <div class="sm-moon">${moonSvg(m.phase)}<span>${esc(m.name)} · ${Math.round(m.illumination * 100)}%</span></div></div>`;
    };
    ctx.subscribe("weather", (w) => ((last = w), render()));
    render();
    ctx.every(60_000, render);
  },
};

export const moon = {
  type: "moon",
  meta: { name: "Moon", category: "web", size: { w: 2, h: 2 }, min: { w: 1, h: 1 }, options: [] },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-moon");
    const render = () => {
      const m = moonPhase(Date.now());
      const days = Math.round(((0.5 - m.phase + 1) % 1) * 29.53);
      el.innerHTML = `${moonSvg(m.phase)}<div class="moon-name">${esc(m.name)}</div><div class="muted moon-sub">${Math.round(m.illumination * 100)}% lit · full in ${days} d</div>`;
    };
    render();
    ctx.every(3600_000, render);
  },
};

export const airquality = {
  type: "airquality",
  meta: {
    name: "Air quality",
    category: "web",
    size: { w: 3, h: 2 },
    min: { w: 2, h: 1 },
    options: [{ key: "scale", type: "choice", label: "Index", default: "eaqi", choices: [{ value: "eaqi", label: "European AQI" }, { value: "usaqi", label: "US AQI" }] }],
  },
  needs: () => ["weather"],
  mount(el, ctx) {
    el.classList.add("w-air");
    ctx.subscribe("weather", (w) => {
      if (w?.missing) return needsSetup(el, "Set your location in the editor.");
      const a = w?.air;
      if (!a) return needsSetup(el, "Loading air quality…");
      const v = ctx.options.scale === "usaqi" ? a.usaqi : a.eaqi;
      const bands = ctx.options.scale === "usaqi" ? [[50, "Good"], [100, "Moderate"], [150, "Unhealthy for some"], [200, "Unhealthy"], [300, "Very unhealthy"], [1e9, "Hazardous"]] : [[20, "Good"], [40, "Fair"], [60, "Moderate"], [80, "Poor"], [100, "Very poor"], [1e9, "Extremely poor"]];
      const idx = bands.findIndex(([lim]) => v <= lim);
      el.dataset.band = String(idx);
      el.innerHTML = `<div class="air-top"><span class="air-num">${round(v)}</span><span class="air-word">${esc(bands[idx]?.[1] ?? "")}</span></div>
        <div class="air-parts muted">PM2.5 ${round(a.pm25)} · PM10 ${round(a.pm10)} · O₃ ${round(a.o3)} · NO₂ ${round(a.no2)} µg/m³</div>${staleNote(w)}`;
    });
  },
};

// ---------------------------------------------------------------- markets ----

export const rates = {
  type: "rates",
  meta: {
    name: "Exchange rates",
    category: "web",
    size: { w: 3, h: 2 },
    min: { w: 2, h: 1 },
    options: [
      { key: "base", type: "text", label: "Base currency (e.g. USD)", default: "USD", maxLength: 3 },
      { key: "symbols", type: "list", label: "Currencies, one per line", default: ["EUR", "GBP", "JPY"] },
    ],
  },
  needs: () => ["markets"],
  mount(el, ctx) {
    el.classList.add("w-list", "w-rates");
    const base = String(ctx.options.base || "USD").toUpperCase();
    ctx.subscribe("markets", (m) => {
      const r = m?.rates?.[base];
      if (!r) return needsSetup(el, "Loading rates…");
      el.innerHTML = `<div class="w-title">1 ${esc(base)} <span class="muted">· ECB ${esc(r.date)}</span></div><div class="list">${(ctx.options.symbols ?? [])
        .map((s) => s.toUpperCase())
        .filter((s) => r.rates[s])
        .map((s) => `<div class="kv"><span class="k">${esc(s)}</span><span class="v">${r.rates[s].toLocaleString([], { maximumFractionDigits: 4 })}</span></div>`)
        .join("")}</div>${staleNote(m)}`;
    });
  },
};

export const crypto = {
  type: "crypto",
  meta: {
    name: "Crypto prices",
    category: "web",
    size: { w: 3, h: 2 },
    min: { w: 2, h: 1 },
    options: [
      { key: "coins", type: "list", label: "Coins (CoinGecko ids), one per line", default: ["bitcoin", "ethereum"] },
      { key: "vs", type: "text", label: "Currency (e.g. usd)", default: "usd", maxLength: 3 },
    ],
  },
  needs: () => ["markets"],
  mount(el, ctx) {
    el.classList.add("w-list", "w-crypto");
    const vs = String(ctx.options.vs || "usd").toLowerCase();
    ctx.subscribe("markets", (m) => {
      const prices = m?.crypto?.prices ?? {};
      const rows = (ctx.options.coins ?? []).filter((c) => prices[c]);
      if (!rows.length) return needsSetup(el, "Loading prices…");
      el.innerHTML = `<div class="list">${rows
        .map((c) => {
          const p = prices[c];
          const ch = p[`${vs}_24h_change`];
          return `<div class="kv"><span class="k">${esc(c[0].toUpperCase() + c.slice(1))}</span><span class="v">${Number(p[vs]).toLocaleString([], { style: "currency", currency: vs.toUpperCase(), maximumFractionDigits: p[vs] < 1 ? 4 : 0 })} <span class="chg ${ch >= 0 ? "up" : "down"}">${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch ?? 0).toFixed(1)}%</span></span></div>`;
        })
        .join("")}</div><div class="credit muted">Prices: CoinGecko</div>${staleNote(m)}`;
    });
  },
};

// ------------------------------------------------------------- reading ----

export const hackernews = {
  type: "hackernews",
  meta: { name: "Hacker News", category: "web", size: { w: 4, h: 3 }, min: { w: 3, h: 2 }, options: [{ key: "count", type: "number", label: "Stories", default: 8, min: 3, max: 15 }] },
  needs: () => ["hn"],
  mount(el, ctx) {
    el.classList.add("w-list", "w-hn");
    ctx.subscribe("hn", (h) => {
      const s = (h?.stories ?? []).slice(0, ctx.options.count);
      if (!s.length) return needsSetup(el, "Loading stories…");
      el.innerHTML = `<div class="w-title">Hacker News</div><div class="list">${s.map((x) => `<div class="news-row"><span class="news-title">${esc(x.title)}</span><span class="muted news-meta">${x.score} pts · ${x.comments} comments</span></div>`).join("")}</div>${staleNote(h)}`;
    });
  },
};

export const news = {
  type: "news",
  meta: {
    name: "News feeds",
    category: "web",
    size: { w: 6, h: 3 },
    min: { w: 3, h: 2 },
    options: [
      { key: "category", type: "text", label: "Only this category (optional)", default: "" },
      { key: "feed", type: "text", label: "Only this feed (optional)", default: "" },
      { key: "openOnPc", type: "bool", label: "Open articles on the computer when tapped", default: false },
    ],
  },
  needs: () => ["feeds"],
  mount(el, ctx) {
    el.classList.add("w-list", "w-news");
    el.innerHTML = `<div class="list" data-no-swipe></div>`;
    const list = el.querySelector(".list");
    list.addEventListener("click", (e) => {
      const row = e.target.closest(".news-row");
      if (!row || !ctx.options.openOnPc) return;
      row.classList.add("opening");
      ctx.request("feeds.open", { url: row.dataset.link }).finally(() => setTimeout(() => row.classList.remove("opening"), 800));
    });
    ctx.subscribe("feeds", (f) => {
      const cat = ctx.options.category.trim().toLowerCase();
      const only = ctx.options.feed.trim().toLowerCase();
      const items = (f?.items ?? []).filter((i) => (!cat || i.category.toLowerCase() === cat) && (!only || String(i.feed).toLowerCase() === only)).slice(0, 25);
      if (!items.length) return (list.innerHTML = `<div class="muted">${f?.items ? "Add feeds in the editor (Settings › News feeds)." : "Loading headlines…"}</div>`);
      list.innerHTML = items
        .map((i) => `<div class="news-row" data-link="${esc(i.link)}"><span class="news-title">${esc(i.title)}</span><span class="muted news-meta">${esc(i.feed)}${i.at ? ` · ${new Date(i.at).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</span></div>`)
        .join("");
    });
  },
};

export const image = {
  type: "image",
  meta: {
    name: "Image / webcam",
    category: "web",
    size: { w: 4, h: 3 },
    min: { w: 1, h: 1 },
    options: [
      { key: "url", type: "text", label: "Image address (https://…)", default: "", maxLength: 2000 },
      { key: "refresh", type: "number", label: "Refresh every (seconds, 0 = never)", default: 60, min: 0, max: 86400 },
      { key: "fit", type: "choice", label: "Fit", default: "cover", choices: [{ value: "cover", label: "Fill" }, { value: "contain", label: "Whole picture" }] },
    ],
  },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-image");
    el.innerHTML = `<img alt="" style="object-fit:${ctx.options.fit === "contain" ? "contain" : "cover"}"><div class="muted img-msg"></div>`;
    const img = el.querySelector("img");
    const msg = el.querySelector(".img-msg");
    const load = () =>
      ctx.request("image.fetch", { pageId: ctx.pageId, widgetId: ctx.widgetId }).then(
        (r) => {
          if (r?.ok) {
            img.src = r.src;
            msg.textContent = "";
          } else msg.textContent = r?.error ?? "No image.";
        },
        (err) => (msg.textContent = err.message),
      );
    load();
    if (ctx.options.refresh > 0) ctx.every(Math.max(5, ctx.options.refresh) * 1000, load);
  },
};

// ---------------------------------------------------------------- calendar ----

const dayLabel = (t) => {
  const d = new Date(t);
  const today = new Date();
  const tom = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tom.toDateString()) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
};

/** Events grouped by local day, at most `max` events. Pure. */
export function groupByDay(events, max = 16, now = Date.now()) {
  const out = [];
  for (const e of events.filter((x) => x.end > now || x.allDay).slice(0, max)) {
    const key = new Date(Math.max(e.start, e.allDay ? e.start : now)).toDateString();
    let g = out.find((x) => x.key === key);
    if (!g) out.push((g = { key, label: dayLabel(Math.max(e.start, e.allDay ? e.start : now)), events: [] }));
    g.events.push(e);
  }
  return out;
}

export const agendaWidget = {
  type: "agenda",
  meta: { name: "Agenda", category: "time", size: { w: 4, h: 4 }, min: { w: 3, h: 2 }, options: [{ key: "max", type: "number", label: "Events", default: 16, min: 1, max: 40 }] },
  needs: () => ["calendar"],
  mount(el, ctx) {
    el.classList.add("w-list", "w-agenda");
    ctx.subscribe("calendar", (c) => {
      if (!c?.events) return needsSetup(el, "Loading calendar…");
      if (!c.events.length) return needsSetup(el, c.errors?.length ? c.errors[0] : `Nothing in the next ${c.days} days.`);
      el.innerHTML = `<div class="list">${groupByDay(c.events, ctx.options.max)
        .map(
          (g) =>
            `<div class="ag-day">${esc(g.label)}</div>${g.events
              .map((e) => `<div class="ag-row"><i style="background:${esc(e.color ?? "#38bdf8")}"></i><span class="ag-time">${e.allDay ? "All day" : hm(e.start)}</span><span class="ag-title">${esc(e.title)}</span></div>`)
              .join("")}`,
        )
        .join("")}</div>${staleNote(c)}`;
    });
  },
};

export const nextup = {
  type: "nextup",
  meta: { name: "Next up", category: "time", size: { w: 4, h: 2 }, min: { w: 2, h: 1 }, options: [] },
  needs: () => ["calendar"],
  mount(el, ctx) {
    el.classList.add("w-nextup");
    let last = null;
    const render = () => {
      const c = last;
      const now = Date.now();
      const next = (c?.events ?? []).find((e) => !e.allDay && e.end > now);
      if (!next) return needsSetup(el, c ? "Nothing else today." : "Loading calendar…");
      const mins = Math.round((next.start - now) / 60_000);
      const when = next.start <= now ? `Now · until ${hm(next.end)}` : mins < 60 ? `In ${mins} min` : `${dayLabel(next.start)} · ${hm(next.start)}`;
      el.innerHTML = `<div class="nu-when" style="color:${esc(next.color ?? "#38bdf8")}">${esc(when)}</div><div class="nu-title">${esc(next.title)}</div><div class="muted nu-loc">${esc(next.location ?? "")}</div>`;
    };
    ctx.subscribe("calendar", (c) => ((last = c), render()));
    ctx.every(30_000, render);
  },
};
