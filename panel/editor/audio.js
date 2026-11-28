// Editor › Settings › Audio & Windows: ducking, push-to-talk options, audio
// profiles (saved from what's playing now), and which Windows services the
// panel may show and control.

const rid = (p) => `${p}${Math.random().toString(36).slice(2, 7)}`;
const lines = (v) => String(v ?? "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

export function renderAudio(root, { state, h, change, api, flash }) {
  const s = state.config.settings;
  s.audio ??= { duckLevel: 30, duckExcept: ["Teams", "Zoom", "Discord"], pttDuck: false, profiles: [] };
  s.system ??= { services: [] };
  const a = s.audio;
  a.profiles ??= [];

  const profName = h("input", { id: "profName", placeholder: "Profile name, e.g. Music" });
  const profiles = h(
    "div",
    { class: "set-list" },
    a.profiles.map((p) =>
      h(
        "div",
        { class: "set-row" },
        h("div", { class: "grow" }, h("b", { text: p.name }), h("div", { class: "muted small", text: [p.output && `Output: ${p.output}`, p.input && `Mic: ${p.input}`, p.apps?.length && p.apps.map((x) => `${x.name} ${x.volume}%`).join(", ")].filter(Boolean).join(" · ") || "No settings" })),
        h("button", { class: "btn danger", text: "Remove", onclick: () => change(() => (a.profiles = a.profiles.filter((x) => x.id !== p.id))) }),
      ),
    ),
  );

  root.append(
    h(
      "section",
      { class: "set-section", id: "audioSettings" },
      h("h3", { text: "Audio & Windows" }),
      h("p", { class: "hint", text: "Per-app volume, switching devices, profiles and ducking work on Windows. On a Mac the panel controls the main output and the microphone." }),
      h("h4", { text: "Ducking" }),
      h("label", {}, "Lower other apps to (%) ", h("input", { id: "duckLevel", type: "number", min: 0, max: 100, value: a.duckLevel, style: "max-width:90px", onchange: (e) => change(() => (a.duckLevel = Number(e.target.value) || 0)) })),
      h("label", {}, "Never lower (app names, comma separated) ", h("input", { id: "duckExcept", value: (a.duckExcept ?? []).join(", "), onchange: (e) => change(() => (a.duckExcept = lines(e.target.value))) })),
      h("label", { class: "check" }, h("input", { type: "checkbox", id: "pttDuck", checked: a.pttDuck, onchange: (e) => change(() => (a.pttDuck = e.target.checked)) }), "Duck other apps while push-to-talk is held"),
      h("h4", { text: "Audio profiles" }),
      profiles,
      h(
        "div",
        { class: "row" },
        profName,
        h("button", {
          class: "btn",
          id: "saveProfile",
          text: "Save what's playing now as a profile",
          onclick: async () => {
            const r = await api("/api/editor/audio/snapshot", {}).catch((e) => ({ ok: false, error: e.message }));
            if (!r.ok) return flash(r.error ?? "Couldn't read the audio state.", true);
            if (a.profiles.length >= 12) return flash("Up to 12 profiles.", true);
            change(() => a.profiles.push({ id: rid("ap"), name: profName.value.trim() || `Profile ${a.profiles.length + 1}`, output: r.output, input: r.input, apps: r.apps }));
          },
        }),
      ),
      h("p", { class: "hint", text: "A profile remembers the output and microphone (by name) and each app's level. Applying it from the panel switches back to all of them." }),
      h("h4", { text: "Windows services" }),
      h("label", {}, "Services the panel may show and start or stop (service names, comma separated) ", h("input", { id: "winServices", placeholder: "e.g. Spooler, docker, MySQL80", value: (s.system.services ?? []).join(", "), onchange: (e) => change(() => (s.system.services = lines(e.target.value))) })),
      h("p", { class: "hint", text: "Starting or stopping most services needs DeskAssist to run as administrator. Only the services listed here can be touched from the panel." }),
    ),
  );
}
