import { chromium } from "@playwright/test";
const [,, out, w, h, ...pages] = process.argv;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.goto("file://" + process.env.PANEL);
await p.waitForTimeout(800);
for (const name of pages) {
  const i = await p.evaluate((n) => [...document.querySelectorAll("#dots .dot")].map((d) => d.getAttribute("aria-label")).indexOf(n), name);
  await p.locator("#dots .dot").nth(i).click();
  await p.waitForTimeout(2600);
  await p.screenshot({ path: `${out}-${name.replace(/\W+/g, "")}.png` });
}
console.log("errors:", JSON.stringify(errs));
await b.close();
