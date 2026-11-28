// Docker or Podman containers through their command-line tools (both take the
// same `ps --format` and `start/stop/restart`). Sampled only while a
// containers widget is shown. Starting and stopping is allowed only from a
// widget whose "allow start / stop" option is on (checked by the host).

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Parse `ps -a --format "{{json .}}"` output (one JSON object per line). Pure. */
export function parseContainers(stdout) {
  const out = [];
  for (const line of String(stdout).split("\n")) {
    if (!line.trim()) continue;
    let c;
    try {
      c = JSON.parse(line);
    } catch {
      continue;
    }
    // Podman prints Names as an array and State in lower case; Docker as a string.
    const names = Array.isArray(c.Names) ? c.Names.join(", ") : String(c.Names ?? "");
    const state = String(c.State ?? "").toLowerCase();
    out.push({ id: String(c.ID ?? c.Id ?? "").slice(0, 12), name: names.replace(/^\//, ""), image: String(c.Image ?? ""), state, status: String(c.Status ?? ""), running: state === "running" });
  }
  return out.sort((a, b) => Number(b.running) - Number(a.running) || a.name.localeCompare(b.name));
}

export function createDocker({ getSettings, isWanted, runImpl = run, log = console.log } = {}) {
  let last = [];
  let engineUsed = null;
  const engines = () => {
    const e = getSettings()?.control?.containers ?? "auto";
    return e === "docker" ? ["docker"] : e === "podman" ? ["podman"] : ["docker", "podman"];
  };

  async function cli(args) {
    // Auto: the first engine that answers. A daemon that's down is a better
    // error to show than a tool that isn't installed.
    let lastErr = null;
    for (const bin of engineUsed ? [engineUsed] : engines()) {
      try {
        const { stdout } = await runImpl(bin, args, { timeout: 15_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
        engineUsed = bin;
        return stdout;
      } catch (err) {
        if (!lastErr || lastErr.code === "ENOENT") lastErr = err;
      }
    }
    engineUsed = null;
    if (lastErr?.code === "ENOENT") throw new Error("Docker or Podman isn't installed on this computer.");
    const msg = String(lastErr?.stderr || lastErr?.message || "");
    throw new Error(/daemon|socket|connect|machine/i.test(msg) ? "Docker isn't running. Start Docker Desktop (or `podman machine start`)." : msg.split("\n")[0].slice(0, 200));
  }

  return {
    periodMs: 4000,
    async sample() {
      if (!isWanted()) return null;
      try {
        last = parseContainers(await cli(["ps", "-a", "--format", "{{json .}}"]));
        return { engine: engineUsed, containers: last, at: Date.now() };
      } catch (err) {
        return { error: err.message, containers: [], at: Date.now() };
      }
    },
    /** start / stop / restart a container the last sample listed. */
    async control(id, action) {
      if (!["start", "stop", "restart"].includes(action)) throw new Error("Unknown action.");
      const c = last.find((x) => x.id === id);
      if (!c) throw new Error("That container is gone.");
      await cli([action, c.id]);
      log(`🐳 ${engineUsed} ${action} ${c.name}`);
      return { ok: true };
    },
  };
}
