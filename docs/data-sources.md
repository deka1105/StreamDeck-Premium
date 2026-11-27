# Data sources (Stage 6)

All requests are made by the **desktop host**, never by the panel (PLAN D1).
The host caches every answer, serves the last good value with `stale: true`
when a refresh fails, and backs off after errors. Checked live on 27 Nov 2026.

| Source | Endpoint | Key / auth | Limits & terms | Used for |
|---|---|---|---|---|
| Open-Meteo forecast | `https://api.open-meteo.com/v1/forecast?latitude&longitude&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,daylight_duration&timezone=auto&forecast_days=7&forecast_hours=24` (+ `temperature_unit=fahrenheit`, `wind_speed_unit=mph`) | none | free for non-commercial use, < 10 000 calls/day; data CC BY 4.0 — credit "Weather data by Open-Meteo.com" | weather, forecast, sun |
| Open-Meteo air quality | `https://air-quality-api.open-meteo.com/v1/air-quality?latitude&longitude&current=european_aqi,us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide&timezone=auto` | none | as above | air quality |
| Open-Meteo geocoding | `https://geocoding-api.open-meteo.com/v1/search?name=…&count=5&language=en&format=json` → `results[{name, latitude, longitude, country_code, admin1, timezone}]` | none | as above | editor location search |
| Frankfurter (ECB rates) | `https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP` → `{base, date, rates{}}` | none | ECB reference rates, updated once per working day | exchange rates |
| CoinGecko public API | `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true` | none (demo key optional) | public tier is rate-limited (~a few calls/min); poll at most every 2 min; attribution requested | crypto |
| Hacker News | `https://hacker-news.firebaseio.com/v0/topstories.json`, `/v0/item/<id>.json` | none | no stated limit; fetch ≤ 15 items every 5 min | Hacker News |
| RSS / Atom feeds | the user's own URLs; OPML import | none | fetch each feed ≤ every 10 min, 2 MB cap | news feeds |
| ICS calendars | the user's own secret ICS links (Google "secret address", Outlook "publish", any `.ics`, local file) | the link is the secret | refresh every 10 min | agenda, next up |
| iCloud CalDAV | `https://caldav.icloud.com` — PROPFIND `current-user-principal` → `calendar-home-set` → calendars → REPORT `calendar-query` with a time range (RFC 4791) | Apple ID + app-specific password, kept in the host's secret store | refresh every 10 min | agenda, next up |

Moon phase is computed locally (synodic month from a known new moon); sunrise,
sunset, daylight and UV come from the forecast's `daily` block.

Weather codes are WMO 4677 codes as Open-Meteo documents them; the panel maps
them to its own icons and words.
