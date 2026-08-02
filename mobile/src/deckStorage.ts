// Per-device deck layout, persisted in AsyncStorage (the pairing key lives in the
// secure store instead — see storage.ts). A device holds several *profiles*
// (named decks of up to MAX_TILES_PER_PROFILE tiles); only the active profile
// shows. defaultButtons seed a fresh device. Mirrors the web app's storage.ts.

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  clampSpan,
  DEFAULT_COLS,
  MAX_COLS,
  MAX_ICON_IMAGE_LEN,
  MAX_TILES_PER_PROFILE,
  MIN_COLS,
  defaultButtons,
  newButtonId,
  newPageId,
  newProfileId,
  validateAction,
  type DeckButton,
  type DeckPage,
  type DeckProfile,
  type IconType,
} from "./buttons";

const PROFILES_KEY = "streamphonedeck.profiles.v1";
// Pre-profiles layout: a single flat DeckButton[]. Migrated into a "Default"
// profile on first load, then left untouched.
const LEGACY_DECK_KEY = "streamphonedeck.deck.v1";
const COLS_KEY = "streamphonedeck.cols";

/** The active profile plus the full set, as persisted together. */
export type ProfilesState = {
  profiles: DeckProfile[];
  activeId: string;
  /** "Intuitive" mode: auto-switch the active profile to match the host's focused app. */
  autoMode: boolean;
};

/** Layout size = number of grid columns (a device-wide preference, not per-profile). */
export async function loadCols(): Promise<number> {
  const raw = await AsyncStorage.getItem(COLS_KEY);
  const n = raw ? parseInt(raw, 10) : DEFAULT_COLS;
  return Number.isFinite(n) ? Math.max(MIN_COLS, Math.min(n, MAX_COLS)) : DEFAULT_COLS;
}

export async function saveCols(cols: number): Promise<void> {
  await AsyncStorage.setItem(COLS_KEY, String(Math.max(MIN_COLS, Math.min(cols, MAX_COLS))));
}

/** A fresh device: one "Default" profile seeded with the default tiles. */
export function defaultProfilesState(): ProfilesState {
  const id = newProfileId();
  return {
    profiles: [{ id, name: "Default", pages: [{ id: newPageId(), buttons: defaultButtons }], apps: [] }],
    activeId: id,
    autoMode: false,
  };
}

/**
 * Load the saved profiles. Falls back through: new profiles store → migrate a
 * legacy flat deck into a single "Default" profile → the seeded defaults.
 * Always resolves to at least one profile with a valid `activeId`.
 */
export async function loadProfiles(): Promise<ProfilesState> {
  try {
    const raw = await AsyncStorage.getItem(PROFILES_KEY);
    if (raw) {
      const state = coerceState(JSON.parse(raw));
      if (state) return state;
    }
    const legacy = await AsyncStorage.getItem(LEGACY_DECK_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed)) {
        const buttons = parsed
          .map(coerceButton)
          .filter((b): b is DeckButton => b !== null)
          .slice(0, MAX_TILES_PER_PROFILE);
        const id = newProfileId();
        const state: ProfilesState = {
          profiles: [{
            id, name: "Default", apps: [],
            pages: [{ id: newPageId(), buttons: buttons.length ? buttons : defaultButtons }],
          }],
          activeId: id,
          autoMode: false,
        };
        await saveProfiles(state); // persist the migration so it happens once
        return state;
      }
    }
  } catch {
    // fall through to defaults on bad/corrupt data
  }
  return defaultProfilesState();
}

export async function saveProfiles(state: ProfilesState): Promise<void> {
  await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(state));
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

function coerceButton(input: unknown): DeckButton | null {
  if (!input || typeof input !== "object") return null;
  const b = input as Record<string, unknown>;
  const action = validateAction(b.action);
  if (!action) return null;
  const { icon, iconType } = coerceIcon(b.icon, b.iconType);
  return {
    id: typeof b.id === "string" && b.id ? b.id : newButtonId(),
    label: typeof b.label === "string" ? b.label : "",
    icon,
    iconType,
    color: typeof b.color === "string" && b.color ? b.color : "#475569",
    w: clampSpan(b.w),
    h: clampSpan(b.h),
    action,
  };
}

/** Normalize a tile's face — valid image data URI stays an image; else emoji/text;
 *  unusable values fall back to the ⭐ emoji. Mirrors the web app. */
function coerceIcon(rawIcon: unknown, rawType: unknown): { icon: string; iconType: IconType } {
  const icon = typeof rawIcon === "string" ? rawIcon : "";
  const type: IconType = rawType === "text" || rawType === "image" ? rawType : "emoji";
  if (type === "image") {
    if (icon.startsWith("data:image/") && icon.length <= MAX_ICON_IMAGE_LEN) return { icon, iconType: "image" };
    return { icon: "⭐", iconType: "emoji" };
  }
  const trimmed = icon.trim().slice(0, 64);
  return { icon: trimmed || "⭐", iconType: type };
}
