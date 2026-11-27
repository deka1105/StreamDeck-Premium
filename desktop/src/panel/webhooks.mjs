// Webhook endpoints (step 8.2), shared by the loopback server (no key needed:
// only this computer can reach it) and, when turned on, the LAN server under
// /hook/… with the separate webhook key. That key opens these endpoints only —
// never the phone API, the editor or pairing.
//
//   POST   /push/<key>[?ttl=s]   text, number or JSON   → set a pushed value
//   GET    /push                                       → all pushed values
//   DELETE /push/<key>                                 → remove one
//   POST   /notify               {title,text,level,vibrate,seconds,wake,page}
//   POST   /goto/<page|next|prev>[?countdown=0]
//   POST   /refresh[?reload=1]
//   POST   /run/<shortcut>[?value=n]

import crypto from "node:crypto";

export function createWebhooks({ pushes, publish, runner }) {
  /** Dispatch one request. `path` is the part after /api or /hook. */
  return async function handle(method, path, body, query) {
    let m;
    if ((m = /^\/push\/([A-Za-z0-9_.-]{1,64})$/.exec(path))) {
      if (method === "POST") {
        try {
          return { status: 200, json: { ok: true, value: pushes.set(m[1], body, query.get("ttl") ?? body?.ttl) } };
        } catch (err) {
          return { status: 400, json: { ok: false, error: err.message } };
        }
      }
      if (method === "DELETE") return { status: 200, json: { ok: true, deleted: pushes.delete(m[1]) } };
    }
    if (path === "/push" && method === "GET") return { status: 200, json: { ok: true, values: pushes.all() } };
    if (path === "/notify" && method === "POST") {
      try {
        return { status: 200, json: { ok: true, notification: pushes.notify(body) } };
      } catch (err) {
        return { status: 400, json: { ok: false, error: err.message } };
      }
    }
    if ((m = /^\/goto\/([A-Za-z0-9_-]{1,40})$/.exec(path)) && method === "POST") {
      const countdown = query.get("countdown");
      publish("goto", { page: m[1], countdown: countdown === null ? 3 : Math.max(0, Math.min(30, Number(countdown) || 0)) });
      return { status: 200, json: { ok: true } };
    }
    if (path === "/refresh" && method === "POST") {
      publish("refresh", { reload: query.get("reload") === "1" });
      return { status: 200, json: { ok: true } };
    }
    if ((m = /^\/run\/([A-Za-z0-9_-]{1,40})$/.exec(path)) && method === "POST") {
      const r = await runner.run(m[1], query.get("value") ?? undefined);
      return { status: r.ok ? 200 : r.status ?? 400, json: r };
    }
    return { status: 404, json: { ok: false, error: "not found" } };
  };
}

/** Constant-time check of a presented webhook key. */
export function keyMatches(presented, actual) {
  if (!actual || typeof presented !== "string") return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(actual);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const newWebhookKey = () => crypto.randomBytes(24).toString("base64url");

/** Read a request body as JSON if it is JSON, otherwise as text. */
export function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > limit) req.destroy();
    });
    req.on("end", () => {
      const type = String(req.headers["content-type"] ?? "");
      if (type.startsWith("application/json")) {
        try {
          return resolve(raw ? JSON.parse(raw) : {});
        } catch {
          return resolve(null);
        }
      }
      resolve(raw.trim());
    });
  });
}
