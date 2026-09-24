// Demo mode: a simulated host so the app is fully explorable with no computer
// paired and nothing installed.
//
// This exists for two audiences. App Review gets a binary they can actually
// operate — a companion app that shows only a QR scanner reads as "unable to
// review" and gets rejected under guideline 2.1. And anyone curious gets to see
// what the deck does before installing a host on their machine.
//
// A demo session is a real `Pairing` carrying a sentinel `kid`, so it persists
// across launches and "Unpair" leaves it exactly like a real one. Every call
// short-circuits before `sendCmd`, so no crypto, counter, or network is touched.

import type { Pairing } from "./storage";
import type { DeckAction } from "./rpc";

export const DEMO_KID = "__demo__";

/** The fake pairing a demo session runs on. No key — nothing ever signs with it. */
export function demoPairing(): Pairing {
  return { kid: DEMO_KID, key: "", host: "demo", port: 0, name: "Demo Mac" };
}

export function isDemo(p: Pairing): boolean {
  return p.kid === DEMO_KID;
}

/**
 * Apps the simulated Mac is "running". Deliberately overlaps the default deck's
 * `app` targets so tiles light up their running / frontmost dots and the deck
 * looks alive rather than staged.
 */
const RUNNING = [
  "Finder",
  "Safari",
  "Visual Studio Code",
  "Messages",
  "Spotify",
  "Notes",
  "Terminal",
];

/** The focused app rotates so Auto mode and the Apps screen visibly react. */
const FOCUS_ROTATION = ["Visual Studio Code", "Safari", "Finder", "Notes"];
const ROTATE_MS = 6000;

function frontmostNow(): string {
  const i = Math.floor(Date.now() / ROTATE_MS) % FOCUS_ROTATION.length;
  return FOCUS_ROTATION[i];
}

/** A beat of latency, so the UI exercises its real in-flight states. */
function settle<T>(value: T, ms = 180): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export function demoHello() {
  return settle({ ok: true, host: "Demo Mac" }, 120);
}

/** Accepts anything and runs nothing. The deck shows a standing banner saying so. */
export function demoSendAction(_label: string, _action: DeckAction) {
  return settle({ ok: true as boolean, error: undefined as string | undefined });
}

export function demoForeground() {
  return settle({ ok: true, app: frontmostNow() as string | null }, 60);
}

export function demoApps() {
  return settle({ ok: true, apps: RUNNING, frontmost: frontmostNow() as string | null }, 140);
}
