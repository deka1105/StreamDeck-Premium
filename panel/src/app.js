// Panel app: mounts widgets for a page and feeds them data from the bridge.

import { REGISTRY, withDefaults } from "./widgets/index.js";
import { resolveLayout } from "./grid.js";

/** Build the per-widget context. Everything registered here is torn down on unmount. */
function makeContext({ store, bridge, options, onCleanup, widgetId, pageId }) {
  const key = `${pageId}:${widgetId}`;
  return {
    options,
    widgetId,
    pageId,
    /**
     * Saved widget state (notes, timers, counters), kept on the computer so it
     * survives reloads and matches on every screen. `onChange` runs on load and
     * whenever any screen changes it. Returns { value, set(v) }.
     */
    persisted(initial, onChange) {
      return this.persistedAt(key, initial, onChange);
    },
    /** Like persisted, but for a shared key ("global:focus") several widgets use. */
    persistedAt(key, initial, onChange) {
      const box = { value: initial, loaded: false };
      const apply = (v) => {
        box.value = v ?? initial;
        box.loaded = true;
        onChange?.(box.value);
      };
      bridge.request("state.get", { key }).then((r) => apply(r?.value), () => apply(initial));
      onCleanup(store.on(`state:${key}`, apply));
      box.set = (v) => {
        apply(v);
        bridge.request("state.set", { key, value: v }).catch(() => {});
      };
      return box;
    },
    bridge,
    now: () => new Date(),
    request: (method, params) => bridge.request(method, params),
    every(ms, fn) {
      const id = setInterval(fn, ms);
      onCleanup(() => clearInterval(id));
      return id;
    },
    subscribe(kind, fn) {
      if (store.has(kind)) fn(store.get(kind));
      onCleanup(store.on(kind, fn));
    },
  };
}

export function mountWidget(host, instance, { store, bridge }) {
  const def = REGISTRY[instance.type];
  const cleanups = [];
  const body = document.createElement("div");
  body.className = "w-body";
  host.appendChild(body);
  if (!def) {
    body.classList.add("w-missing");
    body.textContent = `Unknown widget "${instance.type}"`;
    return { needs: [], destroy: () => body.remove() };
  }
  const options = withDefaults(def, instance.options);
  const ctx = makeContext({ store, bridge, options, widgetId: instance.id, pageId: env.pageId ?? "page", onCleanup: (fn) => cleanups.push(fn) });
  let handle;
  try {
    handle = def.mount(body, ctx) ?? {};
  } catch (err) {
    console.error(`[panel] widget "${instance.type}" failed to mount`, err);
    body.classList.add("w-missing");
    body.textContent = "This widget failed to load.";
    handle = {};
  }
  return {
    needs: def.needs ? def.needs(options) : [],
    destroy() {
      for (const fn of cleanups.splice(0)) fn();
      handle.unmount?.();
      body.remove();
    },
  };
}

/** Render one page into `root`; returns {needs, destroy}. */
export function mountPage(root, page, env, orientation) {
  const grid = document.createElement("div");
  grid.className = "page-grid";
  const widgets = page.widgets ?? [];
  const { cols, rows, boxes } = resolveLayout(widgets, orientation);
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  grid.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
  grid.style.setProperty("--rows", rows);
  const mounted = widgets.map((w, i) => {
    const b = boxes[i];
    const cell = document.createElement("div");
    cell.className = "w";
    cell.dataset.type = w.type;
    cell.dataset.id = w.id ?? "";
    cell.style.gridColumn = `${b.x + 1} / span ${b.w}`;
    cell.style.gridRow = `${b.y + 1} / span ${b.h}`;
    grid.appendChild(cell);
    const m = mountWidget(cell, w, { ...env, pageId: page.id });
    return { ...m, cell };
  });
  root.appendChild(grid);
  return {
    el: grid,
    needs: [...new Set(mounted.flatMap((m) => m.needs))],
    destroy() {
      for (const m of mounted) m.destroy();
      grid.remove();
    },
  };
}
