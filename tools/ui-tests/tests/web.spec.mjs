// Stage 6: weather, feeds and calendars end to end (host fetches; panel renders).
import { test, expect } from "@playwright/test";
import http from "node:http";
import { startHost } from "../lib/host.mjs";

const pad = (n) => String(n).padStart(2, "0");
const icsLocal = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

let fixture;
let fixtureBase;
let host;

test.beforeAll(async () => {
  // A tiny server playing an RSS feed and an ICS calendar.
  fixture = http.createServer((req, res) => {
    if (req.url === "/feed.xml") {
      res.writeHead(200, { "content-type": "application/rss+xml" });
      return res.end(`<rss version="2.0"><channel><title>Fixture News</title>
        <item><title>Local library extends opening hours</title><link>https://example.com/library</link><pubDate>${new Date().toUTCString()}</pubDate></item>
        <item><title>Second headline</title><link>https://example.com/second</link><pubDate>${new Date(Date.now() - 3600_000).toUTCString()}</pubDate></item></channel></rss>`);
    }
    if (req.url === "/cal.ics") {
      const soon = new Date(Date.now() + 60 * 60_000);
      const later = new Date(Date.now() + 26 * 3600_000);
      res.writeHead(200, { "content-type": "text/calendar" });
      return res.end(`BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nSUMMARY:Project sync\r\nDTSTART:${icsLocal(soon)}\r\nDTEND:${icsLocal(new Date(soon.getTime() + 30 * 60_000))}\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:b\r\nSUMMARY:Haircut\r\nDTSTART:${icsLocal(later)}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`);
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
  fixtureBase = `http://127.0.0.1:${fixture.address().port}`;
  host = await startHost({
    port: 18930,
    localPort: 18931,
    config: {
      settings: {
        location: { name: "Charlotte, North Carolina, US", lat: 35.227, lon: -80.843, tz: "America/New_York" },
        feeds: [{ name: "Fixture", url: `${fixtureBase}/feed.xml`, category: "Local" }],
        calendars: [{ id: "work", name: "Work", kind: "ics", url: `${fixtureBase}/cal.ics`, color: "#f472b6" }],
      },
      default: {
        home: "web",
        pages: [
          {
            id: "web",
            name: "Web",
            widgets: [
              { id: "news", type: "news", x: 0, y: 0, w: 6, h: 3, options: { openOnPc: true } },
              { id: "ag", type: "agenda", x: 6, y: 0, w: 3, h: 3 },
              { id: "nu", type: "nextup", x: 9, y: 0, w: 3, h: 3 },
              { id: "moon", type: "moon", x: 0, y: 3, w: 2, h: 3 },
              { id: "wx", type: "weather", x: 2, y: 3, w: 4, h: 3 },
            ],
          },
          { id: "other", name: "Other", widgets: [{ id: "c", type: "clock", x: 0, y: 0, w: 12, h: 6 }] },
        ],
      },
    },
  });
});
test.afterAll(async () => {
  await host?.stop();
  fixture?.close();
});

test("editor settings: import feeds, add a calendar, pick a location", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`${host.base}/editor/`);
  await page.click("#settingsToggle");
  await expect(page.locator("#settingsView")).toBeVisible();

  // The config already has the fixture feed: importing it again adds nothing new.
  await page.fill("#feedBulk", `Local | Fixture | ${fixtureBase}/feed.xml\nWorld | Other | ${fixtureBase}/other.xml\nnot a feed`);
  await page.click("#importBulk");
  await expect(page.locator("#flash")).toContainText("Added 1 feed");

  await page.fill("#icsName", "Home");
  await page.fill("#icsUrl", `${fixtureBase}/cal.ics`);
  await page.click("#addIcs");
  await expect(page.locator(".set-row", { hasText: "Home" })).toBeVisible();

  // Real geocoding through the host (needs the internet, like the product does).
  await page.fill("#geoSearch", "Charlotte");
  await page.locator(".geo-pick").first().click({ timeout: 15_000 });
  await expect(page.locator("#locNow")).toContainText("Charlotte");

  await page.click("#save");
  await expect(page.locator("#flash")).toContainText("Saved");
  await page.locator(".set-row", { hasText: "Work" }).locator("button", { hasText: "Test" }).click();
  await expect(page.locator(".set-row", { hasText: "Work" }).locator(".cal-status")).toContainText("✓ 2 events", { timeout: 15_000 });
});

test("panel: headlines, agenda, next up, weather and the moon from the host", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1170, height: 540 });
  await page.goto(`${host.base}/panel/`);
  await expect(page.locator(".news-title").first()).toHaveText("Local library extends opening hours", { timeout: 20_000 });
  await expect(page.locator(".ag-title").first()).toHaveText("Project sync", { timeout: 20_000 });
  await expect(page.locator(".ag-day").first()).toHaveText("Today");
  await expect(page.locator(".nu-title")).toHaveText("Project sync");
  await expect(page.locator(".nu-when")).toHaveText(/^In (\d+ min|1 h( \d+ min)?)$/);
  await expect(page.locator(".moon-name")).toHaveText(/moon|crescent|quarter|gibbous/i);
  await expect(page.locator(".wx-temp")).toHaveText(/^-?\d+°$/, { timeout: 30_000 });
  await expect(page.locator(".wx-place")).toContainText("Charlotte");
  // The page with the calendar marks "still an event today" on its dot.
  await expect(page.locator("#dots .dot").first()).toHaveAttribute("data-badge", "1");
  await page.screenshot({ path: "test-results/web-page.png" });
  expect(errors).toEqual([]);
});

test("tapping a headline opens it on the computer; unknown links are refused", async ({ page, request }) => {
  await page.setViewportSize({ width: 1170, height: 540 });
  await page.goto(`${host.base}/panel/`);
  await page.locator(".news-row").first().click({ timeout: 20_000 });
  await expect.poll(() => host.log()).toContain('"target":"https://example.com/library"');
  const r = await request.post(`${host.base}/api/panel/rpc`, { data: { method: "feeds.open", params: { url: "https://evil.example/" } } });
  expect((await r.json()).result.ok).toBe(false);
});
