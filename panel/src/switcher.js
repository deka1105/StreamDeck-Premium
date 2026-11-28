import { t } from "./i18n.js";
// Calm page switching (rules and webhooks) and notification toasts.
//
// A request to switch never yanks the page away: it waits while you're using
// the panel, keeps a minimum gap between automatic switches, lets the higher
// priority go first, counts down with Stay / Go now, and — for "only while it
// lasts" rules — goes back to where you were when the rule ends.

/** Should a pending switch start now? Pure (unit-tested). */
export function ready(p, { now, lastTouch, lastSwitch, settings }) {
  if (!p) return false;
  if (now - lastTouch < (settings.waitAfterTouchSec ?? 8) * 1000) return false;
  if (p.source === "rule" && now - lastSwitch < (settings.minGapSec ?? 20) * 1000) return false;
  return true;
}

/** Keep the more important request (higher priority; newer on a tie). Pure. */
export const pick = (a, b) => (!a ? b : !b ? a : b.priority >= a.priority ? b : a);

export function createSwitcher({ gotoId, currentPageId, pageExists, getSettings, lastTouch, overlay, toastBox, vibrate = () => {}, now = () => Date.now() }) {
  let pending = null;
  let counting = null; // { item, endsAt, timer }
  let lastSwitch = 0;
  let held = null; // { id, page, prev, at }

  const clearCountdown = () => {
    if (counting) clearInterval(counting.timer);
    counting = null;
    overlay.hidden = true;
  };

  function doSwitch(item) {
    clearCountdown();
    pending = null;
    const prev = currentPageId();
    lastSwitch = now();
    if (item.whileLasts) held = { id: item.id, page: item.page, prev, at: now() };
    gotoId(item.page);
  }

  function startCountdown(item) {
    const secs = Math.max(0, item.countdown ?? 3);
    if (!secs) return doSwitch(item);
    overlay.innerHTML = `<div class="sw-card"><div class="sw-why"></div><div class="sw-text"></div><div class="sw-actions"><button class="tbtn sw-stay">${t("switch.stay")}</button><button class="tbtn primary sw-go">${t("switch.go")}</button></div></div>`;
    overlay.querySelector(".sw-why").textContent = item.name ? `${item.name}` : "Switching page";
    const text = overlay.querySelector(".sw-text");
    overlay.querySelector(".sw-stay").onclick = () => {
      pending = null;
      clearCountdown();
    };
    overlay.querySelector(".sw-go").onclick = () => doSwitch(item);
    overlay.hidden = false;
    const endsAt = now() + secs * 1000;
    const update = () => {
      const left = Math.ceil((endsAt - now()) / 1000);
      text.textContent = t("switch.to", { page: item.pageName ?? item.page, n: left });
      if (left <= 0) doSwitch(item);
    };
    counting = { item, endsAt, timer: setInterval(update, 250) };
    update();
  }

  // Touches on the countdown card (Stay / Go now) don't count as "using the panel".
  let cardTouch = 0;
  overlay.addEventListener("pointerdown", () => (cardTouch = now()));

  setInterval(() => {
    if (counting) {
      // A touch outside the card postpones the switch until you're done.
      if (now() - lastTouch() < 400 && lastTouch() - cardTouch > 50) {
        const item = counting.item;
        clearCountdown();
        pending = pick(pending, item);
      }
      return;
    }
    if (ready(pending, { now: now(), lastTouch: lastTouch(), lastSwitch, settings: getSettings() })) startCountdown(pending);
  }, 300);

  return {
    request(item) {
      if (!pageExists(item.page)) return;
      if (currentPageId() === item.page) {
        if (item.whileLasts && !held) held = { id: item.id, page: item.page, prev: null, at: now() };
        return;
      }
      if (counting && item.priority > counting.item.priority) clearCountdown();
      if (counting) return void (pending = pick(pending, item));
      pending = pick(pending, item);
    },
    /** A "while it lasts" rule ended: drop its request, and go back if we're still on its page. */
    end(id) {
      if (pending?.id === id) pending = null;
      if (counting?.item.id === id) clearCountdown();
      if (held?.id === id) {
        if (currentPageId() === held.page && held.prev && pageExists(held.prev)) gotoId(held.prev);
        held = null;
      }
    },
    /** While a rule holds its page, the panel doesn't go home when idle (up to the hold limit). */
    holding() {
      const max = (getSettings().holdMaxMin ?? 30) * 60_000;
      return !!held && currentPageId() === held.page && (max === 0 || now() - held.at < max);
    },
    toast(n) {
      vibrate(n.vibrate ? [120, 60, 120] : 0);
      const t = document.createElement("div");
      t.className = "toast";
      t.dataset.level = n.level ?? "info";
      t.innerHTML = `<b></b><span></span>`;
      t.querySelector("b").textContent = n.title || "";
      t.querySelector("span").textContent = n.text || "";
      t.addEventListener("click", () => t.remove());
      toastBox.append(t);
      while (toastBox.children.length > 3) toastBox.firstChild.remove();
      setTimeout(() => t.classList.add("out"), (n.seconds ?? 6) * 1000);
      setTimeout(() => t.remove(), (n.seconds ?? 6) * 1000 + 400);
    },
  };
}
