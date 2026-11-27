// Stage 9: Claude Code link, Allow / Deny on the panel, sessions, limits.
import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startHost } from "../lib/host.mjs";

const claudeDir = mkdtempSync(join(tmpdir(), "deskassist-claude-"));
let host;
test.beforeAll(async () => {
  mkdirSync(join(claudeDir, "sessions"));
  mkdirSync(join(claudeDir, "projects", "p"), { recursive: true });
  writeFileSync(join(claudeDir, "settings.json"), JSON.stringify({ statusLine: { type: "command", command: "cat > /dev/null; echo MINE" } }));
  // A "running" session: this test process's pid is alive.
  writeFileSync(join(claudeDir, "sessions", "1.json"), JSON.stringify({ pid: process.pid, sessionId: "sess-1", cwd: "/work/rocket", status: "busy", updatedAt: Date.now() }));
  writeFileSync(join(claudeDir, "projects", "p", "sess-1.jsonl"), JSON.stringify({ type: "assistant", timestamp: new Date().toISOString(), sessionId: "sess-1", message: { model: "claude-opus-5-5", content: [{ type: "text", text: "PRIVATE REPLY" }], usage: { input_tokens: 1200, output_tokens: 300 } } }) + "\n");
  host = await startHost({
    port: 18970,
    localPort: 18971,
    claudeDir,
    config: {
      settings: { agents: { phonePrompts: true, timeoutSec: 30, alerts: true, idleAlertSec: 0 } },
      default: { home: "ai", pages: [{ id: "ai", name: "AI", widgets: [
        { id: "ss", type: "sessions", x: 0, y: 0, w: 6, h: 3 },
        { id: "aq", type: "aiquota", x: 6, y: 0, w: 3, h: 3, options: { agent: "claude" } },
        { id: "tk", type: "tokens", x: 9, y: 0, w: 3, h: 3 },
        { id: "al", type: "agentalerts", x: 0, y: 3, w: 12, h: 3 },
      ] }] },
    },
  });
});
test.afterAll(async () => host?.stop());

const post = (path, body = {}) => fetch(`${host.base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const hookDir = () => join(host.cwd, ".data", "hooks");
const runScript = (name, input) =>
  new Promise((res) => {
    const c = execFile(process.execPath, [join(hookDir(), name)], (_e, out) => res(out));
    c.stdin.end(JSON.stringify(input));
  });

test("link Claude Code from the editor; the status-line bridge feeds the limits widget", async ({ page }) => {
  await page.goto(`${host.base}/editor/`);
  await page.locator("#settingsToggle").click();
  await page.locator("#agentInstall").click();
  await expect(page.locator("#agentRemove")).toBeVisible();
  const s = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf8"));
  expect(Object.keys(s.hooks).sort()).toEqual(["Notification", "PermissionRequest", "PostToolUse", "Stop", "UserPromptSubmit"]);
  // What Claude Code would do: run the status line with its JSON.
  const out = await runScript("deskassist-hook-statusline.cjs", { model: { display_name: "Opus" }, rate_limits: { five_hour: { used_percentage: 42, resets_at: Math.floor(Date.now() / 1000) + 7200 }, seven_day: { used_percentage: 75, resets_at: Math.floor(Date.now() / 1000) + 86400 * 3 } } });
  expect(out.trim()).toBe("MINE");

  await page.goto(`${host.base}/panel/`);
  await expect(page.locator(".w-quota")).toContainText("42%", { timeout: 10_000 });
  await expect(page.locator('.quota-row[data-level="warn"]')).toContainText("75%");
  await expect(page.locator(".sess-row")).toContainText("rocket");
  await expect(page.locator(".sess-row")).toContainText("Working");
  await expect(page.locator(".w-tokens .tok-big")).toHaveText("1.5k");
  expect(await page.content()).not.toContain("PRIVATE REPLY");
});

test("a permission request shows Allow / Deny on the panel and the answer reaches the hook", async ({ page }) => {
  await page.goto(`${host.base}/panel/`);
  await expect(page.locator(".sess-row")).toBeVisible();
  const hook = runScript("deskassist-hook-permission.cjs", { session_id: "sess-1", cwd: "/work/rocket", tool_name: "Bash", tool_input: { command: "rm -rf dist" } });
  await expect(page.locator(".prompt-card")).toContainText("rm -rf dist");
  await expect(page.locator(".sess-row")).toContainText("Needs permission");
  await page.locator(".prompt-deny").click();
  expect(JSON.parse(await hook).hookSpecificOutput.decision).toMatchObject({ behavior: "deny" });
  await expect(page.locator("#prompts")).toBeHidden();
  expect(host.log()).toContain("deny Bash in rocket");

  const hook2 = runScript("deskassist-hook-permission.cjs", { session_id: "sess-1", cwd: "/work/rocket", tool_name: "Edit", tool_input: { file_path: "/work/rocket/a.js" } });
  await page.locator(".prompt-allow").click();
  expect(JSON.parse(await hook2).hookSpecificOutput.decision.behavior).toBe("allow");
});

test("waiting alerts come and go with the session's hook events; bad tokens are refused", async ({ page }) => {
  await page.goto(`${host.base}/panel/`);
  await runScript("deskassist-hook-event.cjs", { hook_event_name: "Notification", session_id: "sess-1", cwd: "/work/rocket", notification_type: "idle_prompt", message: "Claude is waiting for your input" });
  await expect(page.locator(".w-alerts")).toContainText("waiting for your input");
  await expect(page.locator(".sess-row")).toContainText("Waiting for you");
  await runScript("deskassist-hook-event.cjs", { hook_event_name: "UserPromptSubmit", session_id: "sess-1", cwd: "/work/rocket" });
  await expect(page.locator(".w-alerts")).toContainText("Nothing is waiting");
  const r = await fetch(`${host.base}/api/agent/permission`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "guess", tool: "Bash" }) });
  expect(r.status).toBe(401);
});

test("unlinking restores the previous status line", async () => {
  await post("/api/editor/agents/remove");
  const s = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf8"));
  expect(s).toEqual({ statusLine: { type: "command", command: "cat > /dev/null; echo MINE" } });
});
