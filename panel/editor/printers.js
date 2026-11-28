// Editor › Settings › 3D printers: add up to 8 printers, test each one.
// Access codes, keys and passwords go to the host's secret store.

const rid = () => `pr${Math.random().toString(36).slice(2, 7)}`;

// Mirrors desktop/src/printers/brands.mjs (names, fields, what the secret is).
const BRANDS = {
  klipper: { name: "Klipper (Moonraker)", port: 7125, fields: ["port"], secret: "API key (optional)" },
  octoprint: { name: "OctoPrint", port: 80, fields: ["port"], secret: "API key" },
  prusalink: { name: "Prusa (PrusaLink)", port: 80, fields: ["port", "user"], secret: "Password (user maker) or API key" },
  bambu: { name: "Bambu Lab (LAN)", port: 8883, fields: ["serial"], secret: "LAN access code (printer screen › Network)" },
  elegoo: { name: "Elegoo Centauri Carbon", port: 3030, fields: ["serial"], secret: null },
  flashforge: { name: "Flashforge", port: 8898, fields: ["port", "serial"], secret: "Check code (newer models; empty = G-code port)" },
  snapmaker: { name: "Snapmaker 2.0", port: 8080, fields: ["port"], secret: null },
};
const NO_SOURCE = "Creality (stock firmware), Anycubic LAN mode and Snapmaker J1/Artisan aren't offered yet: their protocols have no public documentation we can build from.";

export function renderPrinters(root, { state, h, change, api, flash }) {
  const s = state.config.settings;
  s.printers ??= [];
  const status = new Map();

  const list = h(
    "div",
    { class: "set-list" },
    s.printers.map((p) => {
      const st = h("span", { class: "muted small cal-status" });
      status.set(p.id, st);
      return h(
        "div",
        { class: "set-row", dataset: { id: p.id } },
        h("div", { class: "grow" }, h("b", { text: p.name }), h("div", { class: "muted small", text: `${BRANDS[p.brand]?.name ?? p.brand} · ${p.host}${p.port ? `:${p.port}` : ""}${p.serial ? ` · ${p.serial}` : ""} · untested on hardware` })),
        st,
        h("button", {
          class: "btn",
          text: "Test connection",
          onclick: async () => {
            st.textContent = "Testing…";
            const r = await api("/api/editor/printers/test", { id: p.id }).catch((e) => ({ ok: false, error: e.message }));
            st.textContent = r.ok ? `✓ ${r.state}, nozzle ${r.temps?.nozzle ?? "—"}°` : r.error ?? "No answer.";
          },
        }),
        h("button", { class: "btn danger", text: "Remove", onclick: () => change(() => (s.printers = s.printers.filter((x) => x.id !== p.id))) }),
      );
    }),
  );

  const brand = h("select", { id: "prBrand" }, Object.entries(BRANDS).map(([v, b]) => h("option", { value: v, text: b.name })));
  const f = {
    name: h("input", { id: "prName", placeholder: "Name, e.g. Garage P1S" }),
    host: h("input", { id: "prHost", placeholder: "IP address, e.g. 192.168.1.60" }),
    port: h("input", { id: "prPort", type: "number", placeholder: "Port" }),
    user: h("input", { id: "prUser", placeholder: "User (PrusaLink: maker)" }),
    serial: h("input", { id: "prSerial", placeholder: "Serial number" }),
    secret: h("input", { id: "prSecret", type: "password", autocomplete: "new-password" }),
  };
  const showFields = () => {
    const b = BRANDS[brand.value];
    f.port.placeholder = `Port (${b.port})`;
    f.port.hidden = !b.fields.includes("port");
    f.user.hidden = !b.fields.includes("user");
    f.serial.hidden = !b.fields.includes("serial");
    f.secret.hidden = !b.secret;
    f.secret.placeholder = b.secret ?? "";
  };
  brand.addEventListener("change", showFields);
  showFields();

  root.append(
    h(
      "section",
      { class: "set-section", id: "printerSettings" },
      h("h3", { text: "3D printers" }),
      h("p", { class: "hint", text: "This computer talks to the printers on your network; the phone only shows what it reports. Up to 8 printers; the Printers widget shows 4 at once. Every brand is built from its published protocol and is untested on real hardware until you try it." }),
      list,
      h("div", { class: "row form" }, brand, f.name, f.host, f.port, f.user, f.serial, f.secret, h("button", {
        class: "btn",
        id: "addPrinter",
        text: "Add printer",
        onclick: async () => {
          if (!/^[A-Za-z0-9.:\-_[\]]{1,255}$/.test(f.host.value.trim())) return flash("Enter the printer's IP address or host name.", true);
          if (s.printers.length >= 8) return flash("Up to 8 printers.", true);
          const b = BRANDS[brand.value];
          if (b.fields.includes("serial") && brand.value !== "flashforge" && !f.serial.value.trim()) return flash("This printer needs its serial number.", true);
          const id = rid();
          if (f.secret.value) {
            const r = await api("/api/editor/secret", { name: `printer:${id}`, value: f.secret.value }).catch((e) => ({ ok: false, error: e.message }));
            if (!r.ok) return flash(r.error ?? "Couldn't save the access code.", true);
          }
          change(() => s.printers.push({ id, brand: brand.value, name: f.name.value.trim() || b.name, host: f.host.value.trim(), port: Number(f.port.value) || null, user: f.user.value.trim(), serial: f.serial.value.trim() }));
          flash("Added. Save, then press Test connection.");
        },
      })),
      h("p", { class: "hint", text: NO_SOURCE }),
    ),
  );
}
