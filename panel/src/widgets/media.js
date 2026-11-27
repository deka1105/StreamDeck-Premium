// Stage 7 widgets: now playing, volume, radio, synced lyrics, media server.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const mmss = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "—");

/** Current position in seconds, moved on by the time since the sample. Pure. */
export function livePosition(m, now = Date.now()) {
  if (!m || !Number.isFinite(m.position)) return null;
  const p = m.state === "playing" ? m.position + (now - (m.at ?? now)) / 1000 : m.position;
  return Number.isFinite(m.duration) ? Math.min(p, m.duration) : p;
}

function btn(label, cls, onclick, aria) {
  const b = document.createElement("button");
  b.className = `mbtn ${cls}`;
  b.textContent = label;
  b.dataset.noSwipe = "";
  if (aria) b.setAttribute("aria-label", aria);
  b.addEventListener("click", onclick);
  return b;
}

// ------------------------------------------------------------ now playing ----

export const nowplaying = {
  type: "nowplaying",
  meta: {
    name: "Now playing",
    category: "media",
    size: { w: 6, h: 3 },
    min: { w: 3, h: 1 },
    options: [
      { key: "volume", type: "bool", label: "Show the volume slider", default: true },
      { key: "server", type: "bool", label: "Show the media server when the computer is idle", default: true },
    ],
  },
  needs: (o) => (o.server ? ["media", "mediaServer"] : ["media"]),
  mount(el, ctx) {
    el.classList.add("w-nowplaying");
    el.innerHTML = `<div class="np-art"><img alt=""></div><div class="np-body"><div class="np-app muted"></div><div class="np-title"></div><div class="np-artist muted"></div>
      <div class="np-seek" data-no-swipe><div class="np-fill"></div></div><div class="np-times muted"><span class="np-pos"></span><span class="np-dur"></span></div><div class="np-ctrls"></div></div>`;
    const $ = (s) => el.querySelector(s);
    const img = $(".np-art img");
    let m = null;
    let server = null;
    let artId = null;
    const send = (command, value) => ctx.request("media.control", { command, value }).catch(() => {});
    $(".np-ctrls").append(
      btn("⏮", "", () => send("previous"), "Previous"),
      btn("⏯", "big", () => send("playpause"), "Play or pause"),
      btn("⏭", "", () => send("next"), "Next"),
    );
    $(".np-seek").addEventListener("click", (e) => {
      if (!m?.canSeek || !m.duration) return;
      const r = e.currentTarget.getBoundingClientRect();
      send("seek", Math.round(((e.clientX - r.left) / r.width) * m.duration));
    });
    const tick = () => {
      const show = m?.playing ? m : null;
      const pos = livePosition(show);
      $(".np-fill").style.width = show?.duration ? `${(100 * (pos ?? 0)) / show.duration}%` : "0%";
      $(".np-pos").textContent = show ? mmss(pos) : "";
    };
    const render = () => {
      const s = server?.servers?.flatMap((x) => x.sessions.map((sess) => ({ ...sess, serverName: x.name, serverId: x.id }))).find((x) => x.state === "playing");
      const useServer = ctx.options.server && !m?.playing && s;
      el.dataset.state = m?.playing ? m.state : useServer ? "server" : "idle";
      if (useServer) {
        $(".np-app").textContent = `${s.serverName} · ${s.device}${s.user ? ` · ${s.user}` : ""}`;
        $(".np-title").textContent = s.title;
        $(".np-artist").textContent = s.subtitle;
        $(".np-dur").textContent = mmss(s.duration);
        if (artId !== `srv:${s.id}`) {
          artId = `srv:${s.id}`;
          ctx.request("mediaServer.poster", { server: s.serverId, session: s.id }).then((r) => (img.src = r?.src || ""), () => {});
        }
        return;
      }
      if (!m?.playing) {
        $(".np-app").textContent = m?.supported === false ? "" : m?.players ? `Plays from ${m.players}` : "";
        $(".np-title").textContent = "Nothing playing";
        $(".np-artist").textContent = "";
        $(".np-dur").textContent = "";
        img.removeAttribute("src");
        artId = null;
        return;
      }
      $(".np-app").textContent = `${m.app} · ${m.state === "playing" ? "playing" : "paused"}`;
      $(".np-title").textContent = m.title;
      $(".np-artist").textContent = [m.artist, m.album].filter(Boolean).join(" — ");
      $(".np-dur").textContent = mmss(m.duration);
      if (m.artId !== artId) {
        artId = m.artId;
        img.removeAttribute("src");
        ctx.request("media.art", { artId }).then((r) => r?.src && artId === m.artId && (img.src = r.src), () => {});
      }
      tick();
    };
    if (ctx.options.volume) {
      const vol = document.createElement("div");
      vol.className = "np-vol";
      vol.dataset.noSwipe = "";
      vol.innerHTML = `<button class="mbtn np-mute" aria-label="Mute">🔈</button><input type="range" min="0" max="100" step="1" aria-label="Volume">`;
      el.querySelector(".np-body").append(vol);
      volumeControl(vol, ctx, () => m);
    }
    ctx.subscribe("media", (v) => ((m = v), render()));
    if (ctx.options.server) ctx.subscribe("mediaServer", (v) => ((server = v), render()));
    ctx.every(500, tick);
  },
};

/** Volume slider + mute, throttled to one change per 300 ms. */
function volumeControl(box, ctx, current) {
  const range = box.querySelector("input");
  const mute = box.querySelector(".np-mute, .vol-mute");
  let dragging = false;
  let pending = null;
  let timer = null;
  const flush = () => {
    timer = null;
    if (pending === null) return;
    ctx.request("media.control", { command: "setvol", value: pending }).catch(() => {});
    pending = null;
  };
  range.addEventListener("input", () => {
    dragging = true;
    pending = Number(range.value);
    if (!timer) timer = setTimeout(flush, 300);
  });
  range.addEventListener("change", () => {
    dragging = false;
    pending = Number(range.value);
    clearTimeout(timer);
    flush();
  });
  mute.addEventListener("click", () => ctx.request("media.control", { command: "mute" }).catch(() => {}));
  ctx.subscribe("media", (m) => {
    if (!dragging && Number.isFinite(m?.volume)) range.value = String(m.volume);
    mute.textContent = m?.muted ? "🔇" : "🔈";
    box.dataset.muted = m?.muted ? "1" : "";
    void current;
  });
}

export const volume = {
  type: "volume",
  meta: { name: "Volume", category: "media", size: { w: 4, h: 1 }, min: { w: 2, h: 1 }, options: [] },
  needs: () => ["media"],
  mount(el, ctx) {
    el.classList.add("w-volume");
    el.innerHTML = `<div class="vol-row" data-no-swipe><button class="mbtn vol-mute" aria-label="Mute">🔈</button><input type="range" min="0" max="100" step="1" aria-label="Volume"><span class="vol-num"></span></div>`;
    volumeControl(el.querySelector(".vol-row"), ctx, () => null);
    ctx.subscribe("media", (m) => (el.querySelector(".vol-num").textContent = Number.isFinite(m?.volume) ? `${m.volume}%` : "—"));
  },
};

// ------------------------------------------------------------------- radio ----

export const radio = {
  type: "radio",
  meta: {
    name: "Radio",
    category: "media",
    size: { w: 4, h: 3 },
    min: { w: 2, h: 2 },
    options: [{ key: "stations", type: "list", label: "Stations, one per line: Name | https://stream-address", default: [] }],
  },
  needs: () => ["radio"],
  mount(el, ctx) {
    el.classList.add("w-list", "w-radio");
    el.innerHTML = `<div class="w-title">Radio <span class="muted rd-now"></span></div><div class="list" data-no-swipe></div><div class="rd-msg muted"></div>`;
    const list = el.querySelector(".list");
    const msg = el.querySelector(".rd-msg");
    const stations = (ctx.options.stations ?? []).map((l) => String(l).split("|").map((x) => x.trim())).map((p) => ({ name: p.length > 1 ? p[0] : p[0], ok: /^https?:\/\//.test(p.at(-1)) })).filter((s) => s.ok);
    let playing = null;
    const draw = () => {
      if (!stations.length) return (list.innerHTML = `<div class="muted">Add stations in the editor: one “Name | https://stream” per line.</div>`);
      list.replaceChildren(
        ...stations.map((s, i) => {
          const b = document.createElement("button");
          b.className = `rd-row${playing === s.name ? " on" : ""}`;
          b.innerHTML = `<span>${playing === s.name ? "■" : "▶"}</span><span class="rd-name"></span>`;
          b.querySelector(".rd-name").textContent = s.name;
          b.addEventListener("click", async () => {
            msg.textContent = "";
            const r = playing === s.name ? await ctx.request("radio.stop") : await ctx.request("radio.play", { pageId: ctx.pageId, widgetId: ctx.widgetId, index: i });
            if (r?.ok === false) msg.textContent = r.error;
          });
          return b;
        }),
      );
    };
    ctx.subscribe("radio", (r) => {
      playing = r?.playing ?? null;
      el.querySelector(".rd-now").textContent = playing ? `· ${playing}` : "";
      if (!r?.player && stations.length) msg.textContent = "Install mpv, ffplay or VLC on the computer to play radio.";
      draw();
    });
    draw();
  },
};

// ------------------------------------------------------------------ lyrics ----

/** Index of the line being sung at `pos` (seconds). Pure. */
export function currentLine(lines, pos) {
  let i = -1;
  for (let k = 0; k < lines.length; k++) if (lines[k].t <= pos) i = k;
  return i;
}

export const lyrics = {
  type: "lyrics",
  meta: {
    name: "Synced lyrics",
    category: "media",
    size: { w: 6, h: 4 },
    min: { w: 3, h: 2 },
    options: [
      { key: "lookup", type: "bool", label: "Look up lyrics on LRCLIB (sends the song title, artist, album and length)", default: false },
      { key: "offset", type: "number", label: "Timing offset in ms (positive = earlier)", default: 0, min: -5000, max: 5000 },
      { key: "plain", type: "bool", label: "Show plain lyrics when there are no timed ones", default: true },
    ],
  },
  needs: () => ["media"],
  mount(el, ctx) {
    el.classList.add("w-lyrics");
    el.innerHTML = `<div class="ly-lines"></div>`;
    const box = el.querySelector(".ly-lines");
    let song = null;
    let lines = [];
    let m = null;
    const say = (t) => (box.innerHTML = `<div class="muted ly-msg">${esc(t)}</div>`);
    if (!ctx.options.lookup) return say("Turn on “Look up lyrics on LRCLIB” in this widget's options.");
    const load = async () => {
      lines = [];
      const r = await ctx.request("lyrics.get", { pageId: ctx.pageId, widgetId: ctx.widgetId }).catch((e) => ({ ok: false, error: e.message }));
      if (!r?.ok) return say(r?.error ?? "Lyrics unavailable.");
      if (r.idle) return say("Nothing playing.");
      if (!r.found) return say("No lyrics found for this song.");
      if (r.synced?.length) {
        lines = r.synced;
        box.innerHTML = lines.map((l, i) => `<div class="ly-line" data-i="${i}">${esc(l.text) || "♪"}</div>`).join("");
      } else if (ctx.options.plain && r.plain) box.innerHTML = `<div class="muted ly-msg">These lines can't follow the song.</div><div class="ly-plain">${esc(r.plain)}</div>`;
      else say("No timed lyrics for this song.");
    };
    let shown = -2;
    const follow = () => {
      if (!lines.length || !m?.playing) return;
      const i = currentLine(lines, (livePosition(m) ?? 0) + ctx.options.offset / 1000);
      if (i === shown) return;
      shown = i;
      box.querySelectorAll(".ly-line.on").forEach((n) => n.classList.remove("on"));
      const cur = box.querySelector(`.ly-line[data-i="${i}"]`);
      if (cur) {
        cur.classList.add("on");
        box.scrollTo({ top: cur.offsetTop - box.clientHeight / 2 + cur.clientHeight / 2, behavior: "smooth" });
      }
    };
    ctx.subscribe("media", (v) => {
      m = v;
      const key = v?.playing ? `${v.title}|${v.artist}` : null;
      if (key !== song) {
        song = key;
        shown = -2;
        key ? load() : say("Nothing playing.");
      }
    });
    ctx.every(300, follow);
  },
};

// ------------------------------------------------------------ media server ----

export const mediaserver = {
  type: "mediaserver",
  meta: { name: "Media server", category: "media", size: { w: 6, h: 3 }, min: { w: 3, h: 2 }, options: [] },
  needs: () => ["mediaServer"],
  mount(el, ctx) {
    el.classList.add("w-mediaserver");
    let posterFor = null;
    let posterSrc = null;
    ctx.subscribe("mediaServer", (d) => {
      const srv = d?.servers?.[0];
      if (!d?.configured) return (el.innerHTML = `<div class="muted setup">Add a Plex or Jellyfin server in the editor (Settings › Media servers).</div>`);
      if (!srv?.online) return (el.innerHTML = `<div class="muted setup">${esc(srv?.name ?? "Server")} is offline${srv?.error ? `: ${esc(srv.error)}` : ""}.</div>`);
      const s = srv.sessions[0];
      if (!s) {
        posterFor = null;
        return (el.innerHTML = `<div class="ms-head"><b>${esc(srv.name)}</b> <span class="muted">${esc(srv.version)}</span></div><div class="muted">Nothing playing.</div><div class="ms-lib muted">${esc(srv.library)}</div>`);
      }
      const more = srv.sessions.length - 1;
      el.innerHTML = `<div class="ms-row"><div class="ms-poster"><img alt=""></div><div class="ms-body">
        <div class="ms-head"><b>${esc(srv.name)}</b>${s.transcoding ? ' <span class="tag">transcoding</span>' : ""}${more ? ` <span class="muted">(+${more} more)</span>` : ""}</div>
        <div class="np-title">${esc(s.title)}</div><div class="muted">${esc(s.subtitle)}</div>
        <div class="np-seek"><div class="np-fill" style="width:${s.duration ? (100 * s.position) / s.duration : 0}%"></div></div>
        <div class="muted ms-dev">${esc(s.device)}${s.user ? ` · ${esc(s.user)}` : ""} · ${s.state}</div><div class="np-ctrls"></div></div></div>`;
      if (s.canControl && srv.type === "jellyfin") {
        const send = (command) => ctx.request("mediaServer.control", { server: srv.id, session: s.id, command });
        el.querySelector(".np-ctrls").append(btn("⏮", "", () => send("previous")), btn("⏯", "big", () => send("playpause")), btn("⏭", "", () => send("next")));
      }
      const img = el.querySelector(".ms-poster img");
      if (posterFor === s.id && posterSrc) img.src = posterSrc; // the card redraws every few seconds; fetch the poster once
      else {
        posterFor = s.id;
        posterSrc = null;
        ctx.request("mediaServer.poster", { server: srv.id, session: s.id }).then((r) => r?.src && posterFor === s.id && (img.src = posterSrc = r.src), () => {});
      }
    });
  },
};
