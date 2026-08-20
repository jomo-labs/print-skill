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
button, edit mode, paper-size switching, WYSIWYG print geometry) are
never authored or retyped, only copied and filled (see
`references/assembly.md`). The generated file is a pure document: all chrome
is injected at runtime by the shell scripts, so shell updates apply to
already-generated pages automatically. Chrome and document are also isolated
from each other — the chrome renders inside a shadow root with its own tokens,
so nothing you write in `custom_css` (a theme's `:root` override included) can
reach the toolbar or the edit overlay. Style the page freely; the
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

First, warm up the PDF server in the background so the one-time Chromium
download overlaps with authoring instead of stalling Step 7: if
`<skill-dir>/server/node_modules` does not exist and Node is available, start
`npm install --prefix <skill-dir>/server` as a **background** task (its
postinstall fetches the pinned Chromium build). Use `--prefix` rather than
`cd`-ing into the skill: a shell whose cwd persists between commands would
still be sitting there at Step 7, where the served root is resolved. Do not wait on it — continue
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

If the page needs **line art derived from a photograph** (coloring page, image
page, drawing prompt — and only those), produce it now: check for an image
backend per `references/harness-support.md` Part 2, generate, then run the
normalize pass and both checks from the **Image block** entry in
`references/page-types.md`. With no backend available, hand-author the art as
stroked SVG (design rule 1a) and say so in the report — the page still gets
made either way.

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
| `title` | Page title; also becomes the filename. |
| `answer_key_html` | Worksheets with an answer key only; otherwise empty. Never author the key as a second page inside `content_html`. |

**Fit one sheet.** Size the content to the paper before you write it (Principle
VII, and the content-box dimensions in `references/page-types.md`): count the
steps, items or rows and pick a layout that holds them. If the content genuinely
will not fit, author the further sheets **explicitly** — the two-sheet form in
`references/assembly.md` — and decide what lands on each, so every sheet reads
as complete.

Never leave it to the shell. Content that outgrows its sheet is continued onto
another one at runtime rather than being lost, but the shell breaks where the
content ran out of room, not where the design wanted a break. Step 6 checks for
exactly that, and a page that trips it is not finished.

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
data attributes (`data-mp-paper`, `data-mp-orientation`) when
paper/orientation are set, and finally replace
`<!-- CONTENT -->` with your content. Use the given commands — never retype
template or stylesheet.

### Step 6 — Verify

Run the grep checks listed at the end of `references/assembly.md` against the
written file (no leftover `<!-- CONTENT -->`, shell intact, anchors in order).
Fix in place if anything fails.

Then check that the content fits the sheets you laid out:

```
node <skill-dir>/server/fit-cli.mjs out/<file>.html
```

It loads the page exactly as the browser and the PDF renderer do and reports
what the shell had to do. Exit 0 means the content fits as authored. Exit 1
means it does not, and says how:

- *authored N sheets, content needs M* — the shell had to continue the content
  onto sheets you did not lay out. Nothing is lost and all M sheets print, but
  the breaks are accidents. Cut or tighten the content to fit N, or author the
  M sheets and place the breaks yourself. Re-run until it passes.
- *content too tall to place on any sheet* — one block is taller than the paper.
  It hangs past the edge and **prints clipped**. Always fix this: split the
  block, shorten it, or give it its own sheet.
- *content is cut off inside N containers* — content outgrew a fixed-size
  container. Containers clip rather than overlap (the document stylesheet sets
  `overflow: clip` on structural containers — on paper, overlap is never
  right), so whatever is past the clip edge **does not print at all**. The
  check lists each container's selector in the file's authored flow. Always
  fix this: shorten the content, or size the container for it.

Needs Node 18+ and the Step 0 `npm install`; if Node is unavailable, say in the
report that the fit check could not run.

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
   Give `--dir` as an **absolute** path: a shell that ran the Step 0
   `npm install` is still sitting in `<skill-dir>/server`, and a relative
   `out` resolves there instead of in the project. The server refuses to
   start on a root inside the skill and says so — re-run with the absolute
   path rather than reading the pages back out of the skill directory.
   If the Step 0 background `npm install` is still running, wait for it to
   finish first; if it was skipped or failed, run
   `npm install --prefix <skill-dir>/server` now (its postinstall fetches the
   Chromium build).
3. A running server is all live editing needs — there is nothing to connect
   or arm (see "Live mode"). Whether you started it just now or reused one
   that was already up, you are done. One exception, and it is about where
   YOU are running rather than anything you did: if the user's browser cannot
   reach your loopback (cloud sandboxes — see
   `references/harness-support.md` Part 1), the URL is useless to them. Report the
   file path instead, and say the page prints correctly opened directly.
4. If Node is unavailable or the install fails, skip serving — the generated
   file still works opened directly in a browser as a **plain printable**
   (styled and print-exact via the browser dialog; no toolbar, editing, or
   live connection — those are server-injected chrome). Say so in the report
   rather than
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
- Add: "Press **Edit** to change text right on the page, or double-click
  anything and tell me here what to do with it — I'll know what you picked."
  Don't explain the mechanism.
- If the server couldn't run: give the file path, note the file is a plain
  printable (print via the browser dialog; no editing without the server),
  and mention Node 18+ enables the exact-PDF server and the full editing
  chrome.

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

`fit-cli.mjs` (Step 6) is the gate to run before either: it exits non-zero when
the content did not fit the sheets the page lays out, so a pipeline can stop on
an accidental page break instead of shipping it. (An open page checks the same
thing continuously, and in live mode offers the user a FIX button that sends
you a `kind: "fit"` event — see "A fit problem arrives".)

Both need Node 18+ and the Step 0 `npm install`. There is no dialog fallback
without a human: if Node is unavailable, report the HTML path and say the PDF
step needs Node 18+. In this mode Step 7 is optional, and the Step 8 report
changes — give the PDF path (plus the HTML path and title), skip the
open-the-link reminder, and hand the PDF to whatever the request says comes
next (save, upload, attach).

Nothing extra is needed to stand down: live editing has no session to leave
and nothing running in the background, so a pipeline run simply ends at the
PDF.

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
markup, injected `applySize` script lines, a `data-mp-live-edit` body
attribute (a flag the shell no longer reads), or relative
`shell/*` links — leave all of it alone: the server serves shell files from
the skill's own assets, the current shell removes and replaces old chrome at
load, and the next browser-edit save cleanses the file automatically. A
leftover `<outdir>/shell/` directory from an older version can be deleted
whenever no `file:`-opened legacy page still needs it.

A page open in the browser via the local server refreshes itself within a
couple of seconds of the file changing on disk (the shell polls the server's
ETag) — after an edit, tell the user the open page has updated; don't ask
them to refresh. In a live session the refresh is exact rather than
merely quick: bracketing the edit with `status working` / `status done` (see
"Handling a message") holds the preview across your writes and refreshes it
the moment you report done.

Sync runs the other way too: text edits the user makes in the browser are
saved back into the file when committed. So the file may have changed since
you wrote it — always Read the current file before editing, and never
regenerate it from memory of what you generated (that would silently discard
the user's own edits).

## Live mode

While the local server is running, the page and you share a few small facts.
**The page records what the user has selected** and **when it has stopped
fitting its sheets**, and you read those when you need them. **You post
`working`/`done` around an edit**, so their tab doesn't flash a half-written
file at them. That is the whole of it.

There is nothing to connect to and nothing to keep running. No listener, no
background task, no watcher to arm or re-arm — selecting is not an event you
are woken for, it is state you look up at the moment it matters. That moment is
always the same one: the user asks for a change and doesn't say what it is
about.

There is no chat in the page either. The user asks you for changes **here, in
this conversation**, where they already are. The page's job is to show them the
printable and let them point at parts of it; yours is everything else. They can
see that pointing worked — the element is outlined, and the toolbar says their
selection is on record — so you do not need to acknowledge it, and should not.

All commands are `node <skill-dir>/server/chat-cli.mjs …` against the running
server (Step 7), with `--url` pointing at its actual port.

### When a request doesn't name its target

"Make it bigger." "Shorter." "Move this up." "Can that be bold?" — a request
that points rather than names is about whatever they have selected in the
browser. Read it:

```
node <skill-dir>/server/chat-cli.mjs selection --url http://127.0.0.1:<port>
```

One line per page that has something selected, newest first:

```
Title was selected.  [/chart.html #probe "Weekly Chore Chart"]
NO_SELECTION
```

The bracket is what you act on: the page, then the selector. Take the newest
line unless the request clearly means another page.

- **`NO_SELECTION`** means they haven't pointed at anything. Ask which element
  rather than guessing.
- **A named target always wins.** "The title", "every heading" — the selection
  is a fallback for requests that don't say, not an override for ones that do.
- **Don't read it when you don't need it.** A request that names its own target
  doesn't need a lookup, and neither does a fresh generation.
- **Don't announce the lookup**, and don't repeat what is selected back to
  them. They are looking at the outline on the page; they know. Say what you
  changed, once, after you change it.

### A page that stops fitting

A page records it when it no longer fits the sheets it lays out — because the
user's own browser edit outgrew a sheet, because they switched to smaller
paper, or because it never fitted in the first place — and when content is cut
off inside a clipping container (containers clip rather than overlap; what is
past the clip edge does not print). Read it the same way you read a selection:

```
node <skill-dir>/server/chat-cli.mjs fit --url http://127.0.0.1:<port>
```

```
/menu.html content runs onto 3 sheets  [authored 1, rendered 3, overflowing 0, letter portrait]
/todo.html content is cut off in 1 place  [authored 1, rendered 1, overflowing 0, clipped 1, letter portrait]
    clipped: #page > div:nth-of-type(2)
EVERYTHING_FITS
```

The `clipped:` lines are the page's own hints: each is the selector, in the
file's authored flow, of a container whose content exceeds its clip edge (the
same containers wear a red dashed outline in the browser). Go straight to
those elements — shorten their content or size them for it — rather than
re-deriving what the page already measured.

**A fit report only exists because the user pressed FIX.** Their toolbar
states the problem in red and offers the button; nothing reaches the record
until they press it. The press also copies **`/print fix`** to their
clipboard and tells them to paste it to you — that message is the button
reaching you, since nothing else can. So treat `/print fix` (or any paste of
it inside a longer message) as exactly this: **read the fit record now and
fix every page on it**, without asking what is wrong — the record has the
details. An entry you find by any other route is the same request that has
not managed to reach you yet; fix it the same way.

**Check the record after your own edits land** — every time, as the last step
of "Editing the page" below. Your edit is the likeliest thing to have broken
the fit, and if it did, they will press the button and be waiting. Check it
too at the start of any turn where a server is up: the press may have
happened after your last turn ended, and the paste is only the loudest way
the request travels, not the only one.

Unlike a selection, **this one is a request to edit.** So fix it, without
waiting to be asked again:

1. Follow "Editing the page" below — `status <page> working`, read the file,
   fix, `status <page> done`. The `done` refreshes their tab, and the refreshed
   page re-measures itself: fixed means the red line disappears on its own and
   the page takes its own report back. Nothing else clears it.
2. Fix it the way the page type wants it fixed (`references/page-types.md`,
   `principles.md` VII): tighten the content back onto the sheet it was
   authored for, or lay the further sheets out **on purpose** — the problem is
   never the extra sheet itself, it is a break nobody designed. `overflowing`
   above 0 is the sharper one: that content is past the paper edge and prints
   clipped. `clipped` above 0 is just as sharp and comes with addresses: the
   report's `clipped:` lines name each container whose content is cut off at
   its clip edge — that content does not print — so edit those elements
   directly.
3. Say one line here about what you changed, as with any other edit. If you
   could not fix it, say that instead — the user is looking at a red line, and
   silence reads as nobody having noticed.

A page that still doesn't fit after your edit puts the button back rather than
re-sending itself, so say what stopped you — otherwise they are looking at a
red line and a button that did nothing.

**What this does not do is interrupt you.** Nothing pushes a fit report at you
mid-turn: a press lands in the record and waits there until you look. That is
the cost of having nothing running in the background, and the reason the fit
check at the end of "Editing the page" is not optional — a user who pressed
FIX while you were elsewhere is owed the check.

### Editing the page

Apply the request per "Editing an existing page", bracketed so the open tab
doesn't show a half-written file:

1. `status <file>.html working` — **before you touch the file**. It holds the
   tab's auto-reload and lights its indicator. Re-post it with a short note
   (`status <file>.html working "restyling the header"`) to extend the hold on
   a long edit; the note becomes the indicator's tooltip.
2. **Read the current file from disk** — never edit from memory. The user's own
   browser edits and their `data-mp-edited` markers live in it, and the
   selector points into it. For a sweep of everything they edited:
   `edits <file>.html`.
3. Apply the change (same self-check rules for CSS, same Step 6 greps), and
   strip the `data-mp-edited` markers you addressed — the marker means "not yet
   seen by the model".
4. `status <file>.html done` — always, and only once the file is final: that is
   what refreshes the open tab. Leaving a working status open holds their
   preview until it times out. Then say in one line what you changed.
5. **Check the fit** (`fit`, above). Your edit is the likeliest thing to have
   pushed the content off its sheets, and nothing will tell you if it did.

If the server has stopped, `selection` and `status` will say so. Restart it
(Step 7, same `--dir`) and carry on; there is no session to re-establish.

## Scope notes

- **Puzzles are presentation-only.** This skill formats mazes, word searches,
  crosswords, and sudoku beautifully, but nothing verifies puzzle correctness —
  prefer user-supplied puzzle content, and say so when you generate it yourself
  (see the puzzle note in `references/page-types.md`).
- **One request, one file.** Multi-document requests are separate runs of this
  workflow.
