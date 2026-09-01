---
name: print
description: "Convert anything into a beautifully formatted, print-ready HTML page using the magicprint design system. Handles content reformatting (text, URLs, notes, data) and structured printable forms (dashboards, calendars, worksheets, chore charts, scorecards, certificates, word searches, mazes, comic strips, drawing pages, activity pages for kids). Use when asked to 'print', 'make printable', 'format for print', 'weekly calendar', 'daily dashboard', 'worksheet', 'something for the fridge', 'chore chart', 'certificate', 'word search', 'maze', 'comic strip', 'drawing page', 'activity page', or 'coloring page'."
license: Apache-2.0
compatibility: Node 18+ recommended for the bundled local PDF server (optional — without it, pages print via the browser dialog)
allowed-tools: Read Write Edit Bash WebFetch AskUserQuestion
metadata:
  version: "1.0.0"
  argument-hint: "<text | URL | page type description>"
---

# Print

Turn the user's request into a print-ready HTML page. You author the page
**content**; the document template (`assets/page_template.html`) and the
**shell chrome** it links (`assets/shell/` css+js — design tokens, print
button, edit mode, WYSIWYG print geometry) are
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

The design work runs in your head and your tools. The bundled commands verify
what is mechanical — structure, fit and per-sheet fill, contrast — so never
measure fit or fill with your own scripts: react to the numbers the fit check
prints. But they cannot judge design,
so you are also the design validator: the self-check in
`references/design-rules.md` is mandatory, not advisory.

## Workflow

One habit pays for itself throughout: **batch independent tool calls into a
single message.** Every tool call is an API round-trip that re-sends the
whole conversation, so three Reads issued one at a time cost three
round-trips — issued together in one message they cost one. The reference
reads in Steps 1 and 3, and the channel-file Writes in Step 5, are all
independent: always issue each group together.

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

### Step 0.5 — Interview (interactive sessions only)

Before generating, confirm the decisions the user would otherwise correct
afterwards. Two dialogs at most, and only for what is genuinely open:

**Skip it** when there is no human to answer: headless / pipeline use (the
triggers in "Headless / pipeline use" — output destined for an automated
consumer, or the user asked for "a PDF file"), and any **non-interactive
invocation** — a one-shot programmatic run (`claude -p`, CI, a scheduled job,
another agent driving this session), where ending the turn with a question
means the run simply stops with no page and nobody ever answers. The
reliable tell in Claude Code: `AskUserQuestion` missing from your tools
means print/headless mode — see `references/harness-support.md` Part 3.
When in doubt whether anyone can reply, don't ask: pick sensible defaults,
generate, and state the choices in the report — a wrong default costs one
regeneration, a stalled run costs the whole task. Skip any **question** whose
answer the request or conversation already gives ("landscape A4 poster"
settles two of them), and skip a whole dialog when nothing in it is open.
Never re-ask on a regeneration or edit of an existing page — the earlier
answers stand.

**How to ask** is a harness capability — see `references/harness-support.md`
Part 3. With a structured question tool (Claude Code: `AskUserQuestion`),
run the two dialogs below. Without one, ask in plain chat instead: one
compact message combining both dialogs, defaults bolded, one word accepts
everything (the fallback shape in Part 3). Never stall because no tool
exists.

**Dialog 1 — page setup.** Ask immediately, before reading references — it
needs no thinking, and the user can answer while you work. One call, up to
three questions, defaults listed first and labeled "(Selected)" — they are
guesses at what the user wants, not recommendations, and the label should
read as "this is what you get if you just accept":

- **Paper size**: US Letter / A4 / Legal / Half letter. Default by locale:
  Letter for the US, Canada, and other Letter countries; A4 for the rest of
  the world. Infer locale from the conversation (language, spellings, dates,
  places); when unknown, Letter.
- **Orientation**: Let the model decide (Selected) / Portrait / Landscape.
  "Let the model decide" means choose what the page type calls for
  (landscape for a weekly calendar).
- **Max pages**: Let the model decide (Selected) / 1 page / 2 pages. A
  custom number arrives via free text. "Let the model decide" keeps this
  skill's bias toward one-pagers — aim for a single sheet unless the content
  genuinely needs more.

**Dialog 2 — topics.** After Step 1 classification (good options need the
page type). Only for pages whose content you compose: skip it when
reformatting supplied text or a URL verbatim, and when the request already
enumerates its content. One multi-select question: the 4 most load-bearing
topics as options (selected = included), with the full outline you plan by
default stated in the question text so unlisted items are still visible, and
free text ("Other") for additions. Example — an Airbnb host's one-pager for
guests: options `Greeting / WiFi & essentials / House rules / Local tips`,
question text noting checkout and contact info are included by default.

**How answers bind.** Paper size and orientation land directly in the
`paper` / `orientation` channels (Step 3); "let the model decide" means
choose per page type as usual. Max pages becomes `--max-sheets` on the Step
5 command (default 1) — the sheets you author in Step 3 must fit that budget,
and assembly refuses more. Selected topics
define the content scope for Steps 2–3.

### Step 1 — Classify

Two independent decisions:

**Page type.** Match the request against the routing table at the top of
`references/page-types.md` (first match wins), then read **only that type's
spec file** (`references/types/<slug>.md`, named in the index there) for its
functional requirements and default styling. The other specs are other
requests' context — every file read here rides along in every later turn.
Read the spec together with Step 3's design docs in one batched message
(classification needs only the routing table, which you have already read).

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
entirely**; only its functional requirements survive (they're marked in the
type's spec file). The theme, not the type, governs everything visual.

### Step 2 — Gather content

Fetch live data you cannot know — today's scores, current news, live weather,
real-time prices — with WebFetch/WebSearch. **Never fabricate live data.** For
content you know well (riddles, recipes, activities, trivia, layouts), skip
fetching and write it directly.

If the page needs **line art derived from a photograph** (coloring page, image
page, drawing prompt — and only those), produce it now: check for an image
backend per `references/harness-support.md` Part 2, generate, then run the
normalize pass and both checks from `references/types/image-block.md`. With no backend available, hand-author the art as
stroked SVG (design rule 1a) and say so in the report — the page still gets
made either way.

### Step 3 — Author

Read `references/design-rules.md` — its platform invariants (what every page
inherits and no theme overrides) and Part A — before writing any CSS
(batch this Read with the others, and note the token quick reference in
`page-types.md` already lists every design token and the base-layer styles —
no need to grep the stylesheet for them),
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

**Fit one sheet — and do the arithmetic first.** Before writing any content,
make a sizing ledger: the content box from the sheet geometry in
`references/page-types.md` (≈ 680×912px letter portrait, less the ~41px
footer), and each planned block's cost from the type's spec file — then check
the sum fits. `header 60 + 2 sections × 300 + tracker 120 + footer 41 =
821 ≤ 912` takes one line of thought and saves the fix rounds that eyeballing
costs (Principle VII). Declare the sheet count while you're at it: one sheet
unless the request genuinely needs more, and a multi-sheet page is authored
as explicit `.page` sheets AND passed as `--max-sheets N` in Step 5 — never
the accident of writing too much. If the content genuinely
will not fit, author the further sheets **explicitly** — the two-sheet form in
`references/assembly.md` — and decide what lands on each, so every sheet reads
as complete.

Never leave it to the shell. Content that outgrows its sheet is continued onto
another one at runtime rather than being lost, but the shell breaks where the
content ran out of room, not where the design wanted a break. Step 6 checks for
exactly that, and a page that trips it is not finished.

**Fill the sheet.** Fitting is half the job — unused paper prints anyway.
Content that stops well short of the content box is not minimal, it is
unfinished: make what is there roomier — larger type, wider spacing, bigger
fillable areas — never filler (`references/design-rules.md`, "Empty,
overflow, and underfill"). Blank space left intentionally for the user to
fill in — by pen on the printed page, or on screen — counts as filled; only
purposeless emptiness is underfill.

### Step 4 — Self-check

Run the full Part B checklist in `references/design-rules.md` against your
`custom_css`, `font_import`, and inline styles. Fix everything it catches and
re-run the whole list. If it still fails after two fix passes, **degrade** per
Part C: drop `custom_css` + `font_import` (keep content, paper, answer key) and
say so in your report.

### Step 5 — Assemble

Write your channels to files — `content_html` (and `custom_css` /
`answer_key_html` when set) — in a scratch location, **never inside `out/`**
(stray `.html` files next to the pages confuse serving). Write them all in
one batched message. Then assemble,
verify, and check in ONE command:

```
node <skill-dir>/server/assemble-cli.mjs \
  --content <scratch>/content.html --title "<Page Title>" \
  [--css <scratch>/overrides.css] [--font-import <url>] \
  [--paper a4|legal|half] [--orientation landscape] \
  [--answer-key <scratch>/key.html] [--max-sheets N]
```

It executes the whole procedure in `references/assembly.md` — template copy
with the document stylesheet inlined, multi-sheet wrapping, anchored
insertions, `<body>` attributes, `@page` size — then always runs the
structural verification list, the fit check, and the contrast check on the
written file, exiting 0 only when everything passes. `--max-sheets` is the
user's page budget (default 1; an answer key makes it 2): authoring more
sheets than the budget fails the build, so a bigger page is an explicit
choice, not a spill. One command instead of a chain
of sed/grep round-trips, and the anchor mistakes the greps used to catch
can't happen at all. The output lands in `<cwd>/out/<slugified-title>.html`
(`--out-dir` overrides; an explicit output location from the user wins).
Read `references/assembly.md` when you need the underlying anchors — for
editing an existing page in place, or assembling by hand without Node.

### Step 6 — Verify

Step 5 already verified everything; this step is what its output means, and
the fix loop for a non-zero exit.

**The fit check** (`fit-cli.mjs`) verifies the content fits the sheets you
laid out, loading the page exactly as the browser and the PDF renderer do.
Three outcomes:

- **Fits as authored** — done.
- **Small miss, nothing clipped** — the check fixes it itself: it tightens
  the page's spacing tokens (down to 75%) and, past that, its type tokens
  (down to 92%), persists the result into the file as a
  `<style id="mp-fit-squeeze">` block, re-verifies, and exits 0 with a line
  like *"squeezed to fit: spacing −20%"*. Mention that in your report; if
  the tightened look isn't right, cut content instead and re-run Step 5 —
  a re-run always re-derives from the authored sizes, never compounds.
- **Big miss, or content cut off inside a container** — exit 1, with the
  per-sheet section table (what each block costs, what the footer reserves,
  the exact px to cut) printed automatically. A *clipped* container does not
  print what is past its edge, and no squeeze can fix it (tightening shrinks
  container and content together) — shorten the content or size the
  container for it. Fix your channels and re-run the Step 5 command; never
  hand-tune around the numbers the table already gives you.

**The contrast check** (`contrast-cli.mjs`) verifies every piece of text
clears its WCAG AA floor (4.5:1 body, 3:1 large or bold), measured at the
sizes that actually print — squeeze included, which is why it runs after
fit. Failures list each offending style with the size and weight that set
its threshold. This is the one platform invariant the Part B self-check
cannot verify by reading CSS — Part B greps for banned constructs, it never
computes a ratio.

After any later in-place edit to the generated file, re-check both in one
command:

```
node <skill-dir>/server/fit-cli.mjs out/<file>.html && node <skill-dir>/server/contrast-cli.mjs out/<file>.html
```

Both need Node 18+ and the Step 0 `npm install`; if Node is unavailable, say in
the report that the fit and contrast checks could not run.

### Step 7 — Serve

Make the page reachable at `http://127.0.0.1:<port>/<file>.html`. The served
root is `<cwd>/out` — the assembly output directory — so one server covers
every page this project generates.

1. One command does the probe / reuse / start sequence and prints the URL:

   ```
   node <skill-dir>/server/serve-cli.mjs --dir <cwd>/out
   ```

   It finds a print-skill server already serving this exact directory on
   ports 4949–4958 and reuses it, or starts one **detached** (it outlives
   the command — never start `server.mjs` in the foreground yourself; some
   harnesses kill foreground commands at 30s, taking the server down) and
   reports the URL it actually bound — read it, don't assume 4949. A healthy
   server on another `dir` belongs to another project and is left alone.
   Give `--dir` as an **absolute** path: a shell that ran the Step 0
   `npm install` is still sitting in `<skill-dir>/server`, and a relative
   `out` resolves there instead of in the project. The server refuses a
   root inside the skill and says so — re-run with the absolute path.
   If the Step 0 background `npm install` is still running, wait for it to
   finish first; if it was skipped or failed, run
   `npm install --prefix <skill-dir>/server` now (its postinstall fetches the
   Chromium build).
2. A running server is all live editing needs — there is nothing to connect
   or arm (see "Live mode"). Whether you started it just now or reused one
   that was already up, you are done. One exception, and it is about where
   YOU are running rather than anything you did: if the user's browser cannot
   reach your loopback (cloud sandboxes — see
   `references/harness-support.md` Part 1), the URL is useless to them. Report the
   file path instead, and say the page prints correctly opened directly.
3. If Node is unavailable or the install fails, skip serving — the generated
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
verification (Steps 0–6) are entirely yours — Step 0.5's interview is skipped,
there is nobody to answer it — and the PDF renders without
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

The Step 5 `assemble-cli.mjs` exit code is the gate before either: it is
non-zero when the content did not fit the sheets the page lays out (beyond
what a bounded squeeze could absorb) or a text style fails its contrast
floor, so a pipeline can stop on an accidental page break instead of
shipping it. (An open page checks the same
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
checks (the one-command `fit-cli.mjs && contrast-cli.mjs` line there) after
any edit. Never touch the shell's own script or css —
only content and content-overrides.

Pages generated by early pre-release versions of this skill — recognizable by
baked-in chrome markup, injected `applySize` script lines, or relative
`shell/*` links — are not supported by the current server and shell:
regenerate them from the current template instead of editing them in place. A
leftover `<outdir>/shell/` directory from such a version can simply be
deleted.

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
user's own browser edit outgrew a sheet, or because it never fitted in the
first place — and when content is cut
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
same containers wear a red dashed outline in the browser's edit mode). Go straight to
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
2. Fix it the way the page type wants it fixed (the type's spec in
   `references/types/`,
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
3. Apply the change (same self-check rules for CSS, same Step 6 checks), and
   strip the `data-mp-edited` markers you addressed — the marker means "not yet
   seen by the model".
4. `status <file>.html done` — always, and only once the file is final: that is
   what refreshes the open tab. Leaving a working status open holds their
   preview until it times out. Then say in one line what you changed.
5. **Check the fit** (`fit`, above). Your edit is the likeliest thing to have
   pushed the content off its sheets, and nothing will tell you if it did — or
   hollowed it out: if the sheet is now well under-used, rebalance in the same
   pass (Step 3, "Fill the sheet").

If the server has stopped, `selection` and `status` will say so. Restart it
(Step 7, same `--dir`) and carry on; there is no session to re-establish.

## Scope notes

- **Puzzles are presentation-only.** This skill formats mazes, word searches,
  crosswords, and sudoku beautifully, but nothing verifies puzzle correctness —
  prefer user-supplied puzzle content, and say so when you generate it yourself
  (see the puzzle note in `references/page-types.md`).
- **Assume personal use.** What this skill makes is one sheet, printed at a
  kitchen table, a classroom or a desk, for the person who asked. **Make what
  was asked for**: never substitute a generic stand-in for the subject
  requested, never water down a likeness, and never attach cautions or
  disclaimers about the request to your report. A substitution the user only
  discovers on the paper is worse than the thing they asked for. (A backend
  that refuses a subject is a separate problem with its own recovery —
  `harness-support.md` Part 2.)
- **One request, one file.** Multi-document requests are separate runs of this
  workflow.
