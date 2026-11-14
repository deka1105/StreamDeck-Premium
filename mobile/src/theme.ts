// Design tokens for the phone app. One place for color, radius, spacing and
// shadow so every screen reads as the same product — and so the app matches
// the marketing site's palette (site/index.html defines the same ground,
// panel and accent values).
//
// TILE_COLORS in buttons.ts is deliberately NOT here: those are user-facing
// choices persisted in saved decks, not chrome.

import { Platform, type ViewStyle } from "react-native";

export const color = {
  /** App background — same as the site's --ground. */
  bg: "#070b14",
  /** Raised surfaces: sheets, cards, modals. */
  surface: "#0e1626",
  /** Inputs, chips, list rows. */
  field: "#16233a",
  /** Hairline borders on dark surfaces. */
  line: "rgba(255,255,255,0.09)",
  lineStrong: "rgba(255,255,255,0.16)",

  ink: "#e8eef9",
  inkMid: "#cdd7e8",
  inkDim: "#8a99b2",
  inkFaint: "#6b7a94",
  inkGhost: "#5d6c86",

  accent: "#38bdf8",
  accentDeep: "#0ea5e9",
  accentSoft: "#7dd3fc",
  accentFaint: "rgba(56,189,248,0.16)",

  success: "#34d399",
  danger: "#fb7185",
  dangerDeep: "#e11d48",
  warn: "#fbbf24",
} as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 24, pill: 999 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

/** Soft drop shadow for floating elements (tiles, sheets). */
export function shadow(depth: 1 | 2 | 3): ViewStyle {
  const table = {
    1: { shadowOpacity: 0.25, shadowRadius: 5, offset: 2, elevation: 3 },
    2: { shadowOpacity: 0.35, shadowRadius: 9, offset: 4, elevation: 6 },
    3: { shadowOpacity: 0.45, shadowRadius: 16, offset: 8, elevation: 12 },
  }[depth];
  return Platform.select<ViewStyle>({
    android: { elevation: table.elevation },
    default: {
      shadowColor: "#000",
      shadowOpacity: table.shadowOpacity,
      shadowRadius: table.shadowRadius,
      shadowOffset: { width: 0, height: table.offset },
    },
  })!;
}
