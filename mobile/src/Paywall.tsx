// The Pro paywall. One sheet, reason-aware headline, dashboard-driven pricing.
//
// The headline changes with *why* it opened (see PAYWALL_COPY) so the ask always
// names the thing the user just reached for. Packages come from RevenueCat's
// current offering, so price and mix are changeable without an app release.
//
// Apple requires Terms of Use and a Privacy Policy to be reachable from any screen
// selling an auto-renewable subscription — both links below must resolve before
// submitting for review.

import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Purchases, { PACKAGE_TYPE, type PurchasesPackage } from "react-native-purchases";

import { selectFeedback, resultFeedback } from "./haptics";
import {
  explainMissingEntitlement,
  fetchOffering,
  hasPro,
  onTestStore,
  PAYWALL_COPY,
  sortPackages,
  wasCancelled,
  type PaywallReason,
} from "./purchases";

// Apple rejects a screen selling an auto-renewable subscription if its
// Terms/Privacy links are dead — guideline 3.1.2(c), and the reason the
// 13 Nov 2026 review failed: every page on deskassist.sdfolio.com was answering
// HTTP 402 DEPLOYMENT_DISABLED because the Vercel project had been switched off.
//
// These now point at GitHub Pages, published straight from site/ by
// .github/workflows/pages.yml on every push to main. That host has no billing
// state to lapse, so the links cannot go dead the way the Vercel ones did.
// Re-verify both return 200 before every submission.
const SITE_BASE = "https://deka1105.github.io/StreamDeck-Premium";

const TERMS_URL = `${SITE_BASE}/terms.html`;
const PRIVACY_URL = `${SITE_BASE}/privacy.html`;

/**
 * Guideline 3.1.2(c) requires the subscription's title, length and price to be on
 * the purchase screen itself. Price and length per tier come from StoreKit and
 * render in the package rows — but those rows disappear whenever the store can't
 * be reached, which is exactly when a reviewer is looking. This block does not
 * disappear, so the terms are stated either way.
 */
const SUBSCRIPTION_TERMS =
  "DeskAssist Pro is an auto-renewing subscription, sold monthly (1 month) or " +
  "yearly (1 year), and also as a one-time Lifetime purchase that never renews. " +
  "Prices for each are shown above in your local currency. Payment is charged to " +
  "your Apple Account at confirmation of purchase. A subscription renews " +
  "automatically for the same length and price unless auto-renew is switched off " +
  "at least 24 hours before the current period ends; the renewal is charged within " +
  "24 hours of that point. Manage or cancel in Settings \u203a Apple Account \u203a " +
  "Subscriptions \u2014 deleting the app does not cancel a subscription.";

/** What Pro actually buys, in the order it matters to a daily user. */
const FEATURES = [
  { icon: "▦", title: "Unlimited profiles", body: "A deck per context — and Auto mode switches as you change apps." },
  { icon: "❯", title: "Unlimited pages", body: "Grow past nine tiles without deleting anything." },
  { icon: "✎", title: "Unlimited snippets", body: "Free keeps three. Pro keeps every one you'll ever retype." },
  { icon: "◈", title: "Image tile faces", body: "Any artwork on any tile, not just emoji." },
];

export function Paywall({
  reason,
  ready,
  onPurchased,
  onClose,
  onDevUnlock,
}: {
  reason: PaywallReason;
  /** SDK is configured — when false we explain rather than show a broken store. */
  ready: boolean;
  onPurchased: () => void;
  onClose: () => void;
  /** Dev builds only: long-press the PRO badge to unlock the gates locally. */
  onDevUnlock?: () => void;
}) {
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  /** Purchase/restore failures only. A failed *price load* is never an error here. */
  const [error, setError] = useState<string | null>(null);
  /** Bumped by Retry to re-run the offering fetch. */
  const [attempt, setAttempt] = useState(0);

  const copy = PAYWALL_COPY[reason];

  useEffect(() => {
    let alive = true;
    // Nothing to fetch without a configured SDK. `packages` stays null and the
    // render picks the "store isn't configured" branch — no setState needed here
    // (`loadingPrices` below already requires `ready`).
    if (!ready) return;
    setPackages(null); // back to the spinner on a retry
    (async () => {
      try {
        const offering = await fetchOffering();
        if (!alive) return;
        const list = sortPackages(offering?.availablePackages ?? []);
        setPackages(list);
        // Preselect annual when present — the tier we actually want chosen.
        const annual = list.find((p) => p.packageType === PACKAGE_TYPE.ANNUAL);
        setSelectedId((annual ?? list[0])?.identifier ?? null);
      } catch (e) {
        // Deliberately *not* shown as an error. A store that cannot be reached,
        // or products that are not on sale yet, is not a broken app — and App
        // Review reads a red SDK string on a purchase screen as a 2.1(b) bug
        // (it did, on 13 Nov 2026). Fall through to the same calm "not available
        // yet" notice an empty offering gets, and keep the detail for dev.
        if (!alive) return;
        if (__DEV__) console.warn("[purchases] couldn't load the offering:", e);
        setPackages([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ready, attempt]);

  const selected = useMemo(
    () => packages?.find((p) => p.identifier === selectedId) ?? null,
    [packages, selectedId],
  );

  async function buy() {
    if (!selected || buying) return;
    selectFeedback();
    setBuying(true);
    setError(null);
    try {
      const { customerInfo } = await Purchases.purchasePackage(selected);
      if (hasPro(customerInfo)) {
        resultFeedback(true);
        onPurchased();
      } else {
        // Purchase succeeded, entitlement didn't arrive — a store-config problem.
        // Dev builds show the full diagnosis inline, because the alternative is
        // hunting for it in a buffered Metro log.
        const detail = explainMissingEntitlement(customerInfo);
        if (__DEV__) console.warn("[purchases]", detail);
        setError(
          __DEV__
            ? `Purchase completed but Pro didn't unlock.\n\n${detail}`
            : "That purchase went through but didn't unlock Pro. Try Restore — if " +
              "that doesn't help, the store's entitlement isn't set up yet.",
        );
      }
    } catch (e) {
      if (!wasCancelled(e)) {
        resultFeedback(false);
        setError(e instanceof Error ? e.message : "The purchase didn't complete.");
      }
    } finally {
      setBuying(false);
    }
  }

  async function restore() {
    if (restoring) return;
    selectFeedback();
    setRestoring(true);
    setError(null);
    try {
      const info = await Purchases.restorePurchases();
      if (hasPro(info)) {
        resultFeedback(true);
        onPurchased();
      } else {
        setError("No previous purchase found on this Apple ID.");
      }
    } catch (e) {
      resultFeedback(false);
      setError(e instanceof Error ? e.message : "Couldn't restore purchases.");
    } finally {
      setRestoring(false);
    }
  }

  const loadingPrices = ready && packages === null;
  const canBuy = !!selected && !buying && !restoring;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.grabRow}>
            <View style={styles.grab} />
            <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.badgeRow}>
              <Text style={styles.eyebrow}>DESKASSIST</Text>
              <Pressable
                style={styles.proBadge}
                onLongPress={onDevUnlock ? () => { resultFeedback(true); onDevUnlock(); onClose(); } : undefined}
                delayLongPress={800}
              >
                <Text style={styles.proBadgeText}>PRO</Text>
              </Pressable>
              {__DEV__ && onTestStore() ? (
                <View style={styles.testBadge}>
                  <Text style={styles.testBadgeText}>TEST STORE</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.subtitle}>{copy.body}</Text>

            <View style={styles.features}>
              {FEATURES.map((f) => (
                <View key={f.title} style={styles.feature}>
                  <Text style={styles.featureIcon}>{f.icon}</Text>
                  <View style={styles.featureText}>
                    <Text style={styles.featureTitle}>{f.title}</Text>
                    <Text style={styles.featureBody}>{f.body}</Text>
                  </View>
                </View>
              ))}
            </View>

            {loadingPrices ? (
              <View style={styles.pricesLoading}>
                <ActivityIndicator color="#38bdf8" />
              </View>
            ) : !ready ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>
                  The store isn’t configured in this build, so Pro can’t be purchased yet. Everything
                  on the free tier keeps working.
                </Text>
              </View>
            ) : packages && packages.length === 0 ? (
              // The store offered nothing — either it answered with an empty
              // offering, or it couldn't be reached at all (both land here on
              // purpose). That is what happens before the in-app purchases are
              // live, and it is not a network fault the reader can fix.
              // "Check your connection" sends them to fix something that isn't
              // broken, and reads to App Review as a purchase flow that fails
              // rather than a product that isn't on sale yet.
              <View style={styles.notice}>
                <Text style={styles.noticeText}>
                  Pro isn’t available for purchase yet. Everything on the free tier keeps
                  working.
                </Text>
                <Pressable
                  onPress={() => {
                    selectFeedback();
                    setAttempt((n) => n + 1);
                  }}
                  hitSlop={8}
                  style={styles.noticeAction}
                >
                  <Text style={styles.noticeActionText}>Check again</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.packages}>
                {packages?.map((p) => {
                  const active = p.identifier === selectedId;
                  const annual = p.packageType === PACKAGE_TYPE.ANNUAL;
                  return (
                    <Pressable
                      key={p.identifier}
                      style={[styles.pkg, active && styles.pkgActive]}
                      onPress={() => {
                        selectFeedback();
                        setSelectedId(p.identifier);
                      }}
                    >
                      <View style={[styles.radio, active && styles.radioActive]}>
                        {active ? <View style={styles.radioDot} /> : null}
                      </View>
                      <View style={styles.pkgText}>
                        <Text style={styles.pkgTitle}>{packageLabel(p)}</Text>
                        {/* Length and price-per-unit: required on the purchase
                            screen by guideline 3.1.2(c), not decoration. */}
                        {packageTerms(p) ? <Text style={styles.pkgNote}>{packageTerms(p)}</Text> : null}
                      </View>
                      {annual ? (
                        <View style={styles.valueBadge}>
                          <Text style={styles.valueBadgeText}>BEST VALUE</Text>
                        </View>
                      ) : null}
                      <Text style={styles.pkgPrice}>{p.product.priceString}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {/* Renders whatever the store did, so the terms are on the screen
                even when no price could be fetched. */}
            <Text style={styles.terms}>{SUBSCRIPTION_TERMS}</Text>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              style={[styles.cta, !canBuy && styles.ctaDisabled]}
              onPress={buy}
              disabled={!canBuy}
            >
              {buying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaText}>{selected ? ctaLabel(selected) : "Unlock Pro"}</Text>
              )}
            </Pressable>

            <View style={styles.links}>
              <Pressable onPress={restore} disabled={restoring} hitSlop={8}>
                <Text style={styles.link}>{restoring ? "Restoring…" : "Restore"}</Text>
              </Pressable>
              <Text style={styles.linkDot}>·</Text>
              <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={8}>
                <Text style={styles.link}>Terms</Text>
              </Pressable>
              <Text style={styles.linkDot}>·</Text>
              <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={8}>
                <Text style={styles.link}>Privacy</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** "Monthly" / "Yearly" / "Lifetime" — falls back to the store's own title. */
function packageLabel(p: PurchasesPackage): string {
  switch (p.packageType) {
    case PACKAGE_TYPE.MONTHLY: return "Monthly";
    case PACKAGE_TYPE.ANNUAL: return "Yearly";
    case PACKAGE_TYPE.LIFETIME: return "Lifetime";
    case PACKAGE_TYPE.WEEKLY: return "Weekly";
    default: return p.product.title || p.identifier;
  }
}

/**
 * ISO-8601 subscription period → "1 month" / "1 year". StoreKit hands these back
 * as "P1M"/"P1Y"; guideline 3.1.2(c) wants the length spelled out next to the
 * price, so an unparsable value returns null and the row simply omits it rather
 * than printing "P1M" at a customer.
 */
export function periodLabel(iso: string | null | undefined): string | null {
  const m = typeof iso === "string" ? /^P(\d+)([DWMY])$/.exec(iso) : null;
  if (!m) return null;
  const n = Number(m[1]);
  const unit = ({ D: "day", W: "week", M: "month", Y: "year" } as const)[m[2] as "D" | "W" | "M" | "Y"];
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * The line under a package title: how long it runs, and the per-month price
 * where that differs from the headline figure (so a yearly tier states its unit
 * price, which 3.1.2(c) asks for "if appropriate").
 */
export function packageTerms(p: PurchasesPackage): string | null {
  if (p.packageType === PACKAGE_TYPE.LIFETIME) return "One-time purchase · never renews";
  const length = periodLabel(p.product.subscriptionPeriod);
  const perMonth =
    p.product.subscriptionPeriod !== "P1M" && p.product.pricePerMonthString
      ? `${p.product.pricePerMonthString}/month`
      : null;
  const parts = [length ? `Auto-renews every ${length}` : null, perMonth].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function ctaLabel(p: PurchasesPackage): string {
  return p.packageType === PACKAGE_TYPE.LIFETIME ? "Unlock Pro forever" : "Start Pro";
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
  // maxWidth keeps the sheet from spanning a full iPad — App Review tests on
  // one (iPad Air 11" on 13 Nov 2026) and a 1000pt-wide bottom sheet reads as a
  // layout fault rather than a design.
  sheet: {
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "92%",
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },

  grabRow: { paddingTop: 10, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  grab: { width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.18)" },
  close: { position: "absolute", right: 14, top: 6, padding: 6 },
  closeText: { color: "#64748b", fontSize: 15, fontWeight: "700" },

  body: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },

  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  eyebrow: { color: "#64748b", fontSize: 11, fontWeight: "700", letterSpacing: 1.6 },
  proBadge: { backgroundColor: "rgba(251,191,36,0.14)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  proBadgeText: { color: "#fbbf24", fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  testBadge: { backgroundColor: "rgba(232,112,95,0.16)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  testBadgeText: { color: "#fb7185", fontSize: 9.5, fontWeight: "800", letterSpacing: 0.8 },

  title: { color: "#f1f5f9", fontSize: 25, fontWeight: "800", letterSpacing: -0.5, lineHeight: 30 },
  subtitle: { color: "#94a3b8", fontSize: 14.5, lineHeight: 21, marginTop: 8 },

  features: { marginTop: 22, gap: 14 },
  feature: { flexDirection: "row", gap: 13, alignItems: "flex-start" },
  featureIcon: { color: "#38bdf8", fontSize: 15, width: 20, textAlign: "center", marginTop: 1 },
  featureText: { flex: 1, gap: 2 },
  featureTitle: { color: "#e2e8f0", fontSize: 14.5, fontWeight: "700" },
  featureBody: { color: "#64748b", fontSize: 12.5, lineHeight: 17 },

  pricesLoading: { paddingVertical: 34, alignItems: "center" },

  notice: { marginTop: 22, backgroundColor: "#1e293b", borderRadius: 12, padding: 14 },
  noticeText: { color: "#94a3b8", fontSize: 13, lineHeight: 19 },
  noticeAction: { marginTop: 10, alignSelf: "flex-start" },
  noticeActionText: { color: "#38bdf8", fontSize: 13, fontWeight: "700" },

  packages: { marginTop: 22, gap: 9 },
  pkg: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1e293b",
    borderWidth: 1.5,
    borderColor: "transparent",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  pkgActive: { borderColor: "#38bdf8", backgroundColor: "rgba(56,189,248,0.08)" },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: "#475569",
    alignItems: "center", justifyContent: "center",
  },
  radioActive: { borderColor: "#38bdf8" },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#38bdf8" },
  pkgText: { flex: 1, gap: 1 },
  pkgTitle: { color: "#e2e8f0", fontSize: 15, fontWeight: "700" },
  pkgNote: { color: "#64748b", fontSize: 11.5 },
  pkgPrice: { color: "#f1f5f9", fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
  valueBadge: { backgroundColor: "rgba(56,189,248,0.16)", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  valueBadgeText: { color: "#7dd3fc", fontSize: 9.5, fontWeight: "800", letterSpacing: 0.7 },

  error: { color: "#fb7185", fontSize: 13, lineHeight: 18, marginTop: 14 },
  terms: { color: "#475569", fontSize: 11.5, lineHeight: 16.5, marginTop: 20 },

  footer: { padding: 20, paddingTop: 14, gap: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  cta: { backgroundColor: "#0284c7", borderRadius: 14, paddingVertical: 15, alignItems: "center", justifyContent: "center", minHeight: 50 },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: "#fff", fontSize: 15.5, fontWeight: "800" },
  links: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  link: { color: "#64748b", fontSize: 12.5, fontWeight: "600" },
  linkDot: { color: "#334155", fontSize: 12.5 },
});
