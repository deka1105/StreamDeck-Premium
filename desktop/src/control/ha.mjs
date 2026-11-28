// Home Assistant over its REST API: read the entities a widget lists, and
// toggle / run them. The long-lived access token stays in the secret store
// and is only ever sent to the Home Assistant address set in the editor.

// What a tap does, per domain. Anything else is read-only on the panel.
const TAP = {
  light: "toggle",
  switch: "toggle",
  fan: "toggle",
  input_boolean: "toggle",
  automation: "toggle",
  cover: "toggle",
  media_player: "media_play_pause",
  lock: null, // lock/unlock chosen from the current state below
  script: "turn_on",
  scene: "turn_on",
  button: "press",
  input_button: "press",
};

/** The service a tap on this entity calls, or null if it's read-only. Pure. */
export function tapService(entityId, state) {
  const domain = String(entityId).split(".")[0];
  if (domain === "lock") return { domain, service: state === "locked" ? "unlock" : "lock" };
  const service = TAP[domain];
  return service ? { domain, service } : null;
}

/** Shape one /api/states entry for the panel. Pure. */
export function shapeEntity(s) {
  const a = s?.attributes ?? {};
  const domain = String(s?.entity_id ?? "").split(".")[0];
  return {
    id: s.entity_id,
    name: a.friendly_name || s.entity_id,
    state: s.state,
    unit: a.unit_of_measurement ?? "",
    domain,
    on: ["on", "open", "playing", "unlocked", "home"].includes(s.state),
    tappable: !!tapService(s.entity_id, s.state),
    icon: a.icon ?? "",
    brightness: Number.isFinite(a.brightness) ? Math.round((a.brightness / 255) * 100) : null,
  };
}

export function createHa({ getSettings, getSecret, getWidgets, fetchImpl = fetch, log = console.log } = {}) {
  const base = () => String(getSettings()?.control?.ha?.url ?? "").replace(/\/+$/, "");
  const wanted = () => [...new Set(getWidgets("homeassistant").flatMap((o) => (Array.isArray(o.entities) ? o.entities : [])).map(String))].slice(0, 64);

  async function call(path, init = {}) {
    const url = base();
    const token = getSecret("ha:token");
    if (!url) throw new Error("Add your Home Assistant address in the editor (Settings › Control Deck).");
    if (!token) throw new Error("Add a Home Assistant long-lived access token in the editor.");
    const r = await fetchImpl(`${url}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(8000) });
    if (r.status === 401) throw new Error("Home Assistant rejected the token.");
    if (!r.ok) throw new Error(`Home Assistant answered ${r.status}.`);
    return r.json();
  }

  return {
    periodMs: 5000,
    async sample() {
      const ids = wanted();
      if (!ids.length) return { entities: [], at: Date.now() };
      try {
        const all = await call("/api/states");
        const byId = new Map(all.map((s) => [s.entity_id, s]));
        return { entities: ids.map((id) => (byId.has(id) ? shapeEntity(byId.get(id)) : { id, name: id, state: "missing", missing: true })), at: Date.now() };
      } catch (err) {
        return { error: err.message, entities: [], at: Date.now() };
      }
    },
    /** Tap an entity: only ids some homeassistant widget lists. */
    async tap(entityId) {
      if (!wanted().includes(entityId)) throw new Error("That entity isn't on any widget.");
      const s = await call(`/api/states/${encodeURIComponent(entityId)}`);
      const svc = tapService(entityId, s.state);
      if (!svc) throw new Error("This entity can only be shown, not changed.");
      await call(`/api/services/${svc.domain}/${svc.service}`, { method: "POST", body: JSON.stringify({ entity_id: entityId }) });
      log(`🏠 Home Assistant ${svc.domain}.${svc.service} ${entityId}`);
      return { ok: true };
    },
    /** Editor: check the connection and list entity ids to pick from. */
    async test() {
      const all = await call("/api/states");
      return { ok: true, count: all.length, entities: all.map((s) => ({ id: s.entity_id, name: s.attributes?.friendly_name ?? "" })).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 2000) };
    },
  };
}
