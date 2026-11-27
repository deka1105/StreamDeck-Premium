// Page templates: starting points in the editor's "New page from template".
// Our own content. Every widget type used here must exist in the registry
// (enforced by test/templates.test.mjs). Grows stage by stage.

export const TEMPLATES = [
  {
    id: "home",
    name: "Home",
    description: "Clock, computer load and your deck tiles.",
    page: {
      name: "Home",
      widgets: [
        { type: "clock", x: 0, y: 0, w: 6, h: 3 },
        { type: "metric", x: 6, y: 0, w: 3, h: 3, options: { source: "cpu" } },
        { type: "metric", x: 9, y: 0, w: 3, h: 3, options: { source: "mem" } },
        { type: "deck", x: 0, y: 3, w: 12, h: 3 },
      ],
    },
  },
  {
    id: "system",
    name: "System",
    description: "CPU, GPU, memory and network over time, disks and latency.",
    page: {
      name: "System",
      widgets: [
        { type: "chart", x: 0, y: 0, w: 4, h: 2, options: { source: "cpu", window: "180" } },
        { type: "chart", x: 4, y: 0, w: 4, h: 2, options: { source: "gpu", source2: "vram", window: "180" } },
        { type: "chart", x: 8, y: 0, w: 4, h: 2, options: { source: "mem", source2: "swap", window: "180" } },
        { type: "chart", x: 0, y: 2, w: 6, h: 2, options: { source: "netDown", source2: "netUp", window: "180" } },
        { type: "chart", x: 6, y: 2, w: 3, h: 2, options: { source: "ping", window: "180" } },
        { type: "metric", x: 9, y: 2, w: 3, h: 2, options: { source: "cpuTemp" } },
        { type: "storage", x: 0, y: 4, w: 6, h: 2 },
        { type: "gpu", x: 6, y: 4, w: 6, h: 2 },
      ],
    },
  },
  {
    id: "processes",
    name: "Processes",
    description: "The heaviest apps; tap one to end it (turn that on per widget).",
    page: {
      name: "Processes",
      widgets: [
        { type: "processes", x: 0, y: 0, w: 8, h: 6, options: { sort: "cpu" } },
        { type: "topprocs", x: 8, y: 0, w: 4, h: 3, options: { sort: "mem", count: 5 } },
        { type: "gauge", x: 8, y: 3, w: 2, h: 3, options: { source: "cpu" } },
        { type: "gauge", x: 10, y: 3, w: 2, h: 3, options: { source: "mem" } },
      ],
    },
  },
  {
    id: "dashboard",
    name: "Dashboard",
    description: "Gauges, a clock and your deck tiles.",
    page: {
      name: "Dashboard",
      widgets: [
        { type: "gauge", x: 0, y: 0, w: 3, h: 3, options: { source: "cpu" } },
        { type: "gauge", x: 3, y: 0, w: 3, h: 3, options: { source: "mem" } },
        { type: "gauge", x: 6, y: 0, w: 3, h: 3, options: { source: "gpu" } },
        { type: "clock", x: 9, y: 0, w: 3, h: 3 },
        { type: "deck", x: 0, y: 3, w: 12, h: 3 },
      ],
    },
  },
  {
    id: "status",
    name: "Status",
    description: "Load, top apps and connection at a glance.",
    page: {
      name: "Status",
      widgets: [
        { type: "gauge", x: 0, y: 0, w: 3, h: 3, options: { source: "cpu" } },
        { type: "gauge", x: 3, y: 0, w: 3, h: 3, options: { source: "mem" } },
        { type: "topprocs", x: 6, y: 0, w: 6, h: 3, options: { sort: "cpu", count: 5 } },
        { type: "internet", x: 0, y: 3, w: 8, h: 3 },
        { type: "metric", x: 8, y: 3, w: 4, h: 3, options: { source: "disk" } },
      ],
    },
  },
  {
    id: "internet",
    name: "Internet",
    description: "Connection quality, data used and a speed test.",
    page: {
      name: "Internet",
      widgets: [
        { type: "internet", x: 0, y: 0, w: 12, h: 4 },
        { type: "chart", x: 0, y: 4, w: 8, h: 2, options: { source: "netDown", source2: "netUp", window: "360" } },
        { type: "metric", x: 8, y: 4, w: 4, h: 2, options: { source: "latency" } },
      ],
    },
  },
  {
    id: "deck",
    name: "Deck",
    description: "Your phone's tiles, full screen.",
    page: { name: "Deck", widgets: [{ type: "deck", x: 0, y: 0, w: 12, h: 6 }] },
  },
  {
    id: "clock",
    name: "Clock",
    description: "A big clock with seconds.",
    page: { name: "Clock", widgets: [{ type: "clock", x: 0, y: 0, w: 12, h: 6, options: { seconds: true } }] },
  },
];
