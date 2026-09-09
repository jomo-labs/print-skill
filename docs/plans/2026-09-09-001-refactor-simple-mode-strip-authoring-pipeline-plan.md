---
title: "refactor: Strip print-skill down to Simple Mode (server, PDF, live-edit only)"
type: refactor
date: 2026-09-09
---

# refactor: Strip print-skill down to Simple Mode (server, PDF, live-edit only)

## Summary

Remove the authoring/QA pipeline (assembly, lint, fit-check, contrast-check, smart server launch) and the reference corpus that drives it, keeping only the page server, the deterministic PDF renderer, the browser-side viewer, and the live-edit channel. SKILL.md is rewritten as a minimal doc for this reduced surface.

## Problem Frame

print-skill's current pipeline (`SKILL.md` Steps 5-7) runs every authored page through `assemble-cli.mjs`, `lint-cli.mjs`, `fit-cli.mjs`, and `contrast-cli.mjs` before serving it via `serve-cli.mjs`. This experiment ("Simple Mode") tests what the skill looks like with that enforcement layer removed, keeping only the parts that let a page be viewed, live-edited, and exported to PDF.

## Requirements

- R1. `server/assemble-cli.mjs`, `server/lint-cli.mjs`, `server/fit-cli.mjs`, `server/contrast-cli.mjs`, and `server/serve-cli.mjs` are deleted, along with the tests that exist only to exercise them.
- R2. The page server (`server/server.mjs`), the PDF engine (`server/render.mjs`, `server/render-cli.mjs`, `server/browser.mjs`), the browser viewer (`assets/shell/*`), and the live-edit channel (`server/chat-cli.mjs`, `server/chat-store.mjs`) are unchanged in behavior.
- R3. Server launch no longer depends on `serve-cli.mjs`'s port-reuse/registry logic; starting the server is `npm start` / `node server.mjs`.
- R4. `references/*.md`, `references/themes/`, and `references/types/` are deleted; anything from `references/follow-up.md` still needed to explain the live-edit channel is inlined into the new `SKILL.md` first.
- R5. `SKILL.md` is replaced with a minimal doc describing only: write the page, start the server, live-edit via the selection/status channel, export a PDF.
- R6. `npm test` (`node --test test/*.test.mjs`) passes with no missing-module errors and no loss of coverage for surviving behavior (page serving, PDF export, shell.js interactions).

## Key Technical Decisions

- **Server launch reverts to `node server.mjs` / `npm start`, dropping `serve-cli.mjs` entirely**: the user chose to treat launch convenience (port reuse, registry, retry loop) as part of "the logic" to cut, not part of "the html renderer" to keep.
- **`SKILL.md` is rewritten in place, not deleted**: Simple Mode stays a usable, redistributable skill — just a much smaller one — rather than becoming a bare sandbox.
- **`references/` is deleted outright, not kept-but-disconnected**: matches "remove most of the logic." `references/follow-up.md`'s live-edit-channel content must be read and inlined into the new `SKILL.md` (U4) before the deletion (U5) runs.
- **Mixed test files are rewritten, not deleted**: `clip-detection.test.mjs`, `font-metrics-fit.test.mjs`, and `page-frame.test.mjs` each exercise real keep-list behavior (shell.js clip detection, server.mjs page-frame chrome injection) alongside a cut-list dependency (`fit-cli.mjs` or `assemble-cli.mjs`). Deleting them outright would silently drop coverage for surviving features.
- **`lib.mjs`, `browser.mjs`, and `assets/page_template.html` are untouched structurally**: research confirmed the dependency arrow runs cut-list → keep-list only (e.g. `fit-cli.mjs` imports from `server.mjs`/`browser.mjs`, never the reverse), so no keep-list source file needs editing to stop calling into the cut-list. `lib.mjs` stays because `server.mjs` and `chat-cli.mjs` import it; `page_template.html` stays because `server/test/helpers.mjs` (the shared fixture builder for keep-list tests) reads it.

## Implementation Units

### U1. Rewrite the three mixed test files to drop their cut-list dependency

**Goal:** `clip-detection.test.mjs`, `font-metrics-fit.test.mjs`, and `page-frame.test.mjs` keep exercising keep-list behavior without importing or shelling out to `assemble-cli.mjs`/`fit-cli.mjs`.

**Requirements:** R6

**Dependencies:** None

**Files:**
- `server/test/clip-detection.test.mjs`
- `server/test/font-metrics-fit.test.mjs`
- `server/test/page-frame.test.mjs`

**Approach:**
- `clip-detection.test.mjs`: remove the "fit-cli fails a clipped page" sub-test; keep the assertions that drive `startServer` and check clip detection directly.
- `font-metrics-fit.test.mjs`: strip the assertions that assert `fit-cli.mjs`'s verdict. If nothing keep-list-specific remains after stripping, fold any remaining assertion into `fit-report.test.mjs` and delete this file — this is a judgment call for whichever leaves the clearer, non-duplicated test.
- `page-frame.test.mjs`: rebuild its fixture HTML using the same `loadPageParts`/`fillTemplate` helpers in `server/test/helpers.mjs` that other keep-list tests already use, instead of shelling out to `assemble-cli.mjs`.

**Patterns to follow:** `server/test/helpers.mjs`'s existing `loadPageParts()`/`fillTemplate()` usage in `pagination.test.mjs`, `selection.test.mjs`, and similar keep-list tests.

**Test scenarios:**
- Happy path: all three rewritten files run green under `node --test test/*.test.mjs` with no import of `assemble-cli.mjs` or `fit-cli.mjs` remaining.
- Regression: the clip-detection and page-frame-chrome-injection behaviors these tests originally covered are still asserted after the rewrite (no silent coverage loss).

**Verification:** `node --test server/test/clip-detection.test.mjs server/test/font-metrics-fit.test.mjs server/test/page-frame.test.mjs` passes; grep confirms none of the three import `assemble-cli.mjs` or `fit-cli.mjs`.

---

### U2. Delete the authoring/QA CLI layer and its dedicated tests

**Goal:** Remove `assemble-cli.mjs`, `lint-cli.mjs`, `fit-cli.mjs`, `contrast-cli.mjs`, `serve-cli.mjs` and every test file whose only purpose is exercising them.

**Requirements:** R1, R3, R6

**Dependencies:** U1 (mixed tests must stop depending on these files first)

**Files:**
- Delete: `server/assemble-cli.mjs`, `server/lint-cli.mjs`, `server/fit-cli.mjs`, `server/contrast-cli.mjs`, `server/serve-cli.mjs`
- Delete: `server/test/assemble-cli.test.mjs`, `server/test/lint-cli.test.mjs`, `server/test/serve-cli.test.mjs`, `server/test/fill-report.test.mjs`, `server/test/token-check.test.mjs`, `server/test/assembly-command.test.mjs`, `server/test/cli-help.test.mjs`

**Approach:** Straight deletion — research confirmed zero keep-list files import from any of these five, so no source edits are needed elsewhere. `cli-help.test.mjs`'s few keep-list-adjacent assertions (chat-cli flag help) aren't worth preserving in isolation; delete the whole file.

**Test scenarios:**
- Happy path: `npm test` runs with no "module not found" errors after deletion.
- Regression: `npm start` / `node server.mjs` still boots and serves a page (no import of a deleted file from `server.mjs`).

**Verification:** `npm test` (from `server/`) passes; `node server.mjs` starts cleanly and `/healthz` responds.

---

### U3. Prune dead exports left in lib.mjs

**Goal:** Remove `findUndefinedTokenRefs` and `findSheetEdgeBorders` from `server/lib.mjs` now that their only callers (`assemble-cli.mjs`, `lint-cli.mjs`, and the deleted `token-check.test.mjs`) are gone.

**Requirements:** R6

**Dependencies:** U2

**Files:** `server/lib.mjs`

**Approach:** Delete the two functions and their exports; leave `slugify`, `takeFlag`, `takeValue`, `realOrSelf` untouched — all four remain in use by `server.mjs` and/or `chat-cli.mjs`.

**Test scenarios:**
- Happy path: grep confirms no remaining file references `findUndefinedTokenRefs` or `findSheetEdgeBorders` after deletion.
- Regression: `server.mjs` and `chat-cli.mjs` still import successfully (no accidental removal of a still-used export).

**Verification:** `npm test` passes; `node -e "import('./lib.mjs')"` (or equivalent) resolves without error.

---

### U4. Write the Simple Mode SKILL.md

**Goal:** Replace the current 9-step `SKILL.md` (interview → classify → author → assemble → verify → serve → report, built around the cut CLIs) with a minimal doc covering only: write the page, start the server, live-edit via the selection/status channel, export a PDF.

**Requirements:** R4, R5

**Dependencies:** None (must complete before U5, since it needs to read `references/follow-up.md` before that file is deleted)

**Files:** `SKILL.md`

**Approach:**
- Read `references/follow-up.md` first and inline whatever live-edit-channel mechanics ("a page that stops fitting," editing an existing page, live mode) it currently explains by reference — that source is being deleted in U5, so nothing can point to it afterward.
- Keep the parts of the current Step 8 (report) that already describe the user-facing live-edit/PDF messaging ("double-click to edit... Print/Save PDF") largely as-is.
- Replace the old Step 7 (Serve, built on `serve-cli.mjs --dir <cwd>/out`) with plain launch instructions: `node server.mjs --dir <cwd>/out` or `npm start --prefix <skill-dir>/server`.
- Drop the steps that lean on deleted reference material entirely: classify (`routing.md`), author-time rules (`design-rules.md`, `principles.md`, `page-types.md`, `types/*.md`, `themes/*.md`), assemble, and verify.
- Update the Step 0 warm-up check that currently asserts `assemble-cli.mjs` exists — it should check for the surviving entry points instead (e.g. `server.mjs`, `node_modules`).

**Test scenarios:**
- Test expectation: none — pure documentation content; the doc-content tests that asserted the old structure (`skill-doc*.test.mjs`) are removed in U5, and there's no new automated check for prose content.

**Verification:** `SKILL.md` reads end-to-end as a coherent, self-contained doc with no dangling reference to a path being deleted in U5.

---

### U5. Delete the references/ corpus and its doc-tests

**Goal:** Remove the authoring-rules corpus and the tests that assert its content/structure, now that `SKILL.md` no longer points to it.

**Requirements:** R4, R6

**Dependencies:** U4

**Files:**
- Delete: `references/assembly.md`, `references/design-rules.md`, `references/follow-up.md`, `references/harness-support.md`, `references/marks.md`, `references/newsprint.md`, `references/page-types.md`, `references/principles.md`, `references/print-fundamentals.md`, `references/routing.md`, `references/themes/`, `references/types/`
- Delete: `server/test/skill-doc.test.mjs`, `server/test/skill-doc-specs.test.mjs`, `server/test/skill-doc-refs.test.mjs`, `server/test/skill-doc-principles.test.mjs`, `server/test/skill-doc-design-rules.test.mjs`, `server/test/skill-doc-themes.test.mjs`, `server/test/skill-doc-theme-specs.test.mjs`

**Approach:** Straight deletion once U4 has extracted anything still needed. Confirm `assets/page_template.html` is NOT touched — it stays because `server/test/helpers.mjs` reads it for keep-list test fixtures, unrelated to `references/`.

**Test scenarios:**
- Happy path: `npm test` runs with no missing-file errors referencing `references/*.md`.
- Regression: `SKILL.md` (from U4) contains no remaining path reference into `references/`.

**Verification:** `npm test` passes; `grep -r "references/" SKILL.md` returns nothing.

## Scope Boundaries

- **Out of scope:** `README.md` and `docs/index.html` — neither references the cut-list by name, and their marketing copy is left for a separate pass.
- **Out of scope:** any functional change to `server.mjs`, `render.mjs`, `browser.mjs`, `chat-cli.mjs`, `chat-store.mjs`, or `assets/shell/*` — every keep-list file's behavior is unchanged; only some of their tests are touched (U1) to stop depending on cut-list fixtures.
- **Outside this experiment's identity:** reintroducing any automated print-quality enforcement (structural verification, lint, fit-check, contrast-check) — that enforcement layer is precisely what Simple Mode removes.

## Risks & Dependencies

- README.md's "Reliably print-ready" claim (ink-safe, grayscale-safe, inside-the-margins) was backed by the now-removed lint/fit/contrast enforcement. Simple Mode weakens that guarantee for any page authored under it; left as a known gap since README updates are out of scope for this plan.
- `font-metrics-fit.test.mjs` (U1) may end up with no keep-list-specific assertions left after stripping its `fit-cli.mjs` dependency — the unit's approach already calls out folding vs. deleting as an implementer judgment call.
