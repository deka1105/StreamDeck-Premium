// Editor › Settings › AI & code: the Claude Code link (hooks + status line),
// phone permission prompts, waiting alerts, and the GitHub sign-in.

export function renderAi(root, { state, h, change, api, flash }) {
  const s = state.config.settings;
  s.agents ??= { phonePrompts: false, onlyWhenAway: false, timeoutSec: 60, alerts: true, idleAlertSec: 30 };
  const a = s.agents;
  const status = h("p", { class: "hint", id: "agentStatus", text: "Checking Claude Code…" });
  const btns = h("div", { class: "row" });
  const refresh = async () => {
    const st = await api("/api/editor/agents").catch(() => null);
    if (!st) return (status.textContent = "Couldn't read the Claude Code status.");
    if (!st.claudeFound) {
      status.textContent = "Claude Code isn't set up for this user on this computer.";
      return btns.replaceChildren();
    }
    status.textContent = st.installed ? `Linked. DeskAssist hooks and its status-line bridge are in ${st.settingsFile}.` : `Not linked. Linking adds a few hooks and a status-line bridge to ${st.settingsFile} (a backup is kept; your current status line keeps working).`;
    btns.replaceChildren(
      st.installed
        ? h("button", { class: "btn danger", id: "agentRemove", text: "Unlink Claude Code", onclick: async () => (await api("/api/editor/agents/remove", {}), flash("Unlinked — the previous status line is back."), refresh()) })
        : h("button", { class: "btn", id: "agentInstall", text: "Link Claude Code", onclick: async () => {
            const r = await api("/api/editor/agents/install", {}).catch((e) => ({ ok: false, error: e.message }));
            flash(r.ok ? "Linked. New Claude Code sessions pick it up; running ones after a restart." : r.error, !r.ok);
            refresh();
          } }),
    );
  };
  refresh();
  const check = (id, key, label) => h("label", { class: "check" }, h("input", { type: "checkbox", id, checked: a[key], onchange: (e) => change(() => (a[key] = e.target.checked)) }), label);
  const num = (id, key, label) => h("label", {}, label, h("input", { id, type: "number", value: a[key], style: "max-width:90px", onchange: (e) => change(() => (a[key] = Number(e.target.value) || 0)) }));
  const tok = h("input", { id: "githubToken", type: "password", placeholder: "Fine-grained token (optional)", autocomplete: "off" });
  root.append(
    h(
      "section",
      { class: "set-section" },
      h("h3", { text: "AI & code" }),
      status,
      btns,
      check("agentPrompts", "phonePrompts", "Answer Claude Code permission requests on the panel (Allow / Deny)"),
      check("agentAway", "onlyWhenAway", "…only when I'm away from this computer"),
      num("agentTimeout", "timeoutSec", "If nobody answers, ask in the terminal after (s)"),
      check("agentAlerts", "alerts", "Show when a session is waiting for me"),
      num("agentIdle", "idleAlertSec", "Count a finished reply as waiting after (s)"),
      h("p", { class: "hint", text: "The panel shows the project folder, the tool and the command or file — never your prompts or Claude's replies." }),
      h("h4", { text: "GitHub" }),
      h("p", { class: "hint", text: "Uses the gh command-line tool if you're signed in. Or paste a fine-grained token (read-only access to your repositories); it's stored encrypted on this computer." }),
      h("div", { class: "row" }, tok, h("button", { class: "btn", text: "Save token", onclick: async () => {
        await api("/api/editor/github-token", { token: tok.value });
        tok.value = "";
        flash("GitHub token saved.");
      } }), h("button", { class: "btn danger", text: "Forget token", onclick: async () => (await api("/api/editor/github-token", { token: "" }), flash("GitHub token removed.")) })),
    ),
  );
}
