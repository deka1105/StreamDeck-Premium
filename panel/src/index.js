// Panel entry point: loads the layout from the computer (or the demo), renders
// the current page, and handles navigation — swipe, page dots, the overview,
// keyboard arrows, and returning home when idle.

import { createBridge } from "./bridge.js";
import { createStore } from "./store.js";
import { mountPage } from "./app.js";
import { visiblePages, homeIndex, indexAfterReload, step, idleReturnSec } from "./nav.js";

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
  document.body.dataset.bridge = bridge.kind;
  if (bridge.demo) {
    bannerEl.hidden = false;
    bannerEl.textContent = "Simulated — demo data";
  }

  let layout = null;
  let index = 0;
  let current = null; // { el, needs, destroy, pageId }
  let lastTouch = Date.now();

  const pages = () => visiblePages(layout);

  // ---- rendering -----------------------------------------------------------

  function renderDots() {
    const list = pages();
    dotsEl.innerHTML = "";
    dotsEl.hidden = list.length < 2;
    list.forEach((p, i) => {
      const b = document.createElement("button");
      b.className = "dot";
      b.setAttribute("aria-label", p.name);
      if (i === index) b.setAttribute("aria-current", "page");
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
    if (page) {
      current = { ...mountPage(holder, page, env, orientation()), holder, pageId: page.id };
    } else {
      holder.innerHTML = `<div class="empty">No pages yet. Add some in the editor on your computer.</div>`;
      current = { needs: [], destroy: () => {}, holder, pageId: null };
    }
    bridge.setNeeds(current.needs);
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
    });
    window.parent?.postMessage({ type: "deskassist-preview-ready" }, location.origin);
  }

  async function loadLayout() {
    if (preview) return;
    try {
      const next = await bridge.request("panel.layout");
      const keepId = layout ? pages()[index]?.id : null;
      layout = next;
      index = keepId ? indexAfterReload(layout, keepId) : homeIndex(layout);
      render(0);
    } catch (err) {
      if (!layout) {
        pagesEl.innerHTML = `<div class="empty">Waiting for your computer…</div>`;
      }
    }
  }

  bridge.on("event", (e) => {
    if (e.type === "data" && e.data?.kind) store.set(e.data.kind, e.data.value);
    else if (e.type === "layout" && e.data?.rev !== layout?.rev) loadLayout();
    else if (e.type === "goto" && e.data?.page) gotoId(e.data.page);
  });
  bridge.on("status", ({ online, detail }) => {
    statusEl.dataset.online = online ? "1" : "0";
    statusEl.title = online ? "Connected" : `Offline${detail ? `: ${detail}` : ""}`;
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
    if (!layout || !overviewEl.hidden || preview) return;
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
    openOverview,
  };
}

boot();
