// Editor › Settings › Control Deck: OBS, Home Assistant, containers,
// computers to wake, OSC messages, dev services and the trackpad. Passwords
// and tokens go straight to the host's secret store and are never read back.

const rid = (p) => `${p}${Math.random().toString(36).slice(2, 7)}`;

export function renderControl(root, { state, h, change, api, flash }) {
  const s = state.config.settings;
  s.control ??= {};
  const c = s.control;
  c.obs ??= { enabled: false, host: "127.0.0.1", port: 4455 };
  c.ha ??= { url: "" };
  c.containers ??= "auto";
  c.wol ??= [];
  c.osc ??= [];
  c.services ??= [];
  c.trackpad ??= false;

  const input = (id, attrs = {}) => h("input", { id, ...attrs });
  const saved = h("span", { class: "muted small", id: "ctlSecrets" });
  api("/api/editor/secrets")
    .then((r) => {
      saved.textContent = `OBS password: ${r.have?.["obs:password"] ? "saved" : "not set"} · Home Assistant token: ${r.have?.["ha:token"] ? "saved" : "not set"}`;
    })
    .catch(() => {});
  const secret = async (name, el, label) => {
    const r = await api("/api/editor/secret", { name, value: el.value }).catch((e) => ({ ok: false, error: e.message }));
    el.value = "";
    flash(r.ok ? `${label} ${r.saved ? "saved" : "removed"}.` : r.error ?? "Couldn't save.", !r.ok);
    saved.textContent = "";
    renderControlStatus();
  };
  const renderControlStatus = () =>
    api("/api/editor/secrets")
      .then((r) => (saved.textContent = `OBS password: ${r.have?.["obs:password"] ? "saved" : "not set"} · Home Assistant token: ${r.have?.["ha:token"] ? "saved" : "not set"}`))
      .catch(() => {});

  const list = (items, label, sub, remove) =>
    h(
      "div",
      { class: "set-list" },
      items.map((x) => h("div", { class: "set-row" }, h("div", { class: "grow" }, h("b", { text: label(x) }), h("div", { class: "muted small", text: sub(x) })), h("button", { class: "btn danger", text: "Remove", onclick: () => change(() => remove(x)) }))),
    );

  // ------------------------------------------------------------------ OBS ----
  const obsPw = input("obsPassword", { type: "password", placeholder: "WebSocket password (if set in OBS)", autocomplete: "new-password" });
  // ----------------------------------------------------------- HA ----
  const haToken = input("haToken", { type: "password", placeholder: "Long-lived access token", autocomplete: "new-password" });
  const haOut = h("div", { class: "ha-list" });
  const haFilter = input("haFilter", { type: "search", placeholder: "Filter entities", hidden: true });
  let haAll = [];
  const drawHa = () => {
    const q = haFilter.value.toLowerCase();
    haOut.replaceChildren(
      ...haAll
        .filter((e) => !q || e.id.includes(q) || e.name.toLowerCase().includes(q))
        .slice(0, 80)
        .map((e) =>
          h("button", {
            class: "btn small ha-pick",
            title: "Copy the id",
            text: `${e.id}${e.name ? ` — ${e.name}` : ""}`,
            onclick: async () => {
              await navigator.clipboard?.writeText(e.id).catch(() => {});
              flash(`Copied ${e.id}. Paste it into a Home Assistant widget's entity list.`);
            },
          }),
        ),
    );
  };
  haFilter.addEventListener("input", drawHa);

  // ---------------------------------------------------------- forms ----
  const wf = { name: input("wolName", { placeholder: "Name, e.g. Gaming PC" }), mac: input("wolMac", { placeholder: "MAC address, e.g. 3C:22:FB:12:34:56" }), addr: input("wolAddr", { placeholder: "Broadcast address (default 255.255.255.255)" }) };
  const of = { name: input("oscName", { placeholder: "Label, e.g. GO" }), host: input("oscHost", { placeholder: "Host, e.g. 192.168.1.40" }), port: input("oscPort", { placeholder: "Port", type: "number", style: "max-width:90px" }), address: input("oscAddress", { placeholder: "Address, e.g. /cue/go" }), args: input("oscArgs", { placeholder: 'Arguments, e.g. 1 0.5 "text"' }) };
  const sf = { name: input("svcName", { placeholder: "Name, e.g. Web app" }), cmd: input("svcCmd", { placeholder: "Program, e.g. npm" }), args: input("svcArgs", { placeholder: "Arguments, e.g. run dev" }), cwd: input("svcCwd", { placeholder: "Folder, e.g. /Users/me/code/site" }), url: input("svcUrl", { placeholder: "Address to open (optional), e.g. http://localhost:3000" }) };

  root.append(
    h(
      "section",
      { class: "set-section", id: "controlDeck" },
      h("h3", { text: "Control Deck" }),
      saved,

      h("h4", { text: "OBS Studio" }),
      h("label", { class: "check" }, h("input", { type: "checkbox", id: "obsEnabled", checked: c.obs.enabled, onchange: (e) => change(() => (c.obs.enabled = e.target.checked)) }), "Connect to OBS (obs-websocket, built into OBS 28 and later)"),
      h(
        "div",
        { class: "row" },
        input("obsHost", { value: c.obs.host, placeholder: "127.0.0.1", onchange: (e) => change(() => (c.obs.host = e.target.value.trim() || "127.0.0.1")) }),
        input("obsPort", { type: "number", value: c.obs.port, style: "max-width:100px", onchange: (e) => change(() => (c.obs.port = Number(e.target.value) || 4455)) }),
        obsPw,
        h("button", { class: "btn", text: "Save password", onclick: () => secret("obs:password", obsPw, "OBS password") }),
      ),
      h("p", { class: "hint", text: "In OBS: Tools › WebSocket Server Settings › Enable. Copy the password from “Show Connect Info”." }),

      h("h4", { text: "Home Assistant" }),
      h(
        "div",
        { class: "row" },
        input("haUrl", { value: c.ha.url, placeholder: "http://homeassistant.local:8123", onchange: (e) => change(() => (c.ha.url = e.target.value.trim())) }),
        haToken,
        h("button", { class: "btn", text: "Save token", onclick: () => secret("ha:token", haToken, "Home Assistant token") }),
        h("button", {
          class: "btn",
          id: "haTest",
          text: "Test & list entities",
          onclick: async () => {
            const r = await api("/api/editor/ha/test", {}).catch((e) => ({ ok: false, error: e.message }));
            if (!r.ok) return flash(r.error ?? "Couldn't reach Home Assistant. Save first, then test.", true);
            flash(`Connected — ${r.count} entities.`);
            haAll = r.entities;
            haFilter.hidden = false;
            drawHa();
          },
        }),
      ),
      haFilter,
      haOut,
      h("p", { class: "hint", text: "Create the token in Home Assistant under your profile › Security › Long-lived access tokens. Save the address with Save at the top, then test." }),

      h("h4", { text: "Containers" }),
      h(
        "label",
        {},
        "Use ",
        (() => {
          const el = h("select", { id: "ctEngine", onchange: (e) => change(() => (c.containers = e.target.value)) }, [["auto", "Docker, or Podman if Docker isn't installed"], ["docker", "Docker"], ["podman", "Podman"]].map(([v, l]) => h("option", { value: v, text: l })));
          el.value = c.containers;
          return el;
        })(),
      ),

      h("h4", { text: "Computers to wake (Wake-on-LAN)" }),
      list(c.wol, (m) => m.name, (m) => `${m.mac} → ${m.address}:${m.port}`, (m) => (c.wol = c.wol.filter((x) => x.id !== m.id))),
      h("div", { class: "row" }, wf.name, wf.mac, wf.addr, h("button", {
        class: "btn",
        id: "addWol",
        text: "Add",
        onclick: () => {
          if (!/^([0-9a-f]{2}[:-]?){5}[0-9a-f]{2}$/i.test(wf.mac.value.trim())) return flash("Enter the MAC address of the computer's wired network port.", true);
          change(() => c.wol.push({ id: rid("pc"), name: wf.name.value.trim() || "Computer", mac: wf.mac.value.trim(), address: wf.addr.value.trim() || "255.255.255.255", port: 9 }));
        },
      })),
      h("p", { class: "hint", text: "The computer must have Wake-on-LAN turned on (in its firmware and network adapter settings) and be on the same network as this one." }),

      h("h4", { text: "OSC messages" }),
      list(c.osc, (o) => o.name, (o) => `${o.host}:${o.port} ${o.address} ${o.args}`, (o) => (c.osc = c.osc.filter((x) => x.id !== o.id))),
      h("div", { class: "row" }, of.name, of.host, of.port, of.address, of.args, h("button", {
        class: "btn",
        id: "addOsc",
        text: "Add",
        onclick: () => {
          if (!/^\/\S*$/.test(of.address.value.trim())) return flash("An OSC address starts with /.", true);
          if (!of.host.value.trim() || !Number(of.port.value)) return flash("Enter the host and port that listens for OSC.", true);
          change(() => c.osc.push({ id: rid("osc"), name: of.name.value.trim() || of.address.value.trim(), host: of.host.value.trim(), port: Number(of.port.value), address: of.address.value.trim(), args: of.args.value.trim() }));
        },
      })),
      h("p", { class: "hint", text: "For lighting desks, QLab, TouchDesigner, Resolume and the like. The phone sends only which message; this computer sends the UDP packet." }),

      h("h4", { text: "Dev services" }),
      list(c.services, (x) => x.name, (x) => `${x.cmd} ${x.args}${x.cwd ? ` in ${x.cwd}` : ""}`, (x) => (c.services = c.services.filter((y) => y.id !== x.id))),
      h("div", { class: "row" }, sf.name, sf.cmd, sf.args, sf.cwd, sf.url, h("button", {
        class: "btn",
        id: "addSvc",
        text: "Add",
        onclick: () => {
          if (!sf.cmd.value.trim()) return flash("Enter the program to run.", true);
          change(() => c.services.push({ id: rid("svc"), name: sf.name.value.trim() || sf.cmd.value.trim(), cmd: sf.cmd.value.trim(), args: sf.args.value.trim(), cwd: sf.cwd.value.trim(), url: sf.url.value.trim() }));
        },
      })),
      h("p", { class: "hint", text: "Started without a shell, each argument as written. The panel can stop only what DeskAssist started." }),

      h("h4", { text: "Trackpad" }),
      h("label", { class: "check" }, h("input", { type: "checkbox", id: "trackpadOn", checked: c.trackpad, onchange: (e) => change(() => (c.trackpad = e.target.checked)) }), "Let the panel's Trackpad widget move and click this computer's pointer"),
      h("p", { class: "hint", text: "Off by default. On macOS this needs the same Accessibility permission as keyboard shortcuts." }),
    ),
  );
}
