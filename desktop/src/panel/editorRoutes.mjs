// Layout editor endpoints. Registered on the loopback server only (local.mjs),
// so nothing here is reachable from the LAN or from a paired phone.
//
//   GET  /editor/                → the editor page (built by panel/)
//   GET  /api/editor/state       → { rev, config, catalog, templates, clients }
//   POST /api/editor/config      { config, baseRev } → { rev, config } | 409 if someone saved first

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findPanelDist } from "../local.mjs";

function readTemplates(dist) {
  try {
    return JSON.parse(readFileSync(join(dist, "templates.json"), "utf8"));
  } catch {
    return { version: 1, templates: [] };
  }
}

export function createEditorRoutes({ store, listDevices = () => [], panelDist = findPanelDist(), secrets = null, providers = {}, fetchImpl = globalThis.fetch }) {
  const json = async (req, readJson) => {
    if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) return null;
    return readJson(req);
  };
  return {
    // City search for the weather location (Open-Meteo geocoding, via the host).
    "GET /api/editor/geocode": async (_req, res, { send, url }) => {
      const q = String(url.searchParams.get("q") ?? "").trim().slice(0, 80);
      if (q.length < 2) return send(res, 200, { ok: true, results: [] });
      try {
        const r = await fetchImpl(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`, { signal: AbortSignal.timeout(10_000) });
        const j = await r.json();
        const results = (j.results ?? []).map((x) => ({
          name: [x.name, x.admin1, x.country_code].filter(Boolean).join(", "),
          lat: x.latitude,
          lon: x.longitude,
          tz: x.timezone ?? "",
        }));
        send(res, 200, { ok: true, results });
      } catch (err) {
        send(res, 200, { ok: false, error: `Search failed: ${err.message}` });
      }
    },
    // Save a secret (calendar password…). Write-only: secrets are never read back.
    "POST /api/editor/secret": async (req, res, { send, readJson }) => {
      const body = await json(req, readJson);
      if (!body || typeof body.name !== "string" || !/^[a-z]+:[A-Za-z0-9_-]{1,40}$/.test(body.name)) return send(res, 400, { ok: false, error: "bad request" });
      if (!secrets) return send(res, 500, { ok: false, error: "no secret store" });
      secrets.set(body.name, typeof body.value === "string" ? body.value : "");
      send(res, 200, { ok: true, saved: secrets.has(body.name), protected: secrets.protected });
    },
    "GET /api/editor/secrets": (_req, res, { send }) => {
      const cfg = store.config();
      const names = (cfg.settings.calendars ?? []).map((c) => `calendar:${c.id}`);
      send(res, 200, { ok: true, have: Object.fromEntries(names.map((n) => [n, !!secrets?.has(n)])), protected: !!secrets?.protected });
    },
    // Try a saved calendar now and report what came back.
    "POST /api/editor/calendar/test": async (req, res, { send, readJson }) => {
      const body = await json(req, readJson);
      const cal = store.config().settings.calendars?.find((c) => c.id === body?.id);
      if (!cal) return send(res, 200, { ok: false, error: "Save the calendar first." });
      try {
        const s = await providers.calendar?.sample();
        const mine = (s?.events ?? []).filter((e) => e.cal === cal.name || cal.kind === "caldav");
        const err = (s?.errors ?? []).find((e) => e.startsWith(`${cal.name}:`));
        send(res, 200, err ? { ok: false, error: err } : { ok: true, events: mine.length });
      } catch (err) {
        send(res, 200, { ok: false, error: err.message });
      }
    },
    "GET /editor/": (_req, res, { send }) => {
      const file = join(panelDist, "editor.html");
      if (!existsSync(file)) return send(res, 404, { error: "editor not built — run `npm run build` in panel/" });
      send(res, 200, readFileSync(file), "text/html; charset=utf-8");
    },
    "GET /editor": (_req, res) => {
      res.writeHead(302, { location: "/editor/" });
      res.end();
    },
    "GET /api/editor/state": (_req, res, { send }) => {
      const devices = listDevices().map((d) => ({ id: d.deviceId, name: d.name, kind: "phone" }));
      send(res, 200, {
        ok: true,
        rev: store.rev,
        config: store.config(),
        catalog: store.catalog(),
        templates: readTemplates(panelDist),
        clients: devices,
      });
    },
    "POST /api/editor/config": async (req, res, { send, readJson }) => {
      if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) return send(res, 415, { ok: false, error: "json only" });
      const body = await readJson(req, 4_000_000);
      if (!body || typeof body.config !== "object") return send(res, 400, { ok: false, error: "bad request" });
      if (Number(body.baseRev) !== store.rev) {
        return send(res, 409, { ok: false, error: "The layout was changed elsewhere. Reload to get the latest, then redo your change.", rev: store.rev });
      }
      const saved = store.save(body.config);
      send(res, 200, { ok: true, ...saved });
    },
  };
}
