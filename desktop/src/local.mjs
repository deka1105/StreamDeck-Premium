// Loopback-only HTTP server: the browser panel, the layout editor (Stage 3),
// and the panel API for browser clients. Never reachable from the LAN.
//
// Defences (a browser on this machine can be tricked into calling us):
//   • binds 127.0.0.1 only;
//   • rejects any Host header that isn't 127.0.0.1:<port> / localhost:<port>
//     (stops DNS-rebinding pages from reading our responses);
//   • rejects cross-site Origins (stops CSRF from other sites);
//   • API calls must be application/json, which a plain HTML form can't send.

import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Where the built panel lives: packaged copy first, then the repo build. */
export function findPanelDist() {
  const candidates = [join(here, "..", "panel-dist"), join(here, "..", "..", "panel", "dist")];
  return candidates.find((d) => existsSync(join(d, "panel.html"))) ?? candidates[candidates.length - 1];
}

const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".css": "text/css" };

export function createLocalServer({ port = 8789, panelApi, panelDist = findPanelDist(), routes = {} } = {}) {
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);

  function send(res, status, body, type = "application/json") {
    const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    res.writeHead(status, {
      "content-type": type,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    });
    res.end(data);
  }

  function readJson(req, limit = 1_000_000) {
    return new Promise((resolve) => {
      let raw = "";
      req.on("data", (c) => {
        raw += c;
        if (raw.length > limit) req.destroy();
      });
      req.on("end", () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          resolve(null);
        }
      });
    });
  }

  function serveFile(res, file) {
    if (!existsSync(file)) return send(res, 404, { error: "not built — run `npm run build` in panel/" });
    const ext = file.slice(file.lastIndexOf("."));
    send(res, 200, readFileSync(file), TYPES[ext] ?? "application/octet-stream");
  }

  const server = http.createServer(async (req, res) => {
    if (!allowedHosts.has(String(req.headers.host ?? "").toLowerCase())) return send(res, 403, { error: "forbidden host" });
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) return send(res, 403, { error: "forbidden origin" });

    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const path = url.pathname;

    if (req.method === "GET" && (path === "/" || path === "/panel")) {
      res.writeHead(302, { location: "/panel/" });
      return res.end();
    }
    if (req.method === "GET" && path === "/panel/") return serveFile(res, join(panelDist, "panel.html"));
    if (req.method === "GET" && path === "/panel/catalog.json") return serveFile(res, join(panelDist, "catalog.json"));

    if (req.method === "POST" && path === "/api/panel/rpc") {
      if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) return send(res, 415, { ok: false, error: "json only" });
      const body = await readJson(req);
      if (!body || typeof body.method !== "string") return send(res, 400, { ok: false, error: "bad request" });
      // Browser clients are namespaced so they can never collide with a paired device id.
      const name = String(body.client ?? "browser").replace(/[^a-z0-9]/gi, "").slice(0, 32) || "browser";
      try {
        const result = await panelApi.call(body.method, body.params, { client: `browser:${name}`, local: true });
        return send(res, 200, { ok: true, result });
      } catch (err) {
        return send(res, 200, { ok: false, error: err.message });
      }
    }

    // Extra routes registered by later stages (editor, webhooks…): "METHOD /path",
    // or "METHOD /prefix/*" for everything under a prefix.
    let extra = routes[`${req.method} ${path}`];
    if (!extra) {
      const key = Object.keys(routes).find((k) => k.endsWith("/*") && k.startsWith(`${req.method} `) && path.startsWith(k.slice(req.method.length + 1, -1)));
      extra = key ? routes[key] : null;
    }
    if (extra) return extra(req, res, { send, readJson, url });

    return send(res, 404, { error: "not found" });
  });

  return {
    server,
    port,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          server.off("error", reject);
          resolve();
        });
      }),
    stop: () => new Promise((r) => server.close(r)),
  };
}
