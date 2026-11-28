// Stage 17 — creative app controls (D13). Every route here comes from the
// vendors' own documentation (docs/creative-apps.md):
//  - tool keys: each app's published keyboard shortcuts, sent after bringing
//    the app to the front;
//  - precise values and colours: the apps' scripting (ExtendScript through
//    AppleScript `do javascript` / `DoScriptFile` on macOS, COM on Windows),
//    from fixed script templates with validated numbers only — the phone never
//    sends script text;
//  - Blender: our add-on on a loopback socket (blender/deskassist_blender.py).
// None of these apps is installed here: all of this is "untested".

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";

const run = promisify(execFile);

// --------------------------------------------------------------- tools ----
// [id, label, mac combo, windows combo]
export const TOOLS = {
  photoshop: [
    ["move", "Move", "v"], ["marquee", "Marquee", "m"], ["lasso", "Lasso", "l"], ["quickselect", "Quick select", "w"], ["crop", "Crop", "c"], ["eyedropper", "Eyedropper", "i"],
    ["healing", "Healing", "j"], ["brush", "Brush", "b"], ["clone", "Clone stamp", "s"], ["historybrush", "History brush", "y"], ["eraser", "Eraser", "e"], ["gradient", "Gradient", "g"],
    ["dodge", "Dodge", "o"], ["pen", "Pen", "p"], ["type", "Type", "t"], ["pathselect", "Path select", "a"], ["shape", "Shape", "u"], ["hand", "Hand", "h"],
    ["rotateview", "Rotate view", "r"], ["zoom", "Zoom", "z"], ["swapcolors", "Swap colours", "x"], ["defaultcolors", "Default colours", "d"], ["brushsmaller", "Brush smaller", "["], ["brushbigger", "Brush bigger", "]"],
  ],
  illustrator: [
    ["selection", "Selection", "v"], ["direct", "Direct select", "a"], ["magicwand", "Magic wand", "y"], ["lasso", "Lasso", "q"], ["pen", "Pen", "p"], ["type", "Type", "t"],
    ["line", "Line", "\\"], ["rectangle", "Rectangle", "m"], ["ellipse", "Ellipse", "l"], ["paintbrush", "Paintbrush", "b"], ["pencil", "Pencil", "n"], ["shaper", "Shaper", "shift+n"],
    ["eraser", "Eraser", "shift+e"], ["rotate", "Rotate", "r"], ["scale", "Scale", "s"], ["width", "Width", "shift+w"], ["freetransform", "Free transform", "e"], ["shapebuilder", "Shape builder", "shift+m"],
    ["gradient", "Gradient", "g"], ["eyedropper", "Eyedropper", "i"], ["blend", "Blend", "w"], ["artboard", "Artboard", "shift+o"], ["hand", "Hand", "h"], ["zoom", "Zoom", "z"],
  ],
  aftereffects: [
    ["selection", "Selection", "v"], ["hand", "Hand", "h"], ["zoom", "Zoom", "z"], ["rotation", "Rotation", "w"], ["camera", "Camera", "c"], ["panbehind", "Pan behind", "y"],
    ["shape", "Shape / mask", "q"], ["pen", "Pen", "g"], ["type", "Type", "cmd+t", "ctrl+t"], ["brush", "Brush", "cmd+b", "ctrl+b"], ["roto", "Roto brush", "alt+w"], ["puppet", "Puppet", "cmd+p", "ctrl+p"],
  ],
  premiere: [
    ["selection", "Selection", "v"], ["trackselect", "Track select", "a"], ["ripple", "Ripple edit", "b"], ["rolling", "Rolling edit", "n"], ["ratestretch", "Rate stretch", "r"], ["razor", "Razor", "c"],
    ["slip", "Slip", "y"], ["slide", "Slide", "u"], ["pen", "Pen", "p"], ["hand", "Hand", "h"], ["zoom", "Zoom", "z"], ["type", "Type", "t"],
  ],
};

export const APPS = {
  photoshop: { name: "Photoshop", match: /Adobe Photoshop/i, win: "Photoshop.Application" },
  illustrator: { name: "Illustrator", match: /Adobe Illustrator/i, win: "Illustrator.Application" },
  aftereffects: { name: "After Effects", match: /Adobe After Effects/i, win: null },
  premiere: { name: "Premiere Pro", match: /Adobe Premiere Pro/i, win: null },
  blender: { name: "Blender", match: /^Blender$/i, win: null },
};

/** The key combo for an app's tool on this OS, or null. Pure. */
export function toolCombo(app, tool, platform = process.platform) {
  const t = TOOLS[app]?.find((x) => x[0] === tool);
  if (!t) return null;
  return platform === "win32" ? t[3] ?? t[2] : t[2];
}

// --------------------------------------------------- precise controls ----
// Each control: a range, and a fixed ExtendScript template taking one number.
export const CONTROLS = {
  illustrator: {
    stroke: { label: "Stroke weight (pt)", min: 0, max: 100, step: 0.25, get: "var s=app.activeDocument.selection;(s.length&&s[0].stroked)?s[0].strokeWidth:''", set: (v) => `var s=app.activeDocument.selection;for(var i=0;i<s.length;i++){if(s[i].strokeWidth!==undefined){s[i].stroked=true;s[i].strokeWidth=${v};}}'ok'` },
    opacity: { label: "Opacity (%)", min: 0, max: 100, step: 1, get: "var s=app.activeDocument.selection;s.length?s[0].opacity:''", set: (v) => `var s=app.activeDocument.selection;for(var i=0;i<s.length;i++){s[i].opacity=${v};}'ok'` },
  },
  aftereffects: {
    // The selected property, if it holds a single number (opacity, rotation, a slider…).
    value: { label: "Selected property", min: -100000, max: 100000, step: 0.1, get: "var c=app.project.activeItem;var p=c&&c.selectedProperties&&c.selectedProperties[c.selectedProperties.length-1];(p&&p.propertyValueType===PropertyValueType.OneD)?p.value:''", set: (v) => `var c=app.project.activeItem;var p=c&&c.selectedProperties&&c.selectedProperties[c.selectedProperties.length-1];if(p&&p.propertyValueType===PropertyValueType.OneD){app.beginUndoGroup('DeskAssist');p.setValue(${v});app.endUndoGroup();}'ok'` },
  },
  photoshop: {
    opacity: { label: "Layer opacity (%)", min: 0, max: 100, step: 1, get: "app.activeDocument.activeLayer.opacity", set: (v) => `app.activeDocument.activeLayer.opacity=${v};'ok'` },
  },
};

/** Clamp to a control's range and step; null if not a number. Pure. */
export function cleanValue(ctl, raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const c = Math.max(ctl.min, Math.min(ctl.max, n));
  return Math.round(c / ctl.step) * ctl.step;
}

/** "#12ab3f" → {r,g,b} or null. Pure. */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ""));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Fixed colour scripts per app; only the three validated numbers are filled in. Pure. */
export function colorScript(app, { r, g, b }) {
  if (app === "photoshop") return `var c=new SolidColor();c.rgb.red=${r};c.rgb.green=${g};c.rgb.blue=${b};app.foregroundColor=c;'ok'`;
  if (app === "illustrator") return `var c=new RGBColor();c.red=${r};c.green=${g};c.blue=${b};var s=app.activeDocument.selection;for(var i=0;i<s.length;i++){if(s[i].filled!==undefined){s[i].filled=true;s[i].fillColor=c;}}app.activeDocument.defaultFillColor=c;'ok'`;
  if (app === "aftereffects") return `var c=app.project.activeItem;var p=c&&c.selectedProperties&&c.selectedProperties[c.selectedProperties.length-1];if(p&&p.propertyValueType===PropertyValueType.COLOR){app.beginUndoGroup('DeskAssist');p.setValue([${(r / 255).toFixed(4)},${(g / 255).toFixed(4)},${(b / 255).toFixed(4)},1]);app.endUndoGroup();}'ok'`;
  return null;
}

/** Wrap ExtendScript for the OS's documented automation route. Pure. */
export function scriptCommand(app, appName, js, platform = process.platform) {
  if (platform === "darwin") {
    // Photoshop and Illustrator: `do javascript`; After Effects: `DoScript`. The script goes in as an argument.
    const verb = app === "aftereffects" ? "DoScript" : "do javascript";
    return ["osascript", ["-e", `on run argv\ntell application (item 1 of argv) to ${verb} (item 2 of argv)\nend run`, appName, js]];
  }
  if (platform === "win32" && APPS[app]?.win) {
    return ["powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `$a = New-Object -ComObject ${APPS[app].win}; $a.DoJavaScript($env:DA_JS)`], { env: { DA_JS: js } }];
  }
  return null;
}

export function createCreative({ execute, platform = process.platform, runImpl = run, runningApps = async () => [], frontmost = async () => null, getSecret = () => null, setSecret = () => {}, fetchImpl = fetch, dryRun = false, log = console.log, now = Date.now } = {}) {
  const lastSet = new Map(); // control -> time (≤ 4 updates a second)

  async function appName(app) {
    const names = [await frontmost().catch(() => null), ...(await runningApps().catch(() => []))].filter(Boolean);
    return names.find((n) => APPS[app].match.test(n)) ?? null;
  }

  async function script(app, js) {
    const name = await appName(app);
    if (!name) throw new Error(`${APPS[app].name} isn't running.`);
    const cmd = scriptCommand(app, name, js, platform);
    if (!cmd) throw new Error(`Scripting ${APPS[app].name} isn't available on this computer.`);
    if (dryRun) return log(`  (dry-run) ${APPS[app].name} script`), "ok";
    const [bin, args, opts = {}] = cmd;
    const { stdout } = await runImpl(bin, args, { timeout: 8000, windowsHide: true, ...opts, env: { ...process.env, ...(opts.env ?? {}) } });
    return stdout.trim();
  }

  // ---- Blender add-on link ----
  const blenderToken = () => {
    let t = getSecret("blender:token");
    if (!t) setSecret("blender:token", (t = randomBytes(16).toString("hex")));
    return t;
  };

  return {
    methods: {
      "creative.tools": ({ app } = {}) => ({ ok: true, tools: (TOOLS[app] ?? []).map(([id, label]) => ({ id, label })), controls: Object.entries(CONTROLS[app] ?? {}).map(([id, c]) => ({ id, label: c.label, min: c.min, max: c.max, step: c.step })) }),
      "creative.tool": async ({ app, tool } = {}) => {
        const combo = toolCombo(String(app), String(tool), platform);
        if (!combo) return { ok: false, error: "No such tool." };
        const name = await appName(app);
        if (!name) return { ok: false, error: `${APPS[app].name} isn't running.` };
        if (dryRun) return log(`  (dry-run) ${APPS[app].name} tool ${tool} → ${combo}`), { ok: true };
        await execute({ type: "app", target: name }); // bring it forward
        await new Promise((r) => setTimeout(r, 120));
        await execute({ type: "keys", combo });
        return { ok: true };
      },
      "creative.get": async ({ app, control } = {}) => {
        const c = CONTROLS[app]?.[control];
        if (!c) return { ok: false, error: "No such control." };
        try {
          const out = await script(app, c.get);
          const v = Number(out);
          return { ok: true, value: out === "" || !Number.isFinite(v) ? null : v };
        } catch (err) {
          return { ok: false, error: err.message };
        }
      },
      "creative.set": async ({ app, control, value } = {}) => {
        const c = CONTROLS[app]?.[control];
        if (!c) return { ok: false, error: "No such control." };
        const v = cleanValue(c, value);
        if (v === null) return { ok: false, error: "Not a number." };
        const key = `${app}:${control}`;
        if (now() - (lastSet.get(key) ?? 0) < 250) return { ok: false, error: "busy", busy: true };
        lastSet.set(key, now());
        try {
          await script(app, c.set(v));
          return { ok: true, value: v };
        } catch (err) {
          return { ok: false, error: err.message };
        }
      },
      "creative.color": async ({ app, hex } = {}) => {
        const rgb = hexToRgb(hex);
        const js = rgb && colorScript(String(app), rgb);
        if (!js) return { ok: false, error: rgb ? "That app has no colour control." : "Not a colour." };
        try {
          await script(app, js);
          return { ok: true };
        } catch (err) {
          return { ok: false, error: err.message };
        }
      },
      // Blender: our add-on listens on 127.0.0.1:18790 and accepts only its fixed operations.
      "blender.op": async ({ op, value, axis } = {}) => {
        try {
          const r = await fetchImpl("http://127.0.0.1:18790/op", { method: "POST", headers: { "content-type": "application/json", "x-deskassist-token": blenderToken() }, body: JSON.stringify({ op: String(op ?? ""), value, axis }), signal: AbortSignal.timeout(4000) });
          const j = await r.json().catch(() => ({}));
          return r.ok ? { ok: true, ...j } : { ok: false, error: j.error ?? `Blender answered ${r.status}.` };
        } catch {
          return { ok: false, error: "Blender isn't running, or the DeskAssist add-on isn't enabled (editor › Settings › Creative apps)." };
        }
      },
    },
    blenderToken,
  };
}
