// Packaging step: copy the built panel and editor (panel/dist) into
// desktop/panel-dist, which electron-builder ships and src/local.mjs serves.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, "..", "..", "panel", "dist");
const to = join(here, "..", "panel-dist");
for (const f of ["panel.html", "editor.html", "catalog.json", "templates.json"]) {
  if (!existsSync(join(from, f))) {
    console.error(`panel/dist/${f} is missing — run "npm run build" in panel/ first.`);
    process.exit(1);
  }
}
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`copied panel/dist → ${to}`);
