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
**content**; the document template (`assets/page_template.html`) and the
**shell chrome** it links (`assets/shell/` css+js — design tokens, print
button, edit mode with chat, paper-size switching, WYSIWYG print geometry) are
never authored or retyped, only copied and filled (see
`references/assembly.md`). The generated file is a pure document: all chrome
is injected at runtime by the shell scripts, so shell updates apply to
already-generated pages automatically. Chrome and document are also isolated
from each other — the chrome renders inside a shadow root with its own tokens,
so nothing you write in `custom_css` (a theme's `:root` override included) can
reach the toolbar, edit overlay, or chat panel. Style the page freely; the
chrome is not yours to style, and you cannot break it by accident.
A bundled local server (`server/`) serves the generated pages and renders
deterministic PDFs with headless Chromium — the same renderer on every
machine, driven by the page's Print button or fully headless for automated
pipelines (see "Headless / pipeline use").

Everything here runs in your head and your tools — no scripts, no server. That
means you are also the design validator: the self-check in
`references/design-rules.md` is mandatory, not advisory.

## Workflow

### Step 0 — Input & server warm-up

**Live-mode invocation short-circuits everything**: if the request is `live`
(`/print live`) or an ask in words to go live / connect to the page's chat,
skip the generation workflow entirely and follow "Live mode (`/print live`)"
below.

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

**Themed?** The request is themed when it names a visual identity: "in the
theme/style of X", "styled/themed like X", "X-themed", "in an X style", and the
bare noun forms "X theme" / "X style" ("batman theme", "art deco style"). What
matters is a concrete subject beside the word — character, place, era, genre,
brand, material, mood. It is NOT themed when only a determiner or back-reference
precedes it ("keep the theme", "the same style"). Judge from the request plus
any separate style instructions.

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

Read `references/design-rules.md` — its platform invariants (what every page
inherits and no theme overrides) and Part A — before writing any CSS,
`references/principles.md` for the layout and typography craft (rank
multi-item content, design empty states, set type properly, size the layout to
the content), and `references/print-fundamentals.md` when physical exactness
matters (paper size, DPI, margins). Produce these channels:

| Channel | Notes |
|---|---|
| `content_html` | The page content. It is inserted inside `<div class="page">` — no wrapper, no footer, no `<html>`/`<head>`/`<body>`. Wrap each top-level block in `<div data-mp-section="...">` (see design rules). Use `var(--color-*)` / `var(--font-*)` tokens everywhere. |
| `custom_css` | Optional. A `:root` token override block + content rules consuming those tokens. Token set: the section-to-token map in `references/themes/theme-spec-template.md`. |
| `font_import` | Optional. Google Fonts URL — required whenever you name any font beyond Playfair Display / Source Serif 4 / Inter. |
| `paper` | Size only: `a4`, `legal`, `half`, or empty (= letter). |
| `orientation` | `landscape` or empty (= portrait). Independent of `paper` — any size×orientation combination works. The ONLY orientation mechanism. |
| `live_edit` | `yes` or empty. Decide per `references/harness-support.md`: `yes` only if the user's browser can reach the local server (reachability gate — cloud sandboxes fail this) AND your harness can run the bounded listen loop (capability ladder). Unknown harness: apply the ladder, don't guess from the name. Empty = the page's Chat panel runs in manual copy/paste mode. |
| `title` | Page title; also becomes the filename. |
| `answer_key_html` | Worksheets with an answer key only; otherwise empty. Never author the key as a second page inside `content_html`. |

### Step 4 — Self-check

Run the full Part B checklist in `references/design-rules.md` against your
`custom_css`, `font_import`, and inline styles. Fix everything it catches and
re-run the whole list. If it still fails after two fix passes, **degrade** per
Part C: drop `custom_css` + `font_import` (keep content, paper, answer key) and
say so in your report.

### Step 5 — Assemble

Follow `references/assembly.md` exactly: produce `<slugified-title>.html`
from `assets/page_template.html` with the step-1 sed (it inlines the document
stylesheet — the generated file is fully self-contained, no sidecar), then
make the anchored insertions — nested-sheet CSS (two-sheet only), font
`<link>`, `custom_css` into `<style id="content-overrides">`, the `<body>`
data attributes (`data-mp-paper`, `data-mp-orientation`, `data-mp-live-edit`)
when paper/orientation/live_edit are set, and finally replace
`<!-- CONTENT -->` with your content. Use the given commands — never retype
template or stylesheet.

### Step 6 — Verify

Run the grep checks listed at the end of `references/assembly.md` against the
written file (no leftover `<!-- CONTENT -->`, shell intact, anchors in order).
Fix in place if anything fails.

### Step 7 — Serve

Make the page reachable at `http://127.0.0.1:<port>/<file>.html`. The served
root is `<cwd>/out` — the assembly output directory — so one server covers
every page this project generates.

1. Probe ports 4949–4958 with `GET http://127.0.0.1:<port>/healthz`. An
   answer naming `"print-skill-server"` whose `dir` equals `<cwd>/out` is
   this project's server — reuse it (note its port); a healthy server with a
   **different** `dir` belongs to another project — leave it alone and keep
   probing.
2. If none matched, start one **in the background** (never foreground — some
   harnesses kill foreground commands at 30s, taking the server down):
   `node <skill-dir>/server/server.mjs --dir <cwd>/out --port 4949 --auto-port`.
   `--auto-port` walks to the next free port when 4949 is taken; the startup
   line prints the URL it actually bound — read it, don't assume 4949.
   If the Step 0 background `npm install` is still running, wait for it to
   finish first; if it was skipped or failed, run `npm install` in
   `<skill-dir>/server` now (its postinstall fetches the Chromium build).
3. If Node is unavailable or the install fails, skip serving — the generated
   file still works opened directly in a browser as a **plain printable**
   (styled and print-exact via the browser dialog; no toolbar, editing, or
   chat — those are server-injected chrome). Say so in the report rather than
   failing the task; this fallback is the one case where the report hands out
   a file path.

### Step 8 — Report

- The page URL (`http://127.0.0.1:<port>/<file>.html`) and the page title.
  **URL only — never the out/ file path.** Users open the link (which carries
  the editing chrome), not the file. Mention the path only if the user asks
  for it, is debugging, or wants the standalone printable file itself.
- One sentence on what was generated
- Remind: "Open the link — double-click any text to edit it (edits save into
  the file automatically), then click **Print / Save PDF** for an exact PDF.
  For font or color changes, ask me to regenerate the page with new style
  instructions."
- If `live_edit` was `yes`, add: "Press **Edit** on the page to edit text and
  open the chat panel — send me `/print live` and I'll connect to it, so you
  can request changes right from the page." If not, add: "Press **Edit** on
  the page to edit text and open the chat panel, which turns your requests
  into instructions you can copy and paste back to me — and if you send me
  `/print live`, I'll check whether live chat can work in this setup and
  connect if it can."
- If the server couldn't run: give the file path, note the file is a plain
  printable (print via the browser dialog; no editing/chat without the
  server), and mention Node 18+ enables the exact-PDF server and the full
  editing chrome.

## Headless / pipeline use

Nothing in this workflow needs a human at a browser: authoring, assembly, and
verification (Steps 0–6) are entirely yours, and the PDF renders without
anyone clicking **Print / Save PDF**. When the output is destined for an
automated consumer — a pipeline stage, a print/mail job, another agent, or the
user asked for "a PDF file" rather than a page to open — produce the PDF
directly after Step 6:

- **One-shot, no running server** (preferred in pipelines):
  `node <skill-dir>/server/render-cli.mjs out/<file>.html [<out>.pdf]`
  — serves the page's directory on an ephemeral loopback port, renders it
  with the same headless Chromium as the interactive path, writes the PDF
  (default: next to the HTML), prints the output path on stdout, and exits.
- **Against the running server** (Step 7 already done):
  `curl -fsS -o <file>.pdf http://127.0.0.1:<port>/pdf/<file>.html`

Both need Node 18+ and the Step 0 `npm install`. There is no dialog fallback
without a human: if Node is unavailable, report the HTML path and say the PDF
step needs Node 18+. In this mode Step 7 is optional, and the Step 8 report
changes — give the PDF path (plus the HTML path and title), skip the
open-the-link reminder, and hand the PDF to whatever the request says comes
next (save, upload, attach).

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
verification greps after any edit. Never touch the shell's own script or css —
only content and content-overrides.

Pages generated by older skill versions may still contain baked-in chrome
markup, injected `applySize`/`setLiveEditSupported` script lines, or relative
`shell/*` links — leave all of it alone: the server serves shell files from
the skill's own assets, the current shell removes and replaces old chrome at
load, and the next browser-edit save cleanses the file automatically. A
leftover `<outdir>/shell/` directory from an older version can be deleted
whenever no `file:`-opened legacy page still needs it.

A page open in the browser via the local server refreshes itself within a
couple of seconds of the file changing on disk (the shell polls the server's
ETag) — after an edit, tell the user the open page has updated; don't ask
them to refresh. In a live chat session the refresh is exact rather than
merely quick: bracketing the edit with `status working` / `status done` (see
"Handling a message") holds the preview across your writes and refreshes it
the moment you report done.

Sync runs the other way too: text edits the user makes in the browser are
saved back into the file when committed. So the file may have changed since
you wrote it — always Read the current file before editing, and never
regenerate it from memory of what you generated (that would silently discard
the user's own edits).

## Live mode (`/print live`)

The generated page's chat panel (opened by the page's **Edit** button) can
talk to you through the local server —
but **only when the user asks**. Never enter the listen loop on your own
after generating a page; the panel itself tells the user to send
`/print live` when they want you connected. Messages the user sends before
you connect queue on the server; your first `wait` drains them.

All commands below are `node <skill-dir>/server/chat-cli.mjs …` against the
running server (Step 7), with `--url` pointing at its actual port. The
`<page>` argument is the page's server path — `<file>.html` under the out/
layout. Target page: the page generated in this conversation; if none and
exactly one page is served (GET `/` lists them), use it; otherwise ask
which page.

### Entering

1. Ensure the server is up (Step 7 probe). A page without the
   `data-mp-live-edit` body attribute is NOT a refusal — the flag is an
   assembly-time guess, and the page's chat panel invites `/print live`
   either way. Re-run the decision from `references/harness-support.md`
   now (reachability gate, then the ladder); if it passes, add
   `data-mp-live-edit="1"` to the page's `<body>` tag (one Edit, per
   assembly step 5) and continue. Only if it genuinely fails do you tell
   the user live mode can't work here — and say why (unreachable browser
   vs. no loop support), not just "unsupported".
2. Pick your listen mechanism from the ladder under "Listening" below —
   highest rung your harness supports (details per harness in
   `references/harness-support.md`). Only rung (c) needs the selftest probe
   (`selftest --seconds 20`, falling back to `--seconds 8`) to pick its
   `--timeout`; if even 8 fails, remove the `data-mp-live-edit` attribute
   from the page's `<body>` tag (one Edit) and tell the user live mode
   doesn't work in this harness.
3. Announce presence fast — `status <file>.html idle` — then start listening.
   Tell the user in the harness conversation that you're connected and how to
   stop (`say "done"` in the panel, or just ask here).

### Listening

Use the quietest mechanism your harness offers — **foreground polling is the
last resort, not the default**. A visible loop of `wait` commands reads as
silent background churn to the user watching the conversation:

- **(a) Stream/monitor** — your harness can feed a background command's
  output lines back to you as events: run `wait <page> --follow` in the
  background and react to each NDJSON line. No polling at all.
- **(b) Background + wake** — your harness runs commands in the background
  and notifies you when they exit (e.g. Claude Code's background Bash):
  run `wait <page> --timeout 240` as a background task and **end your
  turn**. The completion notification wakes you — handle any messages, then
  arm the next background wait. Idle cost: one wake per ~4 minutes, nothing
  in the foreground.
- **(c) Foreground bounded loop** — nothing else available: loop
  `wait <page> --timeout <T>` (the selftest-chosen T) in the foreground;
  each run prints a JSON batch or `NO_MESSAGE`; re-run on `NO_MESSAGE`.

Exit 2 from any `wait` means the server died — restart it (Step 7, same
`--dir`) and resume.

### Handling a message

1. `status <file>.html working` — **post it before you touch the file**, not
   just for the animated indicator: it also tells the open tab your edit is
   in flight, so the preview holds still instead of flickering through every
   intermediate write, and refreshes once when you report done. While you
   work, push what's useful for the user to see: re-post `status <file>.html
   working "<short progress note>"` to update the indicator's label as you
   move through stages (each re-post also extends the hold), and use
   `say <file>.html "<message>"` for anything worth keeping in the
   conversation (a finding, a question, a caveat) — it appears as a chat
   bubble immediately, not just at the end.
2. **Read the current file from disk** — never edit from memory. The user's
   browser edits and their `data-mp-edited` markers live in the file, and the
   message may carry element context in `data` (`selector`, `snapshot`,
   `edited`) pointing into it. For a sweep of everything the user edited:
   `edits <file>.html`.
3. Apply the change per "Editing an existing page" (same self-check rules for
   CSS, same Step 6 greps). Strip the `data-mp-edited` attributes you
   addressed as part of the edit — the marker means "not yet seen by the
   model".
4. `say <file>.html "<one-line confirmation>"`, then `status <file>.html done`
   — that one is what refreshes the open tab, so post it only once the file
   is final, and always post it: leaving a working status open holds the
   preview until it times out. Then resume listening.

### Exiting — mandatory caps

- After **~15 minutes with no messages** (rung (c): 15 consecutive
  `NO_MESSAGE` rounds at T=20; rung (b): ~4 empty wakes at `--timeout 240`),
  or when a chat message just says done/stop/that's all: post a sign-off
  (`say`), then `status <file>.html idle`, leave the loop, and report back
  in the harness that chat is paused and `/print live` reconnects. Mention
  that messages sent meanwhile will queue.
- Anything the user asks in the harness conversation itself always outranks
  the loop — answer it; re-enter live mode only if they want it.

## Scope notes

- **Puzzles are presentation-only.** This skill formats mazes, word searches,
  crosswords, and sudoku beautifully, but nothing verifies puzzle correctness —
  prefer user-supplied puzzle content, and say so when you generate it yourself
  (see the puzzle note in `references/page-types.md`).
- **One request, one file.** Multi-document requests are separate runs of this
  workflow.
