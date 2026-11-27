// Stage 9 widgets: coding-agent sessions, plan limits, token use, waiting
// alerts, GitHub contributions and pull requests. The host sends only ids,
// project folder names, models, counts and timestamps — never prompt text.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ago = (t) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : new Date(t).toLocaleDateString();
};
const until = (t) => {
  const m = Math.max(0, Math.round((t - Date.now()) / 60000));
  return m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.round(m / 1440)} days`;
};
export const tokens = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n ?? 0));
const shortModel = (m) => String(m ?? "").replace(/^claude-/, "").replace(/-\d{8}$/, "");
const AGENTS = [
  { value: "auto", label: "Most recently used" },
  { value: "claude", label: "Claude Code" },
  { value: "codex", label: "Codex" },
];
const pick = (d, opt) => d?.[opt === "auto" ? d?.recent ?? "claude" : opt];
const level = (pct) => (pct >= 90 ? "error" : pct >= 70 ? "warn" : "ok");

// --------------------------------------------------------------- sessions ----

export const sessions = {
  type: "sessions",
  meta: { name: "Agent sessions", category: "ai", size: { w: 4, h: 3 }, min: { w: 2, h: 2 }, options: [{ key: "tap", type: "bool", label: "Tap a session to bring its window forward", default: true }] },
  needs: () => ["ai", "alerts"],
  mount(el, ctx) {
    el.classList.add("w-list", "w-sessions");
    let ai = null;
    let alerts = null;
    const draw = () => {
      const waiting = new Map((alerts?.alerts ?? []).map((a) => [a.session, a]));
      const prompts = new Set((alerts?.prompts ?? []).map((p) => p.session));
      const list = ai?.sessions ?? [];
      el.innerHTML = `<div class="w-title">Agent sessions <span class="muted">${list.length || ""}</span></div><div class="list">${
        list.length
          ? list
              .map((s) => {
                const state = prompts.has(s.id) ? "permission" : waiting.get(s.id)?.kind ?? s.status;
                const label = { working: "Working", idle: "Idle", permission: "Needs permission", input: "Waiting for you", finished: "Finished", question: "Has a question" }[state] ?? state;
                return `<button class="sess-row" data-id="${esc(s.id)}" data-state="${esc(state)}"><i class="sess-dot"></i><span class="grow"><b>${esc(s.project || "—")}</b><span class="muted"> ${s.agent === "codex" ? "Codex" : "Claude"} · ${esc(shortModel(s.model))}</span></span><span class="sess-state">${label}</span><span class="muted sess-tok">${tokens((s.tokens?.input ?? 0) + (s.tokens?.output ?? 0))}</span></button>`;
              })
              .join("")
          : `<div class="muted">No Claude Code or Codex sessions running.</div>`
      }</div>`;
    };
    ctx.subscribe("ai", (d) => ((ai = d), draw()));
    ctx.subscribe("alerts", (d) => ((alerts = d), draw()));
    el.addEventListener("click", async (e) => {
      const row = e.target.closest(".sess-row");
      if (!row || !ctx.options.tap) return;
      await ctx.request("agent.dismiss", { session: row.dataset.id }).catch(() => {});
      const r = await ctx.request("agent.focus", { id: row.dataset.id }).catch((err) => ({ ok: false, error: err.message }));
      row.dataset.result = r?.ok ? "ok" : "fail";
    });
  },
};

// ----------------------------------------------------------------- quotas ----

function bar(label, w, fullAt) {
  if (!w) return `<div class="quota-row muted">${label}: not reported yet</div>`;
  const pct = Math.max(0, Math.min(100, w.used));
  return `<div class="quota-row" data-level="${level(pct)}"><div class="kv"><span class="k">${label}</span><span class="v">${Math.round(pct)}%</span></div><div class="minibar"><i style="width:${pct}%"></i></div><div class="muted quota-sub">${w.resetsAt ? `resets in ${until(w.resetsAt)}` : ""}${fullAt ? ` · at this pace full in ${until(fullAt)}` : ""}</div></div>`;
}

export const aiquota = {
  type: "aiquota",
  meta: { name: "AI plan limits", category: "ai", size: { w: 3, h: 3 }, min: { w: 2, h: 2 }, options: [{ key: "agent", type: "choice", label: "Agent", default: "auto", choices: AGENTS }] },
  needs: () => ["ai"],
  mount(el, ctx) {
    el.classList.add("w-quota");
    ctx.subscribe("ai", (d) => {
      const which = ctx.options.agent === "auto" ? d?.recent ?? "claude" : ctx.options.agent;
      const a = d?.[which];
      const name = which === "codex" ? "Codex" : "Claude Code";
      if (!a?.installed) return (el.innerHTML = `<div class="w-title">${name}</div><div class="muted">Not installed on this computer.</div>`);
      const l = a.limits;
      if (!l || (!l.five && !l.week))
        return (el.innerHTML = `<div class="w-title">${name} limits</div><div class="muted">${which === "claude" ? "Turn on the Claude Code link in the editor (Settings › AI & code). Limits appear after your next message in Claude Code." : "Appear after Codex's next reply."}</div>`);
      const stale = l.at && Date.now() - l.at > 10 * 60_000 ? `<div class="muted quota-sub">as of ${new Date(l.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>` : "";
      el.innerHTML = `<div class="w-title">${name} limits</div>${bar("5-hour", l.five, l.fiveFullAt)}${bar("Weekly", l.week, l.weekFullAt)}${stale}`;
    });
  },
};

// ----------------------------------------------------------------- tokens ----

export const tokenuse = {
  type: "tokens",
  meta: { name: "Token use", category: "ai", size: { w: 3, h: 2 }, min: { w: 2, h: 2 }, options: [{ key: "agent", type: "choice", label: "Agent", default: "claude", choices: AGENTS }] },
  needs: () => ["ai"],
  mount(el, ctx) {
    el.classList.add("w-tokens");
    ctx.subscribe("ai", (d) => {
      const u = pick(d, ctx.options.agent)?.usage;
      if (!u) return (el.innerHTML = `<div class="w-title">Tokens</div><div class="muted">No data yet.</div>`);
      const max = Math.max(1, ...u.days.map((x) => x.tokens));
      const models = Object.entries(u.models ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
      el.innerHTML = `<div class="w-title">Tokens today</div><div class="tok-big">${tokens(u.today)}</div><div class="muted">${tokens(u.lastHour)} in the last hour${models.length ? ` · ${models.map(([m, n]) => `${esc(shortModel(m))} ${tokens(n)}`).join(", ")}` : ""}</div><div class="tok-bars">${u.days.map((x) => `<i title="${esc(x.day)}: ${tokens(x.tokens)}" style="height:${Math.max(4, (x.tokens / max) * 100)}%"></i>`).join("")}</div>`;
    });
  },
};

// ----------------------------------------------------------------- alerts ----

export const agentalerts = {
  type: "agentalerts",
  meta: { name: "Waiting for you", category: "ai", size: { w: 4, h: 2 }, min: { w: 2, h: 1 }, options: [] },
  needs: () => ["alerts"],
  mount(el, ctx) {
    el.classList.add("w-alerts");
    ctx.subscribe("alerts", (d) => {
      const items = [...(d?.prompts ?? []).map((p) => ({ ...p, kind: "permission", message: `${p.tool}: ${p.detail}` })), ...(d?.alerts ?? [])];
      el.dataset.on = items.length ? "1" : "";
      el.innerHTML = items.length
        ? `<div class="w-title">Waiting for you · ${items.length}</div><div class="list">${items.map((a) => `<div class="note-row" data-level="${a.kind === "permission" ? "warn" : "info"}"><b>${esc(a.project || "Claude Code")}</b><span>${esc(a.message)}</span><span class="muted">${ago(a.at)}</span></div>`).join("")}</div>`
        : `<div class="w-title">Waiting for you</div><div class="muted alerts-clear">✓ Nothing is waiting.</div>`;
    });
  },
};

// ---------------------------------------------------------------- github ----

export const contributions = {
  type: "contributions",
  meta: { name: "GitHub contributions", category: "ai", size: { w: 6, h: 2 }, min: { w: 3, h: 2 }, options: [{ key: "weeks", type: "number", label: "Weeks to show", default: 26, min: 4, max: 53 }] },
  needs: () => ["github"],
  mount(el, ctx) {
    el.classList.add("w-contrib");
    ctx.subscribe("github", (g) => {
      if (!g || g.error) return (el.innerHTML = `<div class="w-title">GitHub</div><div class="muted">${esc(g?.error ?? "Loading…")}</div>`);
      const days = g.days.slice(-ctx.options.weeks * 7);
      const max = Math.max(1, ...days.map((d) => d.count));
      const lvl = (n) => (n === 0 ? 0 : Math.ceil((n / max) * 4));
      el.innerHTML = `<div class="w-title">${esc(g.login)} · ${g.total} contributions this year · 🔥 ${g.streak}-day streak</div><div class="contrib-grid" style="--weeks:${Math.ceil(days.length / 7)}">${days.map((d) => `<i data-l="${lvl(d.count)}" title="${esc(d.date)}: ${d.count}"></i>`).join("")}</div><div class="muted contrib-kinds">${g.kinds.commits} commits · ${g.kinds.prs} PRs · ${g.kinds.reviews} reviews · ${g.kinds.issues} issues</div>`;
    });
  },
};

export const prs = {
  type: "prs",
  meta: { name: "Pull requests", category: "ai", size: { w: 4, h: 3 }, min: { w: 2, h: 2 }, options: [{ key: "show", type: "choice", label: "Show", default: "both", choices: [{ value: "both", label: "Mine and review requests" }, { value: "mine", label: "My open PRs" }, { value: "reviews", label: "Waiting for my review" }] }] },
  needs: () => ["github"],
  mount(el, ctx) {
    el.classList.add("w-list", "w-prs");
    ctx.subscribe("github", (g) => {
      if (!g || g.error) return (el.innerHTML = `<div class="w-title">Pull requests</div><div class="muted">${esc(g?.error ?? "Loading…")}</div>`);
      const icon = { passing: "✅", failing: "❌", running: "⏳", none: "·" };
      const row = (p, sub) => `<button class="pr-row" data-url="${esc(p.url)}"><span>${sub}</span><span class="grow"><b>${esc(p.title)}</b><span class="muted"> ${esc(p.repo)}#${p.number}</span></span></button>`;
      const mine = ctx.options.show !== "reviews" ? g.prs.map((p) => row(p, p.draft ? "📝" : icon[p.checks])) : [];
      const rev = ctx.options.show !== "mine" ? g.reviews.items.map((p) => row(p, "👀")) : [];
      el.innerHTML = `<div class="w-title">Pull requests${g.reviews.count && ctx.options.show !== "mine" ? ` · <span class="pr-badge">${g.reviews.count} to review</span>` : ""}</div><div class="list">${[...rev, ...mine].join("") || `<div class="muted">Nothing open.</div>`}</div>`;
    });
    el.addEventListener("click", (e) => {
      const b = e.target.closest(".pr-row");
      if (b) ctx.request("github.open", { url: b.dataset.url }).catch(() => {});
    });
  },
};

// ------------------------------------------- the Allow / Deny prompt card ----

/** Shows Claude Code permission requests on top of any page. */
export function createPromptCard(root, bridge) {
  const cards = new Map();
  const draw = () => {
    root.hidden = cards.size === 0;
    root.replaceChildren(
      ...[...cards.values()].map((p) => {
        const c = document.createElement("div");
        c.className = "prompt-card";
        c.dataset.id = p.id;
        const left = Math.max(0, Math.round((p.expiresAt - Date.now()) / 1000));
        c.innerHTML = `<div class="sw-why">Claude Code · ${esc(p.project)}</div><div class="prompt-tool">${esc(p.tool)}</div><pre class="prompt-detail">${esc(p.detail)}</pre><div class="sw-actions"><button class="btn prompt-deny">Deny</button><button class="btn primary prompt-allow">Allow</button></div><div class="muted prompt-left">Asks in the terminal in ${left} s</div>`;
        return c;
      }),
    );
  };
  const tick = setInterval(() => {
    for (const [id, p] of cards) if (Date.now() > p.expiresAt) cards.delete(id);
    if (cards.size) draw();
    else root.hidden = true;
  }, 1000);
  root.addEventListener("click", async (e) => {
    const card = e.target.closest(".prompt-card");
    const decision = e.target.closest(".prompt-allow") ? "allow" : e.target.closest(".prompt-deny") ? "deny" : null;
    if (!card || !decision) return;
    card.querySelectorAll("button").forEach((b) => (b.disabled = true));
    await bridge.request("agent.answer", { id: card.dataset.id, decision }).catch(() => {});
    cards.delete(card.dataset.id);
    draw();
  });
  return {
    show(p) {
      cards.set(p.id, p);
      draw();
    },
    done(id) {
      cards.delete(id);
      draw();
    },
    sync(prompts = []) {
      const keep = new Set(prompts.map((p) => p.id));
      for (const id of cards.keys()) if (!keep.has(id)) cards.delete(id);
      for (const p of prompts) cards.set(p.id, p);
      draw();
    },
    stop: () => clearInterval(tick),
  };
}
