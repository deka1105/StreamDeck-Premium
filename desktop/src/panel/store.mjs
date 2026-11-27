// The panel's source of truth on the host (PLAN D2): <dataDir>/panel.json,
// readable only by this user. Holds the layouts (default + per device) and a
// revision number that bumps on every save so clients know to reload.

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findPanelDist } from "../local.mjs";
import { sanitizeConfig } from "./schema.mjs";
import { STARTER_LAYOUT } from "./starter.mjs";

export function loadCatalog(dist = findPanelDist()) {
  try {
    return JSON.parse(readFileSync(join(dist, "catalog.json"), "utf8"));
  } catch {
    return { version: 1, categories: [], widgets: [] };
  }
}

export function createPanelStore({ dir, catalog = loadCatalog(), onChange = () => {} }) {
  const file = join(dir, "panel.json");
  let rev = 1;
  let config;

  function load() {
    if (existsSync(file)) {
      try {
        const raw = JSON.parse(readFileSync(file, "utf8"));
        rev = Number.isFinite(raw.rev) ? raw.rev : 1;
        return sanitizeConfig(raw, catalog);
      } catch (err) {
        console.warn(`[panel] ${file} unreadable (${err.message}); starting from the starter layout`);
      }
    }
    return sanitizeConfig({ default: STARTER_LAYOUT }, catalog);
  }

  function persist() {
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ rev, ...config }, null, 2), { mode: 0o600 });
    renameSync(tmp, file); // atomic replace: a crash never leaves half a file
  }

  config = load();

  return {
    get rev() {
      return rev;
    },
    catalog: () => catalog,
    config: () => structuredClone(config),
    /** The layout a client sees: its own if it has one, else the default. */
    layoutFor(client) {
      const own = config.devices[client];
      const l = own && own.pages.length ? own : config.default;
      return { rev, pages: structuredClone(l.pages), home: l.home, look: structuredClone(l.look ?? {}), display: structuredClone(l.display ?? {}), settings: { ...config.settings }, own: !!(own && own.pages.length) };
    },
    /** Replace the whole config (editor Save / import). Returns the sanitized result. */
    save(raw) {
      config = sanitizeConfig(raw, catalog);
      rev += 1;
      persist();
      onChange(rev);
      return { rev, config: structuredClone(config) };
    },
  };
}
