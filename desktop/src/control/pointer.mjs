// Trackpad: move, click and scroll the computer's pointer from the panel.
// Off by default (Settings › Control Deck). One long-lived helper process reads
// one command per line and answers "ok" (or "err …"):
//   macOS:   JavaScript for Automation calling Core Graphics (CGEvent). The
//            host app needs Accessibility permission, like keyboard shortcuts.
//   Windows: PowerShell calling user32 (GetCursorPos / SetCursorPos /
//            mouse_event).
// Commands: "move dx dy", "down left|right", "up left|right",
//           "click left|right", "scroll dx dy", "pos".

import { spawn } from "node:child_process";

const MAC = String.raw`
ObjC.import('CoreGraphics');
ObjC.import('Foundation');
function out(s) {
  $.NSFileHandle.fileHandleWithStandardOutput.writeData($(s + "\n").dataUsingEncoding($.NSUTF8StringEncoding));
}
function here() { return $.CGEventGetLocation($.CGEventCreate(null)); }
var held = null;
function mouse(type, p, btn) {
  var e = $.CGEventCreateMouseEvent(null, type, p, btn);
  $.CGEventPost(0, e);
}
function handle(line) {
  var a = line.trim().split(/\s+/);
  var p = here();
  if (a[0] === "pos") return out("ok " + Math.round(p.x) + " " + Math.round(p.y));
  if (a[0] === "move") {
    var q = $.CGPointMake(p.x + Number(a[1]), p.y + Number(a[2]));
    // While a button is held, moving is a drag.
    mouse(held === "left" ? 6 : held === "right" ? 7 : 5, q, held === "right" ? 1 : 0);
    return out("ok");
  }
  var right = a[1] === "right";
  if (a[0] === "down" || a[0] === "click") { mouse(right ? 3 : 1, p, right ? 1 : 0); held = right ? "right" : "left"; }
  if (a[0] === "up" || a[0] === "click") { mouse(right ? 4 : 2, p, right ? 1 : 0); held = null; }
  if (a[0] === "scroll") {
    var s = $.CGEventCreateScrollWheelEvent2(null, 0, 2, Number(a[2]), Number(a[1]), 0);
    $.CGEventPost(0, s);
  }
  out("ok");
}
function run() {
  var input = $.NSFileHandle.fileHandleWithStandardInput;
  var buf = "";
  out("ready");
  while (true) {
    var d = input.availableData;
    if (d.length === 0) break;
    buf += $.NSString.alloc.initWithDataEncoding(d, $.NSUTF8StringEncoding).js;
    var i;
    while ((i = buf.indexOf("\n")) >= 0) {
      var line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      try { handle(line); } catch (e) { out("err " + e); }
    }
  }
}
`;

const WIN = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -Namespace DA -Name M -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
[DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, int data, System.UIntPtr extra);
public struct POINT { public int X; public int Y; }
'@
[Console]::Out.WriteLine('ready')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  try {
    $a = $line.Trim() -split '\s+'
    $p = New-Object DA.M+POINT
    [void][DA.M]::GetCursorPos([ref]$p)
    switch ($a[0]) {
      'pos' { [Console]::Out.WriteLine("ok $($p.X) $($p.Y)"); continue }
      'move' { [void][DA.M]::SetCursorPos($p.X + [int]$a[1], $p.Y + [int]$a[2]) }
      'down' { [DA.M]::mouse_event($(if ($a[1] -eq 'right') { 8 } else { 2 }), 0, 0, 0, [UIntPtr]::Zero) }
      'up' { [DA.M]::mouse_event($(if ($a[1] -eq 'right') { 16 } else { 4 }), 0, 0, 0, [UIntPtr]::Zero) }
      'click' { $d = $(if ($a[1] -eq 'right') { 8 } else { 2 }); [DA.M]::mouse_event($d, 0, 0, 0, [UIntPtr]::Zero); [DA.M]::mouse_event($d * 2, 0, 0, 0, [UIntPtr]::Zero) }
      'scroll' { [DA.M]::mouse_event(0x800, 0, 0, [int]$a[2] * 40, [UIntPtr]::Zero); if ([int]$a[1] -ne 0) { [DA.M]::mouse_event(0x1000, 0, 0, [int]$a[1] * 40, [UIntPtr]::Zero) } }
    }
    [Console]::Out.WriteLine('ok')
  } catch { [Console]::Out.WriteLine("err $($_.Exception.Message)") }
}
`;

const clampInt = (n, lim) => Math.max(-lim, Math.min(lim, Math.round(Number(n) || 0)));

/** Turn a panel request into one helper line, or null if it isn't allowed. Pure. */
export function pointerLine({ op, dx, dy, button } = {}) {
  const btn = button === "right" ? "right" : "left";
  if (op === "move") return `move ${clampInt(dx, 400)} ${clampInt(dy, 400)}`;
  if (op === "scroll") return `scroll ${clampInt(dx, 50)} ${clampInt(dy, 50)}`;
  if (["click", "down", "up"].includes(op)) return `${op} ${btn}`;
  if (op === "pos") return "pos";
  return null;
}

export function createPointer({ platform = process.platform, spawnImpl = spawn, log = console.log } = {}) {
  let child = null;
  let ready = null;
  let waiting = [];
  let idle = null;

  function start() {
    if (ready) return ready;
    const [cmd, args] =
      platform === "darwin"
        ? ["osascript", ["-l", "JavaScript", "-e", MAC]]
        : platform === "win32"
          ? ["powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", WIN]]
          : [null, null];
    if (!cmd) return Promise.reject(new Error("The trackpad works on macOS and Windows."));
    child = spawnImpl(cmd, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let buf = "";
    ready = new Promise((resolve, reject) => {
      child.once("error", (err) => reject(err));
      child.stdout.on("data", (c) => {
        buf += c;
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (line === "ready") resolve();
          else waiting.shift()?.(line);
        }
      });
      child.on("exit", () => {
        child = null;
        ready = null;
        for (const w of waiting.splice(0)) w("err helper stopped");
        reject(new Error("The trackpad helper stopped."));
      });
    });
    ready.catch(() => {});
    return ready;
  }

  /** Stop the helper after a minute without use. */
  function bump() {
    clearTimeout(idle);
    idle = setTimeout(() => child?.kill(), 60_000);
    idle.unref?.();
  }

  return {
    async send(req) {
      const line = pointerLine(req);
      if (!line) throw new Error("Unknown trackpad command.");
      await start();
      bump();
      const answer = await new Promise((resolve) => {
        waiting.push(resolve);
        child.stdin.write(`${line}\n`);
      });
      if (answer.startsWith("err")) throw new Error(answer.slice(4) || "The trackpad helper failed.");
      return { ok: true, answer };
    },
    stop() {
      clearTimeout(idle);
      child?.kill();
    },
  };
}
