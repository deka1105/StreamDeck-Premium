// Stage 6 providers: weather (+ air quality), markets (rates, crypto), Hacker
// News, news feeds and calendars. All network access happens here, on the
// computer (PLAN D1). Every source is cached; a failed refresh serves the last
// good value with `stale: true` and backs off (1 min doubling to 30 min).
// What to fetch comes from the panel settings and the widgets in the layout.

import { readFileSync } from "node:fs";
import { agenda } from "../parsers/ics.mjs";
import { createCaldav } from "../parsers/caldav.mjs";
import { parseFeed } from "../parsers/feed.mjs";

const MAX_BYTES = 2_000_000;

export async function fetchText(url, { fetchImpl = globalThis.fetch, timeoutMs = 15_000, headers = {} } = {}) {
  const r = await fetchImpl(url, { headers: { "user-agent": "DeskAssist/1.2 (desk panel)", ...headers }, signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = await r.text();
  if (text.length > MAX_BYTES) throw new Error("response too large");
  return text;
}
export const fetchJson = async (url, opts) => JSON.parse(await fetchText(url, opts));

/** A cached value with a refresh interval and error back-off. */
export function cached({ ttlMs, load, now = Date.now }) {
  let value = null;
  let at = 0;
  let failCount = 0;
  let retryAt = 0;
  let error = null;
  let inflight = null;
  return {
    async get(key = "") {
      const t = now();
      if (inflight) return inflight;
      const fresh = value !== null && t - at < ttlMs && this.key === key;
      if (fresh || t < retryAt) return { value, stale: !!error, error, at };
      this.key = key;
      inflight = (async () => {
        try {
          value = await load();
          at = now();
          error = null;
          failCount = 0;
        } catch (err) {
          error = err.message;
          failCount++;
          retryAt = now() + Math.min(30 * 60_000, 60_000 * 2 ** (failCount - 1));
        } finally {
          inflight = null;
        }
        return { value, stale: !!error, error, at };
      })();
      return inflight;
    },
  };
}

// ---------------------------------------------------------------- weather ----

// Tests point both Open-Meteo hosts at a local fixture server.
const METEO = process.env.DECK_OPEN_METEO_BASE?.replace(/\/$/, "") ?? null;

export function weatherUrls({ lat, lon }, units = {}) {
  const f = units.temp === "F" ? "&temperature_unit=fahrenheit" : "";
  const w = units.wind === "mph" ? "&wind_speed_unit=mph" : "";
  return {
    forecast:
      `${METEO ?? "https://api.open-meteo.com"}/v1/forecast?latitude=${lat}&longitude=${lon}` +
      "&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m" +
      "&hourly=temperature_2m,weather_code,precipitation_probability" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,daylight_duration" +
      `&timezone=auto&forecast_days=7&forecast_hours=24${f}${w}`,
    air: `${METEO ?? "https://air-quality-api.open-meteo.com"}/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi,us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide&timezone=auto`,
  };
}

/** Normalize an Open-Meteo forecast (+ optional air quality). Pure. */
export function normalizeWeather(fc, aq, place, units) {
  const c = fc.current ?? {};
  const h = fc.hourly ?? {};
  const d = fc.daily ?? {};
  const off = (fc.utc_offset_seconds ?? 0) * 1000;
  const local = (s) => (s ? Date.parse(`${s}Z`) - off : null); // Open-Meteo times are local to the place
  return {
    place,
    units: { temp: units.temp === "F" ? "°F" : "°C", wind: units.wind === "mph" ? "mph" : "km/h" },
    current: { temp: c.temperature_2m, feels: c.apparent_temperature, humidity: c.relative_humidity_2m, code: c.weather_code, isDay: c.is_day === 1, wind: c.wind_speed_10m },
    hourly: (h.time ?? []).map((t, i) => ({ t: local(t), temp: h.temperature_2m?.[i], code: h.weather_code?.[i], pop: h.precipitation_probability?.[i] })),
    daily: (d.time ?? []).map((t, i) => ({
      date: t,
      code: d.weather_code?.[i],
      max: d.temperature_2m_max?.[i],
      min: d.temperature_2m_min?.[i],
      sunrise: local(d.sunrise?.[i]),
      sunset: local(d.sunset?.[i]),
      uv: d.uv_index_max?.[i],
      daylight: d.daylight_duration?.[i],
    })),
    air: aq?.current ? { eaqi: aq.current.european_aqi, usaqi: aq.current.us_aqi, pm25: aq.current.pm2_5, pm10: aq.current.pm10, o3: aq.current.ozone, no2: aq.current.nitrogen_dioxide } : null,
  };
}

// --------------------------------------------------------------- providers ----

/**
 * getSettings() → panel settings; getWidgets(type) → widget options of that
 * type across the whole config; secrets → the secret store.
 */
export function createWebProviders({ getSettings, getWidgets = () => [], secrets, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const opts = { fetchImpl };

  // weather ----------------------------------------------------------------
  let wKey = "";
  const fc = cached({ ttlMs: 15 * 60_000, now, load: async () => fetchJson(weatherUrls(getSettings().location, getSettings().units).forecast, opts) });
  const aq = cached({ ttlMs: 30 * 60_000, now, load: async () => fetchJson(weatherUrls(getSettings().location, getSettings().units).air, opts) });
  const weather = {
    periodMs: 60_000,
    async sample() {
      const s = getSettings();
      if (!s.location) return { missing: "location" };
      const key = `${s.location.lat},${s.location.lon},${s.units?.temp},${s.units?.wind}`;
      if (key !== wKey) wKey = key;
      const [f, a] = await Promise.all([fc.get(key), aq.get(key)]);
      if (!f.value) return { error: f.error ?? "No weather yet", stale: true };
      return { ...normalizeWeather(f.value, a.value, s.location.name, s.units ?? {}), stale: f.stale, fetchedAt: f.at, at: now() };
    },
  };

  // markets ----------------------------------------------------------------
  const rateSets = () => {
    const sets = new Map();
    for (const o of getWidgets("rates")) {
      const base = String(o.base ?? "USD").toUpperCase().slice(0, 3);
      const syms = sets.get(base) ?? new Set();
      for (const x of o.symbols ?? []) if (/^[A-Z]{3}$/i.test(x)) syms.add(x.toUpperCase());
      sets.set(base, syms);
    }
    return sets;
  };
  const ratesCache = new Map();
  const coinsKey = () => {
    const coins = new Set();
    let vs = "usd";
    for (const o of getWidgets("crypto")) {
      for (const c of o.coins ?? []) if (/^[a-z0-9-]{1,40}$/.test(c)) coins.add(c);
      vs = /^[a-z]{3}$/.test(o.vs ?? "") ? o.vs : vs;
    }
    return { coins: [...coins].sort().slice(0, 25), vs };
  };
  const crypto = cached({
    ttlMs: 2 * 60_000,
    now,
    load: async () => {
      const { coins, vs } = coinsKey();
      if (!coins.length) return {};
      return fetchJson(`https://api.coingecko.com/api/v3/simple/price?ids=${coins.join(",")}&vs_currencies=${vs}&include_24hr_change=true`, opts);
    },
  });
  const markets = {
    periodMs: 60_000,
    async sample() {
      const rates = {};
      let stale = false;
      for (const [base, syms] of rateSets()) {
        if (!syms.size) continue;
        const key = `${base}:${[...syms].sort().join(",")}`;
        if (!ratesCache.has(key)) ratesCache.set(key, cached({ ttlMs: 60 * 60_000, now, load: () => fetchJson(`https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${[...syms].join(",")}`, opts) }));
        const r = await ratesCache.get(key).get(key);
        if (r.value) rates[base] = { date: r.value.date, rates: r.value.rates };
        stale ||= r.stale;
      }
      const ck = coinsKey();
      const c = await crypto.get(`${ck.coins.join(",")}:${ck.vs}`);
      stale ||= c.stale;
      return { rates, crypto: { vs: ck.vs, prices: c.value ?? {} }, stale, at: now() };
    },
  };

  // hacker news --------------------------------------------------------------
  const hnCache = cached({
    ttlMs: 5 * 60_000,
    now,
    load: async () => {
      const ids = (await fetchJson("https://hacker-news.firebaseio.com/v0/topstories.json", opts)).slice(0, 15);
      const items = await Promise.all(ids.map((id) => fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, opts).catch(() => null)));
      return items.filter(Boolean).map((i) => ({ id: i.id, title: i.title, score: i.score, comments: i.descendants ?? 0, url: i.url ?? `https://news.ycombinator.com/item?id=${i.id}`, by: i.by, at: i.time * 1000 }));
    },
  });
  const hn = {
    periodMs: 60_000,
    async sample() {
      const r = await hnCache.get();
      return { stories: r.value ?? [], stale: r.stale, at: now() };
    },
  };

  // news feeds -----------------------------------------------------------------
  const feedCaches = new Map();
  let knownLinks = new Set();
  const feeds = {
    periodMs: 60_000,
    async sample() {
      const list = (getSettings().feeds ?? []).slice(0, 60);
      const items = [];
      let stale = false;
      await Promise.all(
        list.map(async (f) => {
          if (!feedCaches.has(f.url)) feedCaches.set(f.url, cached({ ttlMs: 10 * 60_000, now, load: async () => parseFeed(await fetchText(f.url, opts)) }));
          const r = await feedCaches.get(f.url).get(f.url);
          stale ||= r.stale;
          for (const it of (r.value?.items ?? []).slice(0, 30)) if (it.title && it.link) items.push({ ...it, feed: f.name || r.value.title, category: f.category ?? "" });
        }),
      );
      items.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
      const top = items.slice(0, 150);
      knownLinks = new Set(top.map((i) => i.link));
      return { items: top, categories: [...new Set(list.map((f) => f.category).filter(Boolean))].sort(), stale, at: now() };
    },
    /** Only links the panel was actually shown can be opened on the computer. */
    isKnownLink: (url) => knownLinks.has(url),
  };

  // calendars ---------------------------------------------------------------------
  const calCaches = new Map();
  let calendarsSeen = [];
  const calendar = {
    periodMs: 60_000,
    async sample() {
      const s = getSettings();
      const days = s.calendarDays ?? 7;
      const t = now();
      const from = new Date(new Date(t).toDateString()).getTime(); // start of today
      const to = from + days * 86400_000;
      const events = [];
      let stale = false;
      const errors = [];
      for (const c of (s.calendars ?? []).slice(0, 20)) {
        const key = `${c.id}:${days}`;
        if (!calCaches.has(key))
          calCaches.set(
            key,
            cached({
              ttlMs: 10 * 60_000,
              now,
              load: async () => {
                if (c.kind === "caldav") {
                  const password = secrets?.get(`calendar:${c.id}`);
                  if (!password) throw new Error("No password saved for this calendar.");
                  const dav = createCaldav({ url: c.url, user: c.user, password, fetchImpl });
                  const cals = await dav.calendars();
                  const pick = c.only?.length ? cals.filter((x) => c.only.includes(x.name)) : cals;
                  const out = [];
                  for (const cal of pick) for (const e of agenda(await dav.events(cal.url, from, to), from, to)) out.push({ ...e, cal: cal.name, color: cal.color ?? c.color });
                  calendarsSeen = [...new Set([...calendarsSeen, ...cals.map((x) => x.name)])];
                  return out;
                }
                const text = /^https?:\/\//.test(c.url) ? await fetchText(c.url.replace(/^webcal:/, "https:"), opts) : readFileSync(c.url, "utf8");
                return agenda(text, from, to).map((e) => ({ ...e, cal: c.name, color: c.color }));
              },
            }),
          );
        const r = await calCaches.get(key).get(key);
        if (r.error) errors.push(`${c.name}: ${r.error}`);
        stale ||= r.stale;
        for (const e of r.value ?? []) events.push(e);
      }
      events.sort((a, b) => a.start - b.start);
      return { events: events.filter((e) => e.end > t || e.allDay).slice(0, 40), days, errors, stale, at: t };
    },
  };

  return { weather, markets, hn, feeds, calendar };
}
