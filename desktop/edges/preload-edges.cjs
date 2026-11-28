// The desk-edges overlay's only door to the host: a fixed set of calls.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("edges", {
  info: () => ipcRenderer.invoke("edges:info"),
  on: (event, fn) => {
    const ch = event === "profile" ? "edges:profile" : event === "info" ? "edges:info" : null;
    if (ch) ipcRenderer.on(ch, (_e, data) => fn(data));
  },
  interactive: (on) => ipcRenderer.send("edges:interactive", !!on),
  get: (kind) => ipcRenderer.invoke("edges:get", kind),
  set: (kind, value) => ipcRenderer.invoke("edges:set", kind, value),
  act: (kind, action, arg) => ipcRenderer.invoke("edges:act", kind, action, arg),
  launch: (app) => ipcRenderer.invoke("edges:launch", app),
  icon: (app) => ipcRenderer.invoke("edges:icon", app),
  saveFloating: (list) => ipcRenderer.invoke("edges:saveFloating", list),
});
