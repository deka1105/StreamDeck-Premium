// Parsing + pretty-printing for keyboard-shortcut strings like "cmd+shift+4".
//
// Used by the tile editor for live validation and by the deck to render a
// friendly label. The host agent (host-agent/agent.mjs) has its own executor
// with the *same* modifier/special-key names — keep the two in sync when adding
// keys here.

const MODIFIERS = new Set([
  "cmd", "command", "ctrl", "control", "alt", "opt", "option", "shift",
]);

// Non-character keys the agent understands (must mirror agent KEY_CODES).
const SPECIAL_KEYS = new Set([
  "return", "enter", "tab", "space", "delete", "backspace", "escape", "esc",
  "left", "right", "down", "up", "home", "end", "pageup", "pagedown",
  "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12",
]);

// Pretty symbols for modifiers (macOS glyphs).
const MOD_SYMBOL: Record<string, string> = {
  cmd: "⌘", command: "⌘",
  ctrl: "⌃", control: "⌃",
  alt: "⌥", opt: "⌥", option: "⌥",
  shift: "⇧",
};

export type ParsedCombo =
  | { ok: true; pretty: string }
  | { ok: false; error: string };

/** Validate a combo string and, if valid, produce a friendly label. */
export function parseCombo(input: string): ParsedCombo {
  const combo = input.trim();
  if (!combo) return { ok: false, error: "Enter a shortcut" };

  const parts = combo.toLowerCase().split("+").map((p) => p.trim()).filter(Boolean);
  const mods: string[] = [];
  const keys: string[] = [];

  for (const part of parts) {
    if (MODIFIERS.has(part)) mods.push(part);
    else keys.push(part);
  }

  if (keys.length === 0) return { ok: false, error: "Missing a key (e.g. cmd+space)" };
  if (keys.length > 1) return { ok: false, error: `Only one non-modifier key allowed` };

  const key = keys[0];
  const isChar = key.length === 1;
  if (!isChar && !SPECIAL_KEYS.has(key)) {
    return { ok: false, error: `Unknown key: "${key}"` };
  }

  const prettyMods = mods.map((m) => MOD_SYMBOL[m] ?? m);
  const prettyKey = key.length === 1 ? key.toUpperCase() : capitalize(key);
  return { ok: true, pretty: [...prettyMods, prettyKey].join(" ") };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
