// In-memory pub/sub bus shared across API routes within a single server process.
//
// This is the simplest real-time transport that works with `next dev` and a
// single `next start` instance: the deck (phone) POSTs actions to /api/action,
// which publishes here, and each connected client (/api/events SSE stream)
// receives them. The host agent (host-agent/agent.mjs) is one such client and
// executes the action on the machine it runs on. It is intentionally
// process-local — for multi-instance / serverless deployments, swap this for
// Redis pub/sub or a hosted broker.

import type { ButtonAction } from "./buttons";

export type DeckAction = {
  /** Human-readable label, denormalized so clients can render without the config. */
  label: string;
  /** What the host should do — launch an app, open a URL, send keys, etc. */
  action: ButtonAction;
  /** Epoch milliseconds when the press was received by the server. */
  at: number;
};

type Listener = (action: DeckAction) => void;

// Persist the listener set across hot-reloads / route module reinstantiation in
// dev by stashing it on globalThis.
const globalForBus = globalThis as unknown as {
  __deckListeners?: Set<Listener>;
};

const listeners: Set<Listener> =
  globalForBus.__deckListeners ?? (globalForBus.__deckListeners = new Set());

export function publish(action: DeckAction): void {
  for (const listener of listeners) {
    try {
      listener(action);
    } catch {
      // A broken listener must not stop delivery to the others.
    }
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function listenerCount(): number {
  return listeners.size;
}
