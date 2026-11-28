// Stage 12 — audio and system controls: per-app mixer with meters, audio
// devices, push-to-talk, audio profiles and ducking, power plans, Windows
// services, display brightness, and lock / sleep with a hold to confirm.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pct = (v) => Math.round((Number(v) || 0) * 100);

async function call(ctx, method, params, msg) {
  const r = await ctx.request(method, params).catch((e) => ({ ok: false, error: e.message }));
  if (msg) msg.textContent = r?.ok === false ? r.error ?? "That didn't work." : "";
  return r;
}

/**
 * A range input that sends while dragging (at most every 90 ms) and once more
 * on release, and ignores incoming updates while the finger is on it.
 */
function liveSlider(input, send) {
  let last = 0;
  let timer = null;
  input.dataset.busy = "";
  const fire = () => {
    last = Date.now();
    send(Number(input.value) / 100);
  };
  input.addEventListener("pointerdown", () => (input.dataset.busy = "1"));
  input.addEventListener("input", () => {
    clearTimeout(timer);
    if (Date.now() - last > 90) fire();
    else timer = setTimeout(fire, 90);
  });
  input.addEventListener("change", () => {
    clearTimeout(timer);
    fire();
    setTimeout(() => (input.dataset.busy = ""), 600);
  });
}
const setSlider = (input, v) => {
  if (!input.dataset.busy && document.activeElement !== input) input.value = String(pct(v));
};

const initial = (name) => esc(String(name ?? "?").trim().charAt(0).toUpperCase() || "?");

// ------------------------------------------------------------------ mixer ----

export const mixer = {
  type: "mixer",
  meta: {
    name: "Volume mixer",
    category: "deck",
    size: { w: 6, h: 4 },
    min: { w: 3, h: 2 },
    options: [
      { key: "master", type: "bool", label: "Show the main output", default: true },
      { key: "system", type: "bool", label: "Show system sounds", default: false },
    ],
  },
  needs: () => ["audio", "audiolevels"],
  mount(el, ctx) {
    el.classList.add("w-mixer");
    el.innerHTML = `<div class="w-title">Mixer</div><div class="mx-rows" data-no-swipe></div><div class="cd-msg muted"></div>`;
    const rows = el.querySelector(".mx-rows");
    const msg = el.querySelector(".cd-msg");
    let sig = "";
    const byName = new Map();

    function row(key, label, letter, onVol, onMute) {
      const r = document.createElement("div");
      r.className = "mx-row";
      r.innerHTML = `<span class="mx-ico">${letter}</span><span class="mx-name">${esc(label)}</span><div class="mx-track"><i class="mx-meter"></i><input type="range" min="0" max="100" step="1" aria-label="${esc(label)} volume"></div><span class="mx-num"></span><button class="ibtn mx-mute" aria-label="Mute ${esc(label)}">🔈</button>`;
      const input = r.querySelector("input");
      liveSlider(input, onVol);
      r.querySelector(".mx-mute").addEventListener("click", () => onMute(r.dataset.muted !== "1"));
      byName.set(key, r);
      return r;
    }
    const paint = (r, vol, muted) => {
      setSlider(r.querySelector("input"), vol);
      r.querySelector(".mx-num").textContent = `${pct(vol)}`;
      r.dataset.muted = muted ? "1" : "";
      r.querySelector(".mx-mute").textContent = muted ? "🔇" : "🔈";
    };

    ctx.subscribe("audio", (d) => {
      if (!d?.available) return (rows.innerHTML = `<div class="muted setup">${esc(d?.error ?? "Connecting…")}</div>`);
      const apps = (d.sessions ?? []).filter((s) => ctx.options.system || !s.system);
      const next = JSON.stringify([ctx.options.master, apps.map((s) => s.name), d.perApp]);
      if (next !== sig) {
        sig = next;
        byName.clear();
        rows.replaceChildren();
        if (ctx.options.master !== false) rows.append(row("@out", "Main output", "🔊", (v) => call(ctx, "audio.setDeviceVolume", { flow: "render", volume: v }, msg), (m) => call(ctx, "audio.setDeviceMute", { flow: "render", muted: m }, msg)));
        for (const s of apps) rows.append(row(s.name, s.display || s.name, initial(s.display || s.name), (v) => call(ctx, "audio.setSessionVolume", { name: s.name, volume: v }, msg), (m) => call(ctx, "audio.setSessionMute", { name: s.name, muted: m }, msg)));
        if (!d.perApp) rows.insertAdjacentHTML("beforeend", `<div class="muted mx-note">Per-app volume needs Windows (macOS would need an audio driver).</div>`);
        else if (!apps.length) rows.insertAdjacentHTML("beforeend", `<div class="muted mx-note">No app is playing sound.</div>`);
      }
      const out = byName.get("@out");
      if (out) paint(out, d.output?.volume, d.output?.muted);
      for (const s of apps) byName.get(s.name) && paint(byName.get(s.name), s.volume, s.muted);
    });
    ctx.subscribe("audiolevels", (lv) => {
      if (!lv) return;
      for (const [k, r] of byName) {
        const p = k === "@out" ? lv.output : lv.sessions?.[k] ?? 0;
        r.querySelector(".mx-meter").style.transform = `scaleX(${Math.min(1, Math.sqrt(p || 0))})`;
      }
    });
  },
};

// ---------------------------------------------------------- audio devices ----

export const audiodevices = {
  type: "audiodevices",
  meta: { name: "Audio devices", category: "deck", size: { w: 4, h: 4 }, min: { w: 2, h: 2 }, options: [{ key: "input", type: "bool", label: "Show microphones", default: true }] },
  needs: () => ["audio"],
  mount(el, ctx) {
    el.classList.add("w-devices");
    el.innerHTML = `<div class="w-title">Audio</div><div class="dv-body" data-no-swipe></div><div class="cd-msg muted"></div>`;
    const body = el.querySelector(".dv-body");
    const msg = el.querySelector(".cd-msg");
    let sig = "";
    const section = (flow, title, icon) => {
      const s = document.createElement("div");
      s.className = "dv-sec";
      s.dataset.flow = flow;
      s.innerHTML = `<div class="dv-head"><span>${icon} ${title}</span><button class="ibtn dv-mute"></button></div><div class="vol-row"><input type="range" min="0" max="100" step="1" aria-label="${title} volume"><span class="vol-num"></span></div><div class="dv-list"></div>`;
      liveSlider(s.querySelector("input"), (v) => call(ctx, "audio.setDeviceVolume", { flow, volume: v }, msg));
      s.querySelector(".dv-mute").addEventListener("click", () => call(ctx, "audio.setDeviceMute", { flow, muted: s.dataset.muted !== "1" }, msg));
      return s;
    };
    ctx.subscribe("audio", (d) => {
      if (!d?.available) return (body.innerHTML = `<div class="muted setup">${esc(d?.error ?? "Connecting…")}</div>`);
      const next = JSON.stringify([d.output?.devices, d.input?.devices, d.canSwitch, ctx.options.input]);
      if (next !== sig) {
        sig = next;
        body.replaceChildren(section("render", "Output", "🔊"), ...(ctx.options.input !== false ? [section("capture", "Microphone", "🎙")] : []));
        for (const s of body.querySelectorAll(".dv-sec")) {
          const list = (s.dataset.flow === "render" ? d.output : d.input)?.devices ?? [];
          s.querySelector(".dv-list").innerHTML = list.map((x) => `<button class="dv-dev${x.default ? " on" : ""}" data-id="${esc(x.id)}" ${d.canSwitch ? "" : "disabled"}><i></i><span>${esc(x.name)}</span></button>`).join("") || `<div class="muted">None connected.</div>`;
          s.querySelectorAll(".dv-dev").forEach((b) => b.addEventListener("click", () => !b.classList.contains("on") && call(ctx, "audio.setDefault", { id: b.dataset.id }, msg)));
        }
        if (!d.canSwitch) body.insertAdjacentHTML("beforeend", `<div class="muted mx-note">Switching devices from the panel needs Windows.</div>`);
      }
      for (const s of body.querySelectorAll(".dv-sec")) {
        const st = s.dataset.flow === "render" ? d.output : d.input;
        setSlider(s.querySelector("input"), st?.volume);
        s.querySelector(".vol-num").textContent = `${pct(st?.volume)}%`;
        s.dataset.muted = st?.muted ? "1" : "";
        s.querySelector(".dv-mute").textContent = st?.muted ? (s.dataset.flow === "render" ? "🔇" : "🚫") : s.dataset.flow === "render" ? "🔈" : "🎙";
      }
    });
  },
};

// ---------------------------------------------------------- push-to-talk ----

export const ptt = {
  type: "ptt",
  meta: { name: "Push to talk", category: "deck", size: { w: 3, h: 3 }, min: { w: 1, h: 1 }, options: [{ key: "label", type: "text", label: "Label", default: "Hold to talk" }] },
  needs: () => ["audio"],
  mount(el, ctx) {
    el.classList.add("w-ptt");
    el.innerHTML = `<button class="ptt-btn" data-no-swipe><span class="ptt-ico">🎙</span><span class="ptt-lbl">${esc(ctx.options.label || "Hold to talk")}</span></button><div class="cd-msg muted"></div>`;
    const b = el.querySelector(".ptt-btn");
    const msg = el.querySelector(".cd-msg");
    let hold = null;
    const up = () => {
      if (!hold) return;
      clearInterval(hold);
      hold = null;
      b.classList.remove("live");
      call(ctx, "ptt.up", {}, msg);
    };
    b.addEventListener("pointerdown", async (e) => {
      e.preventDefault();
      b.setPointerCapture?.(e.pointerId);
      if (hold) return;
      b.classList.add("live");
      // Renew the lease while held; if this screen goes away, the host restores the mic.
      hold = setInterval(() => ctx.request("ptt.hold").catch(() => {}), 500);
      const r = await call(ctx, "ptt.down", {}, msg);
      if (!r?.ok) up();
    });
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
    b.addEventListener("contextmenu", (e) => e.preventDefault());
    ctx.subscribe("audio", (d) => {
      if (!hold) b.classList.toggle("live", !!d?.ptt);
      el.classList.toggle("off", d?.available === false);
      if (d?.available === false) msg.textContent = d.error ?? "";
    });
    return { unmount: up };
  },
};

// ------------------------------------------------ profiles and ducking ----

export const audioprofiles = {
  type: "audioprofiles",
  meta: { name: "Audio profiles", category: "deck", size: { w: 4, h: 2 }, min: { w: 2, h: 1 }, options: [{ key: "duck", type: "bool", label: "Show the “Duck other apps” switch", default: true }] },
  needs: () => ["audio"],
  mount(el, ctx) {
    el.classList.add("w-keys", "w-profiles");
    el.innerHTML = `<div class="w-title">Audio profiles</div><div class="keys-row" data-no-swipe></div><div class="cd-msg muted"></div>`;
    const row = el.querySelector(".keys-row");
    const msg = el.querySelector(".cd-msg");
    let sig = "";
    ctx.subscribe("audio", (d) => {
      const next = JSON.stringify([d?.profiles, d?.ducked, d?.perApp]);
      if (next === sig) return;
      sig = next;
      const profiles = d?.profiles ?? [];
      row.innerHTML = `${profiles.map((p) => `<button class="cd-btn key" data-id="${esc(p.id)}"><span class="cd-ico">🎚</span><span class="cd-lbl">${esc(p.name)}</span></button>`).join("")}${ctx.options.duck !== false && d?.perApp ? `<button class="cd-btn key duck${d.ducked ? " on" : ""}"><span class="cd-ico">🔉</span><span class="cd-lbl">${d.ducked ? "Ducking on" : "Duck others"}</span></button>` : ""}`;
      if (!profiles.length && !(ctx.options.duck !== false && d?.perApp)) row.innerHTML = `<div class="muted setup">${d?.perApp === false ? "Audio profiles need Windows." : "Save a profile in the editor (Settings › Audio)."}</div>`;
      row.querySelectorAll("[data-id]").forEach((b) =>
        b.addEventListener("click", async () => {
          const r = await call(ctx, "audio.profile", { id: b.dataset.id }, msg);
          if (r?.ok && r.notes?.length) msg.textContent = r.notes.join(" · ");
        }),
      );
      row.querySelector(".duck")?.addEventListener("click", () => call(ctx, "audio.duck", { on: !d.ducked }, msg));
    });
  },
};

// ------------------------------------------------------------ power plans ----

export const powerplan = {
  type: "powerplan",
  meta: { name: "Power plan", category: "deck", size: { w: 3, h: 2 }, min: { w: 2, h: 1 }, options: [] },
  needs: () => ["winsys"],
  mount(el, ctx) {
    el.classList.add("w-keys");
    el.innerHTML = `<div class="w-title">Power plan</div><div class="keys-row" data-no-swipe></div><div class="cd-msg muted"></div>`;
    const row = el.querySelector(".keys-row");
    const msg = el.querySelector(".cd-msg");
    ctx.subscribe("winsys", (d) => {
      const plans = d?.plans ?? [];
      if (!plans.length) return (row.innerHTML = `<div class="muted setup">${d?.platform && d.platform !== "win32" ? "Power plans are a Windows feature." : "Reading power plans…"}</div>`);
      row.innerHTML = plans.map((p) => `<button class="cd-btn key${p.active ? " on" : ""}" data-guid="${esc(p.guid)}"><span class="cd-ico">${/high|ultimate|perf/i.test(p.name) ? "🚀" : /saver|spar|économ|ahorro/i.test(p.name) ? "🍃" : "⚖️"}</span><span class="cd-lbl">${esc(p.name)}</span></button>`).join("");
      row.querySelectorAll("[data-guid]").forEach((b) => b.addEventListener("click", () => !b.classList.contains("on") && call(ctx, "system.plan", { guid: b.dataset.guid }, msg)));
    });
  },
};

// --------------------------------------------------------- Windows services ----

export const winservices = {
  type: "winservices",
  meta: { name: "Windows services", category: "deck", size: { w: 4, h: 3 }, min: { w: 2, h: 2 }, options: [] },
  needs: () => ["winsys"],
  mount(el, ctx) {
    el.classList.add("w-list", "w-services");
    el.innerHTML = `<div class="w-title">Services</div><div class="list" data-no-swipe></div><div class="cd-msg muted"></div>`;
    const list = el.querySelector(".list");
    const msg = el.querySelector(".cd-msg");
    ctx.subscribe("winsys", (d) => {
      if (d?.platform && d.platform !== "win32") return (list.innerHTML = `<div class="muted">Windows services show on a Windows PC.</div>`);
      const items = d?.services ?? [];
      if (!items.length) return (list.innerHTML = `<div class="muted">Pick services to show in the editor (Settings › Windows).</div>`);
      list.innerHTML = items
        .map((s) => `<div class="svc" data-state="${s.state === "running" ? "running" : "stopped"}"><div class="ct-row"><i class="sess-dot"></i><span class="grow"><b>${esc(s.display)}</b><span class="muted ct-sub">${esc(s.name)} · ${esc(s.state)}</span></span>${s.state === "running" ? `<button class="ibtn" data-n="${esc(s.name)}" data-a="restart" title="Restart">↻</button><button class="ibtn" data-n="${esc(s.name)}" data-a="stop" title="Stop">■</button>` : `<button class="ibtn go" data-n="${esc(s.name)}" data-a="start" title="Start">▶</button>`}</div></div>`)
        .join("");
      list.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => call(ctx, "system.service", { name: b.dataset.n, action: b.dataset.a }, msg)));
    });
  },
};

// ------------------------------------------------------------- brightness ----

export const brightness = {
  type: "brightness",
  meta: { name: "Display brightness", category: "deck", size: { w: 4, h: 2 }, min: { w: 2, h: 1 }, options: [] },
  needs: () => ["winsys"],
  mount(el, ctx) {
    el.classList.add("w-bright");
    el.innerHTML = `<div class="w-title">Brightness</div><div class="br-rows" data-no-swipe></div><div class="cd-msg muted"></div>`;
    const rows = el.querySelector(".br-rows");
    const msg = el.querySelector(".cd-msg");
    let sig = "";
    ctx.subscribe("winsys", (d) => {
      const displays = d?.displays ?? [];
      if (!displays.length) return (rows.innerHTML = `<div class="muted setup">${d?.platform && d.platform !== "win32" ? "Brightness from the panel works on Windows for now." : "No display reports its brightness (external monitors need DDC/CI on)."}</div>`), (sig = "");
      const next = JSON.stringify(displays.map((x) => [x.index, x.name]));
      if (next !== sig) {
        sig = next;
        rows.innerHTML = displays.map((x) => `<div class="vol-row" data-i="${x.index}"><span class="br-name">☀︎ ${esc(x.name)}</span><input type="range" min="0" max="100" step="1" aria-label="${esc(x.name)} brightness"><span class="vol-num"></span></div>`).join("");
        rows.querySelectorAll(".vol-row").forEach((r) => liveSlider(r.querySelector("input"), (v) => call(ctx, "system.brightness", { index: Number(r.dataset.i), percent: Math.round(v * 100) }, msg)));
      }
      for (const x of displays) {
        const r = rows.querySelector(`[data-i="${x.index}"]`);
        if (!r) continue;
        setSlider(r.querySelector("input"), x.percent / 100);
        r.querySelector(".vol-num").textContent = `${x.percent}%`;
      }
    });
  },
};

// ----------------------------------------------------------- lock / sleep ----

export const powerbuttons = {
  type: "powerbuttons",
  meta: { name: "Lock and sleep", category: "deck", size: { w: 3, h: 2 }, min: { w: 2, h: 1 }, options: [] },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-keys");
    el.innerHTML = `<div class="keys-row" data-no-swipe>${[
      ["lock", "🔒", "Lock"],
      ["sleep", "🌙", "Sleep"],
    ]
      .map(([a, i, l]) => `<button class="cd-btn key hold" data-a="${a}"><span class="hold-fill"></span><span class="cd-ico">${i}</span><span class="cd-lbl">${l}</span></button>`)
      .join("")}</div><div class="cd-msg muted">Hold to confirm</div>`;
    const msg = el.querySelector(".cd-msg");
    msg.classList.add("hint");
    for (const b of el.querySelectorAll(".hold")) {
      let t = null;
      const cancel = () => {
        clearTimeout(t);
        t = null;
        b.classList.remove("holding");
      };
      b.addEventListener("pointerdown", (e) => {
        b.setPointerCapture?.(e.pointerId);
        b.classList.add("holding");
        t = setTimeout(async () => {
          cancel();
          const r = await call(ctx, "system.power", { action: b.dataset.a, confirm: true }, msg);
          b.dataset.result = r?.ok ? "ok" : "fail";
          setTimeout(() => delete b.dataset.result, 900);
        }, 1000);
      });
      b.addEventListener("pointerup", cancel);
      b.addEventListener("pointercancel", cancel);
      b.addEventListener("contextmenu", (e) => e.preventDefault());
    }
  },
};

// ------------------------------------------- phone bridge (Android) ----

export const phonebridge = {
  type: "phonebridge",
  meta: { name: "Phone bridge (Android)", category: "personal", size: { w: 3, h: 2 }, min: { w: 2, h: 1 }, options: [] },
  needs: () => [],
  async mount(el, ctx) {
    el.classList.add("w-keys");
    el.innerHTML = `<div class="w-title">Clipboard</div><div class="keys-row" data-no-swipe></div><div class="cd-msg muted"></div>`;
    const row = el.querySelector(".keys-row");
    const msg = el.querySelector(".cd-msg");
    const p = await ctx.request("phone.platform").catch(() => null);
    if (!p?.android) return (row.innerHTML = `<div class="muted setup">The clipboard bridge works in the Android app.</div>`);
    row.innerHTML = `<button class="cd-btn key" data-m="phone.clipboard.send"><span class="cd-ico">📤</span><span class="cd-lbl">Phone → computer</span></button><button class="cd-btn key" data-m="phone.clipboard.receive"><span class="cd-ico">📥</span><span class="cd-lbl">Computer → phone</span></button>`;
    row.querySelectorAll("[data-m]").forEach((b) =>
      b.addEventListener("click", async () => {
        const r = await call(ctx, b.dataset.m, {}, msg);
        b.dataset.result = r?.ok ? "ok" : "fail";
        if (r?.ok) msg.textContent = b.dataset.m.endsWith("send") ? "Copied to the computer." : "Copied to this phone.";
        setTimeout(() => delete b.dataset.result, 900);
      }),
    );
  },
};
