// The panel API: one method table served two ways —
//   over the phone's encrypted RPC   ({cmd: "panel", method, params})
//   over the loopback HTTP server    (POST /api/panel/rpc, browser panels)
// `ctx.client` identifies the caller: a paired device id, or a browser name.

const MAX_WAIT_MS = 25_000;

export class ApiError extends Error {}

export function createPanelApi({ bus, sampler, hostName, extra = {} }) {
  const methods = {
    "panel.hello": () => ({ host: hostName, api: 1, boot: bus.boot }),

    "panel.needs": ({ kinds } = {}, ctx) => {
      sampler.setNeeds(ctx.client, kinds);
      return { ok: true };
    },

    "panel.snapshot": ({ kinds } = {}) => ({ data: sampler.snapshot(Array.isArray(kinds) ? kinds : undefined) }),

    "events.wait": (params = {}, ctx) => {
      sampler.touch(ctx.client);
      const timeoutMs = Math.max(0, Math.min(MAX_WAIT_MS, Number(params.timeoutMs) || MAX_WAIT_MS));
      return bus.wait({ after: params.after, boot: params.boot ?? null, client: ctx.client, timeoutMs });
    },

    ...extra,
  };

  return {
    has: (method) => Object.hasOwn(methods, method),
    async call(method, params, ctx) {
      if (typeof method !== "string" || !Object.hasOwn(methods, method)) throw new ApiError(`unknown method: ${method}`);
      return methods[method](params && typeof params === "object" ? params : {}, ctx);
    },
    /** Add methods later (layout, actions, …) without touching callers. */
    extend(more) {
      Object.assign(methods, more);
    },
  };
}
