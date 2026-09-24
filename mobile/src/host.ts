// The single switch between a real paired host and the demo simulation.
//
// The UI imports these instead of `rpc.ts` directly, so demo mode needs no
// conditionals at any call site — and no demo code can ever reach the encrypted
// transport, because the branch happens before `sendCmd`.

import { isDemo, demoApps, demoForeground, demoHello, demoSendAction } from "./demo";
import * as rpc from "./rpc";
import type { DeckAction } from "./rpc";
import type { Pairing } from "./storage";

export type { DeckAction } from "./rpc";

export function hello(p: Pairing, name: string) {
  return isDemo(p) ? demoHello() : rpc.hello(p, name);
}

export function sendAction(p: Pairing, label: string, action: DeckAction) {
  return isDemo(p) ? demoSendAction(label, action) : rpc.sendAction(p, label, action);
}

export function foreground(p: Pairing) {
  return isDemo(p) ? demoForeground() : rpc.foreground(p);
}

export function apps(p: Pairing) {
  return isDemo(p) ? demoApps() : rpc.apps(p);
}

// Pairing itself is never simulated — a demo session is created locally, not
// negotiated — so `pair` passes straight through.
export const pair = rpc.pair;
