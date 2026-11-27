// Panel-level alarms for timer-like widgets (timer, pomodoro). Widgets only
// exist while their page is shown, so the panel itself watches every alarm
// widget in the layout, raises the full-screen "Time's up" card on whichever
// page you're on, and shows a running timer's time left above the page dots.

import { remaining, fmtClock } from "./widgets/timers.js";

const ALARM_TYPES = new Set(["timer", "pomodoro"]);

/** Should a scheduled alarm be cancelled by this new state? Pure (unit-tested). */
export function cancels(scheduledEndAt, next, now) {
  if (!scheduledEndAt) return false;
  if (next?.running && next.endAt === scheduledEndAt) return false;
  // Changed well before it was due → the user paused, reset or restarted it.
  return now < scheduledEndAt - 500;
}

export function createAlarms({ store, bridge, overlay, badge, currentPageId, gotoId, vibrate = () => {} }) {
  const watched = new Map(); // key -> { pageId, widget, timeout, endAt, off }
  let badgeTimer = null;

  function fire(w, endAt) {
    if (Date.now() - endAt > 60_000) return; // expired long ago (no panel was open): don't shout now
    vibrate();
    const title = w.widget.type === "pomodoro" ? "Time for the next round" : w.widget.options?.label || "Time's up";
    overlay.innerHTML = `<div class="alarm-card" role="alertdialog" aria-live="assertive"><div class="alarm-icon">⏰</div><div class="alarm-title"></div><div class="alarm-sub muted"></div><div class="alarm-actions"><button class="tbtn primary alarm-ok">OK</button><button class="tbtn alarm-go">Show</button></div></div>`;
    overlay.querySelector(".alarm-title").textContent = title;
    overlay.querySelector(".alarm-sub").textContent = `Ended at ${new Date(endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    overlay.querySelector(".alarm-ok").onclick = () => (overlay.hidden = true);
    overlay.querySelector(".alarm-go").onclick = () => {
      overlay.hidden = true;
      gotoId(w.pageId);
    };
    overlay.hidden = false;
  }

  function onState(key, w, st) {
    if (cancels(w.endAt, st, Date.now())) {
      clearTimeout(w.timeout);
      w.endAt = null;
    }
    if (st?.running && st.endAt && st.endAt !== w.endAt) {
      clearTimeout(w.timeout);
      w.endAt = st.endAt;
      w.timeout = setTimeout(() => fire(w, st.endAt), Math.max(0, st.endAt - Date.now()));
    }
    w.state = st;
    updateBadge();
  }

  function updateBadge() {
    const here = currentPageId();
    const running = [...watched.values()].filter((w) => w.state?.running && w.state.endAt > Date.now() && w.pageId !== here);
    if (!running.length) {
      badge.hidden = true;
      return;
    }
    const soonest = running.sort((a, b) => a.state.endAt - b.state.endAt)[0];
    badge.hidden = false;
    badge.textContent = `⏱ ${fmtClock(remaining(soonest.state))}`;
    badge.onclick = () => gotoId(soonest.pageId);
  }

  return {
    /** (Re)scan the layout for alarm widgets. */
    watch(layout) {
      const keep = new Set();
      for (const page of layout?.pages ?? [])
        for (const widget of page.widgets ?? []) {
          if (!ALARM_TYPES.has(widget.type)) continue;
          const key = `${page.id}:${widget.id}`;
          keep.add(key);
          if (watched.has(key)) continue;
          const w = { pageId: page.id, widget, timeout: null, endAt: null, state: null };
          w.off = store.on(`state:${key}`, (st) => onState(key, w, st));
          watched.set(key, w);
          bridge.request("state.get", { key }).then((r) => store.set(`state:${key}`, r?.value ?? null), () => {});
        }
      for (const [key, w] of watched)
        if (!keep.has(key)) {
          clearTimeout(w.timeout);
          w.off();
          watched.delete(key);
        }
      clearInterval(badgeTimer);
      badgeTimer = setInterval(updateBadge, 1000);
    },
    updateBadge,
  };
}
