// Deck data model — ported from the web app's src/lib/buttons.ts, but colors are
// real hex values (no Tailwind on native). The phone deck is its own store, so it
// doesn't need to interop layouts with the web deck.

export type ButtonAction =
  | { type: "app"; target: string }
  | { type: "url"; target: string }
  | { type: "keys"; combo: string }
  | { type: "text"; text: string }
  | { type: "shell"; command: string };

export type ActionType = ButtonAction["type"];

/** How a tile's `icon` is rendered. */
export type IconType = "emoji" | "text" | "image";

/** Max length of a stored image data URI (guards AsyncStorage; picker resizes small). */
export const MAX_ICON_IMAGE_LEN = 200_000;

export type DeckButton = {
  id: string;
  label: string;
  icon: string; // emoji glyph, short text, or an image data URI (see iconType)
  iconType?: IconType; // default "emoji"
  action: ButtonAction;
  color: string; // a hex from TILE_COLORS
  w?: number; // column span (default 1)
  h?: number; // row span (default 1)
};

/** True if the icon is a usable inline image data URI. */
export function isImageIcon(button: Pick<DeckButton, "icon" | "iconType">): boolean {
  return button.iconType === "image" && typeof button.icon === "string" && button.icon.startsWith("data:image/");
}

/** How many tiles a profile pins — the "top 9" the user wants to see. */
export const MAX_TILES_PER_PROFILE = 9;

/**
 * A named deck of pinned tiles. Users switch between profiles (Work, Streaming,
 * Home, …); only the active profile's tiles show. Persisted in AsyncStorage —
 * see deckStorage.ts. Mirrors the web app's DeckProfile.
 */
export type DeckProfile = {
  id: string;
  name: string;
  buttons: DeckButton[];
  /**
   * Frontmost-app names that auto-activate this profile in "intuitive" mode
   * (e.g. ["Safari", "Code"]). Matched case-insensitively against what the host
   * reports as focused. Empty = never auto-activates.
   */
  apps?: string[];
};

/** Case-insensitive match of a frontmost app name against a profile's triggers. */
export function profileMatchesApp(profile: DeckProfile, app: string | null | undefined): boolean {
  if (!app || !profile.apps?.length) return false;
  const needle = app.trim().toLowerCase();
  return profile.apps.some((a) => a.trim().toLowerCase() === needle);
}

/** The first profile whose trigger list matches the app, or null (stay put). */
export function profileForApp(profiles: DeckProfile[], app: string | null | undefined): DeckProfile | null {
  return profiles.find((p) => profileMatchesApp(p, app)) ?? null;
}

/** Grid layout limits (columns = "layout size", span = per-tile resize). */
export const MIN_COLS = 2;
export const MAX_COLS = 5;
export const DEFAULT_COLS = 3;
export const MAX_SPAN = 4;

/** Clamp a stored span to a sane integer ≥ 1. */
export function clampSpan(v: unknown): number {
  const n = typeof v === "number" ? Math.round(v) : 1;
  return Math.max(1, Math.min(n, MAX_SPAN));
}

export const TILE_COLORS: { name: string; color: string }[] = [
  { name: "Sky", color: "#0284c7" },
  { name: "Blue", color: "#2563eb" },
  { name: "Indigo", color: "#4f46e5" },
  { name: "Violet", color: "#7c3aed" },
  { name: "Fuchsia", color: "#c026d3" },
  { name: "Rose", color: "#e11d48" },
  { name: "Amber", color: "#d97706" },
  { name: "Emerald", color: "#059669" },
  { name: "Slate", color: "#475569" },
  { name: "Neutral", color: "#404040" },
];

export const ACTION_TYPES: { type: ActionType; label: string }[] = [
  { type: "app", label: "App" },
  { type: "url", label: "URL" },
  { type: "keys", label: "Shortcut" },
  { type: "text", label: "Text" },
  { type: "shell", label: "Shell" },
];

/** Per-type field metadata for the editor. */
export const FIELD: Record<ActionType, { label: string; placeholder: string; hint: string }> = {
  app: { label: "App name", placeholder: "Safari", hint: "Exact app name, e.g. “Visual Studio Code”." },
  url: { label: "URL", placeholder: "https://github.com", hint: "Opens in your default browser." },
  keys: { label: "Shortcut", placeholder: "cmd+shift+4", hint: "Modifiers + one key. macOS only." },
  text: { label: "Text to type", placeholder: "Hello, world!", hint: "Typed into whatever app is focused on your computer." },
  shell: { label: "Command", placeholder: "osascript -e 'set volume output muted true'", hint: "Runs on the host. Be careful." },
};

export const defaultButtons: DeckButton[] = [
  { id: "safari", label: "Safari", icon: "🧭", action: { type: "app", target: "Safari" }, color: "#0284c7" },
  { id: "vscode", label: "VS Code", icon: "💻", action: { type: "app", target: "Visual Studio Code" }, color: "#2563eb" },
  { id: "finder", label: "Finder", icon: "📁", action: { type: "app", target: "Finder" }, color: "#4f46e5" },
  { id: "spotlight", label: "Spotlight", icon: "🔍", action: { type: "keys", combo: "cmd+space" }, color: "#7c3aed" },
  { id: "screenshot", label: "Screenshot", icon: "📸", action: { type: "keys", combo: "cmd+shift+4" }, color: "#c026d3" },
  { id: "lock", label: "Lock", icon: "🔒", action: { type: "keys", combo: "ctrl+cmd+q" }, color: "#475569" },
  { id: "github", label: "GitHub", icon: "🐙", action: { type: "url", target: "https://github.com" }, color: "#404040" },
  { id: "youtube", label: "YouTube", icon: "▶️", action: { type: "url", target: "https://youtube.com" }, color: "#e11d48" },
  { id: "mute", label: "Mute", icon: "🔇", action: { type: "shell", command: "osascript -e 'set volume output muted true'" }, color: "#d97706" },
];

export function actionValue(action: ButtonAction): string {
  switch (action.type) {
    case "keys":
      return action.combo;
    case "shell":
      return action.command;
    case "text":
      return action.text;
    default:
      return action.target;
  }
}

export function makeAction(type: ActionType, value: string): ButtonAction {
  switch (type) {
    case "keys":
      return { type, combo: value };
    case "shell":
      return { type, command: value };
    case "text":
      return { type, text: value };
    default:
      return { type, target: value };
  }
}

export function validateAction(input: unknown): ButtonAction | null {
  if (!input || typeof input !== "object") return null;
  const a = input as Record<string, unknown>;
  const value =
    typeof a.target === "string" ? a.target
    : typeof a.combo === "string" ? a.combo
    : typeof a.command === "string" ? a.command
    : typeof a.text === "string" ? a.text
    : null;
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2000) return null;
  if (a.type === "app" || a.type === "url" || a.type === "keys" || a.type === "shell" || a.type === "text") {
    return makeAction(a.type, trimmed);
  }
  return null;
}

export function describeAction(action: ButtonAction): string {
  switch (action.type) {
    case "app":
      return `Launch app: ${action.target}`;
    case "url":
      return `Open URL: ${action.target}`;
    case "keys":
      return `Send keys: ${action.combo}`;
    case "shell":
      return `Run: ${action.command}`;
    case "text":
      return `Type: ${action.text}`;
  }
}

export function newButtonId(): string {
  return `btn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newProfileId(): string {
  return `prof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
