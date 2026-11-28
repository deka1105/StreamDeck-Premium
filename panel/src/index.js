// Panel entry point: loads the layout from the computer (or the demo), renders
// the current page, and handles navigation — swipe, page dots, the overview,
// keyboard arrows, and returning home when idle.

import { t, setLocale } from "./i18n.js";
import { createLook } from "./look.js";
import { createDisplay } from "./display.js";

const DEFAULT_DISPLAY = { nav: "dots", badges: true, oledShift: false, dimAfterMin: 0, dimLevel: 0.5, followPcSleep: false, night: { mode: "off", from: "22:30", to: "07:00", style: "clock", brightness: 0.25 } };
import { createPromptCard } from "./widgets/ai.js";
import { createBridge } from "./bridge.js";
import { createStore } from "./store.js";
import { mountPage } from "./app.js";
import { visiblePages, homeIndex, indexAfterReload, step, idleReturnSec } from "./nav.js";
import { createAlarms } from "./alarms.js";
import { createSwitcher } from "./switcher.js";

const LONG_PRESS_MS = 550;
const SWIPE_MIN_PX = 50;

function orientation() {
  return window.innerHeight > window.innerWidth ? "portrait" : "landscape";
}

function boot() {
  const pagesEl = document.getElementById("pages");
  const statusEl = document.getElementById("status");
  const dotsEl = document.getElementById("dots");
  const overviewEl = document.getElementById("overview");
  const bannerEl = document.getElementById("banner");

  const bridge = createBridge();
  const store = createStore();
  // Inside the phone app, diagnostics go to the app's dev log (ignored in release).
  const debug = (msg) => {
    if (bridge.kind === "native") window.ReactNativeWebView.postMessage(JSON.stringify({ t: "debug", msg: String(msg).slice(0, 500) }));
  };
  window.addEventListener("error", (e) => debug(`error: ${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => debug(`unhandled: ${e.reason?.message ?? e.reason}`));
  const env = { store, bridge, goto: (id) => gotoId(id) };
  const look = createLook();
  const displayCtl = createDisplay({ store, onNeedsChange: () => bridge.setNeeds(pageNeeds()) });
  document.body.dataset.bridge = bridge.kind;
  if (bridge.demo) {
    bannerEl.hidden = false;
    bannerEl.textContent = t("banner.demo");
  }

  let layout = null;
  let index = 0;
  const alarms = createAlarms({
    store,
    bridge,
    overlay: document.getElementById("alarm"),
    badge: document.getElementById("timerBadge"),
    currentPageId: () => pages()[index]?.id ?? null,
    gotoId: (id) => gotoId(id),
    vibrate: () => navigator.vibrate?.([200, 100, 200, 100, 400]),
  });
  let current = null; // { el, needs, destroy, pageId }
  let lastTouch = Date.now();

  const pages = () => visiblePages(layout);
  const CAL_TYPES = new Set(["agenda", "nextup", "calendar"]);
  const hasCalendar = (p) => p.widgets.some((w) => CAL_TYPES.has(w.type));
  // The current page's data, plus calendar data if any page shows a calendar
  // (its dot marks "still an event today" even while you're elsewhere).
  const pageNeeds = () => [...new Set([...(current?.needs ?? []), ...(pages().some(hasCalendar) ? ["calendar"] : []), "alerts", ...displayCtl.needs()])];

  // ---- rendering -----------------------------------------------------------

  function renderDots() {
    const list = pages();
    dotsEl.innerHTML = "";
    dotsEl.hidden = list.length < 2;
    list.forEach((p, i) => {
      const b = document.createElement("button");
      b.className = "dot";
      b.setAttribute("aria-label", p.name);
      const nm = document.createElement("span");
      nm.className = "dot-name";
      nm.textContent = p.name;
      b.appendChild(nm);
      if (i === index) b.setAttribute("aria-current", "page");
      if (hasCalendar(p)) {
        const now = Date.now();
        const endOfDay = new Date(new Date().toDateString()).getTime() + 86400_000;
        const next = (store.get("calendar")?.events ?? []).find((e) => !e.allDay && e.end > now && e.start < endOfDay);
        if (next) {
          b.dataset.badge = "1";
          b.style.setProperty("--badge", next.color ?? "#38bdf8");
          b.setAttribute("aria-label", `${p.name} — still an event today`);
        }
      }
      b.addEventListener("click", () => go(i));
      dotsEl.appendChild(b);
    });
  }

  function render(direction = 0) {
    const list = pages();
    const page = list[index];
    const old = current;
    const holder = document.createElement("div");
    holder.className = "page";
    if (direction) holder.style.transform = `translateX(${direction > 0 ? 100 : -100}%)`;
    pagesEl.appendChild(holder);
    look.apply(layout?.look, page?.look);
    displayCtl.apply({ ...DEFAULT_DISPLAY, ...(layout?.display ?? {}), night: { ...DEFAULT_DISPLAY.night, ...(layout?.display?.night ?? {}) } });
    if (page) {
      current = { ...mountPage(holder, page, env, orientation()), holder, pageId: page.id };
    } else {
      holder.innerHTML = `<div class="empty">No pages yet. Add some in the editor on your computer.</div>`;
      current = { needs: [], destroy: () => {}, holder, pageId: null };
    }
    bridge.setNeeds(pageNeeds());
    if (old) {
      if (direction) {
        old.holder.style.transform = `translateX(${direction > 0 ? -100 : 100}%)`;
        requestAnimationFrame(() => (holder.style.transform = "translateX(0)"));
        setTimeout(() => {
          old.destroy();
          old.holder.remove();
        }, 320);
      } else {
        old.destroy();
        old.holder.remove();
      }
    }
    document.body.dataset.page = page?.id ?? "";
    renderDots();
    alarms.updateBadge();
    requestAnimationFrame(() => {
      const g = holder.querySelector(".page-grid")?.getBoundingClientRect();
      debug(`render page=${page?.id} of ${list.length} viewport=${innerWidth}x${innerHeight} grid=${g ? `${Math.round(g.width)}x${Math.round(g.height)}` : "none"} widgets=${page?.widgets?.length ?? 0}`);
    });
  }

  function go(i, { animate = true } = {}) {
    const list = pages();
    const next = step(i, 0, list.length);
    if (!list.length || next === index) return;
    const dir = next > index ? 1 : -1;
    index = next;
    render(animate ? dir : 0);
  }

  function gotoId(id) {
    const i = pages().findIndex((p) => p.id === id);
    if (i >= 0) go(i);
  }

  // ---- layout + data ---------------------------------------------------------

  // Editor live preview: the layout comes from the editor window (unsaved
  // edits), not from the saved config; data still comes from the computer.
  const preview = /[?&]preview=1\b/.test(location.search);
  if (preview) {
    document.body.dataset.preview = "1";
    window.addEventListener("message", (e) => {
      if (e.origin !== location.origin || e.data?.type !== "deskassist-preview") return;
      const keepId = layout ? pages()[index]?.id : null;
      layout = e.data.layout;
      const want = e.data.pageId ?? keepId;
      index = want ? indexAfterReload(layout, want) : homeIndex(layout);
      render(0);
      alarms.watch(layout);
    });
    window.parent?.postMessage({ type: "deskassist-preview-ready" }, location.origin);
  }

  async function loadLayout() {
    if (preview) return;
    let next;
    try {
      next = await bridge.request("panel.layout");
    } catch (err) {
      // The computer didn't answer: keep what we have and try again on resync.
      debug(`panel.layout failed: ${err.message}`);
      if (!layout) pagesEl.innerHTML = `<div class="empty">${t("status.waiting")}</div>`;
      return;
    }
    // Render errors are bugs: let them surface (console / dev log) instead of
    // being mistaken for "computer offline".
    const keepId = layout ? pages()[index]?.id : null;
    layout = next;
    setLocale(layout?.settings?.language ?? "auto");
    index = keepId ? indexAfterReload(layout, keepId) : homeIndex(layout);
    render(0);
    alarms.watch(layout);
  }

  const prompts = createPromptCard(document.getElementById("prompts"), bridge);
  const switcher = createSwitcher({
    gotoId: (id) => gotoId(id),
    currentPageId: () => pages()[index]?.id ?? null,
    pageExists: (id) => pages().some((p) => p.id === id),
    getSettings: () => layout?.settings?.pageSwitch ?? {},
    lastTouch: () => lastTouch,
    overlay: document.getElementById("switch"),
    toastBox: document.getElementById("toasts"),
    vibrate: (p) => p && navigator.vibrate?.(p),
  });
  /** A page id, a 1-based number, or next / prev. */
  const resolvePage = (ref) => {
    const list = pages();
    if (ref === "next") return list[step(index, 1, list.length)]?.id;
    if (ref === "prev") return list[step(index, -1, list.length)]?.id;
    if (/^\d+$/.test(ref)) return list[Number(ref) - 1]?.id;
    return ref;
  };
  const pageName = (id) => pages().find((p) => p.id === id)?.name ?? id;

  bridge.on("event", (e) => {
    if (e.type === "notify" && e.data) {
      switcher.toast(e.data);
      if (e.data.page) switcher.request({ source: "goto", id: `n:${e.data.id}`, page: resolvePage(e.data.page), pageName: pageName(resolvePage(e.data.page)), countdown: 3, priority: 4, name: e.data.title });
      if (e.data.wake) document.body.dispatchEvent(new CustomEvent("deskassist-wake"));
    } else if (e.type === "goto" && e.data?.page) {
      const page = resolvePage(e.data.page);
      switcher.request({ source: "goto", id: `g:${Date.now()}`, page, pageName: pageName(page), countdown: e.data.countdown ?? 3, priority: 6 });
    } else if (e.type === "rule" && e.data?.page) {
      switcher.request({ source: "rule", id: e.data.id, page: e.data.page, pageName: pageName(e.data.page), countdown: e.data.countdown, priority: e.data.priority, whileLasts: e.data.whileLasts, name: e.data.name });
    } else if (e.type === "rule_end" && e.data?.id) {
      switcher.end(e.data.id);
    } else if (e.type === "refresh") {
      if (e.data?.reload) location.reload();
      else loadLayout();
    } else if (e.type === "prompt" && e.data?.id) {
      prompts.show(e.data);
    } else if (e.type === "prompt_done" && e.data?.id) {
      prompts.done(e.data.id);
    } else if (e.type === "night") {
      document.body.dispatchEvent(new CustomEvent("deskassist-night", { detail: e.data }));
    } else if (e.type === "phone") {
      // From the Android app: volume keys flip pages, a hand near the phone wakes it.
      const a = e.data?.action;
      if (a === "next" || a === "prev") {
        document.body.dispatchEvent(new CustomEvent("deskassist-wake"));
        go(step(index, a === "next" ? 1 : -1, pages().length));
      } else if (a === "wake") document.body.dispatchEvent(new CustomEvent("deskassist-wake"));
    }
  });

  bridge.on("event", (e) => {
    if (e.type === "data" && e.data?.kind) {
      store.set(e.data.kind, e.data.value);
      if (e.data.kind === "calendar") renderDots();
      if (e.data.kind === "alerts") prompts.sync(e.data.value?.prompts);
    }
    else if (e.type === "state" && e.data?.key) store.set(`state:${e.data.key}`, e.data.value);
    else if (e.type === "layout" && e.data?.rev !== layout?.rev) loadLayout();

  });
  bridge.on("status", ({ online, detail }) => {
    statusEl.dataset.online = online ? "1" : "0";
    statusEl.title = online ? t("status.connected") : `${t("status.offline")}${detail ? `: ${detail}` : ""}`;
  });
  bridge.on("resync", async () => {
    await loadLayout();
    try {
      const snap = await bridge.request("panel.snapshot", { kinds: current?.needs ?? [] });
      for (const [kind, value] of Object.entries(snap?.data ?? {})) store.set(kind, value);
    } catch {
      /* the next data event fills it in */
    }
  });

  // ---- swipe ---------------------------------------------------------------

  let drag = null;
  pagesEl.addEventListener("pointerdown", (e) => {
    if (e.target.closest("[data-no-swipe]")) return;
    drag = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, active: false };
  });
  pagesEl.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id || !current) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      drag.active = true;
      pagesEl.setPointerCapture(e.pointerId);
      current.holder.classList.add("dragging");
    }
    const list = pages();
    const atEdge = (dx > 0 && index === 0) || (dx < 0 && index === list.length - 1);
    current.holder.style.transform = `translateX(${atEdge ? dx / 4 : dx}px)`;
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.active || !current) return;
    current.holder.classList.remove("dragging");
    const dx = e.clientX - d.x;
    const v = Math.abs(dx) / Math.max(1, performance.now() - d.t);
    const list = pages();
    const target = Math.abs(dx) > SWIPE_MIN_PX || v > 0.5 ? step(index, dx < 0 ? 1 : -1, list.length) : index;
    if (target !== index) go(target);
    else current.holder.style.transform = "translateX(0)";
  };
  pagesEl.addEventListener("pointerup", endDrag);
  pagesEl.addEventListener("pointercancel", endDrag);

  // ---- overview (long-press the dots or an empty spot) -----------------------

  function openOverview() {
    const list = pages();
    overviewEl.innerHTML = `<div class="ov-title">Pages</div><div class="ov-grid"></div>`;
    const grid = overviewEl.querySelector(".ov-grid");
    list.forEach((p, i) => {
      const card = document.createElement("button");
      card.className = "ov-card";
      if (i === index) card.setAttribute("aria-current", "page");
      card.innerHTML = `<span class="ov-name"></span><span class="ov-meta"></span>`;
      card.querySelector(".ov-name").textContent = p.name;
      card.querySelector(".ov-meta").textContent = `${p.widgets.length} widget${p.widgets.length === 1 ? "" : "s"}${p.id === layout?.home ? " · home" : ""}`;
      card.addEventListener("click", () => {
        closeOverview();
        go(i);
      });
      grid.appendChild(card);
    });
    overviewEl.hidden = false;
  }
  function closeOverview() {
    overviewEl.hidden = true;
  }
  overviewEl.addEventListener("click", (e) => {
    if (e.target === overviewEl) closeOverview();
  });

  let pressTimer = null;
  const startPress = (e) => {
    const onEmpty = e.target === pagesEl || e.target.classList?.contains("page") || e.target.classList?.contains("page-grid");
    if (!onEmpty && !e.target.closest("#dots")) return;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      drag = null;
      openOverview();
    }, LONG_PRESS_MS);
  };
  const cancelPress = () => clearTimeout(pressTimer);
  for (const el of [pagesEl, dotsEl]) {
    el.addEventListener("pointerdown", startPress);
    el.addEventListener("pointerup", cancelPress);
    el.addEventListener("pointercancel", cancelPress);
    el.addEventListener("pointermove", (e) => {
      if (drag?.active) cancelPress();
    });
  }

  // ---- keyboard (browser panel) ----------------------------------------------

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") go(index + 1);
    else if (e.key === "ArrowLeft") go(index - 1);
    else if (e.key === "Escape") closeOverview();
    else if (e.key === "Home") go(homeIndex(layout));
  });

  // ---- idle return home --------------------------------------------------------

  const touched = () => (lastTouch = Date.now());
  for (const ev of ["pointerdown", "keydown", "wheel"]) window.addEventListener(ev, touched, { passive: true });
  setInterval(() => {
    if (!layout || !overviewEl.hidden || preview || switcher.holding()) return;
    const sec = idleReturnSec(layout, pages()[index]);
    if (sec !== null && Date.now() - lastTouch >= sec * 1000) {
      go(homeIndex(layout));
      lastTouch = Date.now();
    }
  }, 1000);

  // ---- orientation ---------------------------------------------------------------

  let currentOrientation = orientation();
  window.addEventListener("resize", () => {
    const o = orientation();
    if (o !== currentOrientation) {
      currentOrientation = o;
      if (layout) render(0);
    }
  });

  // For tests and the editor preview.
  window.__panel = {
    get index() {
      return index;
    },
    get pageId() {
      return pages()[index]?.id ?? null;
    },
    go,
    gotoId,
    display: displayCtl,
    openOverview,
  };
}

boot();
