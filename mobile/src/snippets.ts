// The snippet library: reusable text you send to your computer with one tap.
//
// Snippets live in AsyncStorage next to the deck layout (the pairing key is the
// only thing in the secure store). Like deckStorage, everything is validated on
// load so a corrupt or hand-edited blob degrades to "no snippets" instead of
// crashing the app.
//
// A snippet is deliberately *not* a tile. Tiles are the nine things you reach for
// without thinking; the library is the long tail you search when you need it. A
// snippet can be promoted to a tile (see `snippetToTile`) when it graduates.

import AsyncStorage from "@react-native-async-storage/async-storage";

import { TILE_COLORS, clampSpan, newButtonId, type DeckButton } from "./buttons";

const SNIPPETS_KEY = "streamphonedeck.snippets.v1";

/** Generous enough for an email signature or a licence header, bounded so one
 *  snippet can't fill the store. */
export const MAX_SNIPPET_LEN = 4000;
export const MAX_SNIPPET_LABEL_LEN = 48;

export type Snippet = {
  id: string;
  /** Optional short name. Falls back to the text's first line in the UI. */
  label: string;
  text: string;
  createdAt: number;
};

export function newSnippetId(): string {
  return `snip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function loadSnippets(): Promise<Snippet[]> {
  try {
    const raw = await AsyncStorage.getItem(SNIPPETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(coerceSnippet).filter((s): s is Snippet => s !== null);
  } catch {
    return [];
  }
}

export async function saveSnippets(list: Snippet[]): Promise<void> {
  await AsyncStorage.setItem(SNIPPETS_KEY, JSON.stringify(list));
}

function coerceSnippet(input: unknown): Snippet | null {
  if (!input || typeof input !== "object") return null;
  const s = input as Record<string, unknown>;
  const text = typeof s.text === "string" ? s.text.slice(0, MAX_SNIPPET_LEN) : "";
  if (!text.trim()) return null; // an empty snippet has nothing to send
  return {
    id: typeof s.id === "string" && s.id ? s.id : newSnippetId(),
    label: typeof s.label === "string" ? s.label.slice(0, MAX_SNIPPET_LABEL_LEN) : "",
    text,
    createdAt: typeof s.createdAt === "number" && Number.isFinite(s.createdAt) ? s.createdAt : Date.now(),
  };
}

/** What to show as the snippet's name: its label, else its first non-empty line. */
export function snippetTitle(s: Snippet): string {
  if (s.label.trim()) return s.label.trim();
  const firstLine = s.text.split("\n").find((l) => l.trim().length > 0) ?? "";
  return firstLine.trim() || "Untitled";
}

/** A one-line flattening of the body, for the list's secondary row. */
export function snippetPreview(s: Snippet, max = 80): string {
  const flat = s.text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** Promote a snippet to a deck tile that types it. */
export function snippetToTile(s: Snippet): DeckButton {
  return {
    id: newButtonId(),
    label: snippetTitle(s).slice(0, 14),
    icon: "✎",
    iconType: "emoji",
    action: { type: "text", text: s.text },
    // Violet marks text tiles apart from the sky/blue app tiles in the seed deck.
    color: TILE_COLORS.find((c) => c.name === "Violet")?.color ?? TILE_COLORS[0].color,
    w: clampSpan(1),
    h: clampSpan(1),
  };
}
