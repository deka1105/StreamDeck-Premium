// Deck: the phone's own tiles (its active profile's current page) inside the
// panel. Tiles live on the phone (the deck screen edits them); this widget asks
// the app for them and hands taps back, so presses behave exactly like the deck
// screen's — same status line, haptics, timers and app allow-list.
//
//   deck.tiles  → { name, tiles: [{id, label, icon, iconType, color, w, h, kind}] }
//   deck.press  { id } → { ok, error? }
// Both are answered by the phone app (or the demo), never by the computer.

function columnsFor(n, boxW, boxH) {
  if (n <= 0) return 1;
  let best = 1;
  let bestSize = 0;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const size = Math.min(boxW / cols, boxH / rows);
    if (size > bestSize) {
      bestSize = size;
      best = cols;
    }
  }
  return best;
}

export default {
  type: "deck",
  meta: {
    name: "Deck tiles",
    category: "controls",
    size: { w: 12, h: 3 },
    min: { w: 2, h: 1 },
    options: [{ key: "labels", type: "bool", label: "Show labels", default: true }],
  },
  needs: () => [],
  mount(el, ctx) {
    el.classList.add("w-deck");
    el.innerHTML = `<div class="deck-grid"></div><div class="deck-msg" hidden></div>`;
    const grid = el.querySelector(".deck-grid");
    const msg = el.querySelector(".deck-msg");
    let tiles = [];

    const layout = () => {
      const r = el.getBoundingClientRect();
      const cols = columnsFor(tiles.length, r.width, r.height);
      grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
      grid.style.gridTemplateRows = `repeat(${Math.max(1, Math.ceil(tiles.length / cols))}, minmax(0, 1fr))`;
    };

    const render = (data) => {
      tiles = Array.isArray(data?.tiles) ? data.tiles : [];
      grid.innerHTML = "";
      msg.hidden = tiles.length > 0;
      if (!tiles.length) msg.textContent = data?.empty ?? "No tiles on this page yet.";
      for (const t of tiles) {
        const b = document.createElement("button");
        b.className = "deck-tile";
        b.style.setProperty("--tile", t.color || "#16233a");
        b.dataset.id = t.id;
        const face = document.createElement("span");
        face.className = "deck-icon";
        if (t.iconType === "image" && /^data:image\//.test(t.icon || "")) {
          const img = document.createElement("img");
          img.src = t.icon;
          img.alt = "";
          face.appendChild(img);
        } else {
          face.textContent = t.icon || "•";
        }
        b.appendChild(face);
        if (ctx.options.labels) {
          const label = document.createElement("span");
          label.className = "deck-label";
          label.textContent = t.label || "";
          b.appendChild(label);
        }
        b.addEventListener("click", async () => {
          b.classList.add("pressed");
          setTimeout(() => b.classList.remove("pressed"), 160);
          try {
            const r = await ctx.request("deck.press", { id: t.id });
            b.dataset.result = r?.ok === false ? "fail" : "ok";
          } catch {
            b.dataset.result = "fail";
          }
          setTimeout(() => delete b.dataset.result, 900);
        });
        grid.appendChild(b);
      }
      layout();
    };

    const load = () =>
      ctx.request("deck.tiles").then(render, () =>
        render({ tiles: [], empty: "Your phone's deck tiles appear here when the panel runs on the phone." }),
      );
    load();
    // The phone pushes a `deck` event when its tiles change.
    ctx.subscribe("deck", render);
    const ro = new ResizeObserver(layout);
    ro.observe(el);
    return { unmount: () => ro.disconnect() };
  },
};
