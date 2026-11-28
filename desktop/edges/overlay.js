// Desk edges overlay: one transparent, click-through window per display.
// The window receives forwarded mouse moves; when the pointer reaches a hot
// zone the matching control slides in, and the window takes clicks only while
// the pointer is over a revealed control (it never steals clicks elsewhere).
//
// window.edges (preload) provides: info(), on(event, fn), interactive(bool),
// get(kind), set(kind, value), act(kind, action, arg), launch(app),
// icon(app), saveFloating(list).

import { zoneAt, createPressure, controlRect, sliderValue, dialValue, dialDistance, floatingDialValue, clampToDisplay, trayBesideDock } from "../src/edges/geometry.mjs";

const $ = (sel, el = document) => el.querySelector(sel);
const stage = $("#stage");
const bridge = window.edges;
let info = await bridge.info();
info.dockTray ??= trayBesideDock(info.display, info.dock, { apps: info.profile?.dock?.length || 1 });
let display = info.display;
let cfg = info.profile;
let pressure = createPressure(cfg.pressureMs ?? 0);
let shown = null; // { zone, el }
let hideTimer = null;
let overControl = false;
let floating = info.floating ?? [];

const LABEL = { volume: "Volume", brightness: "Brightness", appearance: "Appearance", output: "Output", timer: "Timer", music: "Music", keyboard: "Keyboard light" };
const ICON = { volume: "🔊", brightness: "☀︎", appearance: "◐", output: "🎧", timer: "⏱", music: "♫", keyboard: "⌨︎" };

function applyStyle() {
  const s = cfg.style ?? {};
  const r = document.documentElement.style;
  r.setProperty("--tint", s.tint ?? "#0f172a");
  r.setProperty("--glass", String(s.opacity ?? 0.72));
  r.setProperty("--frost", `${s.frost ?? 18}px`);
  r.setProperty("--accent", s.accent ?? "#38bdf8");
  r.setProperty("--hl", String(s.highlight ?? 0.18));
  document.body.dataset.look = s.look ?? "glass";
}
applyStyle();

// ------------------------------------------------------------- reveal ----

function setInteractive(on) {
  if (on === overControl) return;
  overControl = on;
  bridge.interactive(on);
}

function hideSoon(ms = 650) {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (!shown || overControl) return;
    shown.el.classList.remove("in");
    const el = shown.el;
    setTimeout(() => el.remove(), 220);
    shown.stop?.();
    shown = null;
  }, ms);
}

function reveal(zone) {
  clearTimeout(hideTimer);
  if (shown?.zone === zone) return;
  if (shown) (shown.el.remove(), shown.stop?.());
  const kind = zone === "left" ? cfg.left : zone === "right" ? cfg.right : zone === "dock" ? "dock" : cfg.corners?.[zone];
  if (!kind || kind === "none") return;
  const rect = controlRect(zone, display, { dock: info.dock, dockTray: info.dockTray, sliderLength: cfg.sliderLength ?? 0.5, dial: cfg.dialSize ?? 180 });
  if (!rect) return;
  const el = document.createElement("div");
  el.className = `ctl ${zone === "left" || zone === "right" ? "slider" : zone === "dock" ? "tray" : "dial"} z-${zone}`;
  Object.assign(el.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  el.dataset.kind = kind;
  stage.append(el);
  el.addEventListener("mouseenter", () => (clearTimeout(hideTimer), setInteractive(true)));
  el.addEventListener("mouseleave", () => (setInteractive(false), hideSoon()));
  const ctl = zone === "dock" ? trayControl(el, rect) : el.classList.contains("slider") ? sliderControl(el, rect, kind, zone) : dialControl(el, rect, kind, zone);
  shown = { zone, el, ...ctl };
  requestAnimationFrame(() => el.classList.add("in"));
}

document.addEventListener("mousemove", (e) => {
  const p = { x: e.clientX, y: e.clientY };
  const z = zoneAt(p, display, { dock: info.dock, dockTray: info.dockTray, edgeSpan: cfg.edgeSpan });
  const hit = pressure(z, Date.now());
  if (hit) reveal(hit);
  else if (shown && !overControl && !z) hideSoon();
});
document.addEventListener("mouseleave", () => !overControl && hideSoon());

// ----------------------------------------------------------- controls ----

const throttle = (fn, ms) => {
  let last = 0;
  let t = null;
  return (v) => {
    clearTimeout(t);
    const now = Date.now();
    if (now - last >= ms) (last = now), fn(v);
    else t = setTimeout(() => ((last = Date.now()), fn(v)), ms);
  };
};

async function current(kind) {
  try {
    return await bridge.get(kind);
  } catch {
    return null;
  }
}

/** Edge slider: sweep the pointer along it and the value follows (no click needed). */
function sliderControl(el, rect, kind, zone) {
  el.innerHTML = `<div class="sl-track"><div class="sl-fill"></div><div class="sl-knob"></div></div><div class="sl-label"><span class="sl-ico">${ICON[kind] ?? "•"}</span><span class="sl-num"></span></div>`;
  const fill = $(".sl-fill", el);
  const num = $(".sl-num", el);
  const track = $(".sl-track", el);
  const paint = (v, extra = "") => {
    const pct = Math.round((v ?? 0) * 100);
    fill.style.height = `${pct}%`;
    $(".sl-knob", el).style.bottom = `calc(${pct}% - 7px)`;
    num.textContent = kind === "appearance" ? (v >= 0.5 ? "Dark" : "Light") : `${pct}%${extra}`;
  };
  current(kind).then((r) => {
    if (r?.unavailable) {
      el.classList.add("na");
      num.textContent = r.reason ?? "Not available";
      return;
    }
    paint(r?.value);
  });
  const send = throttle((v) => bridge.set(kind, kind === "appearance" ? (v >= 0.5 ? 1 : 0) : v), 60);
  el.addEventListener("mousemove", (e) => {
    if (el.classList.contains("na")) return;
    const r = track.getBoundingClientRect();
    const v = sliderValue(e.clientY, { y: r.top, height: r.height });
    paint(kind === "appearance" ? (v >= 0.5 ? 1 : 0) : v);
    send(v);
  });
  return {};
}

/** Corner dial: a quarter circle; the pointer's angle sets the value. Pull it out to float it. */
function dialControl(el, rect, kind, zone) {
  el.innerHTML = `<svg class="dl-svg" viewBox="0 0 100 100"><path class="dl-track" /><path class="dl-fill" /></svg><div class="dl-center"><span class="dl-ico">${ICON[kind] ?? "•"}</span><span class="dl-num"></span><span class="dl-name">${LABEL[kind] ?? kind}</span></div>`;
  // Arc around the screen corner, drawn in the dial's own box.
  const corner = { tl: [0, 0], tr: [100, 0], bl: [0, 100], br: [100, 100] }[zone];
  const R = 86;
  const arc = (t) => {
    // t: 0..1 from the horizontal edge toward the vertical edge.
    const a = (t * Math.PI) / 2;
    const sx = zone === "tl" || zone === "bl" ? 1 : -1;
    const sy = zone === "tl" || zone === "tr" ? 1 : -1;
    const start = [corner[0] + sx * R, corner[1]];
    const end = [corner[0] + sx * R * Math.cos(a), corner[1] + sy * R * Math.sin(a)];
    const sweep = (sx === sy ? 1 : 0);
    return `M ${start[0]} ${start[1]} A ${R} ${R} 0 0 ${sweep} ${end[0].toFixed(2)} ${end[1].toFixed(2)}`;
  };
  $(".dl-track", el).setAttribute("d", arc(1));
  const fill = $(".dl-fill", el);
  const num = $(".dl-num", el);
  const center = $(".dl-center", el);
  Object.assign(center.style, zone.includes("l") ? { left: "14%" } : { right: "14%" }, zone.includes("t") ? { top: "14%" } : { bottom: "14%" });
  const paint = (v, text) => {
    fill.setAttribute("d", arc(Math.max(0.001, v ?? 0)));
    num.textContent = text ?? `${Math.round((v ?? 0) * 100)}%`;
  };
  let stop = null;
  let timerEnd = 0;
  if (kind === "timer") {
    let minutes = cfg.timerMinutes ?? 25;
    const tick = () => {
      if (!timerEnd) return paint(minutes / 60, `${minutes} min`);
      const left = Math.max(0, timerEnd - Date.now());
      paint(left / 3_600_000, `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`);
      if (!left) {
        timerEnd = 0;
        el.classList.add("done");
        bridge.act("timer", "done");
      }
    };
    const t = setInterval(tick, 500);
    stop = () => clearInterval(t);
    bridge.act("timer", "state").then((s) => ((timerEnd = s?.endsAt ?? 0), tick()), () => tick());
    el.addEventListener("mousemove", (e) => {
      if (timerEnd || dragging) return;
      minutes = Math.max(1, Math.round(dialValue({ x: e.clientX, y: e.clientY }, zone, display) * 60));
      tick();
    });
    el.addEventListener("click", async () => {
      const s = await bridge.act("timer", timerEnd ? "cancel" : "start", minutes);
      timerEnd = s?.endsAt ?? 0;
      el.classList.remove("done");
      tick();
    });
  } else if (kind === "music") {
    const poll = async () => {
      const m = await current("music");
      el.classList.toggle("playing", !!m?.playing);
      num.textContent = m?.title ? m.title : "Nothing playing";
      $(".dl-name", el).textContent = m?.artist ?? "Music";
      if (m?.art) center.style.setProperty("--art", `url("${m.art}")`);
      paint(m?.progress ?? 0, num.textContent);
    };
    poll();
    const t = setInterval(poll, 2000);
    stop = () => clearInterval(t);
    center.classList.add("art");
    el.addEventListener("click", (e) => {
      const v = dialValue({ x: e.clientX, y: e.clientY }, zone, display);
      const near = dialDistance({ x: e.clientX, y: e.clientY }, zone, display) < (rect.width * 0.55);
      bridge.act("music", near ? "playpause" : v < 0.5 ? "previous" : "next");
      setTimeout(poll, 400);
    });
  } else if (kind === "appearance" || kind === "output") {
    current(kind).then((r) => {
      if (r?.unavailable) return (el.classList.add("na"), (num.textContent = r.reason ?? "Not available"));
      if (kind === "appearance") paint(r?.value ? 1 : 0, r?.value ? "Dark" : "Light");
      else {
        const list = r?.devices ?? [];
        const i = list.findIndex((d) => d.default);
        paint(list.length ? (i + 1) / list.length : 0, list[i]?.name ?? "—");
        el._devices = list;
      }
    });
    el.addEventListener("click", async () => {
      if (el.classList.contains("na")) return;
      if (kind === "appearance") {
        const r = await current("appearance");
        await bridge.set("appearance", r?.value ? 0 : 1);
        paint(r?.value ? 0 : 1, r?.value ? "Light" : "Dark");
      } else {
        const list = el._devices ?? [];
        const i = list.findIndex((d) => d.default);
        const next = list[(i + 1) % list.length];
        if (next) {
          await bridge.set("output", next.id);
          list.forEach((d) => (d.default = d.id === next.id));
          paint((list.indexOf(next) + 1) / list.length, next.name);
        }
      }
    });
  } else {
    current(kind).then((r) => (r?.unavailable ? (el.classList.add("na"), (num.textContent = r.reason ?? "Not available")) : paint(r?.value)));
    const send = throttle((v) => bridge.set(kind, v), 60);
    el.addEventListener("mousemove", (e) => {
      if (el.classList.contains("na") || dragging) return;
      const v = dialValue({ x: e.clientX, y: e.clientY }, zone, display);
      paint(v);
      send(v);
    });
  }
  // Pull the dial out of its corner to make it float.
  let dragging = false;
  el.addEventListener("mousedown", (e) => {
    dragging = true;
    const up = (u) => {
      document.removeEventListener("mouseup", up);
      dragging = false;
      if (dialDistance({ x: u.clientX, y: u.clientY }, zone, display) > rect.width + 40) {
        const pos = clampToDisplay({ x: u.clientX - 80, y: u.clientY - 80 }, display);
        floating = [...floating.filter((f) => f.kind !== kind), { kind, ...pos }];
        bridge.saveFloating(floating);
        drawFloating();
        hideSoon(0);
      }
    };
    document.addEventListener("mouseup", up);
    e.preventDefault();
  });
  return { stop };
}

/** Hidden dock: up to 8 apps beside the system Dock; pull up for the launcher. */
function trayControl(el, rect) {
  const apps = (cfg.dock ?? []).slice(0, 8);
  const vertical = (info.dockTray?.side ?? "bottom") !== "bottom";
  el.classList.toggle("vertical", vertical);
  el.innerHTML = `<div class="tr-apps"></div><button class="tr-more" title="More apps">⌃</button>`;
  const row = $(".tr-apps", el);
  const tile = (name) => {
    const b = document.createElement("button");
    b.className = "app";
    b.title = name;
    b.innerHTML = `<span class="app-ico">${name.slice(0, 1).toUpperCase()}</span>`;
    bridge.icon(name).then((src) => src && ($(".app-ico", b).style.backgroundImage = `url("${src}")`, b.classList.add("has-ico")), () => {});
    b.addEventListener("click", () => (bridge.launch(name), b.classList.add("bump"), setTimeout(() => b.classList.remove("bump"), 400)));
    return b;
  };
  apps.forEach((a) => row.append(tile(a)));
  if (!apps.length) row.innerHTML = `<span class="tr-empty">Add apps in DeskAssist's editor › Desk edges</span>`;
  $(".tr-more", el).addEventListener("click", () => {
    let grid = $(".launcher", stage);
    if (grid) return grid.remove();
    grid = document.createElement("div");
    grid.className = "launcher in";
    const more = cfg.launcher ?? [];
    grid.innerHTML = `<div class="ln-title">Apps</div><div class="ln-grid"></div>`;
    more.forEach((a) => {
      const t = tile(a);
      t.insertAdjacentHTML("beforeend", `<span class="app-name">${a.replace(/[<>&]/g, "")}</span>`);
      $(".ln-grid", grid).append(t);
    });
    if (!more.length) $(".ln-grid", grid).innerHTML = `<span class="tr-empty">Add launcher apps in the editor › Desk edges</span>`;
    const w = 420;
    Object.assign(grid.style, { left: `${Math.min(display.width - w - 8, Math.max(8, rect.x))}px`, bottom: `${display.height - rect.y + 10}px`, width: `${w}px` });
    grid.addEventListener("mouseenter", () => (clearTimeout(hideTimer), setInteractive(true)));
    grid.addEventListener("mouseleave", () => (setInteractive(false), grid.remove(), hideSoon()));
    stage.append(grid);
  });
  return {};
}

// ------------------------------------------------------- floating dials ----

function drawFloating() {
  stage.querySelectorAll(".float").forEach((x) => x.remove());
  for (const f of floating) {
    const el = document.createElement("div");
    el.className = "float in";
    el.dataset.kind = f.kind;
    Object.assign(el.style, { left: `${f.x}px`, top: `${f.y}px` });
    el.innerHTML = `<svg viewBox="0 0 100 100"><circle class="fl-track" cx="50" cy="50" r="42" /><circle class="fl-fill" cx="50" cy="50" r="42" /></svg><div class="fl-center"><span class="dl-ico">${ICON[f.kind] ?? "•"}</span><span class="fl-num"></span></div>`;
    const C = 2 * Math.PI * 42;
    const fill = $(".fl-fill", el);
    fill.style.strokeDasharray = `${(C * 300) / 360} ${C}`;
    const paint = (v) => {
      fill.style.strokeDasharray = `${((C * 300) / 360) * (v ?? 0)} ${C}`;
      $(".fl-num", el).textContent = `${Math.round((v ?? 0) * 100)}%`;
    };
    current(f.kind).then((r) => (r?.unavailable ? ($(".fl-num", el).textContent = "N/A") : paint(r?.value)));
    const send = throttle((v) => bridge.set(f.kind, v), 60);
    let mode = null;
    let offset = null;
    el.addEventListener("mouseenter", () => setInteractive(true));
    el.addEventListener("mouseleave", () => !mode && setInteractive(false));
    el.addEventListener("mousedown", (e) => {
      const r = el.getBoundingClientRect();
      const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      mode = Math.hypot(e.clientX - c.x, e.clientY - c.y) < r.width * 0.28 ? "move" : "turn";
      offset = { x: e.clientX - r.left, y: e.clientY - r.top };
      const move = (m) => {
        if (mode === "move") {
          const pos = clampToDisplay({ x: m.clientX - offset.x, y: m.clientY - offset.y }, display);
          Object.assign(el.style, { left: `${pos.x}px`, top: `${pos.y}px` });
          Object.assign(f, pos);
        } else {
          const v = floatingDialValue({ x: m.clientX, y: m.clientY }, c);
          paint(v);
          send(v);
        }
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        if (mode === "move") bridge.saveFloating(floating);
        mode = null;
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
      e.preventDefault();
    });
    // Double-click sends it back to its corner.
    el.addEventListener("dblclick", () => {
      floating = floating.filter((x) => x !== f);
      bridge.saveFloating(floating);
      setInteractive(false);
      drawFloating();
    });
    stage.append(el);
  }
}
drawFloating();

// Profile changes (frontmost app) and settings edits arrive live.
bridge.on("profile", (p) => {
  cfg = p;
  pressure = createPressure(cfg.pressureMs ?? 0);
  applyStyle();
  if (shown) (shown.el.remove(), shown.stop?.(), (shown = null));
});
bridge.on("info", (i) => {
  info = i;
  display = i.display;
  floating = i.floating ?? floating;
  drawFloating();
});
window.__edges = { reveal, get shown() { return shown?.zone ?? null; } };
