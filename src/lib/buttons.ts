// Deck data model: the button/action types, the default (seed) layout, and
// helpers shared by the UI, the API route, and the host agent.
//
// The deck layout is user-editable and stored per-device (see src/lib/storage.ts);
// `defaultButtons` is only the starting point on first run / after a reset.

/**
 * What a button does when pressed. The host agent (host-agent/agent.mjs)
 * knows how to execute each variant on the machine it runs on.
 */
export type ButtonAction =
  /** Launch/focus an application by name, e.g. "Safari", "Visual Studio Code". */
  | { type: "app"; target: string }
  /** Open a website in the default browser. */
  | { type: "url"; target: string }
  /** Send a keyboard shortcut, e.g. "cmd+space", "cmd+shift+4", "ctrl+cmd+q". */
  | { type: "keys"; combo: string }
  /** Run a shell command on the host. Powerful — see the security note in README. */
  | { type: "shell"; command: string };

export type ActionType = ButtonAction["type"];

export type DeckButton = {
  /** Stable, unique id — React key and reorder handle. */
  id: string;
  /** Text shown on the button. */
  label: string;
  /** Emoji/icon glyph shown above the label. */
  icon: string;
  /** What pressing the button does on the host. */
  action: ButtonAction;
  /** One of TILE_COLORS below (Tailwind gradient classes). */
  color: string;
};

/**
 * How many tiles a profile pins — the "top 9" the user wants to see (a 3×3 grid).
 * The editor blocks adding past this; loading truncates to it.
 */
export const MAX_TILES_PER_PROFILE = 9;

/**
 * A named deck of pinned tiles. Users create several profiles (e.g. Work,
 * Streaming, Home) and switch between them; only the active profile's tiles
 * show. Persisted per-device — see src/lib/storage.ts.
 */
export type DeckProfile = {
  /** Stable, unique id. */
  id: string;
  /** User-facing name shown on the profile switcher. */
  name: string;
  /** The pinned tiles for this profile (≤ MAX_TILES_PER_PROFILE). */
  buttons: DeckButton[];
  /**
   * Frontmost-app names that auto-activate this profile in "intuitive" mode
   * (e.g. ["Safari", "Google Chrome"]). Matched case-insensitively against what
   * the host reports as the focused app. Empty = never auto-activates.
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

/** Selectable tile background gradients, offered in the editor. */
export const TILE_COLORS: { name: string; class: string }[] = [
  { name: "Sky", class: "from-sky-500 to-sky-700" },
  { name: "Blue", class: "from-blue-500 to-blue-700" },
  { name: "Indigo", class: "from-indigo-500 to-indigo-700" },
  { name: "Violet", class: "from-violet-500 to-violet-700" },
  { name: "Fuchsia", class: "from-fuchsia-500 to-fuchsia-700" },
  { name: "Rose", class: "from-rose-500 to-rose-700" },
  { name: "Amber", class: "from-amber-500 to-amber-700" },
  { name: "Emerald", class: "from-emerald-500 to-emerald-700" },
  { name: "Slate", class: "from-slate-500 to-slate-700" },
  { name: "Neutral", class: "from-neutral-600 to-neutral-800" },
];

export const defaultButtons: DeckButton[] = [
  { id: "safari", label: "Safari", icon: "🧭", action: { type: "app", target: "Safari" }, color: "from-sky-500 to-sky-700" },
  { id: "vscode", label: "VS Code", icon: "💻", action: { type: "app", target: "Visual Studio Code" }, color: "from-blue-500 to-blue-700" },
  { id: "finder", label: "Finder", icon: "📁", action: { type: "app", target: "Finder" }, color: "from-indigo-500 to-indigo-700" },
  { id: "spotlight", label: "Spotlight", icon: "🔍", action: { type: "keys", combo: "cmd+space" }, color: "from-violet-500 to-violet-700" },
  { id: "screenshot", label: "Screenshot", icon: "📸", action: { type: "keys", combo: "cmd+shift+4" }, color: "from-fuchsia-500 to-fuchsia-700" },
  { id: "lock", label: "Lock", icon: "🔒", action: { type: "keys", combo: "ctrl+cmd+q" }, color: "from-slate-500 to-slate-700" },
  { id: "github", label: "GitHub", icon: "🐙", action: { type: "url", target: "https://github.com" }, color: "from-neutral-600 to-neutral-800" },
  { id: "youtube", label: "YouTube", icon: "▶️", action: { type: "url", target: "https://youtube.com" }, color: "from-rose-500 to-rose-700" },
  { id: "mute", label: "Mute", icon: "🔇", action: { type: "shell", command: "osascript -e 'set volume output muted true'" }, color: "from-amber-500 to-amber-700" },
];

/** The single field an action carries, keyed by type (used by the editor). */
export function actionValue(action: ButtonAction): string {
  return action.type === "keys" ? action.combo
    : action.type === "shell" ? action.command
    : action.target;
}

/** Build a ButtonAction from a type + single value string. */
export function makeAction(type: ActionType, value: string): ButtonAction {
  switch (type) {
    case "keys": return { type, combo: value };
    case "shell": return { type, command: value };
    default: return { type, target: value };
  }
}

/** Validate an untrusted action payload (server + client share this). */
export function validateAction(input: unknown): ButtonAction | null {
  if (!input || typeof input !== "object") return null;
  const a = input as Record<string, unknown>;
  const value =
    typeof a.target === "string" ? a.target
    : typeof a.combo === "string" ? a.combo
    : typeof a.command === "string" ? a.command
    : null;
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2000) return null;
  if (a.type === "app" || a.type === "url" || a.type === "keys" || a.type === "shell") {
    return makeAction(a.type, trimmed);
  }
  return null;
}

/** One-line, human-readable description of an action (for logs / the monitor UI). */
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
  }
}
