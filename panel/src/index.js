// Panel entry point.

import { createBridge } from "./bridge.js";
import { createStore } from "./store.js";
import { mountPage } from "./app.js";

const STARTER_PAGE = {
  id: "home",
  name: "Home",
  widgets: [
    { id: "w1", type: "clock", x: 0, y: 0, w: 6, h: 3, options: { seconds: true } },
    { id: "w2", type: "metric", x: 6, y: 0, w: 3, h: 3, options: { source: "cpu" } },
    { id: "w3", type: "metric", x: 9, y: 0, w: 3, h: 3, options: { source: "mem" } },
  ],
};

function orientation() {
  return window.innerHeight > window.innerWidth ? "portrait" : "landscape";
}

function boot() {
  const root = document.getElementById("pages");
  const statusEl = document.getElementById("status");
  const bridge = createBridge();
  const store = createStore();
  const env = { store, bridge };
  let current = null;
  let currentOrientation = orientation();

  bridge.on("event", (e) => {
    if (e.type === "data" && e.data?.kind) store.set(e.data.kind, e.data.value);
  });
  bridge.on("status", ({ online, detail }) => {
    statusEl.dataset.online = online ? "1" : "0";
    statusEl.title = online ? "Connected" : `Offline${detail ? `: ${detail}` : ""}`;
  });

  const render = () => {
    current?.destroy();
    current = mountPage(root, STARTER_PAGE, env, currentOrientation);
    bridge.setNeeds(current.needs);
  };

  bridge.on("resync", async () => {
    try {
      const snap = await bridge.request("panel.snapshot", { kinds: current?.needs ?? [] });
      for (const [kind, value] of Object.entries(snap?.data ?? {})) store.set(kind, value);
    } catch {
      /* the next data event fills it in */
    }
  });

  window.addEventListener("resize", () => {
    const o = orientation();
    if (o !== currentOrientation) {
      currentOrientation = o;
      render();
    }
  });

  render();
}

boot();
