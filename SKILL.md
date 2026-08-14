---
name: print
description: "Convert anything into a beautifully formatted, print-ready HTML page using the magicprint design system. Handles content reformatting (text, URLs, notes, data) and structured printable forms (dashboards, calendars, worksheets, chore charts, scorecards, certificates, word searches, mazes, comic strips, drawing pages, activity pages for kids). Use when asked to 'print', 'make printable', 'format for print', 'weekly calendar', 'daily dashboard', 'worksheet', 'something for the fridge', 'chore chart', 'certificate', 'word search', 'maze', 'comic strip', 'drawing page', 'activity page', or 'coloring page'."
license: Apache-2.0
compatibility: Node 18+ recommended for the bundled local PDF server (optional — without it, pages print via the browser dialog)
allowed-tools: Read Write Edit Bash WebFetch
metadata:
  version: "1.0.0"
  argument-hint: "<text | URL | page type description>"
---

# Print

Turn the user's request into a print-ready HTML page. You author the page
**content**; the page **shell** — design tokens, print button, double-click
text editing, paper-size switching, print-fit scaling — ships in `assets/`
(a thin `page_shell.html` plus the `shell/` css+js it links) and is never
authored or retyped, only copied and filled (see `references/assembly.md`).
A bundled local server (`server/`) serves the generated pages and renders
deterministic PDFs with headless Chromium — the same renderer on every
machine.

Everything here runs in your head and your tools — no scripts, no server. That
means you are also the design validator: the self-check in
`references/design-rules.md` is mandatory, not advisory.

## Workflow

### Step 0 — Input & server warm-up

First, warm up the PDF server in the background so the one-time Chromium
download overlaps with authoring instead of stalling Step 7: if
`<skill-dir>/server/node_modules` does not exist and Node is available, start
`npm install` in `<skill-dir>/server` as a **background** task (its
postinstall fetches the pinned Chromium build). Do not wait on it — continue
straight to the input check; Step 7 picks it up. If Node/npm is unavailable,
skip this; Step 7 degrades gracefully.

If there's no input at all, ask: "What would you like to print? Paste text, a
URL, or describe the page you want."

If the request contains an image URL (ends in `.jpg`/`.jpeg`/`.png`/`.webp`/
`.gif`), it's a reference image: view it (Read/WebFetch) before designing, and
design from what you saw, not from the URL string.

### Step 1 — Classify

Two independent decisions:

**Page type.** Match the request against the routing table at the top of
`references/page-types.md` (first match wins), then read that type's section for
its functional requirements and default styling.

**Themed?** The request is themed when it asks for a visual identity: "in the
theme/style of X", "styled like/as X", "themed like/as X", "X-themed" (a
concrete word before "-themed"), or "in a/an X style". It is NOT themed for
phrases that merely refer to a theme — "keep the theme", "this theme", "the same
style", "the default style". Judge from the request text plus any separate style
instructions the user gave.

If themed: open `references/themes/README.md`, match the trigger phrases, and
load the **one** matching spec — or follow its ad-hoc theme checklist when
nothing matches. A themed request **drops the page type's default styling
entirely**; only its functional requirements survive (they're marked in each
type's section). The theme, not the type, governs everything visual.

### Step 2 — Gather content

Fetch live data you cannot know — today's scores, current news, live weather,
real-time prices — with WebFetch/WebSearch. **Never fabricate live data.** For
content you know well (riddles, recipes, activities, trivia, layouts), skip
fetching and write it directly.

### Step 3 — Author

Read `references/design-rules.md` (Part A) before writing any CSS,
`references/principles.md` for the layout and typography craft (rank
multi-item content, design empty states, set type properly, size the layout to
the content), and `references/print-fundamentals.md` when physical exactness
matters (paper size, DPI, margins). Produce these channels:

| Channel | Notes |
|---|---|
| `content_html` | The page content. It is inserted inside `<div class="page">` — no wrapper, no footer, no `<html>`/`<head>`/`<body>`. Wrap each top-level block in `<div data-mp-section="...">` (see design rules). Use `var(--color-*)` / `var(--font-*)` tokens everywhere. |
| `custom_css` | Optional. `:root` token overrides + content-specific rules. |
| `font_import` | Optional. Google Fonts URL — required whenever you name any font beyond Playfair Display / Source Serif 4 / Inter. |
| `paper` | `landscape`, `a4`, `legal`, `half`, or empty (= letter portrait). The ONLY orientation mechanism. |
| `title` | Page title; also becomes the filename. |
| `answer_key_html` | Worksheets with an answer key only; otherwise empty. Never author the key as a second page inside `content_html`. |

### Step 4 — Self-check

Run the full Part B checklist in `references/design-rules.md` against your
`custom_css`, `font_import`, and inline styles. Fix everything it catches and
re-run the whole list. If it still fails after two fix passes, **degrade** per
Part C: drop `custom_css` + `font_import` (keep content, paper, answer key) and
say so in your report.

### Step 5 — Assemble

Follow `references/assembly.md` exactly: copy `assets/page_shell.html` to
`<slugified-title>.html`, then make the anchored insertions — nested-sheet CSS
(two-sheet only), font `<link>`, `custom_css` into
`<style id="content-overrides">`, `applySize('<paper>')` before `</body>`, and
finally replace `<!-- CONTENT -->` with your content. Copy the shell with `cp`
— never retype it.

### Step 6 — Verify

Run the grep checks listed at the end of `references/assembly.md` against the
written file (no leftover `<!-- CONTENT -->`, shell intact, anchors in order).
Fix in place if anything fails.

### Step 7 — Serve

Make the page reachable at `http://127.0.0.1:4949/<file>.html`:

1. Probe `GET http://127.0.0.1:4949/healthz` — if it answers with
   `"print-skill-server"`, the server is already up; done.
2. Otherwise start it in the background from the skill directory:
   `node <skill-dir>/server/server.mjs --dir <output-dir> --port 4949`.
   If the Step 0 background `npm install` is still running, wait for it to
   finish first; if it was skipped or failed, run `npm install` in
   `<skill-dir>/server` now (its postinstall fetches the Chromium build).
3. If Node is unavailable or the install fails, skip serving — the generated
   file still works opened directly in a browser (native print dialog instead
   of the rendered PDF). Say so in the report rather than failing the task.

### Step 8 — Report

- The page URL (`http://127.0.0.1:4949/<file>.html`) and the file path, plus
  the page title
- One sentence on what was generated
- Remind: "Open the link — double-click any text to edit it, then click
  **Print / Save PDF** for an exact PDF. For font or color changes, ask me to
  regenerate the page with new style instructions."
- If the server couldn't run: give the file path, note that Print / Save PDF
  uses the browser's print dialog, and mention Node 18+ enables the exact-PDF
  server.

## Editing an existing page

When the user asks for changes to a page you already generated ("make the
title bigger", "change the font", "add a row"), edit the existing file in
place — don't regenerate from scratch:

- **Text or layout tweaks**: Edit the content inside `<div class="page">`
  directly.
- **Style changes**: edit the CSS inside `<style id="content-overrides">` (and
  the font `<link>` if the font changes). Any CSS change means re-running the
  full self-check (design-rules.md Part B) against the updated styles before
  saving.
- **Structural changes** (different page type, different orientation,
  rethinking the layout): re-author the content channels and re-assemble from
  the shell instead of patching.

Keep the same filename so the user's link stays valid, and re-run the Step 6
verification greps after any edit. Never touch the shell's own markup or
script — only content and content-overrides.

A page open in the browser via the local server refreshes itself within a
couple of seconds of the file changing on disk (the shell polls the server's
ETag) — after an edit, tell the user the open page has updated; don't ask
them to refresh.

## Scope notes

- **Puzzles are presentation-only.** This skill formats mazes, word searches,
  crosswords, and sudoku beautifully, but nothing verifies puzzle correctness —
  prefer user-supplied puzzle content, and say so when you generate it yourself
  (see the puzzle note in `references/page-types.md`).
- **One request, one file.** Multi-document requests are separate runs of this
  workflow.
