// Page navigation rules. Pure functions (unit-tested).

export function visiblePages(layout) {
  return (layout?.pages ?? []).filter((p) => !p.hidden);
}

export function homeIndex(layout) {
  const pages = visiblePages(layout);
  const i = pages.findIndex((p) => p.id === layout?.home);
  return i >= 0 ? i : 0;
}

/** After a layout reload: stay on the same page if it still exists, else go home. */
export function indexAfterReload(layout, currentId) {
  const pages = visiblePages(layout);
  const i = pages.findIndex((p) => p.id === currentId);
  return i >= 0 ? i : homeIndex(layout);
}

/** Wrap-free step: next/prev clamp at the ends. */
export function step(index, delta, count) {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, index + delta));
}

/**
 * Seconds of inactivity after which the panel returns home from `page`, or
 * null if it never should (already home, page set to stay, or idle disabled).
 */
export function idleReturnSec(layout, page) {
  if (!page || page.id === (visiblePages(layout)[homeIndex(layout)]?.id)) return null;
  const sec = page.staySec ?? layout?.settings?.idleSec ?? 300;
  return sec > 0 ? sec : null;
}
