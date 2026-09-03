---
title: "perf: Cut the print skill's mechanical waste"
type: perf
date: 2026-09-03
---

# perf: Cut the print skill's mechanical waste

## Summary

Cut ~28% of the skill's turns — from a median 53.5 to ≤40, and $2.30 to ≤$1.70
per run — by fixing four mechanical defects that cost turns and buy nothing.
None of them touches a design rule, a print rule, or the visual proof loop, so
there is no quality trade to weigh: this is waste removal, not tuning. The
changes that *do* alter what gets printed are deliberately held back to a
second tier, gated on this one's measurements.

---

## Problem Frame

The skill costs 3.5× the control at the median and ~6× on the heaviest tasks.
Measured on run `2026-09-03-001-d63693b2` (14 skill runs, 15 control):

| | control | skill | ratio |
|---|---|---|---|
| median cost | $0.65 | $2.30 | 3.5× |
| median wall clock | 160s | 456s | 2.9× |
| median turns | 11 | 53.5 | 4.9× |
| median cache-read tokens | 231k | 3.2M | 13.9× |
| peak context | 39k | 85k | 2.2× |

Cost is `turns × context`, so the two ratios multiply, and cache-read is the
bill that matters.

### Where the turns actually sit

| segment | median turns | nature |
|---|---|---|
| before the first assemble | 24 | setup, reference loading, authoring |
| inside the assemble loop | 12 | fit iteration |
| after the last assemble | 15 | serving, proof rendering, reporting |

At 4.90 assistant turns per extra assemble round (250 in-loop turns against 51
extra rounds), the loop is not the largest block — and it is the block whose
fixes carry quality risk. The mechanical waste is spread across the other two.

### The four defects this plan fixes

**1. Serving costs ~6 shell calls per run and buys nothing.** `SKILL.md` Step 7
claims *"One command does the probe / reuse / start sequence and prints the
URL."* In practice, across 14 runs:

| | count |
|---|---|
| hand-rolled `curl` port/health scans | 34 |
| `serve-cli.mjs` — the one command that should suffice | 22 |
| raw `server.mjs` launches, which `SKILL.md` explicitly forbids | 15 |
| `lsof` port scans | 6 |

The cause is not model indiscipline. `serve-cli` fails in nearly every run with
`server did not come up within 8s`, and the traces carry the model's own
diagnosis: *"All ten ports in the skill's range are held by print-skill servers
from other projects (several serving deleted temp dirs)"*. It probes the fixed
range 4949–4958 for a server already serving this exact directory, finds every
port held by servers serving other trees, cannot bind, times out, and exits 1.
The model then binds a free port above the range — which is exactly what
`serve-cli` should have done itself. The hand-rolled scans and the three health
route guesses (`/__health`, `/healthz`, `/__mp/health`, the last found by
reading `server.mjs` source) are recovery behaviour, not waste.

**How much of this transfers to real use is uncertain.** The eval runs four
cells concurrently across 35 cells, all racing for the same ten ports, so
orphaned servers accumulate quickly. A single user on one machine would hit
exhaustion far less often. The defects are real at any concurrency — failing
instead of falling back is wrong regardless — but the turn saving measured here
is an upper bound, and U10's contribution to the budget should be read as such.

**2. An undefined path placeholder kills 8 of 65 assemble invocations.** They
die with
`Cannot find module '/private/tmp/mp-*/.claude/skills/print/server/assemble-cli.mjs'`,
across 6 of 14 tasks, each costing a full re-author. The cause is not a
relative path in `SKILL.md` — no command block contains one. Every block writes
`node <skill-dir>/server/...` and nothing says how `<skill-dir>` resolves, so
the model substitutes a relative path itself, which stops resolving the moment
it `cd`s to a scratch directory.

**3. A 9-item mechanical checklist is executed by hand.** Every item in Part B
of `references/design-rules.md` is a text-pattern test over the model's own
CSS. The model runs them as shell greps — 41 across 14 runs, many re-reading
`assets/shell/document.css` for token values that `references/page-types.md`
claims to make unnecessary — and still ships violations the eval catches.

**4. Reference loading ignores its own batching instruction.** A themed run
pulls ~88KB across 5-8 separate turns (spanning turns 5→15, and in one case
5→39), despite `SKILL.md` opening its Workflow section by telling the model to
batch exactly these reads. Restating that instruction is not a fix; it is the
thing that already failed.

One documentation bug feeds defects 3 and 4: the token quick reference lists
`--space-1..20` against only 11 values, so the model authors `var(--space-7)`
and `var(--space-9)`, which do not exist, and greps the stylesheet for the real
values in a file that tells it not to.

### What this plan deliberately does not touch

The assemble loop's 51 re-authors split 29 after a *passing* build, 14 after a
real failure, 8 after the environment deaths fixed here. The 29 are real waste,
but every fix for them changes what gets printed — the squeeze reframing alone
would alter the shipped artifact on 36% of the batch. Those are Tier 2, and
they are held back deliberately so this tier ships with no quality hypothesis
to defend. See Scope Boundaries.

### The instrument

`calibration.md` records paper agreeing with screen on 2026-08-20, and the
baseline has the skill preferred on 10 of 11 cross-arm pairs with 3 physical
violations against the control's 60. It is noisy: the batch measured no
same-arm floor (n=0), ran 64% position bias toward slot A, and the same metric
read 100% (n=20), 0% (n=3) and 91% (n=11) across three consecutive runs with no
comparable change to the skill. For this tier that noise matters less than
usual — there is no quality trade being made, so the gate is confirming nothing
broke rather than measuring a tradeoff.

---

## Requirements

Thresholds are measured by the metrics script U6 commits, using the definitions
pinned there. The definitions are load-bearing: the same run reads 53.5 turns
or 29 depending on whether turns are assistant messages or the harness's own
`num_turns`, and 3.2M or 1.5M cache-read tokens depending on whether per-message
reads are summed or `runs.jsonl`'s single field is used. Unpinned, R2 and R3 can
be declared met without the work landing.

**Cost budget**

R1. Median `assemble-cli` invocations per page drops from 4.5 to ≤4 — the
   environment deaths only. The loop itself is Tier 2.
R2. Median turns per skill run drops from 53.5 to ≤40 (assistant-message
   count).
R3. Median cache-read tokens per skill run drops from 3.2M to ≤2.4M (sum of
   per-message `cache_read_input_tokens`).
R4. The reference material a run needs is loaded in ≤2 turns, down from 5-8.
R5a. Median cost per skill run drops from $2.30 to ≤$1.70, and median wall
   clock from 456s to ≤360s. These are the numbers the work exists to move.
R14. Serving a page resolves in one command that prints the URL, with no port
   scanning, no health-route guessing, and no direct `server.mjs` launch.

**Quality invariants — nothing here should move them at all**

R6. No more than 2 of 11 cross-arm pairs go to the control (baseline: 1 of 11).
   Stated in pairs because at n=11 the reachable rates are 100%, 90.9% and
   81.8% — any percentage threshold above 81.8% and at or below 90.9% means
   "lose no additional pair" while reading as though it grants slack.
R7. Physical-rule violations in the skill arm stay ≤3 per batch; house-style
   violations stay ≤5. Separately, the eight check ids the linter covers —
   `literal-color-outside-root`, `remote-load`, `non-white-paper`,
   `font-without-import`, `blurred-shadow`, `inset-shadow`, `gradient`,
   `forced-background` — go to zero. These straddle both buckets in the
   harness, so neither aggregate alone would catch a regression.
R8. Every generated page still exits 0 through structural verification, the
   token check, lint, fit, and contrast.

**Correctness and discoverability**

R10. No checklist item requires the model to grep its own CSS; the mechanical
   checks are executed by machine.
R11. Documented spacing tokens match `assets/shell/document.css` exactly, so no
   nonexistent token can be authored from the docs.
R12. `serve-cli`, `fit-cli` and `assemble-cli` state their flags on `--help`.
   The other three CLIs are deferred — no trace shows the model reading their
   source, and `chat-cli` never ran in the batch at all.

---

## Key Technical Decisions

KTD1. **Ship the waste removal on its own, before anything that changes the
   printed page.** Every change here is mechanism or documentation; none has a
   quality hypothesis to defend. Rationale: bundling them with the loop work
   would put a 28% cut with no downside behind a review of changes that alter
   36% of shipped artifacts. Tier 2 gets its own gate and its own decision,
   informed by this tier's numbers.

KTD2. **One eval gate, not two.** Rationale: with no quality trade being made,
   the gate is confirming nothing broke rather than measuring a tradeoff. A
   second gate would double a ~$48, ~2h cost to no additional question.

KTD3. **Part B moves to a lint CLI over the authored channels, folded into
   `assemble-cli.mjs`.** Rationale: all 9 items are text-pattern tests, and
   machine execution is cheaper *and* strictly more correct than the model's
   grep rounds. Critically the linter reads the authored `custom_css`,
   `content_html` and `font_import`, never the assembled page: the shell's own
   `assets/shell/document.css` carries a 48px blurred shadow (line 175),
   `background: white !important` (260) and a `radial-gradient` (373), so a
   linter pointed at the assembled output would fail every build.
   `findSheetEdgeBorders(css)` in `server/lib.mjs:107` is the existing
   authored-CSS-only precedent to follow, not the whole-document token check.

KTD4. **Reference batching gets a mechanism, not a stronger imperative.** A
   prewritten command block, not a new CLI. Rationale: `SKILL.md` already tells
   the model to batch and it does not, in 14 of 14 runs. A CLI was specified
   and rejected — it added a second source of truth for reference routing and
   three failure modes fell out of one page of spec (it omitted `page-types.md`,
   hard-failed on the ad-hoc theme path most themed requests take, and needed a
   slug obtainable only by reading a third file first). `tail -n +1` already
   prints a `==> path <==` header per file and fails loudly on a missing one.

KTD5. **The gate metrics become committed code, not a described procedure.**
   Rationale: the harness records `toolCallCount` and one `usage` block; it
   does not record assemble invocations or per-message cache reads, and
   `src/trace.mjs` parses `num_turns` then drops it. Without committed code the
   gate measures something different from the diagnosis.

---

## High-Level Technical Design

Where the run's turns go, and which tier addresses each block. The unchanged
rows are the honest part of this table.

| segment | now | after Tier 1 | mechanism |
|---|---|---|---|
| before the first assemble | 24 | ~17 | U8 (batched reads), U5 (token facts) |
| inside the assemble loop | 12 | ~9 | U5 (env deaths) — the rest is Tier 2 |
| after the last assemble | 15 | ~10 | U10 (serving) — upper bound, see U10 |
| **total** | **53.5** | **≤40** | |
| cache-read tokens | 3.2M | ≤2.4M | all |
| cost per run | $2.30 | ≤$1.70 | all |
| wall clock | 456s | ≤360s | all |

Roughly 7 of the 15 post-assemble turns are the model writing its report and
thinking rather than calling tools. That is not attributed to any cause yet and
is not targeted here.

---

## Implementation Units

U-IDs are stable and carried over from this plan's earlier, wider scope, so the
sequence has gaps: U1, U2, U4 and U9 are the Tier 2 and deferred units named in
Scope Boundaries, and U7 was the second eval gate that KTD2 collapsed into one.

### U3. Replace the hand-run CSS checklist with a lint CLI

**Goal:** The 9 mechanical checks run by machine, automatically, and the
checklist prose leaves the always-loaded path.

**Requirements:** R10, R7, R8

**Dependencies:** none

**Files:**
- `server/lint-cli.mjs` (new)
- `server/assemble-cli.mjs` — run lint before fit, in the existing check chain
  around lines 249-273
- `references/design-rules.md` — Part B replaced by a short pointer; Part C's
  degrade path rewritten to trigger on lint output
- `SKILL.md` — Step 4
- `server/test/lint-cli.test.mjs` (new)

**Approach:** Each Part B item becomes a check function over the authored CSS
and inline `style` attributes: markup breakout and remote loads, backslashes,
paper stays white, the background allowlist, blur radius in shadow layers,
literal colors outside `:root`, inline-style parity, the Google Fonts URL
shape, and display leading clearance. Report every violation in one pass with
the offending declaration and its line, so a single round fixes all of them
rather than the model re-running a checklist after each edit — that re-run
instruction is itself a documented fix-pass multiplier and dies with this unit.

**The input contract is the load-bearing detail.** `lint-cli.mjs` takes
`--css <overrides.css>`, `--content <content.html>` and `--font-import <url>` —
the authored channels, mirroring `assemble-cli.mjs`'s own flags — and never the
assembled page (see KTD3). The font import must be a flag of its own: it lives
in neither the stylesheet nor the content, so without it Part B item 8 and
R7's `font-without-import` cannot be evaluated and the linter would silently
skip one of the nine items it claims to mechanise. `--css` is optional,
matching `assemble-cli.mjs`, so a page with no `custom_css` lints clean rather
than exiting on a missing argument.

**Nine Part B items, eight eval check ids — different namespaces.** The nine
items are this repo's authoring rules; the eight ids in R7 are the eval
harness's check names in `src/checks.mjs`. They do not correspond one-to-one:
`backslashes`, `inline-style parity` and `display leading clearance` have no
eval counterpart, and the harness's `sheet-overflow` has no Part B item. Say so
in the unit, so nobody hunts for a missing ninth id.

Fold it into the chain `assemble-cli.mjs` already runs, ahead of fit, as an
explicit short-circuit that exits 1 before either browser-backed check runs —
the existing `runCheck("fit-cli.mjs")` / `runCheck("contrast-cli.mjs")` pair
runs both unconditionally by design, so lint cannot simply join it. Failing
early also avoids paying for a browser launch on CSS that was never going to
ship.

One item is already enforced and must not regress: `assemble-cli.mjs` validates
the `font_import` URL against a Google Fonts pattern today and *warns while
dropping the link* rather than failing. Decide deliberately whether item 8
keeps that lenient behaviour or becomes a hard failure; do not let the rewrite
change it silently.

**Patterns to follow:** `findSheetEdgeBorders(css)` in `server/lib.mjs:107`
lints authored CSS only — the right precedent. The token check in
`server/test/token-check.test.mjs` shows the failure shape to match: fail
assembly with a hint naming the nearest valid value.

**Test scenarios** (`server/test/lint-cli.test.mjs`):
- One case per Part B item: a minimal violating declaration is caught and named.
- Each item's documented legal edge passes — `8px 8px 0` shadow, `transparent`
  and `currentColor` outside `:root`, an `--image-filter` definition inside
  `:root`, a `var(--space-99, 4px)` fallback.
- An escape-sequence smuggling attempt (`@\69mport`) is caught by the backslash
  check, matching the stated rationale.
- Inline `style` attributes in the content are linted, not just the stylesheet.
- Multiple simultaneous violations all report in one pass.
- The shell's own `assets/shell/document.css` is NOT linted: a build whose
  authored CSS is clean passes even though the assembled page contains the
  shell's blurred shadow, forced background and gradient. This is the
  regression test for the input contract.
- A page with no `custom_css` lints clean rather than erroring.
- An existing `font_import` that today produces a warning still produces the
  same outcome, per the decision recorded above — asserted explicitly so the
  behaviour change is deliberate.
- Assembly with a lint violation exits 1 before a browser is launched.
- The two `literal-color-outside-root` cases the eval caught in the baseline
  are reproduced as fixtures and fail the linter — proof the machine catches
  what the hand-run pass missed.

**Verification:** the lint suite passes; a page whose authored CSS carries a
known Part B violation fails assembly before a browser launches; a page with
clean authored CSS still assembles despite the shell's own violations; and the
gate batch reports zero occurrences of the eight linted check ids.

---

### U5. Fix the reference facts and the path placeholder

**Goal:** Remove the documentation defects that make the model read the
stylesheet and CLI sources, and the one that kills 8 of every 65 assemble
invocations outright.

**Requirements:** R11, R12, R1, R2

**Dependencies:** none

**Files:**
- `references/page-types.md` — the token quick reference, lines 123-141
- `SKILL.md` — Step 0, where `<skill-dir>` gets its absolute-resolution rule
- `server/serve-cli.mjs`, `server/assemble-cli.mjs`, `server/fit-cli.mjs`
- `server/test/token-check.test.mjs`, `server/test/cli-help.test.mjs` (new)

**Approach:** **Define `<skill-dir>` once, absolutely.** The cause of the 8
module-not-found deaths is not a relative path in `SKILL.md` — no command block
contains one. Every block writes `node <skill-dir>/server/...` and nothing says
how `<skill-dir>` resolves, so the model substitutes a relative
`.claude/skills/print/...` itself, which stops resolving the moment it `cd`s to
a scratch directory. Fix the placeholder, not the two blocks that happen to be
most visible: define `<skill-dir>` in Step 0 as an absolute path resolved once
and reused, covering all its uses — Steps 0, 5, 6, 7, and the headless and
live-mode blocks. This is the largest single turn win in this unit.

**Fix the token table.** The spacing row reads `--space-1..20`: 4, 8, 12, 16,
20, 24, 32, 40, 48, 64, 80 — 20 names against 11 values, with no way to tell
which is which. The stylesheet defines 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20 and
nothing else. List each token with its own value. This is why the traces show
the model authoring `var(--space-7)` and `var(--space-9)` and then running
`grep -o -- "--space-[0-9]*:[^;]*"` against `assets/shell/document.css`, in a
file that tells it not to grep for exactly that. Give `--display-overhang` its
value too, for the same reason. Add a machine check that the documented table
matches the stylesheet, so this class of drift cannot return —
`server/test/token-check.test.mjs` already parses both sides.

**Add `--help` to the three CLIs where it is earned.** `serve-cli.mjs`
qualifies on trace evidence; `fit-cli.mjs` and `assemble-cli.mjs` qualify
because U10 and U3 rewrite their argument handling anyway. `render-cli.mjs`,
`contrast-cli.mjs` and `chat-cli.mjs` are deferred: no trace shows the model
reading their source, and `chat-cli` never ran. Note `fit-cli.mjs` currently
accepts one positional and rejects every flag with exit 2, so `--help` there is
a parser change rather than an addition.

**Test scenarios:**
- `SKILL.md` Step 0 states the absolute-resolution rule for `<skill-dir>` and
  no later step redefines it — the regression test for the 8 deaths. Asserting
  the absence of a `.claude/skills/` string would guard nothing, since
  `SKILL.md` never contained one.
- Every `--space-*` token in the documented table exists in
  `assets/shell/document.css` with the documented value.
- Every spacing token defined in the stylesheet appears in the table — catching
  omission as well as invention.
- The same for the type scale, borders, and page margins rows.
- Tokens whose value is a `calc()` or `oklch()` expression —
  `--display-overhang` is `max(0em, calc((1.22em - var(--leading-display) *
  1em) / 2))` — compare under a stated normalisation rule rather than by string
  equality.
- `--help` on each of the three CLIs exits 0 and names every flag it accepts.
- A flag the CLI parses but does not document fails the test.

**Verification:** the token-table test passes against the live stylesheet;
`--help` on `serve-cli`, `fit-cli` and `assemble-cli` lists their flags;
`SKILL.md` Step 0 defines `<skill-dir>` absolutely; and no reference file tells
the model not to grep for something it cannot otherwise obtain.

---

### U8. Give reference loading a mechanism instead of an instruction

**Goal:** The references a run needs arrive in one command, not five to eight
round-trips.

**Requirements:** R4, R2, R3

**Dependencies:** U5 (reuses the absolute skill-directory rule it defines)

**Files:**
- `references/routing.md` (new) — the type routing table *and* the theme
  trigger-phrase index, together
- `references/page-types.md` — routing table moves out; sheet geometry and the
  token quick reference stay
- `references/themes/README.md` — theme index and trigger phrases move out; the
  ad-hoc theme checklist stays
- `SKILL.md` — Steps 1 and 3

**Approach:** Give Step 3 a prewritten batched-read command block over the
absolute skill-directory variable U5 defines (see KTD4 for why a command block
rather than a CLI). The set to read in one call: design rules, principles, the
post-split `page-types.md`, the one type spec, and — when themed — the one
theme spec, or `themes/README.md` for the ad-hoc checklist when no spec
matches.

For that to fit in two turns, classification must not require the 11.7KB
`page-types.md` **and** a second trip for the theme. Both routing tables move
into one small `references/routing.md`: the type table and the theme
trigger-phrase index. Step 1 reads that one file and comes out with both slugs;
Step 3 reads everything else in one command. Two turns, against today's five to
eight.

This remains an instruction the model can bypass — the honest limit of the
approach, and the reason the gate records how many runs actually used the
batched read rather than assuming it.

**Test scenarios:** `Test expectation: none — this unit moves prose between
markdown files and rewrites a command block; it adds no executable behaviour.`
Coverage is the cross-reference check below plus the gate's recorded
reference-load turn count.

**Verification:** every type and theme slug named in `references/routing.md`
resolves to a file that exists; `SKILL.md` Step 1 names only `routing.md`;
Step 3's command block resolves every path through the absolute skill-directory
variable; and a themed run loads its references in two turns.

---

### U10. Make serving survive a busy port range

**Goal:** Step 7 costs one command that succeeds, instead of one that fails and
a hand-rolled recovery.

**Requirements:** R14, R2, R5a

**Dependencies:** U5 (the `<skill-dir>` rule and `serve-cli --help`)

**Files:**
- `server/serve-cli.mjs` — port selection, timeout, failure behaviour, output
- `server/server.mjs` — the health route, and identity of the tree it serves
- `SKILL.md` — Step 7
- `server/test/serve-cli.test.mjs`, `server/test/serve-dir.test.mjs`

**Approach:** Four defects, in descending order of value. The first is the
whole ballgame; the last is what the earlier draft of this unit wrongly led
with.

**1. Fall back instead of failing.** `serve-cli` probes ten fixed ports
(4949–4958), and when all are held it times out at 8s and exits 1 with *"run it
in the foreground to see why"*. Binding a free port outside the range is a
correct outcome, not a failure — the model already does it by hand in every
affected run. Make that the CLI's own behaviour and the recovery turns
disappear.

**2. Reclaim orphans.** Servers start detached and outlive their run, so the
range fills with servers serving directories that no longer exist. A port whose
served tree is gone is reclaimable; today it is indistinguishable from a live
neighbour. The health route already reports which directory a server is
serving — `serve-dir.test.mjs` covers the "healthy server on another dir is
left alone" rule — so the check is cheap: a server whose `dir` no longer exists
on disk is not a neighbour to respect.

**3. Reconsider the 8s timeout and the range width.** Ten ports is small for a
machine running several projects, and 8s is short under load. Both are
hardcoded and neither is discoverable without reading the source, which the
traces show the model doing. Whatever they become, state them in `--help`.

**4. Document the health route.** It exists, and the model found it by reading
`server.mjs`. Name it in `SKILL.md` Step 7 and in `serve-cli --help`, and keep
the two in sync with the route the server actually serves — the three-way drift
is what produced three different guesses.

Once 1 and 2 land, the `server.mjs` prohibition in `SKILL.md` should become
unnecessary rather than louder. A rule the model violated 15 times while
behaving correctly is a design signal.

**Test scenarios:**
- Every port in the range held by live servers on other directories:
  `serve-cli` binds outside the range, prints the URL, exits 0. This is the
  case that fails today.
- A port held by a server whose served directory has been deleted: `serve-cli`
  reclaims it rather than treating it as a live neighbour.
- A healthy server on a different *existing* directory is still left alone —
  the existing rule, which reclamation must not break.
- Run twice against the same directory: the second reuses the first and says
  so, with no second process.
- The documented health route responds, and the name in `SKILL.md`, in
  `serve-cli --help`, and in the server's actual routing table all match.
- A relative `--dir` still resolves against the project rather than the skill
  directory (existing behaviour, guarded).

**Verification:** with the full port range occupied by foreign servers,
`serve-cli` still returns a working URL in one call; a gate run shows no
`lsof`, no port-scanning `curl` loops, and no direct `server.mjs` launches in
the skill arm.

**On the size of this win.** The ~5 turns per run measured in the baseline is
inflated by the harness's four-way concurrency into a ten-port range. Treat it
as an upper bound. The defects are worth fixing at any concurrency, but if the
gate shows a smaller saving than the budget implies, this unit is the first
place to look, not U3 or U8.

---

### U6. Gate — validate the cut without moving quality

**Goal:** Prove Tier 1 cut cost and moved nothing else.

**Target repo:** `print-skill-eval`

**Requirements:** R1, R2, R3, R4, R5a, R6, R7, R8, R14

**Dependencies:** U3, U5, U8, U10

**Files:**
- `src/trace-metrics.mjs` (new) — the trace-analysis script. Not
  `src/metrics.mjs`: `bin/eval.mjs` already writes `results/<run-id>/metrics.json`
  (the per-cell render rows carrying the violation counts, allowlisted for
  publishing), and a same-named module invites an implementer to clobber it.
  Its artifact is `trace-metrics.json`
- `test/trace-metrics.test.mjs` (new)

**Approach:** Commit the measurement, then spend the batch. The harness does
not record what this plan's thresholds are stated in, so the trace analysis
ships as committed code with its definitions pinned:

- turns = count of `assistant` events in `traces/*.jsonl` — **not** the result
  event's `num_turns`, whose median is 29.5 and would read as already under
  R2's target
- cache-read = sum of per-assistant-message `cache_read_input_tokens` — **not**
  `runs.jsonl`'s `usage.cacheReadInputTokens`, whose median is 1,461,730 and
  would read as already under R3's target
- assemble rounds = `Bash` tool_use calls matching `assemble-cli.mjs`
- assemble outcome = classified from the matching `tool_result` text
- shell calls after the last assemble, bucketed by kind — the read for R14
- median = the mean of the two middle values on an even sample; the batch has
  14 produced skill runs, so every median here is a midpoint (53.5 turns, 4.5
  rounds) and a script taking the upper-middle value will not reproduce them

Then run the batch as `node bin/eval.mjs run --task-set wide --replicates 1`,
matching run `2026-09-03-001-d63693b2` exactly. The pin matters twice over:
`wide` is the set the baseline preference came from — `themes` was never in
that batch — and the committed `eval.config.json` now says `replicates: 4`,
which would quadruple the ~$48 spend and change n.

A measured same-arm floor is not available from this configuration and is not
required for this tier. `src/pairing.mjs` builds a null pair only from an arm
with two or more pairable cells, and `--replicates 1` gives each arm one cell
per task, which is why the baseline measured n=0. Since Tier 1 makes no quality
trade, the pair count is a tripwire rather than a measurement; Tier 2 should
measure a floor separately (`--task-set focus --replicates 2` yields same-arm
pairs cheaply) before it leans on the preference rate.

Before spending the batch, confirm nothing in U3 changed what
`src/authored-css.mjs` strips when computing violations over authored CSS — it
strips only `<style id="mp-document-css">`, so a linted stylesheet must not
start counting as authored or the diagnostics stop being comparable.

**Test scenarios** (`test/trace-metrics.test.mjs`):
- Each metric definition computed against a committed fixture trace returns the
  documented baseline figure, so the script is pinned to the numbers in this
  plan rather than free to drift.
- A trace whose assemble result carries `Cannot find module` classifies as an
  environment death, not a pass — the misclassification that produced this
  plan's original failure count.
- A trace whose assemble result carries `does not fit: authored N sheet`
  classifies as a failure even with no literal `Exit code` marker present.
- A trace whose assemble result carries `structural verification FAILED`
  classifies as a failure — 4 baseline invocations take this path and carry no
  exit-code marker either, so a script written only to the two cases above
  would score them as passes.

**Verification:** median turns ≤40; median cache-read ≤2.4M; median cost ≤$1.70
and wall clock ≤360s; reference material loaded in ≤2 turns with the count of
runs that actually used the batched read recorded; no `lsof`, port-scanning
`curl`, or direct `server.mjs` in the skill arm; no more than 2 of 11 cross-arm
pairs to control; physical violations ≤3; zero occurrences of the eight linted
check ids. Record the run id and commit it as the new baseline.

Report quality separately from the linted ids: after U3 those eight are
enforced at assembly and read zero by construction, so a zero there measures
the linter, not the pages. The signals that still carry information are the
non-linted physical classes (chiefly `sheet-overflow`), the house-style count
outside the linted ids, and the cross-arm pair count.

---

## Scope Boundaries

**In scope:** the four mechanical defects above, the documentation bugs that
feed them, and the single gate that makes the result falsifiable.

### Tier 2 — held back deliberately, gated on this tier's numbers

Each of these is evidenced and specified; each also changes what gets printed,
which is why they are not bundled with waste removal.

- **U1 — the squeeze note reads as a success.** 18 of the 29 gratuitous
  re-authors follow `did not fit as authored ... squeezed to fit`, which
  `SKILL.md` Step 6 invites the model to act on. The largest single trigger in
  the loop. It is held back because 5 of 14 baseline tasks converted an early
  squeezed pass into an as-authored final page — under the new rule all five
  would ship squeezed, changing the artifact on 36% of the batch. Needs its own
  gate, a recorded squeeze-depth metric, and a measured same-arm floor.
- **U9 — the sheet budget becomes use-case conditional.** 7 of 16 baseline
  tasks wanted more than one sheet: a packet took 4, a worksheet 2, flashcards
  4, a nature journal would reasonably take 2, and three more
  (`espn-recap-url`, `mlb-scores-standings`, `paper-airplane-folds`) reached one
  sheet only by shipping a persisted squeeze. The other 5 budget-missers
  correctly fought their way to one sheet, so a *global* relax would degrade
  them — this has to key on page type or content volume, asked in Step 0.5's
  Dialog 2 (which already runs after classification) with the type spec
  carrying a default for headless runs.
- **U2 — per-type ink floors.** `INK_FLOOR` is 30 and three page types sit
  permanently below it: maze (min 15), folding (20), flashcards (13). Declared
  floors must sit below the measured minimum with margin, since `reportFill`
  fires on a strict `<`. Worth 7 re-authors.
- **The CSS-footgun check.** `display: grid` on a list item silently promotes
  every inline `<b>`/`<i>` to a grid item; `cookie-monster-recipe` lost a full
  round plus debugging turns to a `.main` that measured 2682px instead of ~540.
  Mechanically detectable, and a natural addition to U3's linter once that
  exists.

### Deferred, unsized

- **U4 — demoting live-mode, editing and pipeline prose out of `SKILL.md`.**
  ~12KB of the always-loaded 33.5KB serves turns a first generation never
  reaches, but it is worth only 1-2 turns and it is the one cheap-looking change
  that could quietly break the follow-up edit flows. If it is ever done, the
  gate needs a follow-up task — generate a page, then issue an edit request and
  a `/print fix` paste — because every gate here runs first-generation tasks
  only.
- **The 15 post-last-assemble turns beyond serving.** U10 takes ~5 of them.
  Roughly 7 more are the model writing its report and thinking, with no tool
  call, and that is unattributed — worth measuring before touching Step 8's
  report spec.
- **Compressing the design guidance.** `references/design-rules.md` Part A,
  `references/principles.md`, and what remains of `references/themes/README.md`
  after U8 are ~30KB of always-loaded prose and the largest remaining context
  target. It is also the likeliest source of the quality margin, and no unit
  here tests that attribution, so the deferral is self-perpetuating until
  someone measures it.
- **First-attempt sizing accuracy.** 21 squeezed passes plus 14 outright
  failures mean most pages missed their sheet budget on the first try, across 10
  of 16 tasks. Even the 5 that correctly wanted one sheet burned 2-9 rounds
  getting there. The Step 3 sizing ledger exists to settle this before authoring
  and is not doing it.

**Not in scope:** the renderer, the shell chrome, the assembly template, the
visual proof loop (~3 turns per run, and the only check that catches design
failures a printer test cannot), every physical print rule, and any change to
what the skill is for. The eval harness's own mechanics are out of scope with
one deliberate exception: U6 adds a metrics script, because the gate cannot
otherwise measure what these thresholds are stated in.

---

## Risks & Dependencies

**U10's measured size may not transfer.** Its diagnosis is now well evidenced —
the traces carry `serve-cli`'s own failure message and the model's port-exhaustion
reasoning in run after run — but the eval's four-way concurrency into a ten-port
range inflates how often exhaustion occurs. A single user would hit it less. The
defects are real regardless; the ~5 turns per run is the uncertain part, and it
is the largest single line in this tier's budget. If the gate comes in short of
≤40 turns, check U10's contribution before suspecting the others.

**U8 is still an instruction the model can bypass.** A command block is cheaper
than a CLI and has fewer failure modes, but it is not load-bearing the way
`assemble-cli.mjs` is — that is the only route to a page, whereas this is a
convenience over reading files. The same batch shows the model ignoring exactly
this class of affordance. The gate records how many runs actually used it, so
R4 is falsifiable rather than assumed.

**After U3, the violation counts stop being an independent quality signal.**
The eight linted ids read zero by construction. This plan leans on violation
counts as the sturdier half of the quality read precisely because the
preference rate is noisy, and this narrows that half to the non-linted classes.
The gate reports them separately for that reason.

**The quality instrument is noisier than one batch suggests.** n=11 cross-arm
pairs, no same-arm floor in the baseline, 64% position bias, and a preference
rate that read 100%, 0% and 91% across three consecutive runs with no
comparable change to the skill. For this tier that is tolerable — nothing here
should move quality at all, so the pair count is a tripwire. Tier 2 cannot rely
on it in the same way and should measure a floor first.

**The gate is the schedule.** One batch at `--task-set wide --replicates 1` is
~2h wall clock and ~$48, and it comes after all four units land.

---

## Sources & Research

- Run `2026-09-03-001-d63693b2` in `print-skill-eval` — `report.txt` for cost
  and quality, `summary.json` for the batch shape (`taskSet: wide`,
  `replicates: 1`, 35 cells), `runs.jsonl` for per-run usage, `verdicts.jsonl`
  for pair-level preferences, `metrics.json` for per-page sheet counts, and
  `traces/*.jsonl` for the assemble classification, re-author attribution, and
  post-assemble shell-call breakdown this plan's numbers come from. The earlier
  runs `2026-09-02-001-a43e4c64` (0%, n=3) and `2026-09-01-001-aadc9a7f`
  (100%, n=20) are the evidence for the instrument's between-run variance.
- `assets/shell/document.css` lines 175, 260, 373 — the shell's own blurred
  shadow, forced background and gradient, which are why U3's linter must read
  the authored channels rather than the assembled page. Also the authoritative
  spacing token values (1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20).
- `server/lib.mjs:107` `findSheetEdgeBorders(css)` — the authored-CSS-only lint
  precedent U3 follows.
- `server/assemble-cli.mjs` lines 249-273 — the structural → fit → contrast
  chain U3 extends; lines 139-144 — the existing lenient `font_import`
  validation that must not change silently.
- `server/test/token-check.test.mjs` — the precedent for a machine check that
  fails assembly with a hint, and proof that the `var(--space-7)` round-trip in
  the traces was caused by the docs rather than a missing check.
- `src/trace.mjs`, `src/authored-css.mjs` and `src/pairing.mjs` in
  `print-skill-eval` — what the harness does and does not record, and why a
  same-arm floor is unavailable at `replicates: 1`.
