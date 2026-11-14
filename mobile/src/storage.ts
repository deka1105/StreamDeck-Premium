// Persistent pairing state, kept in the OS secure keystore (Keychain / Keystore).
// Device keys never touch AsyncStorage or plain files.
//
// Since 1.1 a phone can hold SEVERAL pairings (one per computer) plus which one
// is active. Each pairing keeps its own monotonic send counter (replay
// protection), stored under its kid so switching hosts never reuses a counter.
// A pre-1.1 single pairing (spd.pairing / spd.ctr) is migrated on first load.

import * as SecureStore from "expo-secure-store";

export type Pairing = {
  kid: string;
  key: string; // base64, 32 bytes
  host: string;
  port: number;
  name: string;
};

export type PairingsState = {
  pairings: Pairing[];
  /** kid of the active pairing, or null when none are stored. */
  activeKid: string | null;
};

const PAIRINGS_KEY = "spd.pairings.v1";
const ACTIVE_KEY = "spd.active.v1";
// Pre-1.1 keys: one pairing, one counter. Read once, migrated, then deleted.
const LEGACY_PAIR_KEY = "spd.pairing";
const LEGACY_CTR_KEY = "spd.ctr";

// kid is hex (or the demo sentinel "__demo__") — all valid SecureStore chars.
const ctrKey = (kid: string) => `spd.ctr.${kid}`;

function coercePairing(input: unknown): Pairing | null {
  if (!input || typeof input !== "object") return null;
  const p = input as Record<string, unknown>;
  if (typeof p.kid !== "string" || !p.kid) return null;
  if (typeof p.key !== "string") return null;
  if (typeof p.host !== "string" || !p.host) return null;
  const port = typeof p.port === "number" && Number.isFinite(p.port) ? p.port : 0;
  return { kid: p.kid, key: p.key, host: p.host, port, name: typeof p.name === "string" && p.name ? p.name : "host" };
}

/**
 * All stored pairings plus the active one. Never throws (see the pre-1.1 note
 * in git history: a rejection here hangs the launch spinner forever) — any
 * keystore failure or corrupt JSON degrades to "nothing paired".
 */
export async function loadPairings(): Promise<PairingsState> {
  try {
    const raw = await SecureStore.getItemAsync(PAIRINGS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      const pairings = Array.isArray(parsed)
        ? parsed.map(coercePairing).filter((p): p is Pairing => p !== null)
        : [];
      let activeKid = (await SecureStore.getItemAsync(ACTIVE_KEY)) ?? null;
      if (!pairings.some((p) => p.kid === activeKid)) activeKid = pairings[0]?.kid ?? null;
      return { pairings, activeKid };
    }

    // Migrate a pre-1.1 single pairing into the list, carrying its counter.
    const legacyRaw = await SecureStore.getItemAsync(LEGACY_PAIR_KEY);
    if (legacyRaw) {
      const legacy = coercePairing(JSON.parse(legacyRaw));
      if (legacy) {
        const ctr = (await SecureStore.getItemAsync(LEGACY_CTR_KEY)) ?? "0";
        await SecureStore.setItemAsync(ctrKey(legacy.kid), ctr);
        const state: PairingsState = { pairings: [legacy], activeKid: legacy.kid };
        await persist(state);
        await SecureStore.deleteItemAsync(LEGACY_PAIR_KEY);
        await SecureStore.deleteItemAsync(LEGACY_CTR_KEY);
        return state;
      }
    }
  } catch {
    // fall through
  }
  return { pairings: [], activeKid: null };
}

async function persist(state: PairingsState): Promise<void> {
  await SecureStore.setItemAsync(PAIRINGS_KEY, JSON.stringify(state.pairings));
  if (state.activeKid) await SecureStore.setItemAsync(ACTIVE_KEY, state.activeKid);
  else await SecureStore.deleteItemAsync(ACTIVE_KEY);
}

/** Add (or replace by kid) a pairing, make it active, reset its counter. */
export async function addPairing(state: PairingsState, p: Pairing): Promise<PairingsState> {
  const next: PairingsState = {
    pairings: [...state.pairings.filter((x) => x.kid !== p.kid), p],
    activeKid: p.kid,
  };
  await SecureStore.setItemAsync(ctrKey(p.kid), "0");
  await persist(next);
  return next;
}

/** Remove a pairing and its counter; activates the next remaining one. */
export async function removePairing(state: PairingsState, kid: string): Promise<PairingsState> {
  const pairings = state.pairings.filter((x) => x.kid !== kid);
  const next: PairingsState = {
    pairings,
    activeKid: state.activeKid === kid ? pairings[0]?.kid ?? null : state.activeKid,
  };
  try {
    await SecureStore.deleteItemAsync(ctrKey(kid));
  } catch {
    // counter may never have been written
  }
  await persist(next);
  return next;
}

/** Switch the active computer. No-op if the kid isn't stored. */
export async function setActivePairing(state: PairingsState, kid: string): Promise<PairingsState> {
  if (!state.pairings.some((p) => p.kid === kid)) return state;
  const next: PairingsState = { ...state, activeKid: kid };
  await persist(next);
  return next;
}

/** Atomic-enough monotonic counter for GCM message ordering, per pairing. */
export async function nextCounter(kid: string): Promise<number> {
  const cur = parseInt((await SecureStore.getItemAsync(ctrKey(kid))) ?? "0", 10) || 0;
  const next = cur + 1;
  await SecureStore.setItemAsync(ctrKey(kid), String(next));
  return next;
}
