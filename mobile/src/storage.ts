// Persistent pairing state, kept in the OS secure keystore (Keychain / Keystore).
// The device key never touches AsyncStorage or plain files. The send counter
// lives here too so it keeps increasing across app restarts (replay protection).

import * as SecureStore from "expo-secure-store";

export type Pairing = {
  kid: string;
  key: string; // base64, 32 bytes
  host: string;
  port: number;
  name: string;
};

const PAIR_KEY = "spd.pairing";
const CTR_KEY = "spd.ctr";

/**
 * The stored pairing, or null if there isn't one *or* it can't be read.
 *
 * Never throws. The launch path renders a spinner until this resolves, so a
 * rejection here used to hang the app on that spinner forever — which happens
 * whenever the keystore is unreachable (an unsigned build has no keychain
 * entitlement; on device the keychain is also unavailable before first unlock)
 * or the stored JSON is corrupt. Degrading to "not paired" is recoverable: the
 * user lands on the pair screen and can re-pair or open the demo.
 */
export async function loadPairing(): Promise<Pairing | null> {
  try {
    const raw = await SecureStore.getItemAsync(PAIR_KEY);
    return raw ? (JSON.parse(raw) as Pairing) : null;
  } catch {
    return null;
  }
}

export async function savePairing(p: Pairing): Promise<void> {
  await SecureStore.setItemAsync(PAIR_KEY, JSON.stringify(p));
  await SecureStore.setItemAsync(CTR_KEY, "0");
}

export async function clearPairing(): Promise<void> {
  await SecureStore.deleteItemAsync(PAIR_KEY);
  await SecureStore.deleteItemAsync(CTR_KEY);
}

/** Atomic-enough monotonic counter for GCM message ordering. */
export async function nextCounter(): Promise<number> {
  const cur = parseInt((await SecureStore.getItemAsync(CTR_KEY)) ?? "0", 10) || 0;
  const next = cur + 1;
  await SecureStore.setItemAsync(CTR_KEY, String(next));
  return next;
}
