// Internet: is the connection up, how good is it, how much data, how fast.

import { fmtBytes, fmtDuration } from "../sources.js";
import { pathFor } from "./chart.js";

function ago(t) {
  if (!t) return "—";
  return `${fmtDuration((Date.now() - t) / 1000)} ago`;
}

export default {
  type: "internet",
  meta: {
    name: "Internet",
    category: "computer",
    size: { w: 6, h: 3 },
    min: { w: 2, h: 1 },
    options: [{ key: "speedtest", type: "bool", label: "Show the speed-test button", default: true }],
  },
  needs: () => ["netq"],
  mount(el, ctx) {
    el.classList.add("w-internet");
    el.innerHTML = `
      <div class="net-head"><span class="net-dot"></span><span class="net-status">Checking…</span><span class="net-ip muted"></span></div>
      <div class="net-stats">
        <div><span class="k">Latency</span><span class="v lat">—</span></div>
        <div><span class="k">Jitter</span><span class="v jit">—</span></div>
        <div><span class="k">Loss</span><span class="v loss">—</span></div>
        <div><span class="k">Today</span><span class="v today">—</span></div>
        <div><span class="k">Month</span><span class="v month">—</span></div>
      </div>
      <svg class="net-chart" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path class="chart-line s0"/></svg>
      <div class="net-foot"><span class="net-up muted"></span><span class="net-speed muted"></span><button class="net-test" data-no-swipe>Speed test</button></div>`;
    const $ = (s) => el.querySelector(s);
    const btn = $(".net-test");
    btn.hidden = !ctx.options.speedtest;
    let busy = false;
    btn.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      btn.textContent = "Testing…";
      btn.disabled = true;
      try {
        const r = await ctx.request("netq.speedtest", {});
        if (!r?.ok) $(".net-speed").textContent = r?.error ?? "Speed test failed";
      } catch (err) {
        $(".net-speed").textContent = err.message;
      } finally {
        busy = false;
        btn.textContent = "Speed test";
        btn.disabled = false;
      }
    });
    ctx.subscribe("netq", (q) => {
      if (!q) return;
      el.dataset.state = q.online === null ? "" : q.online ? "up" : "down";
      $(".net-status").textContent = q.online === null ? "Checking…" : q.online ? "Online" : "Offline";
      $(".net-ip").textContent = q.ip ? q.ip : "";
      $(".lat").textContent = q.latencyMs === null ? "—" : `${Math.round(q.latencyMs)} ms`;
      $(".jit").textContent = q.jitterMs === null ? "—" : `${q.jitterMs.toFixed(1)} ms`;
      $(".loss").textContent = q.lossPct === null ? "—" : `${q.lossPct}%`;
      $(".today").textContent = fmtBytes(q.today);
      $(".month").textContent = fmtBytes(q.month);
      const hist = q.hist ?? [];
      const max = Math.max(50, ...hist.filter((v) => v >= 0)) * 1.15;
      $(".chart-line").setAttribute("d", pathFor(hist.map((v, i) => [i, v >= 0 ? v : null]), { t0: 0, t1: Math.max(1, hist.length - 1), max }));
      const drop = q.lastDrop ? ` · last drop ${ago(q.lastDrop.at)} (${fmtDuration(q.lastDrop.seconds)})` : "";
      $(".net-up").textContent = q.upSince ? `Up ${fmtDuration((Date.now() - q.upSince) / 1000)}${drop}` : drop.slice(3);
      $(".net-speed").textContent = q.testing ? "Speed test running…" : q.speed ? `↓ ${q.speed.downMbps} Mbps · ↑ ${q.speed.upMbps} Mbps · ${ago(q.speed.at)}` : "";
    });
  },
};
