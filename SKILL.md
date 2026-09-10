---
name: print
description: "Convert anything into a beautifully formatted, print-ready HTML page using the magicprint design system. Handles content reformatting (text, URLs, notes, data) and structured printable forms (dashboards, calendars, worksheets, chore charts, scorecards, certificates, word searches, mazes, comic strips, drawing pages, activity pages for kids). Use when asked to 'print', 'make printable', 'format for print', 'weekly calendar', 'daily dashboard', 'worksheet', 'something for the fridge', 'chore chart', 'certificate', 'word search', 'maze', 'comic strip', 'drawing page', 'activity page', or 'coloring page'."
license: Apache-2.0
compatibility: Node 18+ recommended for the bundled local page server and PDF renderer (optional — without it, pages print via the browser dialog)
allowed-tools: Read Write Edit Bash WebFetch AskUserQuestion
metadata:
  version: "1.0.0"
  argument-hint: "<text | URL | page type description>"
---

# Print

Turn the user's request into a print-ready HTML page. You author the page
**content** and fill the document template yourself; the template
(`assets/page_template.html`) and the **shell chrome** it links
(`assets/shell/`) are copied and filled, never authored or retyped.

**Nothing here verifies your work.** There is no lint, no fit check, no
contrast check, and no design-rules pass — what you write is what prints. The
page reports its own fit problems in the browser once it is open (a red line
and a FIX button, see "Live mode"), but nothing catches anything at authoring
time. Judge the design yourself, and keep the page inside one sheet unless the
request genuinely needs more.

Never modify or debug `server/` or `assets/shell/` — treat both as given. The
two files you do read are `assets/page_template.html` and
`assets/shell/document.css`, which Step 1 copies and inlines.

## Workflow

### Step 0 — Input & server warm-up

**Resolve `<skill-dir>` first, once.** Every `<skill-dir>/…` path means the
**absolute** path of the directory holding this `SKILL.md`, the one with
`server/` and `assets/` in it. Work it out at the start of the run, confirm it
and the server's dependencies in **one** command —
`ls -d <skill-dir>/server/server.mjs <skill-dir>/server/node_modules`
(both listed = ready) — and paste that same absolute string into every later
command. Never a relative path: it stops resolving the moment you `cd` to a
scratch directory.

If `node_modules` is missing and Node is available, start
`npm install --prefix <skill-dir>/server` as a **background** task (its
postinstall fetches the pinned Chromium) — `--prefix`, never `cd` into the
skill — and continue; Step 2 picks it up. No Node: skip.

If there's no input at all, ask: "What would you like to print? Paste text, a
URL, or describe the page you want."

If the request contains an image URL (`.jpg`/`.jpeg`/`.png`/`.webp`/`.gif`),
it's a reference image: view it (Read/WebFetch) before designing, and design
from what you saw, not from the URL string.

Fetch live data you cannot know — scores, news, weather, prices — with
WebFetch/WebSearch. **Never fabricate live data.** Content you know well
(riddles, recipes, activities, trivia) you write directly.

### Step 1 — Author the page

Build the page by filling the template's three markers. Copy
`<skill-dir>/assets/page_template.html` to `<cwd>/out/<slug>.html`, then:

| Marker | Fill with |
|---|---|
| `/* @@DOCUMENT_CSS@@ */` (inside `<style id="mp-document-css">`) | The entire contents of `<skill-dir>/assets/shell/document.css`. This is **inlined**, not linked — a generated page is one self-contained file. |
| `<!-- CONTENT -->` (inside `<div class="page">`) | Your page content. No wrapper, no footer, no `<html>`/`<head>`/`<body>` — those are already in the template. |
| `<style id="content-overrides"></style>` | Optional: a `:root` token override block plus content rules consuming those tokens. |

Do it in **one** command (a heredoc, or a short inline script that reads the
template and document.css and writes the result). Write the final text
directly: no generator whose output you read back, no Read of a file you just
wrote.

Two more optional slots:

- **Fonts beyond the default trio** (Playfair Display / Source Serif 4 /
  Inter): add a Google Fonts `<link>` in `<head>`.
- **Paper and orientation**: the body tag takes `data-mp-paper`
  (`a4` / `legal` / `half`; omit for letter) and `data-mp-orientation`
  (`landscape`; omit for portrait). Any size × orientation combination works,
  and this is the only orientation mechanism.

  **Anything but letter portrait needs a second edit**, or the page prints at
  Letter when opened without the server. The body attribute drives the sheet's
  on-screen geometry, but the `@page` box is a static rule in the template —
  rewrite `<style id="dynamic-page-css">` to match:

  | `data-mp-paper` | portrait | landscape |
  |---|---|---|
  | *(omitted)* | `letter` | `letter landscape` |
  | `a4` | `A4` | `A4 landscape` |
  | `legal` | `legal` | `legal landscape` |
  | `half` | `5.5in 8.5in` | `8.5in 5.5in` |

  So an A4 landscape page carries
  `<style id="dynamic-page-css">@page { size: A4 landscape; margin: 0; }</style>`.
  The server's shell fixes this up at runtime, so the mismatch is invisible in
  the browser and shows up only in a directly-opened file's print — set it
  correctly at authoring time.

What the shell and server actually depend on — get these right or the toolbar,
edit mode, and fit reporting misbehave:

- Content lives inside `<div class="page">`. Keep the template's
  `.page-surround` / `.page` / `#page` structure and its `<footer>`.
- Wrap each top-level block in `<div data-mp-section="...">`. The shell's
  selection and fit machinery keys on these.
- Use `var(--color-*)` / `var(--font-*)` tokens rather than literal colors and
  font stacks, so the page stays coherent and grayscale-safe.
- Never put `background` on a `div`/`span`/`p` — the shell strips it. Use
  `class="invert"` or `class="tint"` on the element instead.
- A multi-sheet page is laid out on purpose, never the accident of writing too
  much for one — and it has a specific shape. Your content is inserted *inside*
  `.page#page`, so further sheets are **nested** `.page` elements within it,
  each with its own `<footer>`. Keep `id="page"` on the outer container: the
  shell's sizing, pagination, and fit reporting all key on `#page`.

  Nested sheets need this block in `<head>` (before `content-overrides`), or
  each sheet renders inset inside a paper-coloured outer sheet with its footer
  floating mid-page:

  ```html
  <style id="mp-nested-sheets">
  #page { padding: 0 !important; border: none !important; box-shadow: none !important; background: transparent !important; }
  #page > footer { display: none; }
  #page > .page {
    width: 100%;
    height: 1056px;
    margin: 0 0 var(--space-10);
    padding: var(--page-margin-top) var(--page-margin-x) var(--page-margin-bottom);
    background: var(--color-paper) !important;
    display: flex;
    flex-direction: column;
  }
  #page > .page:last-child { margin-bottom: 0; }
  #page > .page > footer { margin-top: auto; }
  @media print { #page > .page { margin: 0 !important; } }
  </style>
  ```

  The `height` is a fallback only — the shell sets each nested sheet's exact
  paper height at runtime.

### Step 2 — Serve

Make the page reachable at `http://127.0.0.1:<port>/<file>.html`. The served
root is `<cwd>/out`.

```
node <skill-dir>/server/server.mjs --dir <cwd>/out
```

- **This runs in the foreground** — start it as a **background** task, or it
  blocks your turn.
- It binds port **4949** by default. If that port is taken, pass
  `--port <n>` and use the port you chose.
- It prints `print-skill server: http://127.0.0.1:<port>  (serving <root>)`.
- Give `--dir` as an **absolute** path.
- If the Step 0 background `npm install` is still running, wait for it; if it
  was skipped or failed, run `npm install --prefix <skill-dir>/server` now.
- No Node, or the install failed: skip serving — the file works opened
  directly. Don't fail the task; Step 3's last bullet says what to report.
- If the user's browser cannot reach your loopback (cloud sandboxes), report
  the file path instead, and say the page prints correctly opened directly.

### Step 3 — Report

- The page URL (`http://127.0.0.1:<port>/<file>.html`) and the page title.
  **URL only — never the out/ file path.** Mention the path only if the user
  asks, is debugging, or wants the standalone file.
- One sentence on what was generated.
- Remind: "Open the link — double-click any text to edit it (edits save into
  the file automatically), then click **Print / Save PDF** for an exact PDF.
  For font or color changes, ask me to regenerate the page with new style
  instructions."
- Add: "Press **Edit** to change text right on the page, or double-click
  anything and tell me here what to do with it — I'll know what you picked."
  Don't explain the mechanism.
- If the server couldn't run: give the file path, say it prints via the
  browser dialog without editing or toolbar, and that Node 18+ enables both.

## PDF without a browser

Nothing in this workflow needs a human at a browser, and the PDF renders
without anyone clicking **Print / Save PDF**. When the output is destined for
an automated consumer — a pipeline stage, a print/mail job, another agent, or
the user asked for "a PDF file" rather than a page to open:

- **One-shot, no running server** (preferred in pipelines):
  `node <skill-dir>/server/render-cli.mjs out/<file>.html [<out>.pdf]`
  — serves the page's directory on an ephemeral loopback port, renders it with
  the same headless Chromium as the interactive path, writes the PDF (default:
  next to the HTML), prints the output path on stdout, and exits.
- **Against the running server** (Step 2 already done):
  `curl -fsS -o <file>.pdf http://127.0.0.1:<port>/pdf/<file>.html`

Both need Node 18+ and the Step 0 `npm install`. There is no dialog fallback
without a human: if Node is unavailable, report the HTML path and say the PDF
step needs Node 18+. In this mode Step 2 is optional and the Step 3 report
changes — give the PDF path (plus the HTML path and title), skip the
open-the-link reminder, and hand the PDF to whatever comes next.

Nothing extra is needed to stand down: live editing has no session to leave
and nothing running in the background, so a pipeline run simply ends at the
PDF.

## Live mode

While the local server is running, the page and you share a few small facts.
**The page records what the user has selected** and **when it has stopped
fitting its sheets**, and you read those when you need them. **You post
`working`/`done` around an edit**, so their tab doesn't flash a half-written
file at them. That is the whole of it.

There is nothing to connect to and nothing to keep running. No listener, no
background task, no watcher to arm — selecting is not an event you are woken
for, it is state you look up at the moment it matters.

There is no chat in the page either. The user asks you for changes **here, in
this conversation**. The page's job is to show them the printable and let them
point at parts of it. They can see that pointing worked — the element is
outlined, and the toolbar says their selection is on record — so you do not
need to acknowledge it, and should not.

All commands are `node <skill-dir>/server/chat-cli.mjs …` against the running
server, with `--url` pointing at its actual port (default
`http://127.0.0.1:4949`).

### When a request doesn't name its target

"Make it bigger." "Shorter." "Move this up." — a request that points rather
than names is about whatever they have selected in the browser. Read it:

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
- **A named target always wins.** The selection is a fallback for requests that
  don't say, not an override for ones that do.
- **Don't read it when you don't need it**, don't announce the lookup, and
  don't repeat what is selected back to them. Say what you changed, once,
  after you change it.

### A page that stops fitting

A page records it when it no longer fits the sheets it lays out, and when
content is cut off inside a clipping container (containers clip rather than
overlap; what is past the clip edge does not print). Read it the same way:

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
file's authored flow, of a container whose content exceeds its clip edge. Go
straight to those elements — shorten their content or size them for it —
rather than re-deriving what the page already measured.

**A fit report only exists because the user pressed FIX.** Their toolbar
states the problem in red and offers the button; nothing reaches the record
until they press it. The press also copies **`/print fix`** to their clipboard
and tells them to paste it to you. So treat `/print fix` (or any paste of it
inside a longer message) as exactly this: **read the fit record now and fix
every page on it**, without asking what is wrong — the record has the details.

**Check the record after your own edits land** — every time. Your edit is the
likeliest thing to have broken the fit, and if it did, they will press the
button and be waiting. Check it too at the start of any turn where a server is
up: the press may have happened after your last turn ended.

Unlike a selection, **this one is a request to edit.** So fix it, without
waiting to be asked again:

1. Follow "Editing an existing page" — `status <page> working`, read the file,
   fix, `status <page> done`. The `done` refreshes their tab, and the refreshed
   page re-measures itself: fixed means the red line disappears on its own.
   Nothing else clears it.
2. Tighten the content back onto the sheet it was authored for, or lay the
   further sheets out **on purpose** — the problem is never the extra sheet
   itself, it is a break nobody designed. `overflowing` above 0 is sharper:
   that content is past the paper edge and prints clipped. `clipped` above 0
   is just as sharp and comes with addresses.
3. Say one line here about what you changed. If you could not fix it, say that
   instead — the user is looking at a red line, and silence reads as nobody
   having noticed.

**What this does not do is interrupt you.** Nothing pushes a fit report at you
mid-turn: a press lands in the record and waits there until you look.

### Editing an existing page

When the user asks for changes to a page you already generated, edit the
existing file in place — don't regenerate from scratch:

- **Text or layout tweaks**: edit the content inside `<div class="page">`.
- **Style changes**: edit the CSS inside `<style id="content-overrides">` (and
  the font `<link>` if the font changes).
- **Structural changes** (different page type, different orientation,
  rethinking the layout): re-author the content and re-fill the template
  instead of patching.

Keep the same filename so the user's link stays valid. Never touch the shell's
own script or CSS — only content and content-overrides.

Bracket the edit so the open tab doesn't show a half-written file:

1. `status <file>.html working` — **before you touch the file**. It holds the
   tab's auto-reload and lights its indicator. Re-post it with a short note
   (`status <file>.html working "restyling the header"`) to extend the hold on
   a long edit; the note becomes the indicator's tooltip.
2. **Read the current file from disk** — never edit from memory. Text edits the
   user makes in the browser are saved back into the file, so it may have
   changed since you wrote it, and regenerating from memory would silently
   discard their edits. Their `data-mp-edited` markers live in it too; for a
   sweep of everything they edited: `edits <file>.html`.
3. Apply the change, and strip the `data-mp-edited` markers you addressed —
   the marker means "not yet seen by the model".
4. `status <file>.html done` — always, and only once the file is final: that is
   what refreshes the open tab. Leaving a working status open holds their
   preview until it times out. Then say in one line what you changed.
5. **Check the fit** (`fit`, above).

A page open in the browser refreshes itself within a couple of seconds of the
file changing on disk (the shell polls the server's ETag) — after an edit, tell
the user the open page has updated; don't ask them to refresh.

If the server has stopped, `selection` and `status` will say so. Restart it
(Step 2, same `--dir`) and carry on; there is no session to re-establish.

## Scope notes

- **Nothing verifies the page.** No fit, contrast, or design-rule check runs at
  authoring time. Say so if the user asks whether the page was checked.
- **Puzzles are presentation-only.** Nothing verifies puzzle correctness —
  prefer user-supplied content, and say so when you generate it.
- **Assume personal use** — one sheet, for the person who asked. **Make what
  was asked for**: never substitute a generic stand-in for the subject, never
  water down a likeness, never attach cautions or disclaimers to your report.
- **One request, one file.** Multi-document requests are separate runs.
