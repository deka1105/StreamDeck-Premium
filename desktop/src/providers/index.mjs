// Every data kind the host can sample, keyed by kind name (the panel's `needs`).

import "./env.mjs"; // fix PATH before any provider shells out
import { system } from "./system.mjs";
import { gpu } from "./gpu.mjs";
import { disks } from "./disks.mjs";
import { net } from "./net.mjs";
import { procs } from "./procs.mjs";
import { createNetq } from "./netq.mjs";
import { createWebProviders } from "./web.mjs";

/**
 * Providers for a host. `dir` persists netq usage; `getSettings` reads panel
 * settings; `getWidgets(type)` lists that widget type's options in the layout;
 * `secrets` holds integration credentials.
 */
export function createProviders({ dir, getSettings = () => ({}), getWidgets = () => [], secrets } = {}) {
  const netq = createNetq({ dir, getSettings: () => getSettings().netq ?? {} });
  return { system, gpu, disks, net, procs, netq, ...createWebProviders({ getSettings, getWidgets, secrets }) };
}

// Kept for callers that just need the stateless set (tests).
export const PROVIDERS = { system, gpu, disks, net, procs };
