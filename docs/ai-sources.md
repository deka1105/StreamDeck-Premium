# AI and code sources (Stage 9)

Only documented interfaces or files the tools write for anyone to read. Prompt
and reply text, tool arguments and chat titles are **never** read or sent.

## Claude Code

| What | Source | Fields used |
|---|---|---|
| Live sessions | `~/.claude/sessions/<pid>.json` (one per running session) | `pid`, `sessionId`, `cwd`, `status` (busy/idle), `name`, `startedAt`, `updatedAt`; a session counts only while its `pid` is alive |
| Token totals | `~/.claude/projects/<project>/<session>.jsonl`, lines with `type: "assistant"` | `timestamp`, `sessionId`, `message.model`, `message.usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens}`, `message.stop_reason` — read incrementally (new bytes only) |
| Plan limits | the documented **status line** stdin JSON (code.claude.com/docs/en/statusline): `rate_limits.five_hour` / `seven_day` → `used_percentage`, `resets_at` (epoch s) | captured by our bridge script, which then runs the user's previous status line unchanged |
| Permission prompts | the documented **`PermissionRequest`** hook (code.claude.com/docs/en/hooks): stdin has `session_id`, `cwd`, `tool_name`, `tool_input`; stdout `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}` or `"deny"` + `message`; no output → Claude Code asks in the terminal as usual | the phone shows project, tool and the command or file path |
| Waiting alerts | `Notification` hook (`notification_type`: `permission_prompt`, `idle_prompt`, …, `message`), `Stop`, `UserPromptSubmit`, `PostToolUse` | state + Claude Code's own notification text + project folder name |

Decision recorded: **quotas come from the documented status line**, not the
undocumented OAuth usage endpoint (risk R5 avoided). Trade-off: limits update
when a terminal session renders its status line, so readings older than
10 minutes are shown "as of HH:MM".

Hooks and the status line are installed into `~/.claude/settings.json` only
when the owner presses **Install** in the editor. A backup is written next to
it (`settings.json.deskassist.bak`); **Remove** takes out exactly the entries
we added and restores the previous status line.

## Codex

| What | Source | Fields used |
|---|---|---|
| Sessions + tokens + limits | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (or `$CODEX_HOME/sessions`) | `session_meta.payload.{id, cwd, timestamp}`; `event_msg` with `payload.type: "token_count"` → `info.total_token_usage`, `rate_limits.primary/secondary.{used_percent, window_minutes, resets_at}` |

Codex isn't installed on the development Mac: parsed from fixtures only,
labelled untested until checked against a real Codex install.

## GitHub

The `gh` CLI (already signed in) or a fine-grained token kept in the secret
store, calling the GraphQL API: contribution calendar, contributions by kind,
commits by repository, open PRs with their latest check state, and PRs waiting
for your review. Polled every 15 minutes, only while a GitHub widget is shown.
