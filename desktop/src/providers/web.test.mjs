import { test } from "node:test";
import assert from "node:assert/strict";
import { createWebProviders, cached, normalizeWeather, weatherUrls } from "./web.mjs";

function fakeNet(routes) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    for (const [pattern, body] of routes) {
      if (url.includes(pattern)) {
        if (body instanceof Error) throw body;
        const text = typeof body === "string" ? body : JSON.stringify(body);
        return { ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text) };
      }
    }
    return { ok: false, status: 404, text: async () => "" };
  };
  return { impl, calls };
}

const FORECAST = {
  utc_offset_seconds: -18000,
  current: { temperature_2m: 8.6, apparent_temperature: 3.8, relative_humidity_2m: 70, is_day: 1, weather_code: 2, wind_speed_10m: 21.9 },
  hourly: { time: ["2026-11-27T15:00"], temperature_2m: [9], weather_code: [3], precipitation_probability: [10] },
  daily: { time: ["2026-11-27"], weather_code: [2], temperature_2m_max: [11], temperature_2m_min: [2], sunrise: ["2026-11-27T07:10"], sunset: ["2026-11-27T17:12"], uv_index_max: [2.5], daylight_duration: [36000] },
};

test("weather: urls carry units; normalized times are absolute", () => {
  const u = weatherUrls({ lat: 35.2, lon: -80.8 }, { temp: "F", wind: "mph" });
  assert.match(u.forecast, /temperature_unit=fahrenheit/);
  assert.match(u.forecast, /wind_speed_unit=mph/);
  const w = normalizeWeather(FORECAST, { current: { european_aqi: 21, us_aqi: 30, pm2_5: 4, pm10: 6, ozone: 50, nitrogen_dioxide: 9 } }, "Charlotte", {});
  assert.equal(w.current.code, 2);
  assert.equal(w.hourly[0].t, Date.UTC(2026, 10, 27, 20)); // 15:00 at UTC−5
  assert.equal(w.daily[0].sunset, Date.UTC(2026, 10, 27, 22, 12));
  assert.equal(w.air.usaqi, 30);
});

test("weather: no location → asks for one; fetch failure → stale last value", async () => {
  let fail = false;
  const net = fakeNet([
    ["api.open-meteo.com", FORECAST],
    ["air-quality", { current: { us_aqi: 10 } }],
  ]);
  const impl = async (url) => {
    if (fail) throw new Error("offline");
    return net.impl(url);
  };
  let t = 1_000_000;
  const settings = { location: null, units: {} };
  const p = createWebProviders({ getSettings: () => settings, fetchImpl: impl, now: () => t });
  assert.deepEqual(await p.weather.sample(), { missing: "location" });
  settings.location = { name: "Charlotte", lat: 35.2, lon: -80.8 };
  const ok = await p.weather.sample();
  assert.equal(ok.current.temp, 8.6);
  assert.equal(ok.stale, false);
  fail = true;
  t += 20 * 60_000; // past the refresh time
  const stale = await p.weather.sample();
  assert.equal(stale.current.temp, 8.6); // last good value…
  assert.equal(stale.stale, true); // …marked stale
});

test("markets: fetches only what widgets ask for", async () => {
  const net = fakeNet([
    ["frankfurter", { base: "USD", date: "2026-11-27", rates: { EUR: 0.91, GBP: 0.76 } }],
    ["coingecko", { bitcoin: { usd: 59836, usd_24h_change: -1.3 } }],
  ]);
  const widgets = { rates: [{ base: "usd", symbols: ["EUR", "gbp", "bad!"] }], crypto: [{ coins: ["bitcoin", "DROP TABLE"], vs: "usd" }] };
  const p = createWebProviders({ getSettings: () => ({}), getWidgets: (type) => widgets[type] ?? [], fetchImpl: net.impl });
  const m = await p.markets.sample();
  assert.deepEqual(m.rates.USD.rates, { EUR: 0.91, GBP: 0.76 });
  assert.equal(m.crypto.prices.bitcoin.usd, 59836);
  assert.ok(net.calls.some((u) => u.includes("symbols=EUR,GBP") || u.includes("symbols=GBP,EUR")));
  assert.ok(net.calls.some((u) => u.includes("ids=bitcoin&")));
});

test("feeds: merged newest first; only shown links can be opened", async () => {
  const net = fakeNet([
    ["a.example", `<rss><channel><title>A</title><item><title>Old</title><link>https://a.example/1</link><pubDate>Thu, 26 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>`],
    ["b.example", `<feed xmlns="http://www.w3.org/2005/Atom"><title>B</title><entry><title>New</title><link href="https://b.example/2"/><updated>2026-11-27T10:00:00Z</updated></entry></feed>`],
  ]);
  const settings = { feeds: [{ name: "Alpha", url: "https://a.example/rss", category: "Tech" }, { name: "", url: "https://b.example/atom", category: "" }] };
  const p = createWebProviders({ getSettings: () => settings, fetchImpl: net.impl });
  const f = await p.feeds.sample();
  assert.deepEqual(f.items.map((i) => [i.title, i.feed]), [["New", "B"], ["Old", "Alpha"]]);
  assert.deepEqual(f.categories, ["Tech"]);
  assert.equal(p.feeds.isKnownLink("https://b.example/2"), true);
  assert.equal(p.feeds.isKnownLink("https://evil.example/"), false);
});

test("calendar: ICS link events in the window, with the calendar's name and colour", async () => {
  const now = new Date(2026, 10, 27, 9).getTime();
  const ics = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:1\nSUMMARY:Lunch\nDTSTART:" + new Date(2026, 10, 27, 12).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "") + "\nEND:VEVENT\nEND:VCALENDAR";
  const net = fakeNet([["cal.example", ics]]);
  const settings = { calendars: [{ id: "w", name: "Work", kind: "ics", url: "https://cal.example/x.ics", color: "#ff0000" }], calendarDays: 7 };
  const p = createWebProviders({ getSettings: () => settings, fetchImpl: net.impl, now: () => now });
  const c = await p.calendar.sample();
  assert.deepEqual(c.events.map((e) => [e.title, e.cal, e.color]), [["Lunch", "Work", "#ff0000"]]);
  // An iCloud calendar without a saved password reports why.
  settings.calendars.push({ id: "i", name: "iCloud", kind: "caldav", url: "https://caldav.icloud.com", user: "me" });
  const c2 = await createWebProviders({ getSettings: () => settings, fetchImpl: net.impl, now: () => now, secrets: { get: () => null } }).calendar.sample();
  assert.match(c2.errors.join(), /No password saved/);
});

test("cached: refreshes after the ttl and backs off after errors", async () => {
  let t = 0;
  let n = 0;
  let fail = false;
  const c = cached({ ttlMs: 1000, now: () => t, load: async () => { n++; if (fail) throw new Error("x"); return n; } });
  assert.equal((await c.get()).value, 1);
  assert.equal((await c.get()).value, 1);
  t = 1500;
  assert.equal((await c.get()).value, 2);
  fail = true;
  t = 3000;
  const s = await c.get();
  assert.equal(s.value, 2);
  assert.equal(s.stale, true);
  t = 3500; // within the 1-minute back-off: no new attempt
  await c.get();
  assert.equal(n, 3);
});
