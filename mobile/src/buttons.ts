// Deck data model — ported from the web app's src/lib/buttons.ts, but colors are
// real hex values (no Tailwind on native). The phone deck is its own store, so it
// doesn't need to interop layouts with the web deck.

/** Media-control verbs the host understands (macOS; see desktop executor). */
export type MediaCommand = "playpause" | "next" | "previous" | "volup" | "voldown" | "mute" | "setvol";

/**
 * A single, directly executable action. Macro steps and timer payloads are
 * restricted to these, so composition is exactly one level deep — no macro of
 * macros, no timer firing a timer.
 */
export type BasicAction =
  | { type: "app"; target: string }
  | { type: "url"; target: string }
  | { type: "keys"; combo: string }
  | { type: "text"; text: string }
  | { type: "shell"; command: string }
  | { type: "media"; command: MediaCommand; value?: number };

/** One step of a macro: a basic action, optionally preceded by a pause. */
export type MacroStep = { action: BasicAction; delayMs?: number };

export type ButtonAction =
  | BasicAction
  /** Runs its steps in order on the host (shell steps still honor the host's shell policy). */
  | { type: "macro"; steps: MacroStep[] }
  /** Counts down on the phone, then fires `inner`. The host never sees "timer". */
  | { type: "timer"; seconds: number; inner: BasicAction };

export type ActionType = ButtonAction["type"];

/** The action types whose editor value is one string (everything pre-1.1). */
export type StringActionType = "app" | "url" | "keys" | "text" | "shell";

export const MAX_MACRO_STEPS = 8;
export const MAX_STEP_DELAY_MS = 30_000;
export const MAX_TIMER_SEC = 2 * 60 * 60;

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

/** How many tiles fit on one page — the "top 9" (3×3). Profiles hold multiple pages. */
export const MAX_TILES_PER_PROFILE = 9;

/** One page of a profile — up to MAX_TILES_PER_PROFILE tiles. */
export type DeckPage = {
  id: string;
  buttons: DeckButton[];
};

/**
 * A named deck. Users switch between profiles (Work, Streaming, Home, …); only
 * the active profile shows. Each profile holds one or more pages of tiles.
 * Persisted in AsyncStorage — see deckStorage.ts. Mirrors the web app.
 */
export type DeckProfile = {
  id: string;
  name: string;
  pages: DeckPage[];
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

/** Named color palettes for tiles. "Classic" is TILE_COLORS, unchanged. */
export type TilePalette = { id: string; name: string; colors: { name: string; color: string }[] };

export const TILE_PALETTES: TilePalette[] = [
  { id: "classic", name: "Classic", colors: TILE_COLORS },
  {
    id: "neon",
    name: "Neon",
    colors: [
      { name: "Magenta", color: "#d500f9" },
      { name: "Purple", color: "#651fff" },
      { name: "Blue", color: "#2962ff" },
      { name: "Cyan", color: "#0091ea" },
      { name: "Teal", color: "#00897b" },
      { name: "Green", color: "#00a344" },
      { name: "Red", color: "#ff1744" },
      { name: "Pink", color: "#c51162" },
      { name: "Indigo", color: "#304ffe" },
      { name: "Orange", color: "#e65100" },
    ],
  },
  {
    id: "pastel",
    name: "Dusk",
    colors: [
      { name: "Mauve", color: "#8d6e9f" },
      { name: "Steel", color: "#6e8fb5" },
      { name: "Sage", color: "#5f8f78" },
      { name: "Clay", color: "#b5776f" },
      { name: "Sand", color: "#a98b4f" },
      { name: "Moss", color: "#71895c" },
      { name: "Lilac", color: "#9a7fb5" },
      { name: "Lagoon", color: "#50808e" },
      { name: "Rosewood", color: "#a86e8e" },
      { name: "Harbor", color: "#64748b" },
    ],
  },
  {
    id: "mono",
    name: "Mono",
    colors: [
      { name: "Ink", color: "#1f2937" },
      { name: "Slate", color: "#334155" },
      { name: "Steel", color: "#475569" },
      { name: "Zinc", color: "#52525b" },
      { name: "Graphite", color: "#3f3f46" },
      { name: "Stone", color: "#57534e" },
      { name: "Coal", color: "#27272a" },
      { name: "Ash", color: "#6b7280" },
      { name: "Navy", color: "#1e293b" },
      { name: "Smoke", color: "#44403c" },
    ],
  },
  {
    id: "sunset",
    name: "Sunset",
    colors: [
      { name: "Crimson", color: "#b91c1c" },
      { name: "Ember", color: "#c2410c" },
      { name: "Amber", color: "#b45309" },
      { name: "Magenta", color: "#be185d" },
      { name: "Wine", color: "#9d174d" },
      { name: "Rust", color: "#7c2d12" },
      { name: "Gold", color: "#a16207" },
      { name: "Rose", color: "#e11d48" },
      { name: "Flame", color: "#ea580c" },
      { name: "Bronze", color: "#92400e" },
    ],
  },
];

export const ACTION_TYPES: { type: ActionType; label: string }[] = [
  { type: "app", label: "App" },
  { type: "url", label: "URL" },
  { type: "keys", label: "Shortcut" },
  { type: "text", label: "Text" },
  { type: "media", label: "Media" },
  { type: "macro", label: "Macro" },
  { type: "timer", label: "Timer" },
  { type: "shell", label: "Shell" },
];

/** Per-type field metadata for the editor (string-valued types only). */
export const FIELD: Record<StringActionType, { label: string; placeholder: string; hint: string }> = {
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

/** The single string value of a string-typed action ("" for structured types). */
export function actionValue(action: ButtonAction): string {
  switch (action.type) {
    case "keys":
      return action.combo;
    case "shell":
      return action.command;
    case "text":
      return action.text;
    case "app":
    case "url":
      return action.target;
    default:
      return "";
  }
}

export function makeAction(type: StringActionType, value: string): BasicAction {
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

export const MEDIA_COMMANDS: { command: MediaCommand; label: string; icon: string }[] = [
  { command: "playpause", label: "Play / Pause", icon: "⏯️" },
  { command: "next", label: "Next track", icon: "⏭️" },
  { command: "previous", label: "Previous", icon: "⏮️" },
  { command: "volup", label: "Volume up", icon: "🔊" },
  { command: "voldown", label: "Volume down", icon: "🔉" },
  { command: "mute", label: "Mute", icon: "🔇" },
  { command: "setvol", label: "Volume slider", icon: "🎚️" },
];

const MEDIA_SET = new Set<string>(MEDIA_COMMANDS.map((m) => m.command));

/** Validate an untrusted basic action (string types + media). */
function validateBasic(input: unknown): BasicAction | null {
  if (!input || typeof input !== "object") return null;
  const a = input as Record<string, unknown>;
  if (a.type === "media") {
    if (typeof a.command !== "string" || !MEDIA_SET.has(a.command)) return null;
    const cmd = a.command as MediaCommand;
    if (cmd === "setvol") {
      const v = typeof a.value === "number" && Number.isFinite(a.value) ? Math.round(a.value) : 50;
      return { type: "media", command: cmd, value: Math.max(0, Math.min(100, v)) };
    }
    return { type: "media", command: cmd };
  }
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

export function validateAction(input: unknown): ButtonAction | null {
  if (!input || typeof input !== "object") return null;
  const a = input as Record<string, unknown>;
  if (a.type === "macro") {
    if (!Array.isArray(a.steps) || a.steps.length === 0) return null;
    const steps: MacroStep[] = [];
    for (const raw of a.steps.slice(0, MAX_MACRO_STEPS)) {
      if (!raw || typeof raw !== "object") return null;
      const s = raw as Record<string, unknown>;
      const action = validateBasic(s.action);
      if (!action) return null;
      const delayMs =
        typeof s.delayMs === "number" && Number.isFinite(s.delayMs)
          ? Math.max(0, Math.min(MAX_STEP_DELAY_MS, Math.round(s.delayMs)))
          : undefined;
      steps.push(delayMs ? { action, delayMs } : { action });
    }
    return steps.length ? { type: "macro", steps } : null;
  }
  if (a.type === "timer") {
    const inner = validateBasic(a.inner);
    if (!inner) return null;
    const seconds =
      typeof a.seconds === "number" && Number.isFinite(a.seconds)
        ? Math.max(1, Math.min(MAX_TIMER_SEC, Math.round(a.seconds)))
        : null;
    if (seconds === null) return null;
    return { type: "timer", seconds, inner };
  }
  return validateBasic(input);
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
    case "media": {
      const meta = MEDIA_COMMANDS.find((m) => m.command === action.command);
      return `Media: ${meta?.label ?? action.command}`;
    }
    case "macro":
      return `Macro: ${action.steps.length} step${action.steps.length === 1 ? "" : "s"}`;
    case "timer":
      return `Timer ${action.seconds}s → ${describeAction(action.inner)}`;
  }
}

/** Every app name an action could launch — used by the host's app allowlist. */
export function appTargetsOf(action: ButtonAction): string[] {
  if (action.type === "app") return [action.target];
  if (action.type === "macro") return action.steps.flatMap((s) => (s.action.type === "app" ? [s.action.target] : []));
  if (action.type === "timer") return action.inner.type === "app" ? [action.inner.target] : [];
  return [];
}

export function newButtonId(): string {
  return `btn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newProfileId(): string {
  return `prof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newPageId(): string {
  return `page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
