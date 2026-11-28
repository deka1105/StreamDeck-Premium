// Stage 11: the Control Deck — demo interactions, then a real host talking to
// a fake OBS (obs-websocket 5), a fake Home Assistant and a dev service.
import { test, expect } from "@playwright/test";
import http from "node:http";
import { pathToFileURL, fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { startHost } from "../lib/host.mjs";
import { acceptUpgrade } from "../../../desktop/src/control/ws.mjs";

const PANEL = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "panel", "dist", "panel.html")).href;

async function goto(page, name) {
  const i = await page.evaluate((n) => [...document.querySelectorAll("#dots .dot")].map((d) => d.getAttribute("aria-label")).indexOf(n), name);
  await page.locator("#dots .dot").nth(i).click();
}

test("demo Control Deck: OBS, meeting, Home Assistant, containers, services respond", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(PANEL);
  await goto(page, "Studio");

  // Scenes: tapping one makes it current.
  const screen = page.locator(".obs-scene", { hasText: /^Screen$/ });
  await screen.click();
  await expect(screen).toHaveClass(/on/);
  await expect(page.locator(".obs-scene.on")).toHaveCount(1);

  // Record starts at once; stopping needs a second tap.
  await page.locator('[data-cmd="record"]').click();
  await expect(page.locator(".pill.rec")).toBeVisible();
  await page.locator('[data-cmd="record"]').click();
  await expect(page.locator('[data-cmd="record"]')).toHaveText(/Tap to stop/);
  await page.locator('[data-cmd="record"]').click();
  await expect(page.locator(".pill.rec")).toHaveCount(0);

  // Audio mute chip flips.
  const mic = page.locator('[data-input="Mic/Aux"]');
  await mic.click();
  await expect(mic).toHaveClass(/muted-in/);

  // Meeting: Leave asks first; Mute everything toggles.
  const leave = page.locator(".mt-leave");
  await leave.click();
  await expect(leave).toHaveText(/Tap to leave/);
  await leave.click();
  await expect(leave).toHaveText(/Leave/);
  await expect(leave).toHaveAttribute("data-result", "ok");
  await page.locator(".mt-all").click();
  await expect(page.locator(".mt-all")).toHaveText(/Unmute everything/);
  await expect(page.locator(".mt-all")).toHaveClass(/on/);

  // Wake and OSC keys come from the host's lists.
  await expect(page.locator(".w-keys .cd-btn")).toHaveCount(5);
  await page.locator(".w-keys .cd-btn", { hasText: "Wake NAS" }).click();
  await expect(page.locator(".w-keys .cd-msg").last()).toHaveText(/Sent to NAS/);

  await goto(page, "Dev & home");
  const shelf = page.locator('.ha-tile[data-id="light.shelf"]');
  await expect(shelf).not.toHaveClass(/\bon\b/);
  await shelf.click();
  await expect(shelf).toHaveClass(/\bon\b/);
  await expect(shelf.locator(".ha-state")).toHaveText("On");
  await expect(page.locator('.ha-tile[data-id="sensor.office_temp"]')).toHaveClass(/ro/);

  await page.locator('.w-containers [data-a="start"]').click();
  await expect(page.locator(".ct-count")).toHaveText("3/3 up");

  const tests = page.locator('.svc:has-text("Tests (watch)")');
  await tests.locator('[data-a="start"]').click();
  await expect(tests).toHaveAttribute("data-state", "running");

  // Trackpad: a drag and a tap go through without errors.
  const pad = page.locator(".tp-surface");
  const box = await pad.boundingBox();
  await page.mouse.move(box.x + 40, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 40, { steps: 6 });
  await page.mouse.up();
  await pad.click();
  await expect(page.locator(".w-trackpad .cd-msg")).toHaveText("");
  expect(errors).toEqual([]);
});

// ------------------------------------------------- real host + fixtures ----

let host;
let obsSrv;
let haSrv;
const obs = { current: "Camera", record: false, calls: [] };
const ha = { desk: "off", calls: [] };

test.describe("host", () => {
  test.beforeAll(async () => {
    obsSrv = http.createServer();
    obsSrv.on("upgrade", (req, socket) => {
      const ws = acceptUpgrade(req, socket);
      ws.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: "5.5.0", rpcVersion: 1 } }));
      ws.on("message", (text) => {
        const m = JSON.parse(text);
        if (m.op === 1) return ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
        const { requestType: t, requestId, requestData: q = {} } = m.d;
        obs.calls.push(t);
        let data = {};
        if (t === "GetSceneList") data = { currentProgramSceneName: obs.current, scenes: [{ sceneName: "Screen", sceneIndex: 0 }, { sceneName: "Camera", sceneIndex: 1 }] };
        else if (t === "GetRecordStatus") data = { outputActive: obs.record, outputTimecode: "00:00:05.000" };
        else if (t === "GetStreamStatus") data = { outputActive: false };
        else if (t === "GetVirtualCamStatus") data = { outputActive: false };
        else if (t === "SetCurrentProgramScene") obs.current = q.sceneName;
        else if (t === "ToggleRecord") obs.record = !obs.record;
        ws.send(JSON.stringify({ op: 7, d: { requestType: t, requestId, requestStatus: { result: true, code: 100 }, responseData: data } }));
      });
    });
    haSrv = http.createServer((req, res) => {
      if (req.headers.authorization !== "Bearer test-token") return res.writeHead(401).end();
      const json = (v) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(v));
      const desk = () => ({ entity_id: "light.desk", state: ha.desk, attributes: { friendly_name: "Desk lamp" } });
      if (req.url === "/api/states") return json([desk(), { entity_id: "sensor.temp", state: "20", attributes: { friendly_name: "Temp", unit_of_measurement: "°C" } }]);
      if (req.url === "/api/states/light.desk") return json(desk());
      if (req.url === "/api/services/light/toggle") {
        ha.calls.push("light.toggle");
        ha.desk = ha.desk === "on" ? "off" : "on";
        return json([]);
      }
      res.writeHead(404).end();
    });
    await new Promise((r) => obsSrv.listen(0, "127.0.0.1", r));
    await new Promise((r) => haSrv.listen(0, "127.0.0.1", r));
    host = await startHost({
      port: 18970,
      localPort: 18971,
      config: {
        settings: {
          control: {
            obs: { enabled: true, host: "127.0.0.1", port: obsSrv.address().port },
            ha: { url: `http://127.0.0.1:${haSrv.address().port}` },
            wol: [{ id: "tower", name: "Tower", mac: "3C:22:FB:12:34:56" }],
            services: [{ id: "echo", name: "Echo", cmd: process.execPath, args: `-e "console.log('hello from service'); setInterval(() => {}, 1000)"` }],
          },
        },
        default: {
          home: "deck",
          pages: [
            {
              id: "deck",
              name: "Deck",
              widgets: [
                { id: "obs", type: "obs", x: 0, y: 0, w: 6, h: 3 },
                { id: "ha", type: "homeassistant", x: 6, y: 0, w: 6, h: 3, options: { entities: ["light.desk", "sensor.temp"] } },
                { id: "svc", type: "services", x: 0, y: 3, w: 6, h: 3 },
                { id: "wk", type: "wake", x: 6, y: 3, w: 6, h: 3 },
              ],
            },
          ],
        },
      },
    });
    // The token goes in through the editor's write-only secret route.
    const r = await fetch(`${host.base}/api/editor/secret`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "ha:token", value: "test-token" }) }).then((x) => x.json());
    expect(r.saved).toBe(true);
  });
  test.afterAll(async () => {
    await host?.stop();
    obsSrv?.close();
    haSrv?.close();
  });

  test("OBS, Home Assistant, a dev service and Wake-on-LAN, end to end", async ({ page }) => {
    await page.setViewportSize({ width: 1170, height: 540 });
    await page.goto(`${host.base}/panel/`);

    // OBS: real obs-websocket traffic.
    await expect(page.locator(".obs-scene.on")).toHaveText("Camera");
    await page.locator(".obs-scene", { hasText: "Screen" }).click();
    await expect(page.locator(".obs-scene.on")).toHaveText("Screen");
    expect(obs.current).toBe("Screen");
    await page.locator('[data-cmd="record"]').click();
    await expect(page.locator(".pill.rec")).toBeVisible();
    expect(obs.record).toBe(true);

    // Home Assistant: the tap reaches the light.toggle service.
    const desk = page.locator('.ha-tile[data-id="light.desk"]');
    await expect(desk.locator(".ha-name")).toHaveText("Desk lamp");
    await expect(page.locator('.ha-tile[data-id="sensor.temp"] .ha-state')).toHaveText("20 °C");
    await desk.click();
    await expect.poll(() => ha.calls).toEqual(["light.toggle"]);
    await expect(desk).toHaveClass(/\bon\b/);

    // A dev service starts, shows its output, and stops.
    const svc = page.locator(".svc", { hasText: "Echo" });
    await svc.locator('[data-a="start"]').click();
    await expect(svc).toHaveAttribute("data-state", "running");
    await expect(svc.locator(".svc-out")).toHaveText(/hello from service/);
    await svc.locator('[data-a="stop"]').click();
    await expect(svc).not.toHaveAttribute("data-state", "running");

    // Wake-on-LAN (dry-run host: logged, not sent).
    await page.locator(".w-keys .cd-btn", { hasText: "Wake Tower" }).click();
    await expect(page.locator(".w-keys .cd-msg")).toHaveText(/Sent to Tower/);
    await expect.poll(() => host.log()).toMatch(/dry-run\) wake Tower 3C:22:FB:12:34:56/);
  });

  test("editor: Control Deck settings save, secrets stay write-only", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${host.base}/editor/`);
    await page.getByRole("button", { name: /Settings/ }).click();
    const section = page.locator("#controlDeck");
    await expect(section).toBeVisible();
    await expect(section.locator("#ctlSecrets")).toHaveText(/Home Assistant token: saved/);
    await section.locator("#haTest").click();
    await expect(section.locator(".ha-pick")).toHaveCount(2);

    await section.locator("#oscName").fill("GO");
    await section.locator("#oscHost").fill("192.168.1.40");
    await section.locator("#oscPort").fill("53000");
    await section.locator("#oscAddress").fill("/go");
    await section.locator("#addOsc").click();
    await section.locator("#trackpadOn").check();
    await page.getByRole("button", { name: /^Save/ }).first().click();
    await expect.poll(async () => (await fetch(`${host.base}/api/editor/state`).then((r) => r.json())).config.settings.control.osc.map((o) => o.address)).toEqual(["/go"]);
    const st = await fetch(`${host.base}/api/editor/state`).then((r) => r.json());
    expect(st.config.settings.control.trackpad).toBe(true);
    expect(JSON.stringify(st)).not.toContain("test-token");
  });
});
