// Timers whose state lives on the computer (ctx.persisted), so they keep
// running through reloads and match on every screen. Alarms are raised at
// panel level (alarms.js), so a timer on another page still goes off.

export const fmtClock = (ms) => {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

/** Remaining ms of a timer state at `now`. Pure (unit-tested). */
export function remaining(st, now = Date.now()) {
  if (!st) return 0;
  if (st.running && st.endAt) return Math.max(0, st.endAt - now);
  return Math.max(0, st.remainingMs ?? 0);
}

function button(label, cls, fn) {
  const b = document.createElement("button");
  b.className = `tbtn ${cls}`;
  b.textContent = label;
  b.dataset.noSwipe = "";
  b.addEventListener("click", fn);
  return b;
}

// ----------------------------------------------------------------- timer ----

export const timer = {
  type: "timer",
  meta: {
    name: "Timer",
    category: "time",
    size: { w: 4, h: 3 },
    min: { w: 2, h: 2 },
    options: [
      { key: "presets", type: "list", label: "Preset minutes, one per line", default: ["1", "3", "5", "10", "15", "25", "45"] },
      { key: "label", type: "text", label: "Label (optional)", default: "" },
    ],
  },
  needs: () => [],
  alarm: true,
  mount(el, ctx) {
    el.classList.add("w-timer");
    el.innerHTML = `<div class="t-label muted"></div><div class="t-ring"><svg viewBox="0 0 100 100"><circle class="t-track" cx="50" cy="50" r="44"/><circle class="t-fill" cx="50" cy="50" r="44" transform="rotate(-90 50 50)"/></svg><div class="t-time">0:00</div></div><div class="t-presets"></div><div class="t-ctrls"></div>`;
    el.querySelector(".t-label").textContent = ctx.options.label;
    const C = 2 * Math.PI * 44;
    const fill = el.querySelector(".t-fill");
    fill.style.strokeDasharray = `${C}`;
    const timeEl = el.querySelector(".t-time");
    const ctrls = el.querySelector(".t-ctrls");
    const st = ctx.persisted({ running: false, endAt: null, remainingMs: 0, durationMs: 0 }, () => draw());
    const presets = (ctx.options.presets ?? []).map(Number).filter((n) => n > 0 && n <= 24 * 60).slice(0, 8);
    el.querySelector(".t-presets").append(
      ...presets.map((m) => button(`${m}m`, "preset", () => st.set({ running: true, endAt: Date.now() + m * 60_000, remainingMs: 0, durationMs: m * 60_000, label: ctx.options.label })),
    ));
    function draw() {
      const s = st.value;
      const left = remaining(s);
      timeEl.textContent = fmtClock(left);
      const frac = s.durationMs ? left / s.durationMs : 0;
      fill.style.strokeDashoffset = `${C * (1 - frac)}`;
      el.dataset.state = s.running ? "running" : left > 0 ? "paused" : "idle";
      ctrls.replaceChildren(
        ...(s.running
          ? [button("Pause", "", () => st.set({ ...s, running: false, endAt: null, remainingMs: remaining(s) }))]
          : left > 0
            ? [button("Resume", "primary", () => st.set({ ...s, running: true, endAt: Date.now() + left, remainingMs: 0 }))]
            : []),
        ...(left > 0 || s.running ? [button("Reset", "", () => st.set({ running: false, endAt: null, remainingMs: 0, durationMs: 0 }))] : []),
      );
    }
    ctx.every(250, () => st.value.running && (timeEl.textContent = fmtClock(remaining(st.value)), (fill.style.strokeDashoffset = `${C * (1 - remaining(st.value) / (st.value.durationMs || 1))}`), remaining(st.value) === 0 && draw()));
  },
};

// --------------------------------------------------------------- stopwatch ----

export const stopwatch = {
  type: "stopwatch",
  meta: { name: "Stopwatch", category: "time", size: { w: 3, h: 3 }, min: { w: 2, h: 2 }, options: [] },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-stopwatch");
    el.innerHTML = `<div class="sw-time">0:00.0</div><div class="t-ctrls"></div><div class="sw-laps muted"></div>`;
    const timeEl = el.querySelector(".sw-time");
    const ctrls = el.querySelector(".t-ctrls");
    const laps = el.querySelector(".sw-laps");
    const st = ctx.persisted({ startAt: null, elapsedMs: 0, laps: [] }, () => draw());
    const elapsed = (s) => s.elapsedMs + (s.startAt ? Date.now() - s.startAt : 0);
    const fmt = (ms) => `${fmtClock(ms)}.${Math.floor((ms % 1000) / 100)}`;
    function draw() {
      const s = st.value;
      timeEl.textContent = fmt(elapsed(s));
      ctrls.replaceChildren(
        s.startAt
          ? button("Stop", "", () => st.set({ ...s, startAt: null, elapsedMs: elapsed(s) }))
          : button(s.elapsedMs ? "Resume" : "Start", "primary", () => st.set({ ...s, startAt: Date.now() })),
        s.startAt ? button("Lap", "", () => st.set({ ...s, laps: [elapsed(s), ...s.laps].slice(0, 20) })) : button("Reset", "", () => st.set({ startAt: null, elapsedMs: 0, laps: [] })),
      );
      laps.textContent = s.laps.slice(0, 3).map((l, i) => `Lap ${s.laps.length - i}: ${fmt(l)}`).join(" · ");
    }
    ctx.every(100, () => st.value.startAt && (timeEl.textContent = fmt(elapsed(st.value))));
  },
};

// ---------------------------------------------------------------- pomodoro ----

export const FOCUS_KEY = "global:focus"; // shared log for the focus history widget
const dayKey = (t) => new Date(t).toLocaleDateString("en-CA");

/** Next pomodoro phase after `phase` ends. Pure. */
export function nextPhase(phase, round, longEvery = 4) {
  if (phase === "focus") return round % longEvery === 0 ? "long" : "short";
  return "focus";
}

export const pomodoro = {
  type: "pomodoro",
  meta: {
    name: "Pomodoro",
    category: "time",
    size: { w: 4, h: 3 },
    min: { w: 3, h: 2 },
    options: [
      { key: "focus", type: "number", label: "Focus minutes", default: 25, min: 1, max: 180 },
      { key: "short", type: "number", label: "Short break minutes", default: 5, min: 1, max: 60 },
      { key: "long", type: "number", label: "Long break minutes", default: 15, min: 1, max: 90 },
      { key: "longEvery", type: "number", label: "Long break after this many focus rounds", default: 4, min: 2, max: 10 },
    ],
  },
  needs: () => [],
  alarm: true,
  mount(el, ctx) {
    el.classList.add("w-pomodoro");
    el.innerHTML = `<div class="po-phase"></div><div class="po-time">25:00</div><div class="po-dots"></div><div class="t-ctrls"></div>`;
    const o = ctx.options;
    const minutes = { focus: o.focus, short: o.short, long: o.long };
    const st = ctx.persisted({ phase: "focus", round: 1, running: false, endAt: null, remainingMs: o.focus * 60_000 }, () => draw());
    const log = ctx.persisted({ days: {} }, null);
    const $ = (s) => el.querySelector(s);
    const complete = (s) => {
      // Record finished focus time once, keyed by its end time (two screens may both see it end).
      if (s.phase === "focus" && s.endAt) {
        const days = { ...(log.value?.days ?? {}) };
        const k = dayKey(s.endAt);
        const ids = new Set(days[`${k}#ids`] ?? []);
        if (!ids.has(s.endAt)) {
          ids.add(s.endAt);
          days[k] = (days[k] ?? 0) + minutes.focus;
          days[`${k}#ids`] = [...ids].slice(-50);
          log.set({ days });
        }
      }
      const phase = nextPhase(s.phase, s.round, o.longEvery);
      st.set({ phase, round: s.phase === "focus" ? s.round : s.round + 1, running: false, endAt: null, remainingMs: minutes[phase] * 60_000 });
    };
    function draw() {
      const s = st.value;
      const left = remaining(s);
      $(".po-phase").textContent = s.phase === "focus" ? `Focus · round ${s.round}` : s.phase === "long" ? "Long break" : "Short break";
      el.dataset.phase = s.phase;
      $(".po-time").textContent = fmtClock(left);
      $(".po-dots").textContent = "●".repeat(((s.round - 1) % o.longEvery) + (s.phase === "focus" ? 0 : 1)).padEnd(o.longEvery, "○");
      $(".t-ctrls").replaceChildren(
        s.running
          ? button("Pause", "", () => st.set({ ...s, running: false, endAt: null, remainingMs: left }))
          : button(left > 0 ? (left === minutes[s.phase] * 60_000 ? "Start" : "Resume") : "Next", "primary", () =>
              left > 0 ? st.set({ ...s, running: true, endAt: Date.now() + left, remainingMs: 0 }) : complete(s),
            ),
        button("Skip", "", () => complete({ ...s, endAt: null })),
        button("Reset", "", () => st.set({ phase: "focus", round: 1, running: false, endAt: null, remainingMs: o.focus * 60_000 })),
      );
    }
    ctx.every(250, () => {
      const s = st.value;
      if (!s.running) return;
      const left = remaining(s);
      $(".po-time").textContent = fmtClock(left);
      if (left === 0) complete(s);
    });
    // The focus log is shared with the Focus history widget.
    void log;
  },
  // The focus log lives under a fixed key so the history widget can read it.
  stateKey: FOCUS_KEY,
};

// ------------------------------------------------------------- focus history ----

export const focushistory = {
  type: "focushistory",
  meta: { name: "Focus history", category: "time", size: { w: 4, h: 2 }, min: { w: 3, h: 2 }, options: [] },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-focushist");
    el.innerHTML = `<div class="w-title">Focus · last 7 days <span class="fh-total muted"></span></div><div class="fh-bars"></div>`;
    const bars = el.querySelector(".fh-bars");
    ctx.persistedAt(FOCUS_KEY, { days: {} }, (v) => {
      const days = v?.days ?? {};
      const today = new Date();
      const list = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - i));
        return { label: d.toLocaleDateString([], { weekday: "narrow" }), min: days[dayKey(d)] ?? 0 };
      });
      const max = Math.max(25, ...list.map((x) => x.min));
      el.querySelector(".fh-total").textContent = `· ${list.reduce((a, b) => a + b.min, 0)} min`;
      bars.innerHTML = list.map((x) => `<div class="fh-col"><div class="fh-bar" style="height:${(100 * x.min) / max}%" title="${x.min} min"></div><span>${x.label}</span></div>`).join("");
    });
  },
};
