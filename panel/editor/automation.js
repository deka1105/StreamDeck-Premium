// Editor › Settings › Shortcuts, Commands, Rules, Webhooks & page switching.

const rid = (p) => `${p}${Math.random().toString(36).slice(2, 7)}`;
const slug = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || rid("s");

const EXAMPLES = [
  ["Music plays → Music page", { name: "Music plays", when: { type: "media_playing", apps: "" }, then: { type: "show_page", page: "music" }, whileLasts: true, priority: 4 }],
  ["On a call → push onair", { name: "On air", when: { type: "app_running", apps: "zoom|Teams|FaceTime|Webex" }, then: { type: "push_value", key: "onair", value: "on" }, whileLasts: true }],
  ["CPU busy → notify", { name: "CPU busy", when: { type: "cpu_above", pct: 90 }, then: { type: "notify", title: "CPU busy", text: "Above 90% for 15 s", level: "warn" }, restSec: 600 }],
  ["Away 5 min → Ambient page", { name: "Away", when: { type: "away", minutes: 5 }, then: { type: "show_page", page: "ambient" }, whileLasts: true, priority: 2 }],
  ["Evenings → Calm page", { name: "Evenings", when: { type: "time_window" }, then: { type: "show_page", page: "calm" }, hours: "21:00-23:00", whileLasts: true, priority: 1 }],
  ["Doorbell pushed → notify", { name: "Doorbell", when: { type: "push_value", key: "doorbell", op: "on" }, then: { type: "notify", title: "Doorbell", text: "Someone is at the door", level: "info" }, restSec: 30 }],
  ["CI failed → notify", { name: "CI failed", when: { type: "push_value", key: "build", op: "eq", value: "failed" }, then: { type: "notify", title: "Build failed", level: "error" }, restSec: 300 }],
  ["Sensor silent 10 min → notify", { name: "Sensor stopped", when: { type: "push_stale", key: "temperature", seconds: 600 }, then: { type: "notify", title: "Sensor stopped posting", level: "warn" }, restSec: 3600 }],
];

const WHEN = [["app_running", "An app is running"], ["app_front", "An app is in front"], ["media_playing", "Music or video plays"], ["push_value", "A pushed value…"], ["push_stale", "A pushed value stops updating"], ["cpu_above", "CPU stays above…"], ["away", "I'm away from the keyboard"], ["time_window", "It's between two times"], ["always", "Always"]];
const THEN = [["show_page", "Show a page"], ["notify", "Show a notification"], ["push_value", "Push a value"], ["run_shortcut", "Run a shortcut"], ["night_screen", "Show the night screen"]];

export function renderAutomation(root, { state, h, change, api, flash }) {
  const cfg = state.config;
  cfg.shortcuts ??= [];
  cfg.commands ??= [];
  cfg.rules ??= [];
  const s = cfg.settings;
  const section = (title, ...kids) => h("section", { class: "set-section" }, h("h3", { text: title }), ...kids);
  const input = (id, attrs = {}) => h("input", { id, ...attrs });
  const select = (id, opts, value) => {
    const el = h("select", { id }, opts.map(([v, l]) => h("option", { value: v, text: l })));
    if (value !== undefined) el.value = value;
    return el;
  };
  const pages = (state.target === "default" ? cfg.default : cfg.devices[state.target] ?? cfg.default).pages;

  // ---------------------------------------------------------- shortcuts ----
  const scList = h("div", { class: "set-list" });
  for (const sc of cfg.shortcuts) {
    const status = h("span", { class: "muted cal-status" });
    scList.append(
      h(
        "div",
        { class: "set-row", dataset: { id: sc.id } },
        h("span", { text: sc.icon || "⚡" }),
        h("div", { class: "grow" }, h("b", { text: `${sc.label} ` }), h("span", { class: "muted small", text: `${sc.id} · ${sc.kind}${sc.value ? ` · takes a number ${sc.value.min}–${sc.value.max}` : ""}` })),
        status,
        h("button", { class: "btn", text: "Test", onclick: async () => {
          const r = await api("/api/editor/shortcut/test", { id: sc.id }).catch((e) => ({ ok: false, error: e.message }));
          status.textContent = r.ok ? "✓ ran" : r.error;
        } }),
        h("button", { class: "btn danger", text: "Remove", onclick: () => change(() => (cfg.shortcuts = cfg.shortcuts.filter((x) => x.id !== sc.id))) }),
      ),
    );
  }
  const f = {
    label: input("scLabel", { placeholder: "Label" }),
    icon: input("scIcon", { placeholder: "Emoji", maxlength: 4, style: "max-width:70px" }),
    kind: select("scKind", [["program", "Run a program"], ["url", "Open an address"], ["keys", "Press keys"], ["text", "Type text"], ["macro", "Macro (other shortcuts)"]]),
    cmd: input("scCmd", { placeholder: "Program path or https:// address (may contain {value})" }),
    args: input("scArgs", { placeholder: "Arguments, e.g. --percent {value}" }),
    combo: input("scCombo", { placeholder: "Keys, e.g. cmd+shift+4" }),
    text: input("scText", { placeholder: "Text to type" }),
    steps: input("scSteps", { placeholder: "Macro steps: shortcut ids and waits in ms, comma-separated" }),
    num: h("input", { type: "checkbox", id: "scNum" }),
    min: input("scMin", { type: "number", value: 0, style: "max-width:80px" }),
    max: input("scMax", { type: "number", value: 100, style: "max-width:80px" }),
    stepv: input("scStep", { type: "number", value: 1, style: "max-width:80px" }),
    toggle: input("scToggle", { placeholder: "Light up from a pushed value (key or key=value)" }),
  };
  root.append(
    section(
      "Shortcuts",
      h("p", { class: "hint", text: "Defined here, on this computer. The phone only sends a shortcut's id — never the command." }),
      scList,
      h("div", { class: "row" }, f.label, f.icon, f.kind),
      h("div", { class: "row" }, f.cmd, f.args),
      h("div", { class: "row" }, f.combo, f.text, f.steps),
      h("div", { class: "row" }, h("label", { class: "check" }, f.num, "Takes a number:"), f.min, f.max, f.stepv, f.toggle),
      h("button", {
        class: "btn",
        id: "addShortcut",
        text: "Add shortcut",
        onclick: () => {
          if (!f.label.value.trim()) return flash("Give the shortcut a label.", true);
          let id = slug(f.label.value);
          while (cfg.shortcuts.some((x) => x.id === id)) id = `${id}-${rid("")}`;
          change(() =>
            cfg.shortcuts.push({
              id,
              label: f.label.value.trim(),
              icon: f.icon.value.trim(),
              color: "#334155",
              kind: f.kind.value,
              cmd: f.cmd.value.trim(),
              args: f.args.value,
              combo: f.combo.value.trim(),
              text: f.text.value,
              steps: f.steps.value.split(",").map((x) => x.trim()).filter(Boolean).map((x) => (/^\d+$/.test(x) ? Number(x) : x)),
              value: f.num.checked ? { min: Number(f.min.value), max: Number(f.max.value), step: Number(f.stepv.value) } : null,
              toggle: f.toggle.value.trim(),
            }),
          );
          flash(`Added “${id}”. Save to keep it.`);
        },
      }),
    ),
  );

  // ----------------------------------------------------------- commands ----
  const cmdList = h("div", { class: "set-list" });
  for (const c of cfg.commands)
    cmdList.append(h("div", { class: "set-row" }, h("div", { class: "grow" }, h("b", { text: `${c.label} ` }), h("span", { class: "muted small", text: `${c.id} · ${c.shell} · every ${c.every} s` })), h("button", { class: "btn danger", text: "Remove", onclick: () => change(() => (cfg.commands = cfg.commands.filter((x) => x.id !== c.id))) })));
  const cLabel = input("cmdLabel", { placeholder: "Label" });
  const cShell = select("cmdShell", [["bash", "bash"], ["zsh", "zsh"], ["sh", "sh"], ["powershell", "PowerShell"]]);
  const cEvery = input("cmdEvery", { type: "number", value: 60, min: 5, style: "max-width:90px" });
  const cScript = h("textarea", { id: "cmdScript", rows: 3, placeholder: "df -h | head -5" });
  root.append(
    section(
      "Commands (for the Command output widget)",
      cmdList,
      h("div", { class: "row" }, cLabel, cShell, h("label", {}, "Every (s)", cEvery)),
      cScript,
      h("button", { class: "btn", id: "addCommand", text: "Add command", onclick: () => {
        if (!cLabel.value.trim() || !cScript.value.trim()) return flash("A command needs a label and a script.", true);
        let id = slug(cLabel.value);
        while (cfg.commands.some((x) => x.id === id)) id = `${id}-${rid("")}`;
        change(() => cfg.commands.push({ id, label: cLabel.value.trim(), shell: cShell.value, script: cScript.value, every: Number(cEvery.value) || 60 }));
        flash(`Added command “${id}” — use that id in a Command output widget.`);
      } }),
    ),
  );

  // -------------------------------------------------------------- rules ----
  const rList = h("div", { class: "set-list" });
  for (const r of cfg.rules) {
    const status = h("span", { class: "muted cal-status" });
    rList.append(
      h(
        "div",
        { class: "set-row", dataset: { id: r.id } },
        h("input", { type: "checkbox", checked: r.enabled, "aria-label": "Enabled", onchange: (e) => change(() => (r.enabled = e.target.checked)) }),
        h("div", { class: "grow" }, h("b", { text: `${r.name} ` }), h("span", { class: "muted small", text: `${WHEN.find(([v]) => v === r.when.type)?.[1]} → ${THEN.find(([v]) => v === r.then.type)?.[1]}${r.then.page ? ` (${r.then.page})` : ""}${r.hours ? ` · ${r.hours}` : ""}${r.whileLasts ? " · while it lasts" : ""}` })),
        status,
        h("button", { class: "btn", text: "Test", onclick: async () => {
          const res = await api("/api/editor/rules/test", { id: r.id }).catch((e) => ({ ok: false, error: e.message }));
          status.textContent = res.ok ? "✓ ran" : res.error;
        } }),
        h("button", { class: "btn danger", text: "Remove", onclick: () => change(() => (cfg.rules = cfg.rules.filter((x) => x.id !== r.id))) }),
      ),
    );
  }
  const ex = select("ruleExample", [["", "Start from an example…"], ...EXAMPLES.map(([l], i) => [String(i), l])]);
  ex.addEventListener("change", () => {
    const e = EXAMPLES[Number(ex.value)];
    if (!e) return;
    const rule = { id: rid("r"), enabled: true, days: [], hours: "", lastsSec: 0, restSec: 60, priority: 5, whileLasts: false, countdownSec: 3, ...structuredClone(e[1]) };
    if (rule.then.page && !pages.some((p) => p.id === rule.then.page)) rule.then.page = pages[0]?.id ?? "";
    change(() => cfg.rules.push(rule));
    flash(`Added “${rule.name}”. Adjust it, then Save.`);
  });
  const rn = input("ruleName", { placeholder: "Rule name" });
  const rw = select("ruleWhen", WHEN);
  const rwArg = input("ruleWhenArg", { placeholder: "Apps (a|b), key, %, minutes or seconds" });
  const rwOp = select("ruleOp", [["on", "is on"], ["gt", ">"], ["ge", "≥"], ["lt", "<"], ["le", "≤"], ["eq", "="]]);
  const rwVal = input("ruleWhenVal", { placeholder: "value (optional)" });
  const rt = select("ruleThen", THEN);
  const rtPage = select("rulePage", pages.map((p) => [p.id, p.name]));
  const rtArg = input("ruleThenArg", { placeholder: "Title / key / shortcut id" });
  const rtVal = input("ruleThenVal", { placeholder: "Text / value" });
  const rHours = input("ruleHours", { placeholder: "Hours, e.g. 22:00-07:00 (optional)" });
  const rLasts = input("ruleLasts", { type: "number", value: 0, min: 0, style: "max-width:80px", "aria-label": "Lasts seconds" });
  const rWhile = h("input", { type: "checkbox", id: "ruleWhile" });
  root.append(
    section(
      "Rules",
      rList,
      ex,
      h("div", { class: "row" }, rn, rw, rwArg, rwOp, rwVal),
      h("div", { class: "row" }, rt, rtPage, rtArg, rtVal),
      h("div", { class: "row" }, rHours, h("label", {}, "Must last (s)", rLasts), h("label", { class: "check" }, rWhile, "Only while it lasts")),
      h("button", { class: "btn", id: "addRule", text: "Add rule", onclick: () => {
        const arg = rwArg.value.trim();
        const when = { type: rw.value, apps: arg, key: arg, op: rwOp.value, value: rwVal.value.trim(), pct: Number(arg) || 80, minutes: Number(arg) || 5, seconds: Number(arg) || 60 };
        const then = { type: rt.value, page: rtPage.value, title: rtArg.value.trim(), text: rtVal.value.trim(), key: rtArg.value.trim(), value: rtVal.value.trim(), id: rtArg.value.trim() };
        change(() => cfg.rules.push({ id: rid("r"), name: rn.value.trim() || "Rule", enabled: true, when, then, days: [], hours: rHours.value.trim(), lastsSec: Number(rLasts.value) || 0, restSec: 60, priority: 5, whileLasts: rWhile.checked, countdownSec: 3 }));
      } }),
      h("p", { class: "hint", text: "Page switches are calm: the phone counts down (Stay / Go now), waits while you're using it and keeps a gap between switches." }),
    ),
  );

  // --------------------------------------------- webhooks & page switching ----
  s.webhooks ??= { lan: false };
  s.pageSwitch ??= { minGapSec: 20, waitAfterTouchSec: 8, holdMaxMin: 30 };
  const keyOut = h("code", { id: "hookKey", class: "small" });
  const port = location.port || "8789";
  const examples = [
    `curl -X POST http://127.0.0.1:${port}/api/push/temperature -d 21.5`,
    `curl -X POST http://127.0.0.1:${port}/api/push/build -H "Content-Type: application/json" -d '{"value":"passed","sub":"main · 3m"}'`,
    `curl -X POST http://127.0.0.1:${port}/api/notify -H "Content-Type: application/json" -d '{"title":"Deploy","text":"Production is live","level":"ok"}'`,
    `curl -X POST http://127.0.0.1:${port}/api/goto/next`,
    `curl -X POST "http://127.0.0.1:${port}/api/run/<shortcut-id>?value=37"`,
  ];
  const pushedBox = h("div", { class: "set-list", id: "pushedList" });
  api("/api/push").then((r) => pushedBox.replaceChildren(...Object.entries(r.values ?? {}).map(([k, v]) => h("div", { class: "set-row" }, h("b", { text: k }), h("span", { class: "grow", text: ` ${v.value}${v.unit ?? ""}` }), h("button", { class: "btn danger", text: "Delete", onclick: async () => {
    await fetch(`/api/push/${encodeURIComponent(k)}`, { method: "DELETE" });
    change(() => {});
  } })))), () => {});
  root.append(
    section(
      "Webhooks",
      h("p", { class: "hint", text: "Anything that can make an HTTP request can put values and notifications on the panel. From this computer no key is needed." }),
      h("pre", { class: "examples", text: examples.join("\n") }),
      h("h4", { text: "Values pushed so far" }),
      pushedBox,
      h("label", { class: "check" }, h("input", { type: "checkbox", id: "hookLan", checked: s.webhooks.lan, onchange: (e) => change(() => (s.webhooks.lan = e.target.checked)) }), "Accept webhooks from other machines on the network (needs the key below)"),
      h("div", { class: "row" }, h("button", { class: "btn", text: "Show key", onclick: async () => (keyOut.textContent = (await api("/api/editor/webhook-key", {})).key) }), h("button", { class: "btn", text: "New key", onclick: async () => {
        keyOut.textContent = (await api("/api/editor/webhook-key", { rotate: true })).key;
        flash("New key made; the old one stops working.");
      } }), keyOut),
      h("p", { class: "hint", text: "From another machine: POST http://<this-computer>:8788/hook/push/<key> with “Authorization: Bearer <key>”. The key opens only these webhook endpoints. The connection is plain HTTP on your network, so use it only on networks you trust." }),
    ),
    section(
      "Page switching",
      h("label", {}, "Wait this long after a touch before switching (s)", input("psTouch", { type: "number", value: s.pageSwitch.waitAfterTouchSec, onchange: (e) => change(() => (s.pageSwitch.waitAfterTouchSec = Number(e.target.value) || 0)) })),
      h("label", {}, "Minimum time between automatic switches (s)", input("psGap", { type: "number", value: s.pageSwitch.minGapSec, onchange: (e) => change(() => (s.pageSwitch.minGapSec = Number(e.target.value) || 0)) })),
      h("label", {}, "A rule may keep its page at most (minutes, 0 = while it lasts)", input("psHold", { type: "number", value: s.pageSwitch.holdMaxMin, onchange: (e) => change(() => (s.pageSwitch.holdMaxMin = Number(e.target.value) || 0)) })),
    ),
  );
}
