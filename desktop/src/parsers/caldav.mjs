// Minimal CalDAV client (RFC 4791 / RFC 6764 style discovery) for iCloud and
// other CalDAV servers: find the user's calendars, then fetch events in a
// time range. Basic auth over HTTPS; credentials come from the secret store.

const NS_STRIP = (xml) => String(xml ?? "").replace(/<(\/?)[A-Za-z0-9_-]+:/g, "<$1").replace(/\s+xmlns(:\w+)?="[^"]*"/g, "");

function responses(xml) {
  return [...NS_STRIP(xml).matchAll(/<response\b[^>]*>([\s\S]*?)<\/response>/gi)].map((m) => m[1]);
}
const inner = (xml, name) => {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  return m ? m[1] : null;
};
const hrefIn = (xml, name) => {
  const block = inner(xml, name);
  return block ? inner(block, "href")?.trim() ?? null : null;
};
const decodeXml = (s) => String(s ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#13;/g, "\r").replace(/&amp;/g, "&");

const ymdhms = (t) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function createCaldav({ url, user, password, fetchImpl = globalThis.fetch, timeoutMs = 15_000 }) {
  const auth = `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
  async function dav(method, target, body, depth = "0") {
    const r = await fetchImpl(target, {
      method,
      headers: { authorization: auth, depth, "content-type": "application/xml; charset=utf-8" },
      body,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (r.status === 401 || r.status === 403) throw new Error("The calendar server refused the sign-in. Check the Apple ID and app-specific password.");
    if (r.status >= 400) throw new Error(`Calendar server answered ${r.status}`);
    return r.text();
  }
  const abs = (href, base) => new URL(href, base).href;

  return {
    /** [{url, name, color}] for every calendar that holds events. */
    async calendars() {
      const p1 = await dav("PROPFIND", url, `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`);
      const principalHref = responses(p1).map((r) => hrefIn(r, "current-user-principal")).find(Boolean);
      if (!principalHref) throw new Error("This doesn't look like a CalDAV server.");
      const principal = abs(principalHref, url);
      const p2 = await dav("PROPFIND", principal, `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`);
      const homeHref = responses(p2).map((r) => hrefIn(r, "calendar-home-set")).find(Boolean);
      if (!homeHref) throw new Error("No calendars found for this account.");
      const home = abs(homeHref, principal);
      const p3 = await dav(
        "PROPFIND",
        home,
        `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:prop><d:displayname/><d:resourcetype/><a:calendar-color/><c:supported-calendar-component-set/></d:prop></d:propfind>`,
        "1",
      );
      return responses(p3)
        .filter((r) => /<calendar\b/i.test(inner(r, "resourcetype") ?? ""))
        .filter((r) => !/<supported-calendar-component-set/i.test(r) || /name="VEVENT"/i.test(r))
        .map((r) => ({
          url: abs(inner(r, "href").trim(), home),
          name: decodeXml(inner(r, "displayname") ?? "").trim() || "Calendar",
          color: (inner(r, "calendar-color") ?? "").trim().slice(0, 7) || null,
        }));
    },
    /** Raw ICS documents for events overlapping [from, to). */
    async events(calendarUrl, from, to) {
      const body = `<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${ymdhms(from)}" end="${ymdhms(to)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
      const xml = await dav("REPORT", calendarUrl, body, "1");
      return responses(xml).map((r) => decodeXml(inner(r, "calendar-data") ?? "")).filter((s) => s.includes("BEGIN:VEVENT"));
    },
  };
}
