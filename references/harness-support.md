# Live edit support (`LIVE_EDIT_SUPPORTED`)

Whether a generated page gets live chat — the Chat panel talking to you
through the local server while you run a listen loop — is a property of the
**agent harness you are running in**, not of the underlying model. Decide it
at assembly time (SKILL.md Step 5) using this document, and inject the flag
per `references/assembly.md` step 5b only when the answer is yes.

Two questions, in order. The first is a hard gate.

## 1. Reachability gate

Can the **user's browser** open the local server (`http://127.0.0.1:4949`)?

If you are running in a cloud sandbox or remote container — Claude Code on
the web, Codex cloud, Cursor cloud agents, the Copilot coding agent, or any
environment where "localhost" is the sandbox's loopback, not the user's
machine — the answer is **no** unless the platform documents port
forwarding / preview URLs you can hand the user. No reachability means no
live mode (and no served preview at all): **flag = no, stop here.** This
kills live mode far more often than any timeout does; say so in your report
instead of promising a page the user can't open.

## 2. Listen-loop capability ladder

If the browser can reach the server, take the **first rung that your harness
supports** — any rung means **flag = yes**; record which rung for the listen
loop in SKILL.md's "Live mode" section:

- **(a) PUSH** — you have a tool that streams a long-running command's output
  back into the conversation as events as it appears. Run
  `chat-cli.mjs wait <page> --follow` under it; each NDJSON line is a user
  message arriving.
- **(b) BACKGROUND+READ** — you can start a command in the background
  (`run_in_background`, `is_background`, `&`…) and later read its
  accumulated output. Run `wait --follow` in the background and harvest new
  lines whenever you get a turn.
- **(c) BOUNDED POLL** — you can only run foreground commands. Probe your
  real ceiling once, at live-mode entry:
  `node <skill-dir>/server/chat-cli.mjs selftest --seconds 20`.
  `SELFTEST_OK seconds=20` in the result → loop `wait --timeout 20`.
  Output truncated or the command was killed → retry `--seconds 8`; OK →
  loop `wait --timeout 8`. Both fail (or `SERVER_UNREACHABLE`) → treat as
  unsupported after all: remove the injected flag line and report manual
  mode. Every `wait` is bounded and idempotent — safe to re-run forever.

Unknown/unlisted harness: don't guess from the name — apply the ladder.

## Known harnesses (checked 2026)

| Harness | Flag | Rung / notes |
|---|---|---|
| Claude Code (CLI / desktop) | **yes** | (a) or (b): background Bash + output monitoring; Bash timeout raisable to 600s. Best case. |
| Claude Code (web), Codex cloud, Cursor cloud agents, Copilot coding agent, other cloud/CI sandboxes | **no** | Reachability gate: user's browser cannot reach sandbox loopback. |
| OpenAI Codex CLI | **yes** | (c), with care: default exec timeout is **10 s** — always pass an explicit per-call timeout ≥ 2× the wait window, or use `--timeout 8`. |
| Gemini CLI | **yes** | (b) or (c): `is_background` + output reads; foreground cap ~5 min. |
| Cursor (IDE agent) | **partial** | (c) with `--timeout 20` or less. CLI shell mode hard-caps at 30 s. |
| GitHub Copilot CLI / VS Code agent mode | **partial** | (c) only; no timeout knob (~5 min internal cap) — keep waits short so the session doesn't look frozen. |
| OpenCode | **yes** | (b): `run_in_background` + `bash_output`. |
| Amp | **yes** | (b): background/tmux patterns + polling check-ins. |
| Windsurf, Crush, Goose | **partial** | (c) presumed; verify with the selftest probe. |
| Aider | **no** | No agentic command loop. |

## Server start caveat (all harnesses)

Start `server.mjs` **detached or via your harness's background facility,
never as a plain foreground command** — some harnesses kill foreground
commands at 30 s, which would take the server (and every open page) down
with it. SKILL.md Step 7 already runs it in the background; treat that as a
hard requirement, not a preference.

## Why waits are bounded

`wait` caps at 25 s server-side and defaults to 20 s in the CLI. Bounded +
idempotent (a server-held cursor delivers each message exactly once across
invocations) means a plain loop of foreground commands works on every rung-
(c) harness, and no harness ever sees a command that looks hung. `NO_MESSAGE`
with exit 0 — not a non-zero exit — signals an empty poll, so harnesses that
surface non-zero exits as errors don't misreport a quiet minute as a failure.
