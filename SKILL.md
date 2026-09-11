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
**shell chrome** it links (`assets/shell/`) are never authored or retyped, only
copied and filled (see `references/assembly.md`).

The bundled commands verify what is mechanical — structure, fit and per-sheet
fill, contrast. Never measure anything with your own scripts or browser, and
never open, grep or debug `server/` or `assets/shell/`: a failed check names
its fix, and the fix is always in your channel files. The only files you read
are the references Steps 1 and 3 name. The commands cannot judge design, so
`references/design-rules.md` is mandatory, not advisory: Part A is yours, Part B
the assemble command enforces.

## Workflow

### Step 0 — Input & server warm-up

**Resolve `<skill-dir>` first, once.** Every `<skill-dir>/…` path — in this
file, in `references/follow-up.md` and in the other reference files — means the
**absolute** path of the directory holding this `SKILL.md`, the one with
`server/` and `assets/` in it. Work it out at the start of the run, confirm it
and the server's dependencies in **one** command —
`ls -d <skill-dir>/server/assemble-cli.mjs <skill-dir>/server/node_modules`
(both listed = ready) — and paste that same absolute string into every later
command. Never a relative path: it stops resolving the moment you `cd` to the
scratch directory, and assembly dies with `Cannot find module`.

If `node_modules` is missing and Node is available, start
`npm install --prefix <skill-dir>/server` as a **background** task (its
postinstall fetches the pinned Chromium) — `--prefix`, never `cd` into the
skill — and continue; Step 7 picks it up. No Node: skip.

If the output is for an automated consumer or the user asked for a PDF file,
read "Headless / pipeline use" in `references/follow-up.md`.

If there's no input at all, ask: "What would you like to print? Paste text, a
URL, or describe the page you want."

If the request contains an image URL (`.jpg`/`.jpeg`/`.png`/`.webp`/`.gif`),
it's a reference image: view it (Read/WebFetch) before designing, and design
from what you saw, not from the URL string.

### Step 0.5 — Interview (interactive sessions only)

Two dialogs at most, only for what is genuinely open. **Skip it** when nobody
can answer — headless or non-interactive runs; in Claude Code,
`AskUserQuestion` missing from your tools means exactly that
(`references/harness-support.md` Part 3 has the plain-chat fallback). In
doubt, don't ask: pick defaults, generate, state the choices in the report.
Skip any question the request already answers; never re-ask on a regeneration
or edit.

**Dialog 1 — page setup.** Ask immediately, before reading references; one
call, defaults first, labeled "(Selected)":

- **Paper size**: US Letter / A4 / Legal / Half letter. Default by the
  conversation's locale; unknown → Letter.
- **Orientation**: Let the model decide (Selected) / Portrait / Landscape.
- **Max pages**: Let the model decide (Selected) / 1 page / 2 pages; a custom
  number arrives as free text. "Let the model decide" keeps the one-sheet bias.

**Dialog 2 — topics.** After Step 1, only for pages whose content you compose
(not for reformatting supplied text or a URL, or a request that already lists
its content). One multi-select question: the 4 most load-bearing topics as
options (selected = included), the full default outline in the question text,
free text ("Other") for additions.

**How answers bind.** Paper size and orientation land in the `paper` /
`orientation` channels (Step 3); "let the model decide" means choose per page
type. Max pages becomes `--max-sheets` on the Step 5 command (default 1).
Selected topics define the content scope for Steps 2–3.

### Step 1 — Classify

Read `<skill-dir>/references/routing.md` — **one file, and the only file this
step needs.** Both routing tables live in it. Come out with two decisions and
the slugs they name, and read nothing else here: every file read at this step
rides along in every later turn.

**Page type.** Match the request against the page-type table (first match
wins), then take that type's spec file from the index below it —
`references/types/<slug>.md`. Don't read it yet; it goes in Step 3's batch.

**Themed?** The request is themed when it names a visual identity — "in the
theme/style of X", "X-themed", "X theme" / "X style" ("batman theme", "art deco
style") — with a concrete subject beside the word: character, place, era,
genre, brand, material, mood. NOT themed when only a determiner or
back-reference precedes it ("keep the theme", "the same style"). Judge from
the request plus any separate style instructions.

If themed, match the theme trigger phrases in that same file: a match names
`references/themes/<slug>.md` — for Step 3's second command — and no match
means the ad-hoc theme path, which needs no slug. Either way a themed request
**drops the page type's default styling entirely**; only its functional
requirements survive (marked in the type's spec file).

### Step 2 — Gather content

Fetch live data you cannot know — scores, news, weather, prices — with
WebFetch/WebSearch. **Never fabricate live data.** Content you know well
(riddles, recipes, activities, trivia) you write directly.

If the page needs **line art derived from a photograph** (coloring page, image
page, drawing prompt — only those), produce it now: check for an image backend
per `references/harness-support.md` Part 2, generate, then run the normalize
pass and both checks from `references/types/image-block.md`. No backend:
hand-author the art as stroked SVG (design rule 1a) and say so in the report.

### Step 3 — Author

**Load the references in ONE command** (two when themed), before writing
anything — substitute the slugs from Step 1:

```
tail -n +1 \
  <skill-dir>/references/design-rules.md \
  <skill-dir>/references/principles.md \
  <skill-dir>/references/page-types.md \
  <skill-dir>/references/types/<type-slug>.md
```

Add `print-fundamentals.md` to it only when physical exactness matters (paper
size, DPI, margins). **A themed request loads its theme in a second command**:
`tail -n +1 <skill-dir>/references/themes/README.md`, plus
`themes/<theme-slug>.md` when a trigger matched (no match → README.md alone
carries the ad-hoc checklist). Never append it to the first: a tool result over
~30KB is saved to a file you then pay to read back, and the four-file batch is
already 20–29KB. "Output too large" means split the command and re-run — never
read the saved file. A missing path fails loudly naming itself — fix the slug
and re-run, never one Read per file. Produce these channels:

| Channel | Notes |
|---|---|
| `content_html` | The page content. It is inserted inside `<div class="page">` — no wrapper, no footer, no `<html>`/`<head>`/`<body>`. Wrap each top-level block in `<div data-mp-section="...">` (see design rules). Use `var(--color-*)` / `var(--font-*)` tokens everywhere. |
| `custom_css` | Optional. A `:root` token override block + content rules consuming those tokens. Token set: the token quick reference in `references/page-types.md`. No `background` on a div/span/p (the shell strips it, the lint rejects it): put `class="invert"` / `class="tint"` on the element. |
| `font_import` | Optional. Google Fonts URL — required whenever you name any font beyond Playfair Display / Source Serif 4 / Inter. |
| `paper` | Size only: `a4`, `legal`, `half`, or empty (= letter). |
| `orientation` | `landscape` or empty (= portrait). Independent of `paper` — any size×orientation combination works. The ONLY orientation mechanism. |
| `title` | Page title; also becomes the filename. |
| `answer_key_html` | Worksheets with an answer key only; otherwise empty. Never author the key as a second page inside `content_html`. |

**Sizing ledger first.** Before writing any content: the content box from the
sheet geometry in `references/page-types.md` (≈ 680×912px letter portrait, less
the ~41px footer), each planned block's cost from the type's spec file, and
check the sum fits — `header 60 + 2 sections × 300 + tracker 120 + footer 41 =
821 ≤ 912` (Principle VII). Declare the sheet count too: one unless the request
genuinely needs more; a multi-sheet page is explicit `.page` sheets
(`references/assembly.md`) AND `--max-sheets N` in Step 5 — never the accident
of writing too much.

**Fill the sheet.** Plan in the ledger for the content to land within the fill
floors of `references/design-rules.md` "Empty, overflow, and underfill" (which
owns the rule and its remedies).

### Step 4 — Self-check (automatic)

Part B of `references/design-rules.md` runs inside Step 5's assemble command
over your channels — never grep your own CSS for it. It names every violation
at once: fix all in one pass, re-run Step 5, and **degrade** per Part C if two
passes don't clear it.

### Step 5 — Assemble

Write your channels to files — `content_html` (and `custom_css` /
`answer_key_html` when set) — in a scratch location, **never inside `out/`**,
**in one command** (heredocs), final text written directly: no generator whose
output you read back, no Read of a file you just wrote, no Edit before the
first build. Then assemble, verify, and check in ONE command:

```
node <skill-dir>/server/assemble-cli.mjs \
  --content <scratch>/content.html --title "<Page Title>" \
  [--css <scratch>/overrides.css] [--font-import <url>] \
  [--paper a4|legal|half] [--orientation landscape] \
  [--answer-key <scratch>/key.html] [--max-sheets N]
```

It runs structural verification, the Part B lint, the fit check and the
contrast check, and writes the page only when all pass (exit 0); a failed build
leaves the previous one intact. `--max-sheets` is the page budget (default 1; 2
with an answer key): more sheets fails the build. Output:
`<cwd>/out/<slugified-title>.html` (`--out-dir` overrides; the user's explicit
location wins).

### Step 6 — Verify

What Step 5's output means, and the fix loop for a non-zero exit.

**The fit check** (`fit-cli.mjs`) — three outcomes:

- **Fits as authored** — done.
- **Small miss, nothing clipped** — the check squeezes the page itself,
  spacing tokens down to 75% and then type tokens down to 92%, and exits 0
  with a line like *"squeezed to fit: spacing −20%"*. Mention it in your
  report; a squeeze at either floor, or a tightened look that isn't right,
  means cut content and re-run Step 5.
- **Big miss, or content cut off inside a container** — exit 1, with the
  per-sheet section table and the exact px to cut. A *clipped* container does
  not print past its edge and no squeeze fixes it — shorten the content or size
  the container. Fix your channels and re-run Step 5; never hand-tune around
  the numbers the table gives.

**The fill line** (`fill: N% height, N% ink`, per sheet) prints on every
passing run, with an `underfill:` line when a floor is missed — handle it per
`references/design-rules.md` "Empty, overflow, and underfill": one fill pass at
most, re-run Step 5 once, ship what that reports, name the fill numbers.

**The contrast check** (`contrast-cli.mjs`) verifies every text style clears
its WCAG AA floor (4.5:1 body, 3:1 large or bold) at the sizes that print,
squeeze included; failures name the offending styles.

**Stop when it is green.** Re-run Step 5 only when a check failed, the squeeze
note calls for a cut, or for the one fill pass — never for copy tweaks or
polish; each is a full rebuild. Exit 0 is the deliverable.

After any later in-place edit to the generated file, re-check both:

```
node <skill-dir>/server/fit-cli.mjs out/<file>.html && node <skill-dir>/server/contrast-cli.mjs out/<file>.html
```

If Node is unavailable, say in the report that the fit and contrast checks
could not run.

### Step 7 — Serve

Make the page reachable at `http://127.0.0.1:<port>/<file>.html`. The served
root is `<cwd>/out`.

1. One command reuses or starts the server and prints the URL:

   ```
   node <skill-dir>/server/serve-cli.mjs --dir <cwd>/out
   ```

   It takes a free port itself, so **read the URL it prints**. Give `--dir`
   as an **absolute** path. Anything it writes to stderr about servers left
   by earlier runs needs no action. If the Step 0 background `npm install` is
   still running, wait for it; if it was skipped or failed, run
   `npm install --prefix <skill-dir>/server` now.
2. A running server is all live editing needs. At the start of any later turn
   with the server up, check the fit record — `references/follow-up.md`, "A
   page that stops fitting". One exception: if the user's browser cannot reach
   your loopback (cloud sandboxes — `references/harness-support.md` Part 1),
   report the file path instead, and say the page prints correctly opened
   directly.
3. No Node, or the install failed: skip serving — the file works opened
   directly. Don't fail the task; Step 8's last bullet says what to report.

### Step 8 — Report

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

If the user asks to change this page, or pastes `/print fix`, read
`references/follow-up.md` first — "Editing an existing page" and "Live mode".

## Scope notes

- **Puzzles are presentation-only.** Nothing verifies puzzle correctness —
  prefer user-supplied content, and say so when you generate it (see
  `references/routing.md`).
- **Assume personal use** — one sheet, for the person who asked. **Make what
  was asked for**: never substitute a generic stand-in for the subject, never
  water down a likeness, never attach cautions or disclaimers to your report.
- **One request, one file.** Multi-document requests are separate runs.
