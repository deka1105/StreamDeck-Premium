// Display behaviour: page navigation style, OLED pixel shift, dimming when
// untouched, the night screen (schedule / computer asleep / a rule), and
// "follow PC sleep" (go black while the computer's display sleeps).

const mins = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};

/** Is `date` inside the from–to window (wrapping past midnight)? Pure. */
export function inWindow(from, to, date = new Date()) {
  const now = date.getHours() * 60 + date.getMinutes();
  const a = mins(from);
  const b = mins(to);
  return a === b ? false : a < b ? now >= a && now < b : now >= a || now < b;
}

/** Which screen should show? "off" | "night" | "black". Pure. */
export function nightState({ display, pc, ruleNight, wokeUntil = 0, now = Date.now(), date = new Date(now) }) {
  if (now < wokeUntil) return "off";
  if (display?.followPcSleep && pc?.displayAsleep) return "black";
  const n = display?.night ?? {};
  const on = ruleNight || (n.mode === "schedule" && inWindow(n.from, n.to, date)) || (n.mode === "pc" && pc?.displayAsleep);
  return on ? (n.style === "black" ? "black" : "night") : "off";
}

/** Small pixel offset that walks around a 7×7 box to spare OLED panels. Pure. */
export function shiftFor(step) {
  const path = [[0, 0], [2, 1], [3, -2], [-1, -3], [-3, 0], [-2, 3], [1, 2]];
  const [x, y] = path[step % path.length];
  return { x, y };
}

export function createDisplay({ body = document.body, store, onNeedsChange = () => {} } = {}) {
  let display = null;
  let ruleNight = false;
  let wokeUntil = 0;
  let lastTouch = Date.now();
  let step = 0;
  const night = document.createElement("div");
  night.id = "night";
  night.hidden = true;
  night.innerHTML = `<div class="night-clock"><div class="night-time"></div><div class="night-date"></div></div>`;
  const dim = document.createElement("div");
  dim.id = "dim";
  dim.hidden = true;
  body.append(night, dim);

  const state = () => nightState({ display, pc: store.get("pcpower"), ruleNight, wokeUntil });
  function update() {
    if (!display) return;
    const s = state();
    night.hidden = s === "off";
    night.dataset.style = s;
    body.dataset.night = s === "off" ? "" : s;
    if (s === "night") {
      const d = new Date();
      night.querySelector(".night-time").textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      night.querySelector(".night-date").textContent = d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
      night.style.setProperty("--night-b", String(display.night.brightness));
    }
    const idleMin = (Date.now() - lastTouch) / 60_000;
    dim.hidden = !(s === "off" && display.dimAfterMin > 0 && idleMin >= display.dimAfterMin);
    dim.style.opacity = String(display.dimLevel);
  }
  function shift() {
    if (!display?.oledShift) {
      body.style.removeProperty("--shift-x");
      body.style.removeProperty("--shift-y");
      return;
    }
    const { x, y } = shiftFor(step++);
    body.style.setProperty("--shift-x", `${x}px`);
    body.style.setProperty("--shift-y", `${y}px`);
  }
  const touch = () => {
    lastTouch = Date.now();
    if (!dim.hidden) dim.hidden = true;
  };
  body.addEventListener("pointerdown", touch, true);
  // A tap on the night or black screen wakes the panel for a minute.
  night.addEventListener("click", () => {
    wokeUntil = Date.now() + 60_000;
    update();
  });
  body.addEventListener("deskassist-night", (e) => {
    ruleNight = !!e.detail?.on;
    if (ruleNight) wokeUntil = 0;
    update();
  });
  body.addEventListener("deskassist-wake", () => {
    wokeUntil = Date.now() + 60_000;
    touch();
    update();
  });
  store.on("pcpower", update);
  setInterval(update, 15_000);
  setInterval(shift, 180_000);

  return {
    apply(next) {
      const needed = (d) => !!(d && (d.followPcSleep || d.night?.mode === "pc"));
      const changed = needed(display) !== needed(next);
      display = next;
      body.dataset.nav = display.nav;
      body.dataset.badges = display.badges ? "1" : "0";
      shift();
      update();
      if (changed) onNeedsChange();
    },
    needs: () => (display && (display.followPcSleep || display.night?.mode === "pc") ? ["pcpower"] : []),
    state,
    // For tests.
    _force: (s) => {
      ruleNight = s;
      update();
    },
  };
}
