// RevenueCat integration: SDK setup, the `pro` entitlement, and the free-tier
// limits the deck enforces.
//
// Design intent: the free tier is a *complete, useful product* — one profile, one
// page, nine tiles, and ad-hoc text sending all work forever. Pro sells the things
// that only matter once the deck is part of your daily workflow: more surface
// (profiles/pages), a saved snippet library, and custom image faces. Nothing that
// works on day one stops working; the wall is always in front of *growth*, never
// in front of the core loop.
//
// Configuration lives in the environment so the repo stays publishable:
//   EXPO_PUBLIC_REVENUECAT_IOS_KEY / EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
// (RevenueCat SDK keys are public client keys — safe to ship in a binary — but
// keeping them out of git means a fork doesn't bill against our project.)
// With no key configured the app runs entirely on the free tier and the paywall
// explains why instead of crashing.

import { createContext, useContext } from "react";
import { Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  PACKAGE_TYPE,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from "react-native-purchases";

/** The single entitlement that unlocks everything. Must match RevenueCat exactly. */
export const ENTITLEMENT_ID = "pro";

/** What the deck checks before letting the user grow past the free tier. */
export type Limits = {
  /** How many profiles the device may hold. */
  maxProfiles: number;
  /** How many pages one profile may hold. */
  maxPagesPerProfile: number;
  /** Uploaded-image tile faces (emoji and text faces are always free). */
  imageIcons: boolean;
  /**
   * How many snippets may be saved. Free gets a few rather than none on purpose:
   * a feature nobody can try is a feature nobody buys, and three is enough to
   * feel why you'd want the fourth. Ad-hoc text sending is always unlimited.
   */
  maxSnippets: number;
};

export const FREE_LIMITS: Limits = {
  maxProfiles: 1,
  maxPagesPerProfile: 1,
  imageIcons: false,
  maxSnippets: 3,
};

export const PRO_LIMITS: Limits = {
  maxProfiles: Infinity,
  maxPagesPerProfile: Infinity,
  imageIcons: true,
  maxSnippets: Infinity,
};

export function limitsFor(isPro: boolean): Limits {
  return isPro ? PRO_LIMITS : FREE_LIMITS;
}

/** Why the paywall opened — drives its headline, so the ask matches the moment. */
export type PaywallReason = "profiles" | "pages" | "imageIcons" | "snippets" | "generic";

export const PAYWALL_COPY: Record<PaywallReason, { title: string; body: string }> = {
  profiles: {
    title: "One deck isn't enough",
    body: "Pro gives you unlimited profiles — a separate deck for editing, for calls, for coding — and Auto mode switches between them as you change apps on your Mac.",
  },
  pages: {
    title: "Room for more than nine",
    body: "Pro adds unlimited pages to every profile, so a deck can hold as many tiles as your workflow needs.",
  },
  imageIcons: {
    title: "Use your own artwork",
    body: "Pro lets a tile wear any image — an app icon, a logo, a screenshot — instead of an emoji.",
  },
  snippets: {
    title: "Room for every snippet",
    body: "Free keeps three. Pro saves as many as you like — addresses, commands, boilerplate, that one paragraph you retype every week — and types any of them into your Mac with one tap.",
  },
  generic: {
    title: "DeskAssist Pro",
    body: "Unlimited profiles and pages, a saved snippet library, and custom image faces for every tile.",
  },
};

/** The platform's public SDK key, or null when unconfigured. */
export function apiKey(): string | null {
  const key =
    Platform.OS === "ios"
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  const trimmed = typeof key === "string" ? key.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

let configured = false;

/**
 * Bring up the SDK once. Safe to call repeatedly; returns false when there's no
 * key (or no native module, e.g. Expo Go) so callers can stay on the free tier
 * rather than crash.
 */
export async function configurePurchases(): Promise<boolean> {
  if (configured) return true;
  const key = apiKey();
  if (!key) return false;
  try {
    if (__DEV__) await Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey: key });
    configured = true;
    return true;
  } catch (e) {
    // Missing native module (Expo Go) or a bad key: run free rather than die.
    if (__DEV__) console.warn("[purchases] configure failed:", e);
    return false;
  }
}

export function isConfigured(): boolean {
  return configured;
}

/** True when `customerInfo` carries an active `pro` entitlement. */
export function hasPro(info: CustomerInfo | null): boolean {
  return !!info?.entitlements.active[ENTITLEMENT_ID];
}

/**
 * The offering to show. Prefers RevenueCat's `current` offering so pricing and
 * package mix stay dashboard-controlled — no app release needed to run a
 * pricing experiment.
 */
export async function fetchOffering(): Promise<PurchasesOffering | null> {
  const offerings = await Purchases.getOfferings();
  return offerings.current ?? null;
}

/** Order packages cheapest-commitment first, with lifetime last as the anchor. */
export function sortPackages(packages: PurchasesPackage[]): PurchasesPackage[] {
  const rank = (p: PurchasesPackage) => {
    switch (p.packageType) {
      case PACKAGE_TYPE.MONTHLY: return 0;
      case PACKAGE_TYPE.ANNUAL: return 1;
      case PACKAGE_TYPE.LIFETIME: return 2;
      default: return 3;
    }
  };
  return [...packages].sort((a, b) => rank(a) - rank(b));
}

/** True when a thrown purchase error was just the user backing out. */
export function wasCancelled(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { userCancelled?: boolean }).userCancelled === true;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type ProState = {
  /** Active `pro` entitlement. */
  isPro: boolean;
  /** Limits derived from `isPro` — what the deck actually enforces. */
  limits: Limits;
  /** Still resolving the first customer-info read. */
  loading: boolean;
  /** SDK came up (key present + native module available). */
  ready: boolean;
  /** Open the paywall, framed for the feature that was blocked. */
  showPaywall: (reason?: PaywallReason) => void;
};

export const ProContext = createContext<ProState>({
  isPro: false,
  limits: FREE_LIMITS,
  loading: false,
  ready: false,
  showPaywall: () => {},
});

export function usePro(): ProState {
  return useContext(ProContext);
}
