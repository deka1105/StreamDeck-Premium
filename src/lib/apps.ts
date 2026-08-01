// Latest list of running apps on the host, reported by the agent and read by the
// deck's "Apps" screen. Process-local state on globalThis, like src/lib/bus.ts and
// src/lib/foreground.ts. The agent POSTs /api/apps; the deck polls GET /api/apps
// while the Apps screen is open. For multi-instance, back this with a shared store.

export type RunningApps = {
  /** Names of apps with a UI currently running on the host (sorted). */
  apps: string[];
  /** The focused app, so the screen can highlight it (null = unknown). */
  frontmost: string | null;
  /** Epoch milliseconds when last reported (null = not yet). */
  at: number | null;
};

const globalForApps = globalThis as unknown as { __deckApps?: RunningApps };

const state: RunningApps =
  globalForApps.__deckApps ?? (globalForApps.__deckApps = { apps: [], frontmost: null, at: null });

export function setApps(apps: string[], frontmost: string | null): void {
  state.apps = apps;
  state.frontmost = frontmost;
  state.at = Date.now();
}

export function getApps(): RunningApps {
  return { apps: state.apps, frontmost: state.frontmost, at: state.at };
}
