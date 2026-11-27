// Editor › Settings › Appearance & display (for the layout being edited:
// "All devices" or one device). Looks inherit: preset → whole panel → page →
// tile (tile looks are set in the inspector).

import { PRESETS } from "../src/look.js";

export function renderLook(root, { state, h, change, flash, layout }) {
  layout.look ??= {};
  layout.display ??= {};
  const d = layout.display;
  d.night ??= {};
  state.lookTarget ??= "panel";
  const target = () => (state.lookTarget === "panel" ? layout.look : ((layout.pages.find((p) => p.id === state.lookTarget) ?? {}).look ??= {}));
  const L = target();
  const set = (k, v) => change(() => {
    const t = target();
    if (v === undefined || v === "" || v === null) delete t[k];
    else t[k] = v;
  });
  const field = (label, el) => h("label", {}, label, el);
  const sel = (id, opts, value, onchange) => {
    const e = h("select", { id }, opts.map(([v, l]) => h("option", { value: v, text: l })));
    e.value = value ?? "";
    e.addEventListener("change", () => onchange(e.value));
    return e;
  };
  const color = (id, k) => {
    const i = h("input", { type: "color", id, value: L[k] ?? "#38bdf8" });
    i.addEventListener("change", () => set(k, i.value));
    return h("span", { class: "row" }, i, h("button", { class: "btn small", text: "Inherit", onclick: () => set(k) }));
  };
  const range = (id, k, min, max, step, def) => {
    const i = h("input", { type: "range", id, min, max, step, value: L[k] ?? def });
    const out = h("span", { class: "muted small", text: L[k] === undefined ? "inherited" : String(L[k]) });
    i.addEventListener("change", () => set(k, Number(i.value)));
    return h("span", { class: "row" }, i, out);
  };
  const tri = (id, k) => sel(id, [["", "Inherit"], ["on", "On"], ["off", "Off"]], L[k] === undefined ? "" : L[k] ? "on" : "off", (v) => set(k, v === "" ? undefined : v === "on"));

  // Wallpaper: an https address, or an uploaded picture shrunk to ≤1600 px.
  const wall = L.wallpaper ?? null;
  const wUrl = h("input", { id: "wallUrl", placeholder: "https://… picture address", value: wall?.src?.startsWith("https:") ? wall.src : "" });
  const wFile = h("input", { type: "file", id: "wallFile", accept: "image/*" });
  const setWall = (patch) => set("wallpaper", patch === null ? null : { dim: 0.35, blur: 0, ...(target().wallpaper ?? {}), ...patch });
  wUrl.addEventListener("change", () => (wUrl.value.trim() ? setWall({ src: wUrl.value.trim() }) : set("wallpaper")));
  wFile.addEventListener("change", async () => {
    const f = wFile.files?.[0];
    if (!f) return;
    const img = await createImageBitmap(f);
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const src = c.toDataURL("image/jpeg", 0.82);
    if (src.length > 1_500_000) return flash("That picture is too large even after shrinking.", true);
    setWall({ src });
  });
  const wDim = h("input", { type: "range", id: "wallDim", min: 0, max: 0.9, step: 0.05, value: wall?.dim ?? 0.35 });
  const wBlur = h("input", { type: "range", id: "wallBlur", min: 0, max: 30, step: 1, value: wall?.blur ?? 0 });
  wDim.addEventListener("change", () => wall && setWall({ dim: Number(wDim.value) }));
  wBlur.addEventListener("change", () => wall && setWall({ blur: Number(wBlur.value) }));

  const presets = h("div", { class: "preset-row" }, ...Object.entries(PRESETS).map(([id, p]) =>
    h("button", { class: `preset${L.preset === id ? " on" : ""}`, dataset: { preset: id }, style: `--p-bg:${p.bg};--p-tile:${p.tile};--p-accent:${p.accent};--p-ink:${p.ink ?? "#e8eef9"}`, onclick: () => set("preset", id) }, h("i"), h("span", { text: p.name })),
  ));

  const dset = (k, v) => change(() => (d[k] = v));
  const nset = (k, v) => change(() => (d.night = { ...d.night, [k]: v }));
  const sec = h(
    "section",
    { class: "set-section", id: "lookSection" },
    h("h3", { text: "Appearance" }),
    field("Apply to", sel("lookTarget", [["panel", "The whole panel"], ...layout.pages.map((p) => [p.id, `Page: ${p.name}`])], state.lookTarget, (v) => {
      state.lookTarget = v;
      change(() => {});
    })),
    h("p", { class: "hint", text: state.lookTarget === "panel" ? "Pages inherit this unless they set their own. Tiles can override colours in the inspector." : "Only what you set here differs from the whole panel." }),
    presets,
    h("div", { class: "grid2" },
      field("Theme", sel("lookTheme", [["", "Inherit"], ["dark", "Dark"], ["light", "Light"], ["oled", "OLED black"]], L.theme, (v) => set("theme", v || undefined))),
      field("Font", sel("lookFont", [["", "Inherit"], ["system", "System"], ["rounded", "Rounded"], ["serif", "Serif"], ["mono", "Monospace"], ["condensed", "Condensed"]], L.font, (v) => set("font", v || undefined))),
      field("Accent", color("lookAccent", "accent")),
      field("Background", color("lookBg", "bg")),
      field("Tiles", color("lookTile", "tile")),
      field("Text", color("lookInk", "ink")),
      field("Text size", range("lookScale", "scale", 0.7, 1.5, 0.05, 1)),
      field("Corner radius", range("lookRadius", "radius", 0, 40, 1, 16)),
      field("Gap between tiles", range("lookGap", "gap", 0, 24, 1, 8)),
      field("Edge padding", range("lookPad", "padding", 0, 32, 1, 10)),
      field("Tile see-through", range("lookOpacity", "opacity", 0, 1, 0.05, 1)),
      field("Tile borders", tri("lookBorder", "border")),
      field("Tile shadows", tri("lookShadow", "shadow")),
    ),
    h("h4", { text: "Wallpaper" }),
    h("div", { class: "row" }, wUrl, wFile, h("button", { class: "btn small", text: state.lookTarget === "panel" ? "Remove" : "No wallpaper on this page", onclick: () => (state.lookTarget === "panel" ? set("wallpaper") : setWall(null)) })),
    h("div", { class: "grid2" }, field("Darken", wDim), field("Blur", wBlur)),
    h("button", { class: "btn", text: "Reset to inherited", onclick: () => change(() => {
      if (state.lookTarget === "panel") layout.look = {};
      else delete layout.pages.find((p) => p.id === state.lookTarget).look;
    }) }),
  );
  const disp = h(
    "section",
    { class: "set-section", id: "displaySection" },
    h("h3", { text: "Display" }),
    h("div", { class: "grid2" },
      field("Page navigation", sel("navStyle", [["dots", "Dots"], ["bar", "Page names along the bottom"], ["side-left", "Side bar, left"], ["side-right", "Side bar, right"], ["none", "Hidden (swipe only)"]], d.nav ?? "dots", (v) => dset("nav", v))),
      field("Dim after no touch (min, 0 = never)", h("input", { type: "number", id: "dimAfter", min: 0, max: 240, value: d.dimAfterMin ?? 0, onchange: (e) => dset("dimAfterMin", Number(e.target.value) || 0) })),
    ),
    h("label", { class: "check" }, h("input", { type: "checkbox", id: "navBadges", checked: d.badges !== false, onchange: (e) => dset("badges", e.target.checked) }), "Badges on page navigation"),
    h("label", { class: "check" }, h("input", { type: "checkbox", id: "oledShift", checked: !!d.oledShift, onchange: (e) => dset("oledShift", e.target.checked) }), "Shift by a few pixels every few minutes (OLED screens)"),
    h("label", { class: "check" }, h("input", { type: "checkbox", id: "followPc", checked: !!d.followPcSleep, onchange: (e) => dset("followPcSleep", e.target.checked) }), "Go black while the computer's display sleeps"),
    h("h4", { text: "Night screen" }),
    h("div", { class: "grid2" },
      field("Show", sel("nightMode", [["off", "Never (rules can still show it)"], ["schedule", "Between two times"], ["pc", "While the computer's display sleeps"]], d.night.mode ?? "off", (v) => nset("mode", v))),
      field("Style", sel("nightStyle", [["clock", "Dim clock"], ["black", "Black"]], d.night.style ?? "clock", (v) => nset("style", v))),
      field("From", h("input", { type: "time", id: "nightFrom", value: d.night.from ?? "22:30", onchange: (e) => nset("from", e.target.value) })),
      field("To", h("input", { type: "time", id: "nightTo", value: d.night.to ?? "07:00", onchange: (e) => nset("to", e.target.value) })),
      field("Clock brightness", h("input", { type: "range", id: "nightB", min: 0.05, max: 0.6, step: 0.05, value: d.night.brightness ?? 0.25, onchange: (e) => nset("brightness", Number(e.target.value)) })),
    ),
    h("p", { class: "hint", text: "Tap the night screen to wake the panel for a minute." }),
  );
  root.prepend(sec, disp);
}
