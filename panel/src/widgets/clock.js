// Clock: time (12/24 h, optional seconds) and date. Needs no computer data.

export default {
  type: "clock",
  meta: {
    name: "Clock",
    category: "time",
    size: { w: 4, h: 2 },
    min: { w: 2, h: 1 },
    options: [
      { key: "hour12", type: "bool", label: "12-hour clock", default: false },
      { key: "seconds", type: "bool", label: "Show seconds", default: false },
      { key: "date", type: "bool", label: "Show the date", default: true },
    ],
  },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-clock");
    el.innerHTML = `<div class="clock-time"></div><div class="clock-date"></div>`;
    const timeEl = el.querySelector(".clock-time");
    const dateEl = el.querySelector(".clock-date");
    const render = () => {
      const now = ctx.now();
      const o = ctx.options;
      timeEl.textContent = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: o.seconds ? "2-digit" : undefined,
        hour12: !!o.hour12,
      });
      dateEl.textContent = o.date ? now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) : "";
      dateEl.hidden = !o.date;
    };
    render();
    ctx.every(1000, render);
  },
};
