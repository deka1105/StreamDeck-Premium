// The layout demo mode shows. Grows as widgets land, so App Review can see
// every kind of widget without a computer.

export const DEMO_LAYOUT = {
  rev: 1,
  home: "home",
  settings: { idleSec: 300 },
  pages: [
    {
      id: "home",
      name: "Home",
      widgets: [
        { id: "clock", type: "clock", x: 0, y: 0, w: 6, h: 3, options: {} },
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
