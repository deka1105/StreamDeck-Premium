// Preload bridge for the pairing window. CommonJS (.cjs) so it loads cleanly in a
// sandboxed renderer. Exposes a tiny, explicit API — no Node internals reach the
// page. The renderer never touches the token store or the cert; it only asks the
// main process to start a pairing session and manage devices.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("deck", {
  startPairing: () => ipcRenderer.invoke("pairing:start"),
  listDevices: () => ipcRenderer.invoke("devices:list"),
  revoke: (deviceId) => ipcRenderer.invoke("devices:revoke", deviceId),
  onDevicesChanged: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("devices:changed", handler);
    return () => ipcRenderer.removeListener("devices:changed", handler);
  },
  // Allowed-apps management
  listInstalledApps: () => ipcRenderer.invoke("apps:installed"),
  listAllowedApps: () => ipcRenderer.invoke("apps:allowed"),
  setAppAllowed: (name, on) => ipcRenderer.invoke("apps:set", name, on),
});
