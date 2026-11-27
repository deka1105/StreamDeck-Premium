// Time widgets that need no computer data.

const ZONES = [
  ["local", "This phone's time zone"],
  ["UTC", "UTC"],
  ["America/Los_Angeles", "Los Angeles"],
  ["America/Denver", "Denver"],
  ["America/Chicago", "Chicago"],
  ["America/New_York", "New York"],
  ["America/Sao_Paulo", "São Paulo"],
  ["Europe/London", "London"],
  ["Europe/Paris", "Paris"],
  ["Europe/Berlin", "Berlin"],
  ["Europe/Istanbul", "Istanbul"],
  ["Africa/Lagos", "Lagos"],
  ["Asia/Dubai", "Dubai"],
  ["Asia/Kolkata", "Mumbai"],
  ["Asia/Singapore", "Singapore"],
  ["Asia/Shanghai", "Shanghai"],
  ["Asia/Tokyo", "Tokyo"],
  ["Australia/Sydney", "Sydney"],
  ["Pacific/Auckland", "Auckland"],
];
const ZONE_CHOICES = ZONES.map(([value, label]) => ({ value, label }));
const zoneLabel = (z) => ZONES.find(([v]) => v === z)?.[1] ?? z.split("/").pop().replace(/_/g, " ");

/** Hours, minutes, seconds of `date` in `zone` ("local" = this device). Pure. */
export function partsIn(date, zone) {
  if (!zone || zone === "local") return { h: date.getHours(), m: date.getMinutes(), s: date.getSeconds(), day: date.getDay() };
  const f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "numeric", second: "numeric", weekday: "short", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { h: Number(p.hour) % 24, m: Number(p.minute), s: Number(p.second), day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}

// ------------------------------------------------------------ analog ----

export const analog = {
  type: "analog",
  meta: {
    name: "Analog clock",
    category: "time",
    size: { w: 3, h: 3 },
    min: { w: 2, h: 2 },
    options: [
      { key: "zone", type: "choice", label: "Time zone", default: "local", choices: ZONE_CHOICES },
      { key: "seconds", type: "bool", label: "Second hand", default: true },
      { key: "label", type: "bool", label: "Show the city", default: false },
    ],
  },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-analog");
    const ticks = Array.from({ length: 12 }, (_, i) => `<line x1="50" y1="${i % 3 ? 8 : 6}" x2="50" y2="12" transform="rotate(${i * 30} 50 50)"/>`).join("");
    el.innerHTML = `<svg viewBox="0 0 100 100" class="analog-svg" aria-hidden="true">
      <circle cx="50" cy="50" r="46" class="face"/><g class="ticks">${ticks}</g>
      <line class="hand h" x1="50" y1="50" x2="50" y2="27"/><line class="hand m" x1="50" y1="50" x2="50" y2="16"/>
      <line class="hand s" x1="50" y1="58" x2="50" y2="12"/><circle cx="50" cy="50" r="2.4" class="hub"/></svg>
      <div class="analog-label"></div>`;
    const [hh, mh, sh] = ["h", "m", "s"].map((c) => el.querySelector(`.hand.${c}`));
    sh.style.display = ctx.options.seconds ? "" : "none";
    const label = el.querySelector(".analog-label");
    label.textContent = ctx.options.label ? zoneLabel(ctx.options.zone) : "";
    const render = () => {
      const { h, m, s } = partsIn(ctx.now(), ctx.options.zone);
      hh.setAttribute("transform", `rotate(${(h % 12) * 30 + m * 0.5} 50 50)`);
      mh.setAttribute("transform", `rotate(${m * 6 + s * 0.1} 50 50)`);
      sh.setAttribute("transform", `rotate(${s * 6} 50 50)`);
    };
    render();
    ctx.every(1000, render);
  },
};

// -------------------------------------------------------------- word clock ----

const WORD_GRID = [
  "ITLISASAMPM",
  "ACQUARTERDC",
  "TWENTYFIVEX",
  "HALFSTENFTO",
  "PASTERUNINE",
  "ONESIXTHREE",
  "FOURFIVETWO",
  "EIGHTELEVEN",
  "SEVENTWELVE",
  "TENSEOCLOCK",
];
// word → [row, col, length]
const WORDS = {
  IT: [0, 0, 2], IS: [0, 3, 2], A: [1, 0, 1], QUARTER: [1, 2, 7], TWENTY: [2, 0, 6], FIVE_M: [2, 6, 4], HALF: [3, 0, 4], TEN_M: [3, 5, 3], TO: [3, 9, 2], PAST: [4, 0, 4],
  NINE: [4, 7, 4], ONE: [5, 0, 3], SIX: [5, 3, 3], THREE: [5, 6, 5], FOUR: [6, 0, 4], FIVE: [6, 4, 4], TWO: [6, 8, 3], EIGHT: [7, 0, 5], ELEVEN: [7, 5, 6], SEVEN: [8, 0, 5],
  TWELVE: [8, 5, 6], TEN: [9, 0, 3], OCLOCK: [9, 5, 6],
};
const HOURS = ["TWELVE", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN"];

/** The words lit for h:m, rounded down to five minutes. Pure (unit-tested). */
export function wordsFor(h, m) {
  const five = Math.floor(m / 5) * 5;
  const words = ["IT", "IS"];
  let hour = h % 12;
  const minuteWords = { 5: ["FIVE_M"], 10: ["TEN_M"], 15: ["A", "QUARTER"], 20: ["TWENTY"], 25: ["TWENTY", "FIVE_M"], 30: ["HALF"] };
  if (five === 0) return [...words, HOURS[hour], "OCLOCK"];
  if (five <= 30) return [...words, ...minuteWords[five], "PAST", HOURS[hour]];
  hour = (hour + 1) % 12;
  return [...words, ...minuteWords[60 - five], "TO", HOURS[hour]];
}

export const wordclock = {
  type: "wordclock",
  meta: { name: "Word clock", category: "time", size: { w: 4, h: 4 }, min: { w: 3, h: 3 }, options: [] },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-wordclock");
    const grid = document.createElement("div");
    grid.className = "wc-grid";
    const cells = WORD_GRID.map((row) => [...row].map((ch) => {
      const c = document.createElement("span");
      c.textContent = ch;
      grid.append(c);
      return c;
    }));
    el.append(grid);
    let last = "";
    const render = () => {
      const d = ctx.now();
      const lit = wordsFor(d.getHours(), d.getMinutes());
      const sig = lit.join();
      if (sig === last) return;
      last = sig;
      cells.flat().forEach((c) => c.classList.remove("on"));
      for (const w of lit) {
        const [r, c0, len] = WORDS[w];
        for (let i = 0; i < len; i++) cells[r][c0 + i].classList.add("on");
      }
      grid.setAttribute("aria-label", lit.map((w) => w.replace(/_M$/, "").replace("OCLOCK", "o'clock").toLowerCase()).join(" "));
    };
    render();
    ctx.every(5000, render);
  },
};

// ------------------------------------------------------------ world clocks ----

export const worldclocks = {
  type: "worldclocks",
  meta: {
    name: "World clocks",
    category: "time",
    size: { w: 4, h: 3 },
    min: { w: 2, h: 2 },
    options: [
      { key: "zones", type: "list", label: "Time zones, one per line (e.g. Europe/London)", default: ["America/New_York", "Europe/London", "Asia/Tokyo"] },
      { key: "hour12", type: "bool", label: "12-hour clock", default: false },
    ],
  },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-list", "w-world");
    el.innerHTML = `<div class="list"></div>`;
    const list = el.querySelector(".list");
    const zones = (ctx.options.zones ?? []).filter((z) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: z });
        return true;
      } catch {
        return false;
      }
    });
    const rows = zones.map((z) => {
      const r = document.createElement("div");
      r.className = "world-row";
      r.innerHTML = `<span class="world-city"></span><span class="world-day muted"></span><span class="world-time"></span>`;
      r.querySelector(".world-city").textContent = zoneLabel(z);
      list.append(r);
      return { z, r };
    });
    if (!rows.length) list.innerHTML = `<div class="muted">Add time zones in the editor.</div>`;
    const render = () => {
      const now = ctx.now();
      const localDay = now.getDay();
      for (const { z, r } of rows) {
        r.querySelector(".world-time").textContent = now.toLocaleTimeString([], { timeZone: z, hour: "2-digit", minute: "2-digit", hour12: !!ctx.options.hour12 });
        const d = partsIn(now, z).day;
        r.querySelector(".world-day").textContent = d === localDay ? "" : (d - localDay + 7) % 7 === 1 ? "tomorrow" : "yesterday";
      }
    };
    render();
    ctx.every(10_000, render);
  },
};

// ---------------------------------------------------------------- calendar ----

/** Weeks of the month containing `d` as arrays of {day, inMonth, today}. Pure. */
export function monthGrid(d, weekStart = 1) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const first = new Date(y, m, 1);
  const offset = (first.getDay() - weekStart + 7) % 7;
  const start = new Date(y, m, 1 - offset);
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let i = 0; i < 7; i++) {
      const c = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i);
      row.push({ day: c.getDate(), inMonth: c.getMonth() === m, today: c.toDateString() === d.toDateString() });
    }
    if (w >= 4 && !row.some((c) => c.inMonth)) break;
    weeks.push(row);
  }
  return weeks;
}

export const calendar = {
  type: "calendar",
  meta: {
    name: "Month",
    category: "time",
    size: { w: 4, h: 4 },
    min: { w: 3, h: 3 },
    options: [{ key: "weekStart", type: "choice", label: "Weeks start on", default: "1", choices: [{ value: "1", label: "Monday" }, { value: "0", label: "Sunday" }] }],
  },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-calendar");
    const render = () => {
      const now = ctx.now();
      const ws = Number(ctx.options.weekStart);
      const names = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + ((i + ws) % 7)).toLocaleDateString([], { weekday: "narrow" }));
      el.innerHTML = `<div class="cal-title">${now.toLocaleDateString([], { month: "long", year: "numeric" })}</div>
        <div class="cal-grid">${names.map((n) => `<span class="cal-h">${n}</span>`).join("")}${monthGrid(now, ws)
          .flat()
          .map((c) => `<span class="cal-d${c.inMonth ? "" : " out"}${c.today ? " today" : ""}">${c.day}</span>`)
          .join("")}</div>`;
    };
    render();
    ctx.every(60_000, render);
  },
};

// --------------------------------------------------------- time progress ----

/** Fraction of the day / week / month / year that has passed. Pure. */
export function progressOf(d, weekStart = 1) {
  const startDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (d - startDay) / 86400_000;
  const dow = (d.getDay() - weekStart + 7) % 7;
  const week = (dow + day) / 7;
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const month = (d.getDate() - 1 + day) / daysInMonth;
  const y0 = new Date(d.getFullYear(), 0, 1);
  const y1 = new Date(d.getFullYear() + 1, 0, 1);
  const year = (d - y0) / (y1 - y0);
  return { day, week, month, year };
}

export const progress = {
  type: "progress",
  meta: { name: "Time progress", category: "time", size: { w: 4, h: 3 }, min: { w: 2, h: 2 }, options: [] },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-list", "w-progress");
    el.innerHTML = `<div class="list"></div>`;
    const list = el.querySelector(".list");
    const labels = { day: "Today", week: "This week", month: "This month", year: "This year" };
    const rows = Object.keys(labels).map((k) => {
      const r = document.createElement("div");
      r.className = "store-row";
      r.innerHTML = `<div class="store-top"><span class="store-name">${labels[k]}</span><span class="store-val"></span></div><div class="minibar"><i></i></div>`;
      list.append(r);
      return [k, r];
    });
    const render = () => {
      const p = progressOf(ctx.now());
      for (const [k, r] of rows) {
        const v = Math.max(0, Math.min(1, p[k]));
        r.querySelector(".store-val").textContent = `${Math.floor(v * 100)}%`;
        r.querySelector("i").style.width = `${(v * 100).toFixed(2)}%`;
      }
    };
    render();
    ctx.every(30_000, render);
  },
};

// --------------------------------------------------------------- countdown ----

export const countdown = {
  type: "countdown",
  meta: {
    name: "Countdown",
    category: "time",
    size: { w: 3, h: 2 },
    min: { w: 2, h: 1 },
    options: [
      { key: "title", type: "text", label: "What it's counting to", default: "New Year" },
      { key: "date", type: "text", label: "Date and time (YYYY-MM-DD or YYYY-MM-DD HH:MM)", default: "" },
    ],
  },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-countdown");
    el.innerHTML = `<div class="cd-title"></div><div class="cd-big"></div><div class="cd-small muted"></div>`;
    el.querySelector(".cd-title").textContent = ctx.options.title;
    const parse = (s) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(String(s ?? "").trim());
      if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
      const n = ctx.now();
      return new Date(n.getFullYear() + 1, 0, 1); // default: next New Year
    };
    const target = parse(ctx.options.date);
    const render = () => {
      const ms = target - ctx.now();
      const big = el.querySelector(".cd-big");
      const small = el.querySelector(".cd-small");
      if (ms <= 0) {
        big.textContent = "Now!";
        small.textContent = target.toLocaleDateString();
        return;
      }
      const d = Math.floor(ms / 86400_000);
      const h = Math.floor((ms % 86400_000) / 3600_000);
      const m = Math.floor((ms % 3600_000) / 60_000);
      big.textContent = d ? `${d} day${d === 1 ? "" : "s"}` : `${h} h ${m} min`;
      small.textContent = d ? `${h} h ${m} min · ${target.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}` : target.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };
    render();
    ctx.every(30_000, render);
  },
};
