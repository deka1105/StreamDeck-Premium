// Every data kind the host can sample, keyed by kind name (the panel's `needs`).

import "./env.mjs"; // fix PATH before any provider shells out
import { system } from "./system.mjs";
import { gpu } from "./gpu.mjs";
import { disks } from "./disks.mjs";
import { net } from "./net.mjs";
import { procs } from "./procs.mjs";
import { createNetq } from "./netq.mjs";

/** Providers for a host. `dir` persists netq usage; `getSettings` reads panel settings. */
export function createProviders({ dir, getSettings = () => ({}) } = {}) {
  const netq = createNetq({ dir, getSettings: () => getSettings().netq ?? {} });
  return { system, gpu, disks, net, procs, netq };
}

// Kept for callers that just need the stateless set (tests).
export const PROVIDERS = { system, gpu, disks, net, procs };
