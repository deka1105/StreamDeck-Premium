import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1170, height: 540 } });
await p.goto("file:///Users/shubhamarundekatey/ClaudeCode/day28/StreamDeck-Premium/panel/dist/panel.html?demo=1");
await p.waitForTimeout(800);
console.log(await p.evaluate(() => {
  const host = document.createElement("div"); host.className = "w"; host.style.cssText = "position:fixed;left:0;top:0;width:600px;height:80px";
  const body = document.createElement("div"); body.className = "w-body w-titletext"; body.textContent = "Good evening"; host.append(body); document.body.append(host);
  const cs = getComputedStyle(body); return { fs: cs.fontSize, lh: cs.lineHeight, h: body.clientHeight, zoom: getComputedStyle(document.querySelector(".page-grid")).zoom };
}));
await b.close();
