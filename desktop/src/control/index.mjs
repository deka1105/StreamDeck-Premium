// Control Deck (Stage 11): data kinds and panel methods for OBS, Home
// Assistant, containers, Wake-on-LAN, OSC, dev services, meeting controls and
// the trackpad. Every method acts only on things set up in the editor — the
// phone sends ids, never addresses, commands or entity names it made up.

import { createObs } from "./obs.mjs";
import { createHa } from "./ha.mjs";
import { createDocker } from "./docker.mjs";
import { createServices } from "./services.mjs";
import { createMeeting } from "./meeting.mjs";
import { createPointer } from "./pointer.mjs";
import { wake, sendOsc } from "./udp.mjs";

export function createControl({ getSettings, getWidgets, secrets, execute, publish, widgetAllows, dryRun = false, log = console.log, overrides = {} } = {}) {
  const ctl = () => getSettings()?.control ?? {};
  const getSecret = (n) => secrets?.get?.(n) ?? null;
  const obs = overrides.obs ?? createObs({ getSettings, getSecret, isWanted: () => getWidgets("obs").length > 0, log });
  const ha = overrides.ha ?? createHa({ getSettings, getSecret, getWidgets, log });
  const containers = overrides.containers ?? createDocker({ getSettings, isWanted: () => getWidgets("containers").length > 0, log });
  const services = overrides.services ?? createServices({ getSettings, log });
  const meeting = overrides.meeting ?? createMeeting({ execute, dryRun, log });
  const pointer = overrides.pointer ?? createPointer({ log });

  const refresh = async (kind, prov) => publish("data", { kind, value: await prov.sample() });
  // OBS events and service exits show up without waiting for the next sample.
  let obsTimer = null;
  obs.setOnChange?.(() => {
    clearTimeout(obsTimer);
    obsTimer = setTimeout(() => refresh("obs", obs).catch(() => {}), 150);
  });
  services.setOnChange?.(() => refresh("services", services).catch(() => {}));

  const wrap = (fn) => async (params = {}, ctx = {}) => {
    try {
      return await fn(params, ctx);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };

  const methods = {
    "obs.control": wrap(async ({ command, arg }) => {
      const value = await obs.control(String(command ?? ""), arg);
      publish("data", { kind: "obs", value });
      return { ok: true };
    }),
    "ha.tap": wrap(async ({ entity }) => {
      const r = await ha.tap(String(entity ?? ""));
      setTimeout(() => refresh("ha", ha).catch(() => {}), 400);
      return r;
    }),
    // Start / stop only from a containers widget whose "allow start / stop" is on.
    "containers.control": wrap(async ({ widgetId, id, action }, ctx) => {
      if (!widgetAllows(ctx.client, widgetId, "containers", "allowControl")) return { ok: false, error: "Starting and stopping is turned off for this widget. Turn it on in the layout editor." };
      const r = await containers.control(String(id ?? ""), String(action ?? ""));
      await refresh("containers", containers);
      return r;
    }),
    "wol.wake": wrap(async ({ id }) => {
      const m = (ctl().wol ?? []).find((x) => x.id === id);
      if (!m) return { ok: false, error: "No such computer." };
      if (dryRun) log(`  (dry-run) wake ${m.name} ${m.mac}`);
      else await wake(m);
      log(`⏰ wake ${m.name}`);
      return { ok: true };
    }),
    "osc.send": wrap(async ({ id }) => {
      const o = (ctl().osc ?? []).find((x) => x.id === id);
      if (!o) return { ok: false, error: "No such OSC message." };
      if (dryRun) log(`  (dry-run) OSC ${o.host}:${o.port} ${o.address} ${o.args}`);
      else await sendOsc(o);
      return { ok: true };
    }),
    "osc.list": () => ({ items: (ctl().osc ?? []).map(({ id, name }) => ({ id, name })) }),
    "wol.list": () => ({ items: (ctl().wol ?? []).map(({ id, name }) => ({ id, name })) }),
    "services.control": wrap(async ({ id, action }) => {
      const r = await services.control(String(id ?? ""), String(action ?? ""));
      await refresh("services", services);
      return r;
    }),
    "services.open": wrap(async ({ id }) => {
      const url = services.url(String(id ?? ""));
      if (!url) return { ok: false, error: "No address set for this service." };
      await execute({ type: "url", target: url });
      return { ok: true };
    }),
    "meeting.press": wrap(async ({ app, action }) => meeting.press(String(app ?? ""), String(action ?? ""))),
    "meeting.muteAll": wrap(async () => {
      const r = await meeting.muteAll();
      await refresh("meeting", meeting);
      return r;
    }),
    "pointer.send": wrap(async (req) => {
      if (!ctl().trackpad) return { ok: false, error: "The trackpad is off. Turn it on in the editor (Settings › Control Deck)." };
      return pointer.send(req);
    }),
  };

  return {
    providers: { obs, ha, containers, services, meeting },
    methods,
    testHa: () => ha.test(),
    stop() {
      clearTimeout(obsTimer);
      obs.close?.();
      services.stopAll();
      pointer.stop();
    },
  };
}
