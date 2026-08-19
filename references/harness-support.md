# Live edit support

Whether the page's Chat panel can talk to you — while you run a listen loop
against the local server — is a property of the **agent harness you are
running in**, not of the underlying model and not of the page. Nothing is
recorded in the generated file: every page the server serves is live-capable,
and the only question is whether *you* can listen. Decide that with this
document, at Step 8 when you connect (and again at any later `/print live`).

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
supports** — either rung means **flag = yes**; record which rung for the
listen loop in SKILL.md's "Live mode" section:

- **(a) PUSH** — you have a tool that streams a long-running command's output
  back into the conversation as events as it appears. Run
  `chat-cli.mjs wait <page> --follow` under it; each NDJSON line is a user
  message arriving.
- **(b) BACKGROUND+WAKE** — you can start a command in the background
  (`run_in_background`, `is_background`, `&`…). If your harness *notifies*
  you when a background command exits (Claude Code does), run one-shot
  `wait <page> --timeout 240` in the background and end your turn — the
  completion notification is your wake; handle messages and re-arm. If the
  harness only lets you *read* accumulated background output on your own
  turns, run `wait --follow` in the background and harvest new lines
  whenever you get a turn.

**A foreground-only harness does not support live mode.** If you can neither
stream a command's output (a) nor put one in the background (b), the answer
is **flag = no** — stop here, exactly as if the reachability gate had failed.
Looping bounded foreground `wait` commands does technically work, and this
skill used to describe it as a third rung; it is no longer supported. The
turn can never end while you are listening, so the user watches a stream of
silent command churn for as long as the session lasts and cannot ask you
anything else without breaking the loop. The page still gets its Chat panel
in copy/paste mode, which costs the user one paste and costs the conversation
nothing.

Unknown/unlisted harness: don't guess from the name — apply the ladder.

## 3. Passing means live mode is ON, by default

Clearing both checks does not merely *permit* live mode — it turns it on.
Rungs (a) and (b) both listen without occupying the foreground, so the cost
of being connected is a wake every few minutes and nothing the user has to
watch. Once Step 7 has the server running and Step 8 has reported the page,
arm the listen loop and end your turn (SKILL.md's "Live mode" section). The
user never has to discover a command to switch on a feature that is already
running.

One limit on that default: **interactive runs only.** In headless / pipeline
use (SKILL.md's "Headless / pipeline use" — the output goes to an automated
consumer and the run ends at a PDF), there is nobody at a browser to chat
with, so never arm the listen loop there whatever the ladder says.

Having connected, stay connected and stay quiet: no idle cap, no wake
budget, and no narration of empty wakes (SKILL.md's "Leaving"). `/print live`
survives as the explicit re-entry after the user has told you to stop, and as
the way they ask you to reconsider a harness you judged unsupported.

## Known harnesses (checked 2026)

| Harness | Live mode | Rung / notes |
|---|---|---|
| Claude Code (CLI / desktop) | **yes** | (b): run `wait <page> --timeout 240` with `run_in_background` and end the turn — the task-completion notification wakes the session; re-arm per wake. (a) where a Monitor/stream tool exists. |
| OpenCode | **yes** | (b): `run_in_background` + `bash_output`. |
| Amp | **yes** | (b): background/tmux patterns + polling check-ins. |
| Gemini CLI | **yes** | (b): `is_background`, plus output reads on your own turns. |
| Claude Code (web), Codex cloud, Cursor cloud agents, Copilot coding agent, other cloud/CI sandboxes | **no** | Reachability gate: user's browser cannot reach sandbox loopback. |
| OpenAI Codex CLI | **no** | Foreground only (default exec timeout 10 s). Copy/paste mode. |
| Cursor (IDE agent) | **no** | Foreground only; CLI shell mode hard-caps at 30 s. |
| GitHub Copilot CLI / VS Code agent mode | **no** | Foreground only, no timeout knob. |
| Windsurf, Crush, Goose | **no**, unless (b) | Presumed foreground-only. If the harness does have a background facility with output reads, it qualifies at (b) — confirm before claiming it. |
| Aider | **no** | No agentic command loop. |

## Server start caveat (all harnesses)

Start `server.mjs` **detached or via your harness's background facility,
never as a plain foreground command** — some harnesses kill foreground
commands at 30 s, which would take the server (and every open page) down
with it. SKILL.md Step 7 already runs it in the background; treat that as a
hard requirement, not a preference.

## Why waits are bounded

`wait` defaults to 20 s and allows up to 300 s for the background one-shot
listeners rung (b) runs, where the harness wake — not a timeout ceiling —
ends the hold. Bounded + idempotent is what makes re-arming safe: a
server-held cursor delivers each message exactly once across invocations, so
a message that lands in the gap between one wait exiting and the next being
armed is still there for the next one. Nothing is lost between wakes, and no
harness ever sees a command that looks hung. `NO_MESSAGE` with exit 0 — not
a non-zero exit — signals an empty poll, so harnesses that surface non-zero
exits as errors don't misreport a quiet minute as a failure.
