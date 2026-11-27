// The layout a fresh host starts with, before anyone opens the editor.
// Widget types not in the catalogue are dropped by the schema, so this can list
// widgets from later stages without breaking older builds.

export const STARTER_LAYOUT = {
  home: "home",
  pages: [
    {
      id: "home",
      name: "Home",
      widgets: [
        { id: "clock", type: "clock", x: 0, y: 0, w: 6, h: 3, options: { seconds: false } },
        { id: "cpu", type: "metric", x: 6, y: 0, w: 3, h: 3, options: { source: "cpu" } },
        { id: "mem", type: "metric", x: 9, y: 0, w: 3, h: 3, options: { source: "mem" } },
        { id: "deck", type: "deck", x: 0, y: 3, w: 12, h: 3, options: {} },
      ],
    },
    {
      id: "deck",
      name: "Deck",
      widgets: [{ id: "deck", type: "deck", x: 0, y: 0, w: 12, h: 6, options: {} }],
    },
  ],
};
