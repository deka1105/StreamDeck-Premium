import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { parseFeed, parseOpml, parseBulk } from "./feed.mjs";
import { agenda, parseDate, zonedToUtc } from "./ics.mjs";
import { createCaldav } from "./caldav.mjs";

// ------------------------------------------------------------------ feeds ----

test("RSS 2.0 items with CDATA, entities and dates", () => {
  const f = parseFeed(`<?xml version="1.0"?><rss version="2.0"><channel><title>Example &amp; Co</title>
    <item><title><![CDATA[First <b>post</b>]]></title><link>https://example.com/1</link><pubDate>Fri, 27 Nov 2026 10:00:00 GMT</pubDate></item>
    <item><title>Second &#8211; one</title><link>javascript:alert(1)</link></item></channel></rss>`);
  assert.equal(f.title, "Example & Co");
  assert.equal(f.items[0].title, "First post");
  assert.equal(f.items[0].link, "https://example.com/1");
  assert.equal(f.items[0].at, Date.UTC(2026, 10, 27, 10));
  assert.equal(f.items[1].title, "Second – one");
  assert.equal(f.items[1].link, null); // only http(s) links survive
});

test("Atom entries pick the alternate link", () => {
  const f = parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
    <entry><title type="html">A &lt;i&gt;b&lt;/i&gt;</title><link rel="self" href="https://x/self"/><link rel="alternate" href="https://x/a"/><updated>2026-11-27T12:00:00Z</updated></entry></feed>`);
  assert.equal(f.title, "Atom");
  assert.equal(f.items[0].link, "https://x/a");
  assert.equal(f.items[0].at, Date.UTC(2026, 10, 27, 12));
});

test("OPML import keeps categories from nesting; bulk lines too", () => {
  const o = parseOpml(`<opml><body><outline text="Tech"><outline text="HN" xmlUrl="https://hnrss.org/frontpage"/><outline text="Bad" xmlUrl="ftp://x"/></outline><outline text="Solo" xmlUrl="https://solo.example/feed"/></body></opml>`);
  assert.deepEqual(o, [
    { name: "HN", url: "https://hnrss.org/frontpage", category: "Tech" },
    { name: "Solo", url: "https://solo.example/feed", category: "" },
  ]);
  assert.deepEqual(parseBulk("News | BBC | https://feeds.bbci.co.uk/news/rss.xml\nVerge | https://www.theverge.com/rss/index.xml\nnot a url"), [
    { name: "BBC", url: "https://feeds.bbci.co.uk/news/rss.xml", category: "News" },
    { name: "Verge", url: "https://www.theverge.com/rss/index.xml", category: "" },
  ]);
});

// -------------------------------------------------------------------- ICS ----

const day = (y, m, d, h = 0, mi = 0) => new Date(y, m, d, h, mi).getTime();

test("dates: UTC, zoned, Windows zone names, all-day", () => {
  assert.equal(parseDate("20261127T150000Z").t, Date.UTC(2026, 10, 27, 15));
  assert.equal(parseDate("20261127T100000", { TZID: "America/New_York" }).t, Date.UTC(2026, 10, 27, 15));
  assert.equal(parseDate("20260701T100000", { TZID: "Eastern Standard Time" }).t, Date.UTC(2026, 6, 1, 14)); // EDT in July
  assert.equal(zonedToUtc(2026, 2, 8, 3, 30, 0, "America/New_York"), Date.UTC(2026, 2, 8, 7, 30)); // just after spring-forward
  const ad = parseDate("20261127", { VALUE: "DATE" });
  assert.equal(ad.allDay, true);
  assert.equal(ad.t, day(2026, 10, 27));
});

const ICS = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:standup
SUMMARY:Standup
DTSTART:20200106T090000
DTEND:20200106T091500
RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR
EXDATE:20261127T090000
BEGIN:VALARM
SUMMARY:ignore me
END:VALARM
END:VEVENT
BEGIN:VEVENT
UID:standup
RECURRENCE-ID:20261130T090000
SUMMARY:Standup (moved)
DTSTART:20261130T100000
DTEND:20261130T101500
END:VEVENT
BEGIN:VEVENT
UID:dentist
SUMMARY:Dentist\\, downtown
LOCATION:Main St
DTSTART;VALUE=DATE:20261128
DTEND;VALUE=DATE:20261129
END:VEVENT
BEGIN:VEVENT
UID:monthly
SUMMARY:Review
DTSTART:20260105T140000
RRULE:FREQ=MONTHLY;BYDAY=-1FR;COUNT=24
END:VEVENT
BEGIN:VEVENT
UID:gone
SUMMARY:Cancelled thing
STATUS:CANCELLED
DTSTART:20261127T120000
END:VEVENT
END:VCALENDAR`;

test("agenda: recurrence from years ago, EXDATE, overrides, all-day, last-Friday rule, cancelled", () => {
  const from = day(2026, 10, 26); // Thu 26 Nov 2026
  const to = day(2026, 11, 3);
  const items = agenda(ICS, from, to);
  const titles = items.map((e) => `${new Date(e.start).getDate()} ${e.title}`);
  assert.deepEqual(titles, ["27 Review", "28 Dentist, downtown", "30 Standup (moved)", "2 Standup"]);
  assert.equal(items.find((e) => e.title === "Dentist, downtown").allDay, true);
  assert.equal(new Date(items.find((e) => e.title === "Standup (moved)").start).getHours(), 10);
});

test("agenda: COUNT ends a series", () => {
  const items = agenda(ICS, day(2028, 0, 1), day(2028, 2, 1));
  assert.equal(items.filter((e) => e.title === "Review").length, 0); // 24 months from Jan 2026 ends Dec 2027
});

// ----------------------------------------------------------------- CalDAV ----

test("CalDAV: discovery and a time-range query against a local fixture server", async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push(`${req.method} ${req.url} depth=${req.headers.depth}`);
      if (req.headers.authorization !== `Basic ${Buffer.from("me@icloud.com:abcd-efgh").toString("base64")}`) {
        res.writeHead(401);
        return res.end();
      }
      res.writeHead(207, { "content-type": "application/xml" });
      if (req.url === "/" && body.includes("current-user-principal"))
        return res.end(`<d:multistatus xmlns:d="DAV:"><d:response><d:href>/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/123/principal/</d:href></d:current-user-principal></d:prop></d:propstat></d:response></d:multistatus>`);
      if (req.url === "/123/principal/")
        return res.end(`<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><response><href>/123/principal/</href><propstat><prop><C:calendar-home-set><href>/123/calendars/</href></C:calendar-home-set></prop></propstat></response></multistatus>`);
      if (req.url === "/123/calendars/" && req.method === "PROPFIND")
        return res.end(`<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">
          <d:response><d:href>/123/calendars/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
          <d:response><d:href>/123/calendars/home/</d:href><d:propstat><d:prop><d:displayname>Home</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><a:calendar-color>#FF2968FF</a:calendar-color><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop></d:propstat></d:response>
          <d:response><d:href>/123/calendars/tasks/</d:href><d:propstat><d:prop><d:displayname>Reminders</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><c:supported-calendar-component-set><c:comp name="VTODO"/></c:supported-calendar-component-set></d:prop></d:propstat></d:response>
        </d:multistatus>`);
      if (req.url === "/123/calendars/home/" && req.method === "REPORT") {
        const ok = /time-range start="\d{8}T\d{6}Z" end="\d{8}T\d{6}Z"/.test(body);
        return res.end(`<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/123/calendars/home/a.ics</d:href><d:propstat><d:prop><cal:calendar-data>${ok ? "BEGIN:VCALENDAR&#13;\nBEGIN:VEVENT&#13;\nUID:a&#13;\nSUMMARY:Dinner &amp; drinks&#13;\nDTSTART:20261127T230000Z&#13;\nEND:VEVENT&#13;\nEND:VCALENDAR" : ""}</cal:calendar-data></d:prop></d:propstat></d:response></d:multistatus>`);
      }
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  try {
    const dav = createCaldav({ url: base, user: "me@icloud.com", password: "abcd-efgh" });
    const cals = await dav.calendars();
    assert.deepEqual(cals, [{ url: `${base}123/calendars/home/`, name: "Home", color: "#FF2968" }]);
    const docs = await dav.events(cals[0].url, Date.UTC(2026, 10, 27), Date.UTC(2026, 11, 4));
    const items = agenda(docs, Date.UTC(2026, 10, 27), Date.UTC(2026, 11, 4));
    assert.equal(items[0].title, "Dinner & drinks");
    await assert.rejects(createCaldav({ url: base, user: "me@icloud.com", password: "wrong" }).calendars(), /refused the sign-in/);
    assert.ok(seen.some((s) => s.startsWith("REPORT /123/calendars/home/ depth=1")));
  } finally {
    server.close();
  }
});
