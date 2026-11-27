// Latest value per data kind ("system", "media", …), with subscriptions.
// Widgets never fetch; they subscribe here and the app feeds the store from
// the bridge's `data` events and snapshots.

export function createStore() {
  const values = new Map();
  const subs = new Map();

  return {
    get: (kind) => values.get(kind),
    has: (kind) => values.has(kind),
    set(kind, value) {
      values.set(kind, value);
      for (const fn of subs.get(kind) ?? []) {
        try {
          fn(value);
        } catch (err) {
          console.error(`[panel] subscriber for "${kind}" failed`, err);
        }
      }
    },
    /** Subscribe; returns an unsubscribe function. */
    on(kind, fn) {
      if (!subs.has(kind)) subs.set(kind, new Set());
      subs.get(kind).add(fn);
      return () => subs.get(kind)?.delete(fn);
    },
  };
}
