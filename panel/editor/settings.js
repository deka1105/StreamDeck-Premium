// Editor › Settings: location, units, calendars, news feeds, internet options.
// Edits the working copy (state.config.settings); Save in the header persists.
// Secrets (calendar passwords) go straight to the host's secret store and are
// never part of the config or read back.

import { renderAutomation } from "./automation.js";

const rid = (p) => `${p}${Math.random().toString(36).slice(2, 8)}`;

export function renderSettings(root, { state, h, change, api, flash }) {
  const s = state.config.settings;
  root.innerHTML = "";
  const section = (title, ...kids) => h("section", { class: "set-section" }, h("h3", { text: title }), ...kids);

  // ---------------------------------------------------------- location ----
  const results = h("div", { class: "geo-results" });
  const q = h("input", { type: "search", id: "geoSearch", placeholder: "Search a city, e.g. Charlotte or Paris", "aria-label": "City" });
  let t = null;
  q.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const r = await api(`/api/editor/geocode?q=${encodeURIComponent(q.value)}`).catch((e) => ({ results: [], error: e.message }));
      results.replaceChildren(
        ...(r.results ?? []).map((x) =>
          h("button", { class: "btn geo-pick", text: x.name, onclick: () => change(() => (s.location = { name: x.name, lat: x.lat, lon: x.lon, tz: x.tz })) }),
        ),
      );
      if (r.error) flash(r.error, true);
    }, 300);
  });
  root.append(
    section(
      "Location",
      h("p", { class: "muted", id: "locNow", text: s.location ? `Now: ${s.location.name} (${s.location.lat.toFixed(2)}, ${s.location.lon.toFixed(2)})` : "Not set — weather widgets will ask for it." }),
      q,
      results,
      h("p", { class: "hint", text: "Weather data by Open-Meteo.com. Your computer looks it up; the phone never contacts it." }),
    ),
  );

  // ------------------------------------------------------------- units ----
  const sel = (id, value, opts, onchange) => {
    const el = h("select", { id }, opts.map(([v, l]) => h("option", { value: v, text: l })));
    el.value = value;
    el.addEventListener("change", () => change(() => onchange(el.value)));
    return el;
  };
  root.append(
    section(
      "Units",
      h("label", {}, "Temperature", sel("unitTemp", s.units.temp, [["C", "°C"], ["F", "°F"]], (v) => (s.units.temp = v))),
      h("label", {}, "Wind", sel("unitWind", s.units.wind, [["kmh", "km/h"], ["mph", "mph"]], (v) => (s.units.wind = v))),
    ),
  );

  // --------------------------------------------------------- calendars ----
  const calList = h("div", { class: "set-list" });
  for (const c of s.calendars) {
    const status = h("span", { class: "muted cal-status" });
    calList.append(
      h(
        "div",
        { class: "set-row", dataset: { id: c.id } },
        h("input", { type: "color", value: c.color, "aria-label": "Colour", onchange: (e) => change(() => (c.color = e.target.value)) }),
        h("div", { class: "grow" }, h("b", { text: c.name }), h("div", { class: "muted small", text: c.kind === "caldav" ? `iCloud · ${c.user}` : c.url })),
        status,
        h("button", {
          class: "btn",
          text: "Test",
          onclick: async () => {
            status.textContent = "Testing…";
            const r = await api("/api/editor/calendar/test", { id: c.id }).catch((e) => ({ ok: false, error: e.message }));
            status.textContent = r.ok ? `✓ ${r.events} event${r.events === 1 ? "" : "s"}` : r.error;
          },
        }),
        h("button", { class: "btn danger", text: "Remove", onclick: () => change(() => (s.calendars = s.calendars.filter((x) => x.id !== c.id))) }),
      ),
    );
  }
  const icsName = h("input", { placeholder: "Name (e.g. Work)", id: "icsName" });
  const icsUrl = h("input", { placeholder: "Secret ICS address (https://… or webcal://…)", id: "icsUrl" });
  const icName = h("input", { placeholder: "Name (e.g. iCloud)", id: "icName" });
  const icUser = h("input", { placeholder: "Apple ID (email)", id: "icUser", autocomplete: "off" });
  const icPass = h("input", { placeholder: "App-specific password", id: "icPass", type: "password", autocomplete: "new-password" });
  root.append(
    section(
      "Calendars",
      calList,
      h("label", {}, "Days ahead to show", sel("calDays", String(s.calendarDays), [1, 3, 7, 14, 31].map((d) => [String(d), `${d} day${d === 1 ? "" : "s"}`]), (v) => (s.calendarDays = Number(v)))),
      h("h4", { text: "Add a calendar link (Google, Outlook, any .ics)" }),
      h("div", { class: "row" }, icsName, icsUrl, h("button", {
        class: "btn",
        id: "addIcs",
        text: "Add",
        onclick: () => {
          const url = icsUrl.value.trim();
          if (!/^(https?|webcal):\/\//i.test(url)) return flash("Paste the calendar's https:// or webcal:// address.", true);
          change(() => s.calendars.push({ id: rid("c"), name: icsName.value.trim() || "Calendar", kind: "ics", url, color: "#38bdf8", only: [] }));
        },
      })),
      h("h4", { text: "Add iCloud (Apple ID + app-specific password from account.apple.com)" }),
      h("div", { class: "row" }, icName, icUser, icPass, h("button", {
        class: "btn",
        id: "addIcloud",
        text: "Add",
        onclick: async () => {
          if (!icUser.value.trim() || !icPass.value) return flash("Enter the Apple ID and an app-specific password.", true);
          const id = rid("c");
          const r = await api("/api/editor/secret", { name: `calendar:${id}`, value: icPass.value }).catch((e) => ({ ok: false, error: e.message }));
          if (!r.ok) return flash(r.error ?? "Couldn't save the password.", true);
          icPass.value = "";
          change(() => s.calendars.push({ id, name: icName.value.trim() || "iCloud", kind: "caldav", url: "https://caldav.icloud.com", user: icUser.value.trim(), color: "#f472b6", only: [] }));
          flash(r.protected ? "Password saved, encrypted by your system keychain. Save the layout to keep the calendar." : "Password saved on this computer. Save the layout to keep the calendar.");
        },
      })),
    ),
  );

  // ------------------------------------------------------------- feeds ----
  const feedList = h("div", { class: "set-list" });
  for (const f of s.feeds) {
    feedList.append(
      h(
        "div",
        { class: "set-row" },
        h("div", { class: "grow" }, h("b", { text: f.name || f.url }), h("div", { class: "muted small", text: `${f.category ? `${f.category} · ` : ""}${f.url}` })),
        h("button", { class: "btn danger", text: "Remove", onclick: () => change(() => (s.feeds = s.feeds.filter((x) => x.url !== f.url))) }),
      ),
    );
  }
  const fName = h("input", { placeholder: "Name", id: "feedName" });
  const fUrl = h("input", { placeholder: "Feed address (RSS or Atom)", id: "feedUrl" });
  const fCat = h("input", { placeholder: "Category (optional)", id: "feedCat" });
  const bulk = h("textarea", { id: "feedBulk", rows: 3, placeholder: "Paste lines like: News | BBC | https://feeds.bbci.co.uk/news/rss.xml" });
  const opml = h("input", { type: "file", accept: ".opml,.xml,text/xml", hidden: true, id: "opmlFile" });
  const importText = async (text) => {
    const r = await api("/api/editor/feeds/import", { text }).catch((e) => ({ ok: false, error: e.message }));
    if (!r.ok) return flash(r.error ?? "Import failed", true);
    const have = new Set(s.feeds.map((f) => f.url));
    const add = r.feeds.filter((f) => !have.has(f.url));
    change(() => s.feeds.push(...add));
    flash(`Added ${add.length} feed${add.length === 1 ? "" : "s"}. Save to keep them.`);
  };
  opml.addEventListener("change", async () => {
    const f = opml.files?.[0];
    opml.value = "";
    if (f) importText(await f.text());
  });
  root.append(
    section(
      "News feeds",
      feedList,
      h("div", { class: "row" }, fName, fUrl, fCat, h("button", {
        class: "btn",
        id: "addFeed",
        text: "Add",
        onclick: () => {
          if (!/^https?:\/\//i.test(fUrl.value.trim())) return flash("Paste the feed's https:// address.", true);
          if (s.feeds.some((f) => f.url === fUrl.value.trim())) return flash("That feed is already in the list.", true);
          change(() => s.feeds.push({ name: fName.value.trim(), url: fUrl.value.trim(), category: fCat.value.trim() }));
        },
      })),
      bulk,
      h("div", { class: "row" }, h("button", { class: "btn", id: "importBulk", text: "Import these lines", onclick: () => importText(bulk.value) }), h("button", { class: "btn", text: "Import OPML…", onclick: () => opml.click() }), opml),
    ),
  );

  // ------------------------------------------------------ media servers ----
  s.mediaServers ??= [];
  const msList = h("div", { class: "set-list" });
  for (const m of s.mediaServers) {
    msList.append(
      h(
        "div",
        { class: "set-row" },
        h("div", { class: "grow" }, h("b", { text: `${m.name} (${m.type === "plex" ? "Plex" : "Jellyfin"})` }), h("div", { class: "muted small", text: m.url })),
        h("button", { class: "btn danger", text: "Remove", onclick: () => change(() => (s.mediaServers = s.mediaServers.filter((x) => x.id !== m.id))) }),
      ),
    );
  }
  const msType = h("select", { id: "msType" }, h("option", { value: "jellyfin", text: "Jellyfin" }), h("option", { value: "plex", text: "Plex" }));
  const msUrl = h("input", { id: "msUrl", placeholder: "Server address, e.g. http://192.168.1.20:8096" });
  const msToken = h("input", { id: "msToken", type: "password", placeholder: "API key (Jellyfin) or X-Plex-Token (Plex)", autocomplete: "new-password" });
  root.append(
    section(
      "Media servers",
      msList,
      h("div", { class: "row" }, msType, msUrl, msToken, h("button", {
        class: "btn",
        id: "addMediaServer",
        text: "Add",
        onclick: async () => {
          if (!/^https?:\/\//i.test(msUrl.value.trim())) return flash("Enter the server's http(s) address.", true);
          if (s.mediaServers.length >= 4) return flash("Up to 4 servers.", true);
          const id = rid("m");
          if (msToken.value) {
            const r = await api("/api/editor/secret", { name: `media:${id}`, value: msToken.value }).catch((e) => ({ ok: false, error: e.message }));
            if (!r.ok) return flash(r.error ?? "Couldn't save the token.", true);
            msToken.value = "";
          }
          change(() => s.mediaServers.push({ id, type: msType.value, name: msType.value === "plex" ? "Plex" : "Jellyfin", url: msUrl.value.trim() }));
        },
      })),
      h("p", { class: "hint", text: "The token stays on this computer (encrypted by the system keychain) and is only sent to that server." }),
    ),
  );

  // ---------------------------------------------------------- internet ----
  root.append(
    section(
      "Internet widget",
      h("label", { class: "check" }, h("input", { type: "checkbox", id: "showIp", checked: s.netq.showIp, onchange: (e) => change(() => (s.netq.showIp = e.target.checked)) }), "Show my public IP (asked from speed.cloudflare.com)"),
      h("label", {}, "Run a speed test automatically", sel("speedHours", String(s.netq.speedtestHours), [["0", "Only when I tap the button"], ["6", "Every 6 hours"], ["12", "Every 12 hours"], ["24", "Every day"]], (v) => (s.netq.speedtestHours = Number(v)))),
    ),
  );

  renderAutomation(root, { state, h, change, api, flash });
}
