// streamPhoneDeck desktop host — Electron shell (menu-bar/tray app).
//
// This is a thin wrapper around the headless host core in src/host.mjs: it starts
// the TLS server, lives in the menu bar / system tray, and opens a window that
// renders the pairing QR. All the security lives in the core; this file is UI.
//
// Dev:    npm start                 (opens the tray + pairing window)
//         DECK_DRY_RUN=1 npm start  (log actions instead of running them)
//         SMOKE=1 npm start         (boot the core, print SMOKE OK, exit — no UI)

import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, dialog } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import qrcode from "qrcode";
import { createHost } from "./src/host.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SMOKE = !!process.env.SMOKE;
const dryRun = ["1", "true", "yes"].includes((process.env.DECK_DRY_RUN ?? "").toLowerCase());

app.setName("streamPhoneDeck");

// Only one host may bind the port; a second launch just re-opens the pair window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => createPairWindow());
}

let host;
let tray;
let pairWindow;
let appsWindow;

function createPairWindow() {
  if (pairWindow && !pairWindow.isDestroyed()) {
    pairWindow.show();
    pairWindow.focus();
    return;
  }
  pairWindow = new BrowserWindow({
    width: 420,
    height: 680,
    resizable: false,
    fullscreenable: false,
    title: "streamPhoneDeck — Pair a phone",
    backgroundColor: "#0b1120",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
    },
  });
  pairWindow.loadFile(join(__dirname, "pair.html"));
  pairWindow.on("closed", () => {
    pairWindow = null;
  });
}

function buildTrayMenu() {
  const devices = host.listDevices();
  const deviceItems = devices.length
    ? devices.map((d) => ({
        label: `Unpair "${d.name}" (${d.deviceId.slice(0, 6)}…)`,
        click: () => {
          host.revoke(d.deviceId);
          refresh();
        },
      }))
    : [{ label: "No paired devices", enabled: false }];

  return Menu.buildFromTemplate([
    { label: `Host: ${host.name} · port ${host.port}`, enabled: false },
    { type: "separator" },
    { label: "Pair a phone…", click: createPairWindow },
    { label: "Paired devices", submenu: deviceItems },
    { type: "separator" },
    {
      label: "Allow shell commands (⚠️ runs code)",
      type: "checkbox",
      checked: host.getAllowShell(),
      click: (item) => {
        if (item.checked) {
          // Enabling the RCE path — confirm first. Deny reverts the checkbox.
          const choice = dialog.showMessageBoxSync({
            type: "warning",
            buttons: ["Cancel", "Allow shell commands"],
            defaultId: 0,
            cancelId: 0,
            title: "Allow shell commands?",
            message: "Shell tiles run arbitrary commands on this Mac.",
            detail:
              "Any paired phone will be able to execute shell commands here. Only enable this if you trust every paired device. You can turn it off again anytime.",
          });
          if (choice !== 1) {
            host.setAllowShell(false);
            refresh();
            return;
          }
        }
        host.setAllowShell(item.checked);
        refresh();
      },
    },
    {
      label: "Open at login",
      type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { label: "Quit streamPhoneDeck", click: () => app.quit() },
  ]);
}

function refresh() {
  if (tray) tray.setContextMenu(buildTrayMenu());
  if (pairWindow && !pairWindow.isDestroyed()) pairWindow.webContents.send("devices:changed");
}

app.whenReady().then(async () => {
  app.dock?.hide?.(); // menu-bar utility, no dock icon

  const dir = join(app.getPath("userData"), "data");
  host = createHost({ dir, dryRun });
  host.server.on("error", (err) => {
    const msg =
      err.code === "EADDRINUSE"
        ? `Port ${host.port} is already in use. Is another copy of streamPhoneDeck running?`
        : `Could not start the host: ${err.message}`;
    dialog.showErrorBox("streamPhoneDeck", msg);
    app.quit();
  });
  await host.listen();
  console.log(`host listening on :${host.port} (${host.name})`);

  if (SMOKE) {
    console.log("SMOKE OK");
    setTimeout(() => app.quit(), 100);
    return;
  }

  // Tray icon (a black+alpha template image; macOS recolors it for the menu bar).
  const icon = nativeImage.createFromPath(join(__dirname, "assets", "trayTemplate.png"));
  if (process.platform === "darwin" && !icon.isEmpty()) icon.setTemplateImage(true);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip("streamPhoneDeck host");
  tray.setContextMenu(buildTrayMenu());

  ipcMain.handle("pairing:start", async () => {
    const { payload, expiresAt } = host.startPairing();
    const qr = await qrcode.toDataURL(JSON.stringify(payload), { margin: 1, width: 320 });
    refresh();
    return { ...payload, expiresAt, qr };
  });
  ipcMain.handle("devices:list", () => host.listDevices());
  ipcMain.handle("devices:revoke", (_e, id) => {
    host.revoke(id);
    refresh();
    return host.listDevices();
  });

  createPairWindow();
});

// Menu-bar app: keep running after the pairing window is closed. Quit only from
// the tray menu. (Subscribing to this event overrides the default auto-quit.)
app.on("window-all-closed", () => {});
