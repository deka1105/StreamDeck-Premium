// `printers` kind: up to 8 printers added in the editor, polled by this
// computer only while a printer widget is on some layout (the phone never
// talks to a printer). Brands that allow a single client keep one live link.

import { BRANDS, blank, snapmakerConnect } from "./brands.mjs";

export function cleanPrinters(list) {
  const ids = new Set();
  const host = /^[A-Za-z0-9.:\-_[\]]{1,255}$/;
  return (Array.isArray(list) ? list.slice(0, 8) : [])
    .filter((p) => p && BRANDS[p.brand] && host.test(p.host ?? ""))
    .map((p, i) => {
      let id = /^[A-Za-z0-9_-]{1,40}$/.test(p.id ?? "") ? p.id : `pr${i + 1}`;
      while (ids.has(id)) id += "x";
      ids.add(id);
      return {
        id,
        brand: p.brand,
        name: String(p.name ?? "").slice(0, 40) || BRANDS[p.brand].name,
        host: p.host,
        port: Number.isInteger(Number(p.port)) && Number(p.port) > 0 && Number(p.port) < 65536 ? Number(p.port) : null,
        user: String(p.user ?? "").slice(0, 60),
        serial: String(p.serial ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64),
        model: String(p.model ?? "").slice(0, 40),
      };
    });
}

export function createPrinters({ getSettings, getSecret, isWanted = () => true, brands = BRANDS, opts = {}, log = console.log } = {}) {
  const sessions = new Map(); // id -> { key, session }
  const failures = new Map(); // id -> { until, last }
  const list = () => getSettings()?.printers ?? [];
  const secretOf = (p) => getSecret(`printer:${p.id}`);

  function sessionFor(p) {
    const key = JSON.stringify([p.brand, p.host, p.port, p.serial, !!secretOf(p)]);
    const cur = sessions.get(p.id);
    if (cur && cur.key === key) return cur.session;
    cur?.session.close?.();
    const session = brands[p.brand].session(p, secretOf(p), opts);
    sessions.set(p.id, { key, session });
    return session;
  }

  async function pollOne(p) {
    const b = brands[p.brand];
    const f = failures.get(p.id);
    if (f && Date.now() < f.until) return { ...blank(), ...f.last };
    try {
      const s = b.session ? await sessionFor(p).poll() : await b.poll(p, secretOf(p), opts);
      failures.delete(p.id);
      return s;
    } catch (err) {
      // Back off: a sleeping printer shouldn't be hammered.
      const n = (f?.n ?? 0) + 1;
      const last = { online: false, state: "offline", error: err.message };
      failures.set(p.id, { n, until: Date.now() + Math.min(60_000, 5000 * n), last });
      return { ...blank(), ...last };
    }
  }

  return {
    periodMs: 2000,
    async sample() {
      const printers = list();
      // Close links to printers that are gone.
      for (const id of sessions.keys()) if (!printers.some((p) => p.id === id)) (sessions.get(id).session.close?.(), sessions.delete(id));
      if (!printers.length || !isWanted()) {
        if (!isWanted()) for (const [id, s] of sessions) (s.session.close?.(), sessions.delete(id));
        return { printers: printers.map((p) => ({ ...blank(), id: p.id, name: p.name, brand: p.brand })), at: Date.now() };
      }
      const out = await Promise.all(printers.map(async (p) => ({ ...(await pollOne(p)), id: p.id, name: p.name, brand: p.brand, brandName: brands[p.brand]?.name ?? p.brand, model: p.model || "" })));
      return { printers: out, at: Date.now() };
    },
    /** Editor: try one printer now (Snapmaker: also asks for a token). */
    async test(id, { setSecret } = {}) {
      const p = list().find((x) => x.id === id);
      if (!p) return { ok: false, error: "Save the printer first." };
      if (p.brand === "snapmaker" && !secretOf(p)) {
        const r = await snapmakerConnect(p, null, opts).catch((e) => ({ ok: false, error: e.message }));
        if (r.ok && r.token) setSecret?.(`printer:${p.id}`, r.token);
        if (!r.ok) return r;
      }
      failures.delete(p.id);
      const s = p.brand in brands && brands[p.brand].session ? await (async () => {
        const session = sessionFor(p);
        for (let i = 0; i < 12; i++) {
          const r = await session.poll();
          if (r.online) return r;
          await new Promise((res) => setTimeout(res, 500));
        }
        return session.poll();
      })() : await pollOne(p);
      return s.online ? { ok: true, state: s.state, temps: s.temps } : { ok: false, error: s.error ?? "No answer." };
    },
    stop() {
      for (const s of sessions.values()) s.session.close?.();
      sessions.clear();
    },
  };
}
