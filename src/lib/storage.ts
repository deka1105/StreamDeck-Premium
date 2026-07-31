// Per-device persistence for the deck layout (localStorage).
//
// The deck is a personal thing — your phone is your deck — so edits live on the
// device that made them. `defaultButtons` seeds a fresh device; a reset clears
// back to it. (To share one deck across devices, this is the layer to swap for a
// server-backed store.)

import { defaultButtons, type DeckButton, validateAction } from "./buttons";

const STORAGE_KEY = "streamphonedeck.deck.v1";
const TOKEN_KEY = "streamphonedeck.token";

/** The access token this device sends with each press (empty if none set). */
export function loadToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(TOKEN_KEY) ?? "";
}

export function saveToken(token: string): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

/** Load the saved deck, falling back to the defaults on first run / bad data. */
export function loadDeck(): DeckButton[] {
  if (typeof window === "undefined") return defaultButtons;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultButtons;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultButtons;
    const clean = parsed.map(coerceButton).filter((b): b is DeckButton => b !== null);
    return clean.length ? clean : defaultButtons;
  } catch {
    return defaultButtons;
  }
}

export function saveDeck(buttons: DeckButton[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(buttons));
}

export function resetDeck(): DeckButton[] {
  if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
  return defaultButtons;
}

export function newButtonId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `btn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Validate/normalize one stored entry; returns null if it's unusable. */
function coerceButton(input: unknown): DeckButton | null {
  if (!input || typeof input !== "object") return null;
  const b = input as Record<string, unknown>;
  const action = validateAction(b.action);
  if (!action) return null;
  return {
    id: typeof b.id === "string" && b.id ? b.id : newButtonId(),
    label: typeof b.label === "string" ? b.label : "",
    icon: typeof b.icon === "string" && b.icon ? b.icon : "⭐",
    color: typeof b.color === "string" && b.color ? b.color : "from-slate-500 to-slate-700",
    action,
  };
}
