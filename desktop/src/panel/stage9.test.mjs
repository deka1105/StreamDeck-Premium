import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { claudeUsageLine, codexLine, forecast, createAi, createTailer } from "../providers/ai.mjs";
import { shapeGithub } from "../providers/github.mjs";
import { createAgents, withoutOurs, _scripts } from "./agents.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "da-s9-"));

test("Claude transcript lines give tokens and model, never text", () => {
  const line = JSON.stringify({ type: "assistant", timestamp: "2026-11-27T10:00:00Z", sessionId: "s1", message: { model: "claude-opus-5-5", content: [{ type: "text", text: "SECRET REPLY" }], usage: { input_tokens: 10, cache_read_input_tokens: 90, output_tokens: 5 } } });
  const r = claudeUsageLine(line);
  assert.deepEqual({ ...r, t: 0 }, { t: 0, session: "s1", model: "claude-opus-5-5", input: 100, output: 5, stop: null });
  assert.ok(!JSON.stringify(r).includes("SECRET"));
  assert.equal(claudeUsageLine(JSON.stringify({ type: "user", message: { content: "usage assistant" } })), null);
  assert.equal(claudeUsageLine("not json usage assistant"), null);
});

test("Codex rollout lines give token totals and both limit windows", () => {
  const r = codexLine(JSON.stringify({ timestamp: "2026-11-27T10:00:00Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 500, output_tokens: 50 }, last_token_usage: { input_tokens: 100, output_tokens: 10 } }, rate_limits: { primary: { used_percent: 12.5, window_minutes: 300, resets_at: 1795800000 }, secondary: { used_percent: 40, window_minutes: 10080 } } } }));
  assert.equal(r.kind, "tokens");
  assert.deepEqual(r.total, { input: 500, output: 50 });
  assert.equal(r.primary.used, 12.5);
  assert.equal(r.primary.resetsAt, 1795800000_000);
  assert.equal(r.secondary.windowMin, 10080);
  assert.equal(codexLine(JSON.stringify({ type: "session_meta", payload: { id: "x", cwd: "/a/proj" } })).cwd, "/a/proj");
});

test("forecast projects when a limit fills, or null if it resets first", () => {
  const t0 = 1_000_000;
  assert.equal(forecast([{ t: t0, used: 10 }, { t: t0 + 3600_000, used: 20 }], t0 + 3600_000), t0 + 3600_000 + 8 * 3600_000);
  assert.equal(forecast([{ t: t0, used: 10 }, { t: t0 + 3600_000, used: 20, resetsAt: t0 + 7200_000 }], t0 + 3600_000), null);
  assert.equal(forecast([{ t: t0, used: 30 }, { t: t0 + 1, used: 20 }]), null);
});

test("the tailer reads only new complete lines", () => {
  const f = join(tmp(), "a.jsonl");
  writeFileSync(f, "one\ntw");
  const tail = createTailer();
  assert.deepEqual(tail(f), ["one"]);
  appendFileSync(f, "o\nthree\n");
  assert.deepEqual(tail(f), ["two", "three"]);
  assert.deepEqual(tail(f), []);
});

test("ai provider lists live Claude sessions with tokens, and limits from the bridge file", async () => {
  const d = tmp();
  const claude = join(d, "claude");
  mkdirSync(join(claude, "sessions"), { recursive: true });
  mkdirSync(join(claude, "projects", "p"), { recursive: true });
  writeFileSync(join(claude, "sessions", "1.json"), JSON.stringify({ pid: process.pid, sessionId: "live", cwd: "/x/myproj", status: "busy", updatedAt: 5 }));
  writeFileSync(join(claude, "sessions", "2.json"), JSON.stringify({ pid: 999999, sessionId: "dead", cwd: "/x/old" }));
  writeFileSync(join(claude, "projects", "p", "live.jsonl"), JSON.stringify({ type: "assistant", timestamp: new Date().toISOString(), sessionId: "live", message: { model: "m", usage: { input_tokens: 7, output_tokens: 3 } } }) + "\n");
  const limitsFile = join(d, "limits.json");
  writeFileSync(limitsFile, JSON.stringify({ rate_limits: { five_hour: { used_percentage: 23.5, resets_at: 1795800000 } }, at: Date.now() }));
  const s = await createAi({ claudeDir: claude, codexDir: join(d, "none"), limitsFile }).sample();
  assert.deepEqual(s.sessions.map((x) => [x.id, x.project, x.status, x.tokens.input + x.tokens.output]), [["live", "myproj", "working", 10]]);
  assert.equal(s.claude.usage.today, 10);
  assert.equal(s.claude.limits.five.used, 23.5);
  assert.equal(s.claude.limits.week, null);
  assert.equal(s.codex.installed, false);
});

test("github answer is shaped with streak, check states and reviews", () => {
  const day = (date, n) => ({ date, contributionCount: n });
  const g = shapeGithub({ viewer: { login: "me", contributionsCollection: { totalCommitContributions: 3, contributionCalendar: { totalContributions: 9, weeks: [{ contributionDays: [day("2026-11-24", 0), day("2026-11-25", 2), day("2026-11-26", 4), day("2026-11-27", 0)] }] } }, pullRequests: { nodes: [{ number: 4, title: "Fix", url: "u", repository: { nameWithOwner: "a/b" }, commits: { nodes: [{ commit: { statusCheckRollup: { state: "FAILURE" } } }] } }] } }, reviews: { issueCount: 1, nodes: [{ number: 9, title: "T", url: "v", repository: { nameWithOwner: "c/d" }, author: { login: "x" } }] } }, Date.parse("2026-11-27T12:00:00Z"));
  assert.equal(g.streak, 2); // today's empty day doesn't break it yet
  assert.equal(g.prs[0].checks, "failing");
  assert.equal(g.reviews.count, 1);
});

test("install adds hooks + bridge with a backup; remove restores exactly", () => {
  const d = tmp();
  const claudeDir = join(d, "claude");
  mkdirSync(claudeDir);
  const before = { model: "opus", statusLine: { type: "command", command: "echo mine", padding: 1 }, hooks: { SessionEnd: [{ hooks: [{ type: "command", command: "save.sh" }] }] } };
  writeFileSync(join(claudeDir, "settings.json"), JSON.stringify(before));
  const a = createAgents({ log: () => {}, dir: join(d, "data"), claudeDir });
  assert.equal(a.install().installed, true);
  const s = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf8"));
  assert.ok(existsSync(join(claudeDir, "settings.json.deskassist.bak")));
  assert.equal(s.hooks.PermissionRequest[0].matcher, "*");
  assert.ok(s.statusLine.command.includes(_scripts.MARK));
  assert.equal(s.statusLine.padding, 1);
  assert.equal(s.hooks.SessionEnd.length, 1);
  a.install(); // twice = still one of each
  assert.equal(JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf8")).hooks.PermissionRequest.length, 1);
  a.remove();
  const after = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf8"));
  assert.deepEqual(after.hooks, before.hooks);
  assert.equal(after.statusLine.command, "echo mine");
  assert.deepEqual(withoutOurs({}), {});
});

test("the status-line bridge saves limits and still prints the old status line", () => {
  const d = tmp();
  const claudeDir = join(d, "claude");
  mkdirSync(claudeDir);
  writeFileSync(join(claudeDir, "settings.json"), JSON.stringify({ statusLine: { type: "command", command: "cat > /dev/null; echo OLD-LINE" } }));
  const a = createAgents({ log: () => {}, dir: join(d, "data"), claudeDir });
  a.install();
  const input = JSON.stringify({ model: { display_name: "Opus" }, rate_limits: { five_hour: { used_percentage: 50, resets_at: 1 } } });
  const out = execFileSync(process.execPath, [join(d, "data", "hooks", "deskassist-hook-statusline.cjs")], { input, encoding: "utf8" });
  assert.equal(out.trim(), "OLD-LINE");
  assert.equal(JSON.parse(readFileSync(a.limitsFile, "utf8")).rate_limits.five_hour.used_percentage, 50);
});

test("permission: token checked, off by default, phone answer wins, timeout → no decision", async () => {
  const d = tmp();
  mkdirSync(join(d, "claude"));
  let settings = { agents: { phonePrompts: false, timeoutSec: 10 } };
  const events = [];
  const a = createAgents({ log: () => {}, dir: join(d, "data"), claudeDir: join(d, "claude"), getSettings: () => settings, publish: (e, v) => events.push([e, v]) });
  a.install();
  const token = JSON.parse(readFileSync(join(d, "data", "hooks", "hook-config.json"), "utf8")).token;
  assert.equal((await a.permission({ token: "nope" })).status, 401);
  assert.equal((await a.permission({ token, tool: "Bash" })).json.decision, null); // feature off
  settings = { agents: { phonePrompts: true, timeoutSec: 10 } };
  const p = a.permission({ token, session: "s", project: "proj", tool: "Bash", detail: "rm -rf build" });
  await new Promise((r) => setImmediate(r));
  const prompt = events.find(([e]) => e === "prompt")[1];
  assert.equal(prompt.detail, "rm -rf build");
  assert.equal(a.answer(prompt.id, "maybe").ok, false);
  assert.equal(a.answer(prompt.id, "deny").ok, true);
  assert.equal((await p).json.decision, "deny");
  assert.equal(a.answer(prompt.id, "allow").ok, false); // already answered
  // Answered in the terminal instead: the next hook event for that session clears the card.
  const p2 = a.permission({ token, session: "s2", tool: "Edit" });
  await new Promise((r) => setImmediate(r));
  a.event({ token, event: "PostToolUse", session: "s2" });
  assert.equal((await p2).json.decision, null);
});

test("waiting alerts: Notification sets, prompt submit clears, Stop alerts after the delay", async () => {
  const d = tmp();
  const a = createAgents({ log: () => {}, dir: join(d, "data"), claudeDir: join(d, "claude"), getSettings: () => ({ agents: { alerts: true, idleAlertSec: 0 } }) });
  mkdirSync(join(d, "claude"));
  a.install();
  const token = JSON.parse(readFileSync(join(d, "data", "hooks", "hook-config.json"), "utf8")).token;
  a.event({ token, event: "Notification", session: "s", project: "p", type: "idle_prompt", message: "Claude is waiting for your input" });
  let v = await a.provider().sample();
  assert.equal(v.alerts[0].kind, "input");
  a.event({ token, event: "UserPromptSubmit", session: "s" });
  assert.equal((await a.provider().sample()).alerts.length, 0);
  a.event({ token, event: "Stop", session: "s", project: "p" });
  await new Promise((r) => setTimeout(r, 20));
  v = await a.provider().sample();
  assert.equal(v.alerts[0].kind, "finished");
});

test("the permission hook script prints a decision only when the panel gives one", async () => {
  const { createServer } = await import("node:http");
  const d = tmp();
  mkdirSync(join(d, "claude"));
  let answer = "allow";
  const srv = createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => res.end(JSON.stringify({ decision: answer, saw: JSON.parse(b) })));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const a = createAgents({ log: () => {}, dir: join(d, "data"), claudeDir: join(d, "claude"), port: srv.address().port });
  a.install();
  const runHook = () => new Promise((res) => {
    const { execFile } = require_();
    const c = execFile(process.execPath, [join(d, "data", "hooks", "deskassist-hook-permission.cjs")], (_e, out) => res(out));
    c.stdin.end(JSON.stringify({ session_id: "s", cwd: "/a/proj", tool_name: "Bash", tool_input: { command: "ls" } }));
  });
  assert.deepEqual(JSON.parse(await runHook()), { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } });
  answer = "deny";
  assert.equal(JSON.parse(await runHook()).hookSpecificOutput.decision.behavior, "deny");
  answer = null;
  assert.equal(await runHook(), "");
  srv.close();
});
import { createRequire } from "node:module";
const require_ = () => createRequire(import.meta.url)("node:child_process");
