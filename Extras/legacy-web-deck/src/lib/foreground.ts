// Latest frontmost/focused app on the host, reported by the agent and read by
// the deck for "intuitive" auto profile switching.
//
// Like src/lib/bus.ts this is process-local state stashed on globalThis so it
// survives dev hot-reload. The agent POSTs the focused app to /api/foreground;
// the deck polls GET /api/foreground and switches profiles to match. For a
// multi-instance deployment, back this with the same shared store as the bus.

export type Foreground = {
  /** The host's focused application name, e.g. "Safari" (null = not yet reported). */
  app: string | null;
  /** Epoch milliseconds when it was last reported. */
  at: number | null;
};

const globalForFg = globalThis as unknown as { __deckForeground?: Foreground };

const state: Foreground =
  globalForFg.__deckForeground ?? (globalForFg.__deckForeground = { app: null, at: null });

export function setForeground(app: string): void {
  state.app = app;
  state.at = Date.now();
}

export function getForeground(): Foreground {
  return { app: state.app, at: state.at };
}
