---
title: "fix: Decouple serve-dir's refused-cwd test from the skill's own out/ state"
type: fix
date: 2026-09-09
---

# fix: Decouple serve-dir's refused-cwd test from the skill's own out/ state

## Summary

`server/test/serve-dir.test.mjs` has two tests that assert opposite things about
`resolveServeDir(null, SKILL_DIR)`, and the verdict depends on whether
`<SKILL_DIR>/out` happens to exist on disk when the "refused" test runs. This plan
narrows the "refused" test to cwd values that can never legitimately be the skill's
own `out/`, and hardens the surviving `out/`-exists test to fail loudly on a leftover
rather than silently changing the other test's outcome (GitHub issue #62).

## Problem Frame

`resolveServeDir` promotes `<dir>/out` to the served root when it exists, and
separately refuses any root that resolves inside `SKILL_DIR` — except the one
legitimate case, `SKILL_DIR/out` itself, which is a real project when the skill is
run on itself. Two tests exercise this:

- "a cwd inherited from the skill is refused, not served" asserts
  `resolveServeDir(null, SKILL_DIR)` throws.
- "the skill's own out/ is a project like any other" creates `<SKILL_DIR>/out`,
  asserts `resolveServeDir(null, SKILL_DIR)` resolves to it, and removes it in a
  `finally`.

Both assertions are about the same call with the same arguments; only the presence
of `<SKILL_DIR>/out` on disk decides which one is correct. In file order the second
test's cleanup always runs before the first test's next invocation, so the suite is
green today — but the moment cleanup doesn't run (the issue's own root cause: a
Ctrl-C, a crash, a killed process leaves `<SKILL_DIR>/out` behind), the "refused"
test starts failing until someone notices and removes the directory by hand. The
issue was filed against this exact condition and remains reproducible in the current
file — verified directly against `server/test/serve-dir.test.mjs` and
`server/server.mjs`'s `resolveServeDir` before scoping this plan.

## Requirements

- R1. The unconditionally-refused cases (`SERVER_DIR`, `SKILL_DIR/assets`, the
  relative-flag case) assert independently of `SKILL_DIR/out`'s existence, so
  their outcome no longer depends on execution order or leftover state.
- R2. The bare-skill-root case — `resolveServeDir(null, SKILL_DIR)` when
  `SKILL_DIR/out` does not exist — keeps a dedicated, deterministic regression
  assertion that it throws, so removing it from the state-dependent loop does not
  silently drop coverage of the scenario issue #62 was actually filed about.
- R3. Any test that requires `SKILL_DIR/out` to be absent or present as a
  precondition confirms that precondition explicitly and fails with a clear
  message naming the conflict — rather than silently deleting or silently
  running against whatever the directory already holds — since that directory
  can legitimately hold real output from a developer dogfooding the skill on
  itself, not only debris from an interrupted test run.

## Key Technical Decisions

- **Narrow the state-dependent loop; give the bare-skill-root case its own
  test:** `resolveServeDir`'s promote-then-refuse logic is already correct
  (that's what makes `SKILL_DIR/out` a legitimate exception at all). The defect
  is that one test loop conflates two different things: cases refused
  unconditionally (`SERVER_DIR`, `SKILL_DIR/assets`), and the one case whose
  verdict depends on `SKILL_DIR/out`'s existence (`SKILL_DIR` itself). Splitting
  the state-dependent case into its own test — one that asserts its precondition
  before asserting the throw — keeps the coverage the original loop provided
  without reintroducing the contradiction.
- **Treat `SKILL_DIR/out`'s presence as an unresolved precondition, not
  necessarily debris:** the Problem Frame is explicit that `SKILL_DIR/out` "is a
  real project when the skill is run on itself" — so a test that needs the
  directory absent (or present) to make a clean assertion cannot assume its
  current state is test leftover. Both the new bare-skill-root test and "the
  skill's own out/" test assert their precondition first and fail with a message
  telling the developer to move or remove real output before running the suite,
  rather than either deleting it unannounced (today's `finally` block already
  does this) or running the assertion against content of unknown origin.

## Implementation Units

### U1. Deflake the refused/owns-out test pair without losing coverage

**Goal:** Remove the state-dependent overlap between the two existing tests, while
keeping deterministic coverage of both the bare-skill-root refusal and the
`SKILL_DIR/out`-exists case, per R1, R2, and R3.

**Requirements:** R1, R2, R3

**Dependencies:** none

**Files:**
- `server/test/serve-dir.test.mjs` (modify)

**Approach:**
- In "a cwd inherited from the skill is refused, not served", drop `SKILL_DIR` from
  the loop of cwd values, keeping `SERVER_DIR` and `path.join(SKILL_DIR, "assets")`
  — both are refused unconditionally, independent of `SKILL_DIR/out`'s existence.
  The existing relative-flag assertion (`resolveServeDir("out", SERVER_DIR)`) is
  unaffected and stays as-is.
- Add a new test — e.g. "a bare skill root with no out/ yet is refused" — that
  first asserts `<SKILL_DIR>/out` does not exist (failing with a message pointing
  at the directory if it does, since its presence means either interrupted-run
  debris or real dogfood output that the test cannot safely ignore), then asserts
  `resolveServeDir(null, SKILL_DIR)` throws. This restores the coverage the old
  loop provided for the case R2 names, made explicit about its precondition
  instead of implicit in loop membership.
- In "the skill's own out/ is a project like any other", add the same
  precondition assertion ahead of the `mkdir` — `<SKILL_DIR>/out` does not already
  exist — with a message that tells the developer to move or remove existing
  output before running the suite, per R3.

**Patterns to follow:** the file's existing `fs.realpath`-after-`mkdtemp`
convention in the `project()` helper for state that must be compared by real
path, and the existing `try`/`finally` cleanup shape already used around the
`mkdir` in this same test.

**Test scenarios:**
- Happy path: with `<SKILL_DIR>/out` absent, the "refused" test still throws for
  `SERVER_DIR`, `SKILL_DIR/assets`, and the relative-`out`-under-`SERVER_DIR` case.
- Happy path: with `<SKILL_DIR>/out` absent, the new bare-skill-root test passes
  its precondition check and confirms `resolveServeDir(null, SKILL_DIR)` throws.
- Happy path: the "skill's own out/" test passes its precondition check, then
  resolves both `resolveServeDir(out, SKILL_DIR)` and
  `resolveServeDir(null, SKILL_DIR)` to `out` after creating it, and still removes
  it in `finally`.
- Regression proof: pre-create `<SKILL_DIR>/out` by hand (simulating either an
  interrupted-run leftover or real dogfood output), then run the full file — both
  the new bare-skill-root test and "the skill's own out/" test fail immediately on
  their precondition check, with a message naming the conflicting directory,
  instead of one test silently contradicting the other or silently deleting real
  content.
- Edge case: run only the new bare-skill-root test in isolation with
  `<SKILL_DIR>/out` pre-created — it fails on the precondition, not on the
  `resolveServeDir` assertion, so the failure message correctly identifies the
  precondition conflict rather than looking like a `resolveServeDir` regression.

**Verification:** `node --test server/test/serve-dir.test.mjs` passes on a clean
checkout, in isolation per test name, and across repeated full-suite runs; the
pre-seeded-`SKILL_DIR/out` scenarios above (full suite and isolated) demonstrate
the fix rather than just the absence of a regression.

## Scope Boundaries

This plan covers only issue #62. Issues #55, #56, #57, and #61 were checked against
the current codebase before this plan was written and are already fixed by prior
commits — no work remains for them. Issue #31 (dense page types may under-use the
sheet relative to a no-skill baseline) stays open and out of scope here: it's an
unconfirmed lead pending a blind print batch, not a defined fix.
