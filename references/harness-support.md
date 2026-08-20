# Optional capabilities

Two things this skill uses when the environment provides them and works
without when it does not: **live edit** (the served page, which records what
the user selects for you to read) and an **image backend** (turning a
photograph into line art). Both degrade rather than fail — decide each from
this document, never assume.

---

# Part 1 — Can the user reach the served page?

One question, and it is a property of **where you are running**, not of the
page and not of the model.

## The reachability gate

Can the **user's browser** open the local server (`http://127.0.0.1:4949`)?

If you are running in a cloud sandbox or remote container — Claude Code on the
web, Codex cloud, Cursor cloud agents, the Copilot coding agent, or any
environment where "localhost" is the sandbox's loopback, not the user's machine
— the answer is **no** unless the platform documents port forwarding or preview
URLs you can hand the user.

No reachability means no served preview: no toolbar, no in-page editing, no
selection for you to read. The generated file is still a complete, print-exact
document — say that in your report, and hand over the file path rather than a
URL the user cannot open.

Everywhere else — any harness running on the user's own machine — the answer is
yes, and there is nothing further to check.

## Why there is nothing further to check

There used to be a capability ladder here: whether your harness could stream a
command's output, or run one in the background and wake you, or only run
foreground commands. It decided whether you could hold a listen loop open, and
live editing depended on the answer.

Nothing listens any more. The page records what the user selected; you read it
with one short command at the moment a request needs a target (SKILL.md's "Live
mode"). That is a single shell call that starts and finishes inside one turn, so
it works identically on every harness that can run a command at all — no
background task, no stream, no watcher to arm, nothing left running between
turns, and nothing for a harness to be capable or incapable of.

The ladder was also the source of the worst failures this skill had: agents that
armed six overlapping watchers, re-armed them on every event, and buried the
user in notifications about the machinery. A read is not capable of that.

---

# Part 2 — Image backend (line art from a photograph)

Only the **Coloring / activity page**, **Image page** and **Drawing prompt
page** types may use this. Never for calendars, worksheets, planners or
certificates: raster art there cannot consume the design tokens, cannot be
touched by edit mode, and violates the no-fill rule.

## The contract

A usable backend must meet **both**, or it cannot do this job:

- **image-to-image** — the photograph is the input. A text-to-image-only
  model cannot convert a specific scene or preserve a likeness.
- **≥2100px on the long edge** — 300 DPI across the 7in content box. A hard
  floor, not a preference: below it fine detail prints soft, and upscaling
  cannot invent what was never captured.

Resolution is usually a **parameter, not a ceiling** — look for one before
concluding a backend is too small. Defaults commonly emit ~1K, which fails
the floor; the same model asked explicitly for its maximum can clear it
several times over.

## Resolution order

Probe each adapter, take the first that meets the contract, and record the
model and prompt in an HTML comment on the page — generation is not
reproducible, and later you will want to know what produced the art.

If none qualifies — no credential, no quota, an API error — **hand-author the
art as stroked SVG** (design rule 1a) and say so in the report. The
capability is additive; the skill must never depend on it.

## Adapters

| Backend | Status | Notes |
|---|---|---|
| Google Gemini | tested | `GEMINI_API_KEY`; `google-genai` client. Model `gemini-3-pro-image-preview` (a *preview* id — verify it still exists). Pass `image_size="4K"` and an `aspect_ratio`; the default is ~1K and fails the floor. Returns JPEG. |
| others | not yet written | Follow the contract above. |

Make the call directly rather than delegating to a separate image-generation
plugin — a cross-plugin dependency silently removes the capability on any
machine where that plugin is not installed.

## Known failure responses

- **`429` with `limit: 0`** — not exhausted quota; the tier has *no*
  entitlement to that model. Retrying and switching model both fail; only
  billing changes it. Distinguish from a real rate limit, which reports a
  non-zero limit and a retry delay worth honouring.
- **`503 UNAVAILABLE`** — transient load. Retry with backoff; it usually
  clears on the first retry.
- **A web UI generating images while the API refuses** is normal — they are
  separate entitlements on the same account.

## Privacy

Generation uploads the source photograph to a third party, and these are
often personal or family photos. Some providers train on free-tier
submissions and not on paid. Surface this as a decision the user makes, not
a default they discover afterwards.
