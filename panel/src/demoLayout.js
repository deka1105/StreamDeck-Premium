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
      id: "system",
      name: "System",
      widgets: [
        { id: "c1", type: "chart", x: 0, y: 0, w: 6, h: 2, options: { source: "cpu", window: "180" } },
        { id: "c2", type: "chart", x: 6, y: 0, w: 6, h: 2, options: { source: "netDown", source2: "netUp", window: "180" } },
        { id: "g1", type: "gauge", x: 0, y: 2, w: 2, h: 2, options: { source: "mem" } },
        { id: "g2", type: "gauge", x: 2, y: 2, w: 2, h: 2, options: { source: "gpu" } },
        { id: "tp", type: "topprocs", x: 4, y: 2, w: 4, h: 4, options: { sort: "cpu", count: 6 } },
        { id: "st", type: "storage", x: 8, y: 2, w: 4, h: 4 },
        { id: "in", type: "internet", x: 0, y: 4, w: 4, h: 2 },
      ],
    },
    {
      id: "ambient",
      name: "Ambient",
      widgets: [
        { id: "wx", type: "weather", x: 0, y: 0, w: 4, h: 2 },
        { id: "sm", type: "sunmoon", x: 4, y: 0, w: 4, h: 2 },
        { id: "aq", type: "airquality", x: 8, y: 0, w: 4, h: 2 },
        { id: "fc", type: "forecast", x: 0, y: 2, w: 8, h: 2 },
        { id: "nu", type: "nextup", x: 8, y: 2, w: 4, h: 2 },
        { id: "ag", type: "agenda", x: 0, y: 4, w: 4, h: 2 },
        { id: "cr", type: "crypto", x: 4, y: 4, w: 4, h: 2 },
        { id: "nw", type: "news", x: 8, y: 4, w: 4, h: 2 },
      ],
    },
    {
      id: "music",
      name: "Music",
      widgets: [
        { id: "np", type: "nowplaying", x: 0, y: 0, w: 7, h: 4 },
        { id: "ly", type: "lyrics", x: 7, y: 0, w: 5, h: 6, options: { lookup: true } },
        { id: "ms", type: "mediaserver", x: 0, y: 4, w: 7, h: 2 },
      ],
    },
    {
      id: "auto",
      name: "Automation",
      widgets: [
        { id: "pv", type: "pushvalue", x: 0, y: 0, w: 3, h: 2, options: { key: "temperature", title: "Living room" } },
        { id: "pb", type: "pushvalue", x: 3, y: 0, w: 3, h: 2, options: { key: "build", title: "Build", style: "progress" } },
        { id: "rl", type: "rules", x: 6, y: 0, w: 3, h: 2 },
        { id: "bb", type: "bigbutton", x: 9, y: 0, w: 3, h: 2, options: { shortcut: "deploy" } },
        { id: "nt", type: "notifications", x: 0, y: 2, w: 6, h: 4 },
        { id: "cm", type: "command", x: 6, y: 2, w: 6, h: 2, options: { command: "disk", title: "Disk" } },
        { id: "sg", type: "shortcutgrid", x: 6, y: 4, w: 6, h: 2 },
      ],
    },
    {
      id: "ai",
      name: "AI",
      widgets: [
        { id: "ss", type: "sessions", x: 0, y: 0, w: 6, h: 3 },
        { id: "aq", type: "aiquota", x: 6, y: 0, w: 3, h: 3, options: { agent: "claude" } },
        { id: "tk", type: "tokens", x: 9, y: 0, w: 3, h: 3 },
        { id: "cg", type: "contributions", x: 0, y: 3, w: 7, h: 3 },
        { id: "pr", type: "prs", x: 7, y: 3, w: 5, h: 3 },
      ],
    },
    {
      id: "studio",
      name: "Studio",
      widgets: [
        { id: "obs", type: "obs", x: 0, y: 0, w: 7, h: 4, options: { scenes: true, outputs: true, audio: true } },
        { id: "mt", type: "meeting", x: 7, y: 0, w: 5, h: 3, options: { app: "zoom", muteAll: true } },
        { id: "vol", type: "volume", x: 7, y: 3, w: 5, h: 1 },
        { id: "osc", type: "oscpad", x: 0, y: 4, w: 7, h: 2, options: { title: "Lighting desk" } },
        { id: "wk", type: "wake", x: 7, y: 4, w: 5, h: 2 },
      ],
    },
    {
      id: "devdeck",
      name: "Dev & home",
      widgets: [
        { id: "ha", type: "homeassistant", x: 0, y: 0, w: 4, h: 6, options: { title: "Office", entities: ["light.desk", "light.shelf", "switch.coffee", "sensor.office_temp", "lock.front_door", "scene.focus"] } },
        { id: "svc", type: "services", x: 4, y: 0, w: 4, h: 4, options: { output: true } },
        { id: "ct", type: "containers", x: 8, y: 0, w: 4, h: 4, options: { allowControl: true } },
        { id: "tp", type: "trackpad", x: 4, y: 4, w: 8, h: 2 },
      ],
    },
    {
      id: "daily",
      name: "Daily",
      widgets: [
        { id: "todo", type: "checklist", x: 0, y: 0, w: 4, h: 4 },
        { id: "tm", type: "timer", x: 4, y: 0, w: 4, h: 4 },
        { id: "po", type: "pomodoro", x: 8, y: 0, w: 4, h: 4 },
        { id: "wc", type: "wordclock", x: 0, y: 4, w: 3, h: 2 },
        { id: "note", type: "note", x: 3, y: 4, w: 5, h: 2, options: { title: "Note" } },
        { id: "bat", type: "battery", x: 8, y: 4, w: 2, h: 2 },
        { id: "ct", type: "counter", x: 10, y: 4, w: 2, h: 2 },
      ],
    },
    {
      id: "deck",
      name: "Deck",
      widgets: [{ id: "deck", type: "deck", x: 0, y: 0, w: 12, h: 6, options: {} }],
    },
  ],
};
