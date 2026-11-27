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

export function createEditorRoutes({ store, listDevices = () => [], panelDist = findPanelDist() }) {
  return {
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
