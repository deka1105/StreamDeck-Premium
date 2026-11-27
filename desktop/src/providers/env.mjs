// Make sure the standard system tool directories are on PATH. GUI apps and
// some shells start with a minimal PATH, and systeminformation shells out to
// tools like `route`, `netstat` and `mount` (in /sbin and /usr/sbin on macOS),
// which otherwise fail silently and return empty network/disk data.

import { delimiter } from "node:path";

export function ensureSystemPath(env = process.env, platform = process.platform) {
  if (platform === "win32") return env.PATH;
  const want = ["/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin", ...(platform === "darwin" ? ["/opt/homebrew/bin"] : [])];
  const have = (env.PATH ?? "").split(delimiter).filter(Boolean);
  for (const d of want) if (!have.includes(d)) have.push(d);
  env.PATH = have.join(delimiter);
  return env.PATH;
}

ensureSystemPath();
