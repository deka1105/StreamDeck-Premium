// Owns Pro entitlement state for the whole app and hosts the paywall.
//
// Entitlement truth always comes from RevenueCat's CustomerInfo — never from a
// local flag we write ourselves — so a lapsed subscription, a refund, or a
// restore on a second device all land correctly without any logic of our own.
// The SDK's update listener keeps that live while the app is open.
//
// If the SDK can't come up (no key, or Expo Go with no native module) the app
// runs on the free tier and says so on the paywall, rather than crashing.

import { useCallback, useEffect, useMemo, useState } from "react";
import Purchases, { type CustomerInfo } from "react-native-purchases";

import { Paywall } from "./Paywall";
import {
  configurePurchases,
  hasPro,
  limitsFor,
  ProContext,
  type PaywallReason,
  type ProState,
} from "./purchases";

export function ProProvider({ children }: { children: React.ReactNode }) {
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [paywall, setPaywall] = useState<PaywallReason | null>(null);
  // Dev-only switch for exercising the gates without a sandbox purchase.
  const [devPro, setDevPro] = useState(false);

  useEffect(() => {
    let alive = true;
    // Only true once the listener is actually attached. Without this, unmounting
    // after a failed configure (no key, or Expo Go with no native module) would
    // call into a missing native module and throw during teardown.
    let listening = false;

    const onUpdate = (info: CustomerInfo) => {
      if (alive) setIsPro(hasPro(info));
    };

    (async () => {
      const ok = await configurePurchases();
      if (!alive) return;
      setReady(ok);
      if (!ok) {
        setLoading(false);
        return;
      }
      Purchases.addCustomerInfoUpdateListener(onUpdate);
      listening = true;
      try {
        const info = await Purchases.getCustomerInfo();
        if (alive) setIsPro(hasPro(info));
      } catch {
        // Offline on first launch: stay free until the listener corrects us.
        // A cached entitlement arrives via onUpdate as soon as the SDK syncs.
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      if (listening) Purchases.removeCustomerInfoUpdateListener(onUpdate);
    };
  }, []);

  const showPaywall = useCallback((reason: PaywallReason = "generic") => {
    setPaywall(reason);
  }, []);

  const effectivePro = isPro || (__DEV__ && devPro);

  const value = useMemo<ProState>(
    () => ({
      isPro: effectivePro,
      limits: limitsFor(effectivePro),
      loading,
      ready,
      showPaywall,
    }),
    [effectivePro, loading, ready, showPaywall],
  );

  return (
    <ProContext.Provider value={value}>
      {children}
      {paywall ? (
        <Paywall
          reason={paywall}
          ready={ready}
          onPurchased={() => {
            // The listener sets isPro; closing here just returns the user to the
            // action they were blocked on.
            setPaywall(null);
          }}
          onClose={() => setPaywall(null)}
          onDevUnlock={__DEV__ ? () => setDevPro(true) : undefined}
        />
      ) : null}
    </ProContext.Provider>
  );
}
