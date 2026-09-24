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
  fetchOffering,
  hasPro,
  PAYWALL_COPY,
  sortPackages,
  wasCancelled,
  type PaywallReason,
} from "./purchases";

const TERMS_URL = "https://deka1105.github.io/streamPhoneDeck/terms.html";
const PRIVACY_URL = "https://deka1105.github.io/streamPhoneDeck/privacy.html";

/** What Pro actually buys, in the order it matters to a daily user. */
const FEATURES = [
  { icon: "▦", title: "Unlimited profiles", body: "A deck per context — and Auto mode switches as you change apps." },
  { icon: "❯", title: "Unlimited pages", body: "Grow past nine tiles without deleting anything." },
  { icon: "✎", title: "Snippet library", body: "Save text once, type it into your Mac with one tap." },
  { icon: "◈", title: "Image tile faces", body: "Any artwork on any tile, not just emoji." },
];

export function Paywall({
  reason,
  ready,
  onPurchased,
  onClose,
}: {
  reason: PaywallReason;
  /** SDK is configured — when false we explain rather than show a broken store. */
  ready: boolean;
  onPurchased: () => void;
  onClose: () => void;
}) {
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = PAYWALL_COPY[reason];

  useEffect(() => {
    let alive = true;
    if (!ready) {
      setPackages([]);
      return;
    }
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
        if (!alive) return;
        setPackages([]);
        setError(e instanceof Error ? e.message : "Couldn't load pricing.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [ready]);

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
        setError("That purchase went through but didn't unlock Pro. Try Restore, or contact support.");
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
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
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
              <View style={styles.notice}>
                <Text style={styles.noticeText}>
                  No pricing is available right now. Check your connection and try again.
                </Text>
              </View>
            ) : (
              <View style={styles.packages}>
                {packages?.map((p) => {
                  const active = p.identifier === selectedId;
                  const annual = p.packageType === PACKAGE_TYPE.ANNUAL;
                  const lifetime = p.packageType === PACKAGE_TYPE.LIFETIME;
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
                        {lifetime ? <Text style={styles.pkgNote}>Pay once, yours forever</Text> : null}
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
    case "MONTHLY": return "Monthly";
    case "ANNUAL": return "Yearly";
    case "LIFETIME": return "Lifetime";
    case "WEEKLY": return "Weekly";
    default: return p.product.title || p.identifier;
  }
}

function ctaLabel(p: PurchasesPackage): string {
  return p.packageType === "LIFETIME" ? "Unlock Pro forever" : "Start Pro";
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#0f172a", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%" },

  grabRow: { paddingTop: 10, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  grab: { width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.18)" },
  close: { position: "absolute", right: 14, top: 6, padding: 6 },
  closeText: { color: "#64748b", fontSize: 15, fontWeight: "700" },

  body: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },

  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  eyebrow: { color: "#64748b", fontSize: 11, fontWeight: "700", letterSpacing: 1.6 },
  proBadge: { backgroundColor: "rgba(251,191,36,0.14)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  proBadgeText: { color: "#fbbf24", fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },

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

  footer: { padding: 20, paddingTop: 14, gap: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  cta: { backgroundColor: "#0284c7", borderRadius: 14, paddingVertical: 15, alignItems: "center", justifyContent: "center", minHeight: 50 },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: "#fff", fontSize: 15.5, fontWeight: "800" },
  links: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  link: { color: "#64748b", fontSize: 12.5, fontWeight: "600" },
  linkDot: { color: "#334155", fontSize: 12.5 },
});
