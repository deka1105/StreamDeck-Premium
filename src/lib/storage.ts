// Per-device persistence for the deck (localStorage).
//
// The deck is a personal thing — your phone is your deck — so edits live on the
// device that made them. A device holds several *profiles* (named decks of up to
// MAX_TILES_PER_PROFILE tiles); only the active profile's tiles show. This is the
// live source of truth; `defaultButtons` only seeds a fresh device.
//
// (To share profiles across devices, this is the layer to swap for a server store.)

import {
  defaultButtons,
  MAX_ICON_IMAGE_LEN,
  MAX_TILES_PER_PROFILE,
  validateAction,
  type DeckButton,
  type DeckProfile,
  type IconType,
} from "./buttons";

const PROFILES_KEY = "streamphonedeck.profiles.v1";
// Pre-profiles layout: a single flat DeckButton[]. Migrated into a "Default"
// profile on first load, then left untouched.
const LEGACY_DECK_KEY = "streamphonedeck.deck.v1";
const TOKEN_KEY = "streamphonedeck.token";

/** The active profile plus the full set, as persisted together. */
export type ProfilesState = {
  profiles: DeckProfile[];
  activeId: string;
  /** "Intuitive" mode: auto-switch the active profile to match the host's focused app. */
  autoMode: boolean;
};

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

/** A fresh device: one "Default" profile seeded with the default tiles. */
export function defaultProfilesState(): ProfilesState {
  const id = newProfileId();
  return { profiles: [{ id, name: "Default", buttons: [...defaultButtons], apps: [] }], activeId: id, autoMode: false };
}

/**
 * Load the saved profiles. Falls back through: new profiles store → migrate a
 * legacy flat deck into a single "Default" profile → the seeded defaults.
 * Always returns at least one profile with a valid `activeId`.
 */
export function loadProfiles(): ProfilesState {
  if (typeof window === "undefined") return defaultProfilesState();
  try {
    const raw = window.localStorage.getItem(PROFILES_KEY);
    if (raw) {
      const state = coerceState(JSON.parse(raw));
      if (state) return state;
    }
    const legacy = window.localStorage.getItem(LEGACY_DECK_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed)) {
        const buttons = parsed
          .map(coerceButton)
          .filter((b): b is DeckButton => b !== null)
          .slice(0, MAX_TILES_PER_PROFILE);
        const id = newProfileId();
        const state: ProfilesState = {
          profiles: [{ id, name: "Default", buttons: buttons.length ? buttons : [...defaultButtons], apps: [] }],
          activeId: id,
          autoMode: false,
        };
        saveProfiles(state); // persist the migration so it happens once
        return state;
      }
    }
  } catch {
    // fall through to defaults on bad/corrupt data
  }
  return defaultProfilesState();
}

export function saveProfiles(state: ProfilesState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROFILES_KEY, JSON.stringify(state));
}

export function newButtonId(): string {
  return newId("btn");
}

export function newProfileId(): string {
  return newId("prof");
}

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Validate/normalize a persisted profiles blob; null if unusable. */
function coerceState(input: unknown): ProfilesState | null {
  if (!input || typeof input !== "object") return null;
  const s = input as Record<string, unknown>;
  if (!Array.isArray(s.profiles)) return null;
  const profiles = s.profiles.map(coerceProfile).filter((p): p is DeckProfile => p !== null);
  if (!profiles.length) return null;
  const activeId =
    typeof s.activeId === "string" && profiles.some((p) => p.id === s.activeId)
      ? s.activeId
      : profiles[0].id;
  return { profiles, activeId, autoMode: s.autoMode === true };
}

/** Validate/normalize one stored profile; null if unusable. */
function coerceProfile(input: unknown): DeckProfile | null {
  if (!input || typeof input !== "object") return null;
  const p = input as Record<string, unknown>;
  if (!Array.isArray(p.buttons)) return null;
  const buttons = p.buttons
    .map(coerceButton)
    .filter((b): b is DeckButton => b !== null)
    .slice(0, MAX_TILES_PER_PROFILE);
  const apps = Array.isArray(p.apps)
    ? p.apps.filter((a): a is string => typeof a === "string" && a.trim().length > 0).map((a) => a.trim())
    : [];
  return {
    id: typeof p.id === "string" && p.id ? p.id : newProfileId(),
    name: typeof p.name === "string" && p.name.trim() ? p.name : "Profile",
    buttons,
    apps,
  };
}

/** Validate/normalize one stored tile; returns null if it's unusable. */
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
