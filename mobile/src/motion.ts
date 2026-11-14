// Motion primitives for the phone app — all built on React Native's core
// Animated / LayoutAnimation, so they add no native dependency and run in the
// already-shipped dev client and EAS builds unchanged.
//
// Every entrance/loop here checks the system Reduce Motion setting; feedback
// that tracks the finger directly (press scale, drag) is exempt, per the
// platform HIG, because it never moves on its own.

import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  Pressable,
  UIManager,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

// LayoutAnimation needs an explicit opt-in on the old Android architecture;
// on the new architecture the call doesn't exist and isn't needed.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ------------------------------------------------------------------ */
/* Reduce Motion                                                      */
/* ------------------------------------------------------------------ */

const ReduceMotionContext = createContext(false);

/** Tracks the OS "Reduce Motion" accessibility setting app-wide. */
export function MotionProvider({ children }: { children: ReactNode }) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduced(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return createElement(ReduceMotionContext.Provider, { value: reduced }, children);
}

export function useReduceMotion(): boolean {
  return useContext(ReduceMotionContext);
}

/* ------------------------------------------------------------------ */
/* Layout transitions                                                 */
/* ------------------------------------------------------------------ */

/**
 * Animate the next layout change (view switches, tiles added/removed, pills
 * appearing). Call immediately before the state update that changes layout.
 */
export function animateLayout(reduced = false) {
  if (reduced) return;
  LayoutAnimation.configureNext({
    duration: 240,
    create: { type: "easeInEaseOut", property: "opacity" },
    update: { type: "spring", springDamping: 0.85 },
    delete: { type: "easeInEaseOut", property: "opacity", duration: 120 },
  });
}

/* ------------------------------------------------------------------ */
/* Press feedback                                                     */
/* ------------------------------------------------------------------ */

type PressableScaleProps = PressableProps & {
  /** Scale while pressed (default 0.95). */
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/**
 * A Pressable that springs down while pressed and back on release — the one
 * press affordance used across the app so everything feels like the same
 * material. Direct-manipulation feedback, so it ignores Reduce Motion.
 */
export function PressableScale({ scaleTo = 0.95, style, children, disabled, ...rest }: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.spring(scale, { toValue: v, speed: 40, bounciness: 5, useNativeDriver: true }).start();
  return createElement(
    Pressable,
    {
      ...rest,
      disabled,
      onPressIn: (e) => {
        if (!disabled) to(scaleTo);
        rest.onPressIn?.(e);
      },
      onPressOut: (e) => {
        to(1);
        rest.onPressOut?.(e);
      },
    },
    createElement(Animated.View, { style: [style, { transform: [{ scale }] }] }, children),
  );
}

/* ------------------------------------------------------------------ */
/* Entrances                                                          */
/* ------------------------------------------------------------------ */

/**
 * Fade-and-rise entrance on mount. `delay` staggers siblings (pass index*30).
 * Under Reduce Motion the content simply appears.
 */
export function Reveal({
  delay = 0,
  distance = 12,
  style,
  children,
}: {
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const reduced = useReduceMotion();
  const t = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      t.setValue(1);
      return;
    }
    const anim = Animated.timing(t, {
      toValue: 1,
      duration: 320,
      delay,
      easing: Easing.bezier(0.23, 1, 0.32, 1), // same ease-out the site uses
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [t, delay, reduced]);
  return createElement(
    Animated.View,
    {
      style: [
        style,
        {
          opacity: t,
          transform: [
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) },
            { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
          ],
        },
      ],
    },
    children,
  );
}

/* ------------------------------------------------------------------ */
/* Loops                                                              */
/* ------------------------------------------------------------------ */

/**
 * iOS-home-screen-style wiggle for edit mode. Returns a transform you can
 * spread into a style; identity when inactive or Reduce Motion is on.
 * `seed` desynchronises neighbouring tiles.
 */
export function useWiggle(active: boolean, seed = 0) {
  const reduced = useReduceMotion();
  const t = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (!active || reduced) {
      t.setValue(0.5);
      return;
    }
    const dur = 130 + (seed % 3) * 14; // slight per-tile phase difference
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: dur * 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0.5, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      t.setValue(0.5);
    };
  }, [active, reduced, seed, t]);
  const range = seed % 2 === 0 ? ["-1.1deg", "1.1deg"] : ["1.1deg", "-1.1deg"];
  return { rotate: t.interpolate({ inputRange: [0, 1], outputRange: range }) };
}

/** Gentle opacity pulse for live indicators (connection dot, frontmost dot). */
export function usePulse(active: boolean) {
  const reduced = useReduceMotion();
  const t = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active || reduced) {
      t.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 0.35, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      t.setValue(1);
    };
  }, [active, reduced, t]);
  return t;
}

/** Stable per-id small integer, for wiggle phase seeds. */
export function seedFor(id: string): number {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n + id.charCodeAt(i)) % 97;
  return n;
}

/** Spring preset used for drag-return and dot emphasis. */
export const springBack = (v: Animated.Value | Animated.ValueXY, toValue: number | { x: number; y: number }) =>
  Animated.spring(v as Animated.Value, {
    toValue: toValue as number,
    speed: 24,
    bounciness: 7,
    useNativeDriver: false,
  });
