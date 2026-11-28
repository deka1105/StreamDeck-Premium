// Desk edges in the Electron host: one transparent, always-on-top window per
// display that ignores the mouse (but still receives moves) until the pointer
// is over a revealed control. Hidden over fullscreen apps unless allowed.

import { BrowserWindow, screen, ipcMain, nativeImage, app as electronApp } from "electron";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanEdges, effectiveProfile, dockFromWorkArea } from "./config.mjs";
import { trayBesideDock, clampToDisplay } from "./geometry.mjs";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const OVERLAY = join(here, "..", "..", "edges", "overlay.html");
const PRELOAD = join(here, "..", "..", "edges", "preload-edges.cjs");

/** macOS: the Dock's real position and size (needs Accessibility, like keyboard shortcuts). */
async function macDockFrame() {
  try {
    const { stdout } = await run("osascript", ["-e", 'tell application "System Events" to tell process "Dock" to get {position, size} of list 1'], { timeout: 3000 });
    const [x, y, w, h] = stdout.split(",").map((s) => Number(s.trim()));
    return [x, y, w, h].every(Number.isFinite) ? { x, y, width: w, height: h } : null;
  } catch {
    return null;
  }
}

export function createEdges({ getSettings, saveEdges, controls, frontmostApp, log = console.log, platform = process.platform }) {
  const windows = new Map(); // display id -> BrowserWindow
  let edges = cleanEdges(getSettings()?.edges ?? {});
  let front = null;
  let profileTimer = null;
  let dockFrame = null;
  const iconCache = new Map();

  function displayInfo(d) {
    const bounds = d.bounds;
    let dock = dockFromWorkArea(bounds, d.workArea);
    // Use the real Dock frame (global coordinates) when we have it and it's on this display.
    if (dock && dockFrame && dockFrame.x >= bounds.x && dockFrame.x < bounds.x + bounds.width && dockFrame.y >= bounds.y && dockFrame.y < bounds.y + bounds.height) {
      dock = { ...dock, x: dockFrame.x - bounds.x, y: dockFrame.y - bounds.y, width: dockFrame.width, height: dockFrame.height };
    }
    const display = { width: bounds.width, height: bounds.height };
    return {
      id: String(d.id),
      display,
      dock,
      dockTray: trayBesideDock(display, dock, { apps: effectiveProfile(edges, front).dock?.length || 1 }),
      profile: effectiveProfile(edges, front),
      floating: edges.floating.filter((f) => !f.display || f.display === String(d.id)).map((f) => ({ ...f, ...clampToDisplay(f, display) })),
    };
  }

  function makeWindow(d) {
    const b = d.bounds;
    const win = new BrowserWindow({
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      transparent: true,
      frame: false,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      fullscreenable: false,
      show: false,
      backgroundColor: "#00000000",
      webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true, backgroundThrottling: false },
    });
    win.setAlwaysOnTop(true, "screen-saver");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: edges.allowFullscreen });
    win.setIgnoreMouseEvents(true, { forward: true });
    win.loadFile(OVERLAY);
    win.once("ready-to-show", () => win.showInactive());
    win.__displayId = String(d.id);
    return win;
  }

  function sync() {
    const all = screen.getAllDisplays();
    const wanted = edges.enabled ? (edges.displays === "primary" ? [screen.getPrimaryDisplay()] : all) : [];
    for (const [id, w] of windows) {
      if (!wanted.some((d) => String(d.id) === id)) {
        w.destroy();
        windows.delete(id);
      }
    }
    for (const d of wanted) {
      const id = String(d.id);
      const w = windows.get(id);
      if (!w) windows.set(id, makeWindow(d));
      else {
        w.setBounds(d.bounds);
        w.webContents.send("edges:info", displayInfo(d));
      }
    }
  }

  const windowFor = (sender) => [...windows.values()].find((w) => w.webContents === sender);
  const displayOf = (sender) => screen.getAllDisplays().find((d) => String(d.id) === windowFor(sender)?.__displayId);

  ipcMain.handle("edges:info", (e) => {
    const d = displayOf(e.sender);
    return d ? displayInfo(d) : null;
  });
  ipcMain.on("edges:interactive", (e, on) => {
    const w = windowFor(e.sender);
    if (!w) return;
    // While over a control, take clicks; otherwise let everything through.
    if (on) w.setIgnoreMouseEvents(false);
    else w.setIgnoreMouseEvents(true, { forward: true });
  });
  ipcMain.handle("edges:get", (_e, kind) => controls.get(String(kind)).catch((err) => ({ unavailable: true, reason: err.message })));
  ipcMain.handle("edges:set", (_e, kind, value) => controls.set(String(kind), value).catch((err) => ({ ok: false, error: err.message })));
  ipcMain.handle("edges:act", (_e, kind, action, arg) => controls.act(String(kind), String(action), arg).catch(() => ({ ok: false })));
  ipcMain.handle("edges:launch", (_e, name) => {
    // Only apps configured in the editor can be launched from the edges.
    const p = effectiveProfile(edges, front);
    if (![...(p.dock ?? []), ...(p.launcher ?? [])].includes(name)) return { ok: false };
    return controls.launch(name);
  });
  ipcMain.handle("edges:icon", async (_e, name) => {
    if (iconCache.has(name)) return iconCache.get(name);
    let src = null;
    try {
      const candidates = platform === "darwin" ? (/\.app$/.test(name) ? [name] : ["/Applications", "/System/Applications", "/System/Applications/Utilities", join(electronApp.getPath("home"), "Applications")].map((d) => join(d, `${name}.app`))) : [name];
      const path = candidates.find((p) => existsSync(p));
      if (path) {
        // A Quick Look thumbnail of the app bundle is its icon (getFileIcon crashed Electron 34 on macOS).
        const img = platform === "darwin" ? await nativeImage.createThumbnailFromPath(path, { width: 128, height: 128 }) : await electronApp.getFileIcon(path, { size: "large" });
        src = img.isEmpty() ? null : img.toDataURL();
      }
    } catch {
      src = null;
    }
    iconCache.set(name, src);
    return src;
  });
  ipcMain.handle("edges:saveFloating", (e, list) => {
    const id = windowFor(e.sender)?.__displayId ?? "";
    const others = edges.floating.filter((f) => f.display && f.display !== id);
    edges.floating = cleanEdges({ floating: [...others, ...(Array.isArray(list) ? list : []).map((f) => ({ ...f, display: id }))] }).floating;
    saveEdges(edges.floating);
    return { ok: true };
  });

  // The frontmost app picks the profile (checked every 1.5 s while edges are on).
  async function pollFront() {
    if (!edges.enabled || !edges.profiles.length) return;
    const f = await frontmostApp().catch(() => null);
    if (f === front) return;
    const before = JSON.stringify(effectiveProfile(edges, front));
    front = f;
    const after = effectiveProfile(edges, front);
    if (JSON.stringify(after) !== before) for (const w of windows.values()) w.webContents.send("edges:profile", after);
  }

  return {
    async start() {
      if (platform === "darwin") dockFrame = await macDockFrame();
      sync();
      screen.on("display-added", sync);
      screen.on("display-removed", sync);
      screen.on("display-metrics-changed", sync);
      profileTimer = setInterval(pollFront, 1500);
    },
    /** Settings changed in the editor: restyle and re-place without a restart. */
    async reload() {
      edges = cleanEdges(getSettings()?.edges ?? {});
      if (platform === "darwin") dockFrame = await macDockFrame();
      sync();
      for (const w of windows.values()) w.webContents.send("edges:profile", effectiveProfile(edges, front));
    },
    async recalibrate() {
      dockFrame = platform === "darwin" ? await macDockFrame() : null;
      sync();
    },
    stop() {
      clearInterval(profileTimer);
      for (const w of windows.values()) w.destroy();
      windows.clear();
    },
    windows,
  };
}
