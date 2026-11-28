// Editor › Settings › Desk edges: controls at the computer's screen edges and
// corners, a hidden dock beside the Dock/taskbar, per-app profiles, and the
// glass look. Changes apply on Save, without restarting DeskAssist.

const SLIDERS = [["none", "Nothing"], ["volume", "Volume"], ["brightness", "Brightness"], ["appearance", "Light / dark"]];
const DIALS = [["none", "Nothing"], ["volume", "Volume"], ["brightness", "Brightness"], ["appearance", "Light / dark"], ["output", "Audio output"], ["timer", "Timer"], ["music", "Music"], ["keyboard", "Keyboard light"]];
const lines = (v) => String(v ?? "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

export function renderEdges(root, { state, h, change }) {
  const s = state.config.settings;
  s.edges ??= {};
  const e = s.edges;
  e.base ??= { left: "volume", right: "none", corners: { tl: "timer", tr: "none", bl: "appearance", br: "music" }, dock: [], launcher: [] };
  e.base.corners ??= {};
  e.style ??= { look: "glass", tint: "#0f172a", accent: "#38bdf8", opacity: 0.72, frost: 18, highlight: 0.18 };
  e.profiles ??= [];

  const sel = (id, opts, value, set, blank = false) => {
    const el = h("select", { id, onchange: (ev) => change(() => set(ev.target.value)) }, [...(blank ? [["", "Same as normal"]] : []), ...opts].map(([v, l]) => h("option", { value: v, text: l })));
    el.value = value ?? "";
    return el;
  };
  const num = (id, label, obj, key, min, max, step = 1) => h("label", {}, label, h("input", { id, type: "range", min, max, step, value: obj[key], oninput: (ev) => change(() => (obj[key] = Number(ev.target.value))) }));
  const zones = (target, blank) =>
    h(
      "div",
      { class: "edge-grid" },
      h("label", {}, "Left edge", sel(`${blank ? "p" : "e"}Left`, SLIDERS, target.left, (v) => (target.left = v || undefined), blank)),
      h("label", {}, "Right edge", sel(`${blank ? "p" : "e"}Right`, SLIDERS, target.right, (v) => (target.right = v || undefined), blank)),
      ...[["tl", "Top-left corner"], ["tr", "Top-right corner"], ["bl", "Bottom-left corner"], ["br", "Bottom-right corner"]].map(([k, l]) =>
        h("label", {}, l, sel(`${blank ? "p" : "e"}${k}`, DIALS, (target.corners ??= {})[k], (v) => (target.corners[k] = v || undefined), blank)),
      ),
    );

  root.append(
    h(
      "section",
      { class: "set-section", id: "edgeSettings" },
      h("h3", { text: "Desk edges" }),
      h("p", { class: "hint", text: "Controls that appear when the pointer reaches the edge or a corner of this computer's screen, and a hidden dock beside the Dock (or taskbar). Part of the DeskAssist app (not the command-line host). Nothing is drawn or clicked until you reach an edge." }),
      h("label", { class: "check" }, h("input", { type: "checkbox", id: "edgesOn", checked: e.enabled === true, onchange: (ev) => change(() => (e.enabled = ev.target.checked)) }), "Turn on desk edges"),
      h(
        "div",
        { class: "row" },
        h("label", {}, "Screens ", sel("edgesDisplays", [["all", "Every display"], ["primary", "Main display only"]], e.displays ?? "all", (v) => (e.displays = v))),
        h("label", { class: "check" }, h("input", { type: "checkbox", id: "edgesFull", checked: e.allowFullscreen === true, onchange: (ev) => change(() => (e.allowFullscreen = ev.target.checked)) }), "Also over full-screen apps"),
      ),
      num("edgesPressure", "Push into the edge before it opens (ms) ", e, "pressureMs", 0, 1000, 50),
      h("h4", { text: "Edges and corners" }),
      zones(e.base, false),
      h("p", { class: "hint", text: "Sweep along a slider to set it; turn a corner dial by moving around the corner. Pull a dial out of its corner to float it anywhere; double-click a floating dial to send it back. On a Mac, display brightness and keyboard light need private Apple APIs, so those show “not available”." }),
      h("h4", { text: "Hidden dock" }),
      h("label", {}, "Apps in the dock (up to 8, one per line, e.g. Safari)", h("textarea", { id: "edgesDock", rows: 3, value: (e.base.dock ?? []).join("\n"), onchange: (ev) => change(() => (e.base.dock = lines(ev.target.value).slice(0, 8))) })),
      h("label", {}, "More apps in the launcher (pull up on the dock)", h("textarea", { id: "edgesLauncher", rows: 3, value: (e.base.launcher ?? []).join("\n"), onchange: (ev) => change(() => (e.base.launcher = lines(ev.target.value).slice(0, 40))) })),
      h("h4", { text: "Look" }),
      h(
        "div",
        { class: "edge-grid" },
        h("label", {}, "Style ", sel("edgesLook", [["glass", "Glass"], ["minimal", "Minimal"]], e.style.look, (v) => (e.style.look = v))),
        h("label", {}, "Tint ", h("input", { type: "color", id: "edgesTint", value: e.style.tint, onchange: (ev) => change(() => (e.style.tint = ev.target.value)) })),
        h("label", {}, "Accent ", h("input", { type: "color", id: "edgesAccent", value: e.style.accent, onchange: (ev) => change(() => (e.style.accent = ev.target.value)) })),
      ),
      num("edgesOpacity", "Opacity ", e.style, "opacity", 0.2, 1, 0.02),
      num("edgesFrost", "Frost ", e.style, "frost", 0, 40, 1),
      num("edgesHighlight", "Highlight ", e.style, "highlight", 0, 0.6, 0.02),
      h("h4", { text: "Per-app profiles" }),
      h("p", { class: "hint", text: "When one of these apps is in front, its choices replace the normal ones (empty = same as normal)." }),
      ...e.profiles.map((p) =>
        h(
          "div",
          { class: "set-row edge-profile" },
          h(
            "div",
            { class: "grow" },
            h("div", { class: "row" }, h("input", { value: p.name, placeholder: "Profile name", onchange: (ev) => change(() => (p.name = ev.target.value)) }), h("input", { value: p.apps, placeholder: "Apps, e.g. Figma|Photoshop", onchange: (ev) => change(() => (p.apps = ev.target.value)) })),
            zones(p, true),
          ),
          h("button", { class: "btn danger", text: "Remove", onclick: () => change(() => (e.profiles = e.profiles.filter((x) => x !== p))) }),
        ),
      ),
      h("button", { class: "btn", id: "addEdgeProfile", text: "Add a profile", onclick: () => change(() => e.profiles.push({ id: `ep${Math.random().toString(36).slice(2, 7)}`, name: "New profile", apps: "", corners: {} })) }),
    ),
  );
}
