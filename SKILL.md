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

**Live-mode invocation short-circuits everything**: if the request is `live`
(`/print live`) or an ask in words to go live / connect to the page,
skip the generation workflow entirely and follow "Live mode" below. You
normally connect on your own at the end of Step 8, so this is re-entry after
you signed off, or a user asking you to reconsider a page you judged
unsupported.

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
3. A running server is what live mode is: if you can run the listen loop,
   you should be listening on it (see "Live mode"). That holds whether you
   started the server just now or reused one that was already up. Arm the
   loop at the end of the turn, after the Step 8 report — never here, or the
   report never gets written.
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
- If you can run the listen loop (`references/harness-support.md`), add:
  "Press **Edit** to change text right on the page, or double-click anything
  and tell me here what to do with it — I'm connected to the page, so I'll
  know what you picked." If you can't, add: "Press **Edit** to change text
  right on the page, and tell me here what else you'd like changed." Don't
  explain the mechanism either way.
- If the server couldn't run: give the file path, note the file is a plain
  printable (print via the browser dialog; no editing without the server),
  and mention Node 18+ enables the exact-PDF server and the full editing
  chrome.
- **Then connect**, unless this is a headless/pipeline run: go straight into
  "Live mode" below — announce presence, arm the listen loop, end your turn.
  Not a question to ask the user; the page is served and you are the model
  it is served for.

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

**Never enter live mode here.** Connecting by default is for a person who is
about to open the page; in a pipeline there is nobody at a browser, and a
listen loop would keep waking a run that should have ended at the PDF.

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

While the local server is running, you can be **connected to it**: you learn
which element the user has just selected in whatever page they have open and
when a page has stopped fitting its sheets, and their page learns when you are
mid-edit so it doesn't flash a half-written file at them.

**You connect to the server, not to a page.** One listener covers every page
it serves — the one you just generated, one from earlier in the conversation,
one made after you started listening. Each event tells you which page it came
from. So there is never a page to choose before connecting, and never a reason
to wait until a particular page is "in play".

There is no chat in the page. The user asks you for changes **here, in this
conversation** — where they already are, and where your answer was going to
appear anyway. The page's job is to show them the printable and let them point
at parts of it; yours is everything else.

It is on by default: whenever the server is up and your harness can run the
listen loop (`references/harness-support.md`), you connect. At the end of a
generation run, after restarting a crashed server, in any later turn that
brings one up — **including a turn whose only job was to start the server.**
"They only asked me to restart it" is not a reason to leave it unwatched:
starting the server and being reachable on it are one act, and a server nobody
is listening to silently drops everything the user does in the browser.

All commands are `node <skill-dir>/server/chat-cli.mjs …` against the running
server (Step 7), with `--url` pointing at its actual port. `wait` takes no
page. The commands that do — `status`, `edits` — take the page's server path
(`<file>.html` under the out/ layout), which is the `page` field of the event
you are responding to, or the page you just wrote.

### Connecting

1. Ensure the server is up (Step 7 probe). No server, no live mode.
2. Run the decision in `references/harness-support.md` — the reachability
   gate, then the ladder. It is a fact about your harness, not about the page.
   If it fails, say so once, plainly, and carry on: everything else about the
   page still works, and the user can still ask you for changes here.
3. Arm the listen loop at the **highest rung your harness supports**:
   - **(a) Stream/monitor** — run `wait --follow` under a tool that streams
     its output back to you; each NDJSON line is an event.
   - **(b) Background + wake** — run `wait --timeout 240` as a background task
     and **end your turn**. The completion notification wakes you: handle
     whatever arrived, then arm the next one.

   No page argument in either. Never loop foreground `wait` commands; a
   harness that can do nothing else does not support live mode at all.
4. If you have just generated or edited a page, post `status <file>.html idle`
   so that page's indicator goes live at once. Otherwise there is nothing to
   post — a page shows itself as connected on its next poll either way.

### Staying quiet

**Connecting is not news, and neither is waiting.** The user is looking at the
page, not at this conversation.

- Say **nothing** when you arm or re-arm the loop. Not "Listening", not
  "Still listening", not "Waiting for changes", not a note that you are going
  to keep watching. An empty wake produces **no output at all** — re-arm and
  end the turn silently.
- Never count wakes, never announce a countdown, and never explain the
  mechanism. There is no idle cap: quiet is the normal state of a page
  someone is reading.
- The one exception is the first connect in a generation run, where a single
  clause in the Step 8 report ("I'm connected to the page") tells the user
  the loop is running at all.

The only things worth writing here are: what a user selected (below), what you
changed and why, and anything that blocked you.

### A selection arrives

`wait` delivers `kind: "selection"` entries. Each carries the `page` it came
from plus `data.selector`, `data.snapshot` and `data.edited` — or
`data.selector: null` when the user cleared it. It means the user
double-clicked something in that page. It is **never a request to edit**:
don't touch the file, don't post a status.

Do two things:

1. **Say one short line in this conversation** naming the element the way the
   user would — from `data.snapshot`, not from the selector: "Looking at the
   subtitle." / "Got the Saturday row." That line is the whole point: it is
   how they know you are looking where they are looking, and it belongs here,
   in front of them, not on the page.
2. **Hold it as the subject**, along with the page it is on. Their next
   message will usually not name what it is about — "make it bigger",
   "shorter", "move this up" — and it means that element, in that page. It
   stays the subject until they select another or clear it, so a whole run of
   requests can be about the same one.

Then go back to listening, silently.

- **Newest wins.** If a batch carries several (they hunted around while you
  were busy), only the last counts.
- **`selector: null`** means nothing is selected: drop the subject, and if a
  later bare "make it bigger" arrives, ask which element.
- **Don't re-acknowledge** the same element. You are told again only when the
  selection actually changed.
- **An explicitly named target always wins.** "the title", "every heading" —
  the selection is a default, not a lock.

### A fit problem arrives

When a page stops fitting the sheets it lays out — because the user's own
browser edit outgrew a sheet, because they switched to smaller paper, or
because it never fitted in the first place — their toolbar says so in red and
puts a **FIX** button next to the message. `wait` delivers a `kind: "fit"`
entry when they press it. `data` carries
`{authored, rendered, overflowing, paper, orientation}`.

Unlike a selection, **this one is a request to edit**, and an explicit one: the
layout is yours, not theirs, so pressing that button is them handing it over.
The line then reads `content runs onto 3 sheets … fixing` with the indicator
pulsing. Something has to happen at the other end of that.

So fix it, the moment it arrives, without waiting to be asked again:

1. Follow "Editing the page" below — `status <page> working`, read the file,
   fix, `status <page> done`. The `done` is what refreshes their tab, and the
   refreshed page re-measures itself: fixed means the red line disappears on
   its own. Nothing else clears it.
2. Fix it the way the page type wants it fixed (`references/page-types.md`,
   `principles.md` VII): tighten the content back onto the sheet it was
   authored for, or lay the further sheets out **on purpose** — the problem is
   never the extra sheet itself, it is a break nobody designed. `overflowing`
   above 0 is the sharper one: that content is past the paper edge and prints
   clipped.
3. Say one line here about what you changed, as with any other edit.

A page that still doesn't fit after your edit puts the button back rather than
re-sending itself, so say what stopped you — otherwise they are looking at a
red line and a button that did nothing.

### Editing the page

The request comes from the user, here. Apply it per "Editing an existing
page", bracketed so the open tab doesn't show a half-written file:

1. `status <file>.html working` — **before you touch the file**. It holds the
   tab's auto-reload and lights its indicator. Re-post it with a short note
   (`status <file>.html working "restyling the header"`) to extend the hold on
   a long edit; the note becomes the indicator's tooltip.
2. **Read the current file from disk** — never edit from memory. The user's
   own browser edits and their `data-mp-edited` markers live in it, and the
   selection's `data.selector` points into it. For a sweep of everything they
   edited: `edits <file>.html`.
3. Apply the change (same self-check rules for CSS, same Step 6 greps), and
   strip the `data-mp-edited` markers you addressed — the marker means "not
   yet seen by the model".
4. `status <file>.html done` — always, and only once the file is final: that
   is what refreshes the open tab. Leaving a working status open holds their
   preview until it times out. Then confirm in one line here, and resume
   listening.

### Disconnecting

Live mode ends when the server dies (exit 2 from any `wait` — restart it and
re-arm in the same turn), when the session ends, or when the user asks you to
stop. Nothing else ends it, and none of those need a paragraph: a line when
something actually broke, silence otherwise.

## Scope notes

- **Puzzles are presentation-only.** This skill formats mazes, word searches,
  crosswords, and sudoku beautifully, but nothing verifies puzzle correctness —
  prefer user-supplied puzzle content, and say so when you generate it yourself
  (see the puzzle note in `references/page-types.md`).
- **One request, one file.** Multi-document requests are separate runs of this
  workflow.
