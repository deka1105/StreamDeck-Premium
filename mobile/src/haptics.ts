// Thin, fire-and-forget wrapper around expo-haptics so tile presses feel
// physical. Every call is best-effort: haptics are unavailable in Low Power
// Mode, on devices without a Taptic Engine, and on web without permission —
// none of that should ever break an action, so we swallow rejections.
import * as Haptics from "expo-haptics";

/** A crisp tap the instant a tile is pressed (before the action is sent). */
export function tapFeedback() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Success / failure buzz once the host has answered. */
export function resultFeedback(ok: boolean) {
  Haptics.notificationAsync(
    ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
  ).catch(() => {});
}

/** A subtle tick for navigation / toggles (page flips, profile switch, mode toggles). */
export function selectFeedback() {
  Haptics.selectionAsync().catch(() => {});
}
