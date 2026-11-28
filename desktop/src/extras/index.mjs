// Stage 15 long tail:
//  - photo frame: pictures from a folder on this computer, or an Immich album;
//  - camera: a still from an RTSP stream (through ffmpeg) or an HTTP snapshot URL;
//  - device batteries: Bluetooth mice, keyboards, headphones (macOS ioreg;
//    Windows through PnP device properties).
// The phone only ever asks by widget id; paths, URLs and keys stay here.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, extname } from "node:path";

const run = promisify(execFile);
const IMG = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

/** Pictures in a folder (one level deep plus one level of subfolders), newest first. */
export function listPictures(folder, { max = 500 } = {}) {
  const out = [];
  const walk = (dir, depth) => {
    let names = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const n of names) {
      if (n.startsWith(".")) continue;
      const p = join(dir, n);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory() && depth < 1) walk(p, depth + 1);
      else if (st.isFile() && IMG.has(extname(n).toLowerCase()) && st.size < 12_000_000) out.push({ path: p, at: st.mtimeMs });
      if (out.length >= max) return;
    }
  };
  walk(folder, 0);
  return out.sort((a, b) => b.at - a.at);
}

/** Pick the picture for a slot: changes every `everySec`, shuffled by a stable step. Pure. */
export function pictureIndex(count, everySec, now = Date.now(), shuffle = true) {
  if (!count) return -1;
  const step = Math.floor(now / 1000 / Math.max(5, everySec));
  return shuffle ? (step * 7919) % count : step % count;
}

/** `ioreg -r -k BatteryPercent -l` output → [{name, pct}]. Pure. */
export function parseIoregBatteries(stdout) {
  const out = [];
  for (const block of String(stdout).split(/\n(?=\+-o )/)) {
    const pct = /"BatteryPercent" = (\d+)/.exec(block)?.[1];
    if (pct === undefined) continue;
    const name = /"Product" = "([^"]+)"/.exec(block)?.[1] ?? /"DeviceName" = "([^"]+)"/.exec(block)?.[1] ?? "Device";
    out.push({ name, pct: Number(pct) });
  }
  return out;
}

export function createExtras({ getWidget, platform = process.platform, runImpl = run, fetchImpl = fetch, getSecret = () => null, now = Date.now } = {}) {
  const folderCache = new Map(); // folder -> { at, list }
  const snapCache = new Map(); // widget key -> { at, src }

  async function frame(w) {
    const o = w.options ?? {};
    if (o.source === "immich") {
      const base = String(o.immich ?? "").replace(/\/+$/, "");
      const key = getSecret(`immich:${w.id}`) ?? getSecret("immich:key");
      if (!/^https?:\/\//.test(base) || !key) return { ok: false, error: "Set the Immich address and API key in the editor." };
      const headers = { "x-api-key": key, accept: "application/json" };
      let assets;
      if (o.album) {
        const a = await (await fetchImpl(`${base}/api/albums/${encodeURIComponent(o.album)}`, { headers, signal: AbortSignal.timeout(10_000) })).json();
        assets = (a.assets ?? []).filter((x) => x.type === "IMAGE");
      } else {
        assets = await (await fetchImpl(`${base}/api/assets/random?count=1`, { headers, signal: AbortSignal.timeout(10_000) })).json();
      }
      if (!assets?.length) return { ok: false, error: "No pictures in that album." };
      const pick = assets[Math.max(0, pictureIndex(assets.length, o.every ?? 60, now(), o.shuffle !== false))];
      const r = await fetchImpl(`${base}/api/assets/${pick.id}/thumbnail?size=preview`, { headers, signal: AbortSignal.timeout(15_000) });
      if (!r.ok) return { ok: false, error: `Immich answered ${r.status}.` };
      const type = r.headers.get("content-type") ?? "image/jpeg";
      return { ok: true, src: `data:${type.split(";")[0]};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`, caption: pick.originalFileName ?? "" };
    }
    const folder = String(o.folder ?? "");
    if (!folder) return { ok: false, error: "Pick a folder of pictures in the editor." };
    let c = folderCache.get(folder);
    if (!c || now() - c.at > 5 * 60_000) folderCache.set(folder, (c = { at: now(), list: listPictures(folder) }));
    if (!c.list.length) return { ok: false, error: "No pictures in that folder." };
    const p = c.list[pictureIndex(c.list.length, o.every ?? 60, now(), o.shuffle !== false)];
    const buf = readFileSync(p.path);
    return { ok: true, src: `data:${MIME[extname(p.path).toLowerCase()]};base64,${buf.toString("base64")}`, caption: o.captions ? p.path.split(/[\\/]/).pop() : "" };
  }

  async function camera(w) {
    const o = w.options ?? {};
    const url = String(o.url ?? "");
    const key = `${w.id}:${url}`;
    const c = snapCache.get(key);
    if (c && now() - c.at < 2000) return { ok: true, src: c.src, at: c.at };
    let src;
    if (/^rtsps?:\/\//i.test(url)) {
      // One frame through ffmpeg, scaled down; the URL goes in as an argument, never through a shell.
      try {
        const { stdout } = await runImpl("ffmpeg", ["-hide_banner", "-loglevel", "error", "-rtsp_transport", "tcp", "-i", url, "-frames:v", "1", "-vf", "scale='min(960,iw)':-2", "-f", "image2", "-vcodec", "mjpeg", "pipe:1"], { timeout: 12_000, encoding: "buffer", maxBuffer: 8 * 1024 * 1024, windowsHide: true });
        src = `data:image/jpeg;base64,${Buffer.from(stdout).toString("base64")}`;
      } catch (err) {
        return { ok: false, error: err.code === "ENOENT" ? "RTSP cameras need ffmpeg on this computer (brew install ffmpeg / winget install ffmpeg)." : "The camera didn't send a picture." };
      }
    } else if (/^https?:\/\//i.test(url)) {
      const r = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
      const type = r.headers.get("content-type") ?? "";
      if (!r.ok || !/^image\//.test(type)) return { ok: false, error: `Not a picture (HTTP ${r.status}). Use the camera's snapshot URL.` };
      src = `data:${type.split(";")[0]};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
    } else return { ok: false, error: "Set the camera's rtsp:// or snapshot http(s):// address in the editor." };
    snapCache.set(key, { at: now(), src });
    return { ok: true, src, at: now() };
  }

  async function batteries() {
    try {
      if (platform === "darwin") {
        const { stdout } = await runImpl("ioreg", ["-r", "-k", "BatteryPercent", "-l"], { timeout: 6000, maxBuffer: 4 * 1024 * 1024 });
        return { devices: parseIoregBatteries(stdout), at: now() };
      }
      if (platform === "win32") {
        const ps = "Get-PnpDevice -Class Bluetooth,HIDClass -PresentOnly -ErrorAction SilentlyContinue | ForEach-Object { $b = Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2' -ErrorAction SilentlyContinue; if ($b -and $b.Data -ne $null) { [pscustomobject]@{ name = $_.FriendlyName; pct = [int]$b.Data } } } | ConvertTo-Json -Compress";
        const { stdout } = await runImpl("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { timeout: 15_000, windowsHide: true });
        const j = stdout.trim() ? JSON.parse(stdout) : [];
        const list = (Array.isArray(j) ? j : [j]).filter((d) => d?.name);
        return { devices: [...new Map(list.map((d) => [d.name, { name: d.name, pct: d.pct }])).values()], at: now() };
      }
      return { devices: [], at: now() };
    } catch (err) {
      return { devices: [], error: err.message, at: now() };
    }
  }

  return {
    providers: { devbatteries: { periodMs: 60_000, sample: batteries } },
    methods: {
      "frame.picture": async ({ pageId, widgetId } = {}, ctx) => {
        const w = getWidget(ctx.client, pageId, widgetId);
        if (!w || w.type !== "photoframe") return { ok: false, error: "No such widget." };
        return frame(w).catch((err) => ({ ok: false, error: err.message }));
      },
      "camera.snapshot": async ({ pageId, widgetId } = {}, ctx) => {
        const w = getWidget(ctx.client, pageId, widgetId);
        if (!w || w.type !== "camera") return { ok: false, error: "No such widget." };
        return camera(w).catch((err) => ({ ok: false, error: err.message }));
      },
    },
  };
}
