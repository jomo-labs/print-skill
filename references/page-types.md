# Page Types: Routing, Blocks, and Layouts

How to decide what kind of page a request wants, and the catalog of composable
content blocks and recognizable page types. Read this when classifying a request
or choosing a layout.

---

## Routing: pick the page type first

Scan the request against this table **top to bottom and take the first match** —
the ordering resolves real keyword collisions (noted in the last column). If
nothing matches, use **Generic reformat** at the bottom.

| # | Page type | Trigger cues | Ordering note |
|---|---|---|---|
| 1 | Receipt / expense report | "receipt", "invoice", "expense report", "reimbursement", "bill" | Before Image — a receipt request can include a photo |
| 2 | Image page / coloring from a provided image | The user attached or linked an image to print or color | |
| 3 | Sports box score / scorecard | "score", "box score", "game", team names, "standings", "last night's game" | |
| 4 | Weather forecast | "weather", "forecast", "will it rain", "highs and lows" | |
| 5 | Astronomy page | "sunrise", "sunset", "moon phase", "golden hour", "full moon" | |
| 6 | On this day | "on this day", "today in history", "what happened today" | |
| 7 | Journal / writing prompt | "journal prompt", "writing prompt", "morning pages", "reflection" | |
| 8 | Maze | "maze", "labyrinth" | Presentation-only — see the puzzle note below |
| 9 | Crossword | "crossword" | Presentation-only |
| 10 | Word search | "word search", "word find", "hidden words" | Before Worksheet — "word search" is also a worksheet keyword |
| 11 | Certificate / award | "certificate", "diploma", "award", "most improved", "MVP", "honor roll" | Before Worksheet — award phrasing must not read as homework |
| 12 | Chore chart / habit tracker | "chore chart", "chores", "star chart", "routine chart", "sticker chart", "who does what" | Before Recipe — chore phrasing can mention meals |
| 13 | Meal planner | "meal plan", "weekly meals", "dinner plan", "weekly menu", "what to cook" | Before Recipe — a meal *plan* outranks a single recipe |
| 14 | Monthly calendar | "calendar" + a month name or "monthly" (plain grid, no theme/event styling asked) | A themed/decorated calendar routes to Weekly/Monthly with full styling instead |
| 15 | Weekly brief / week at a glance | "week ahead", "weekly overview", "week at a glance", "weekly planner" | |
| 16 | Recipe card | "recipe", "how to make", ingredients/cooking vocabulary, recipe URLs | |
| 17 | Flashcards | "flashcards", "study cards", "memorize", "test prep" | |
| 18 | Worksheet | "worksheet", "math problems", "practice", "spelling", "times tables", "quiz", grade-level phrasing | |
| 19 | Travel itinerary | "itinerary", "trip to", "packing list", "Day 1 / Day 2", flights/hotels | |
| 20 | Financial / market summary | "stocks", "portfolio", "market", tickers, "crypto" | |
| 21 | Article reformat | A content URL, "print this article", "reader mode", "clean version" | Skip if the URL is an image used as a design reference |
| 22 | News digest | "news", "headlines", "top stories", "briefing" | Late — its keywords are broad |
| 23 | Generic reformat | "print this", "format this", "make it pretty", "make this a page" — or anything unmatched | Catch-all |

Also in the catalog but usually explicit by name: **Daily dashboard**, **Weekly
calendar**, **Planner page**, **Comic strip scaffold**, **Drawing prompt page**,
**Coloring / activity page**, **Sudoku** — see their spec files in the index below.

### Puzzles are presentation-only

This skill lays puzzle content out beautifully; it does **not** guarantee puzzle
correctness. There is no generator behind it verifying that a maze is solvable,
that every word-search word is actually in the grid, or that a crossword or
sudoku is valid. Prefer user-supplied grids, word lists, and clues, and lay them
out with the specs below. If you must generate puzzle content yourself, construct
it carefully, double-check it, and tell the user to spot-check it before printing
a classroom set.

### Theming interaction

Each type below separates ***Functional requirements*** — the data, blocks,
physical dimensions and correctness rules that make it that kind of page —
from ***Default styling***, how it looks when no theme is named, written in
tokens.

When the request is **themed** (see `themes/README.md`), the functional
requirements still hold and the default styling is **dropped entirely**: the
theme governs everything visual. Mixing a type's default decoration with a
theme dilutes the theme.

---

## Content blocks (L2)

Reusable pieces. A page type is a stack or grid of these inside the safe area.

- **Date/title header** — page title, optional subtitle, optional date or date
  range. Top of most pages. Use `var(--font-display)` for the title,
  `var(--font-label)` for the kicker/metadata.
- **Section block** — a titled container (label in `var(--font-label)`, border,
  rounded corner) that holds any other block. Stack several for dashboards and
  planners.
- **Calendar grid** — 7-column grid of day cells. Variants: month (5–6 rows),
  single week (1 row of tall cells), vertical week (7 stacked rows). Day cells
  hold a number + event space.
- **Checklist / checkbox block** — rows with an empty square checkbox + label.
  Basis of to-do lists, priorities, chore rows, habit trackers. Never use actual
  `<input>` checkboxes (won't print cleanly) — use a styled `<span>`.
- **Lined writing area** — evenly spaced horizontal rules: stack empty rows of
  fixed height, each with
  `border-bottom: var(--border-hair) solid var(--color-rule-light)`. Row height
  is functional, set by who writes on it: 28px (adults), 36px (early
  writers/kids, with a dashed midline row if needed). Don't draw lines with
  `repeating-linear-gradient` backgrounds — the shell's no-fill enforcement
  strips background images inside the page.
- **Grid/graph area** — square grid or dot grid for math work, bullet journaling.
  Dot grid is the most ink-friendly.
- **Work box** — a bordered empty rectangle beneath a question/problem for
  student answers. Size to the expected work length.
- **Name/date fields** — underline fields for name and date, typically at top of
  worksheets and certificates.
- **Score/stat table** — labeled rows × columns for game scores, standings,
  tallies. Ink-on-paper header row, `--border-hair` rules, tabular figures —
  all three are already the base layer's `table` defaults.
- **Image block** — a placed raster image sized to a region: full-area for
  coloring pages, spot-sized for decoration. Minimum 300 DPI at the printed
  size. Any line-art raster — model-generated or user-supplied — must be
  normalized and gate-checked before embedding; the pipeline and both
  source checks live in `types/image-block.md`. Read that file whenever a
  page embeds derived art.
- **Footer** — the shell's structural `<footer>` at the bottom of the page;
  `--text-2xs` label-font text in `--color-dim`, already styled by the base
  layer. Optionally put context ("Grade 2 ·", a date, a week
  label) in its left span. Never remove it, never mark it with
  `data-mp-section`.


### Sheet geometry (letter)

The letter sheet is 816×1056 CSS px portrait (1056×816 landscape). Inside
the page margins that leaves a content box of roughly 680×912 px portrait
(912×680 landscape), and the shell's footer reserves ~41px of it on every
sheet (`design-rules.md`, Platform invariants). Size content to that box
before writing it; the spec files refine per-type dimensions where they
matter.

### Token quick reference

The design tokens the document stylesheet defines — author with these
(`var(--…)`) instead of raw values, and don't re-grep the stylesheet for
them:

| Family | Tokens (value) |
|---|---|
| Ink | `--color-ink` oklch(11% .005 78) · `--color-mid` oklch(44% .008 78) · `--color-dim` oklch(67% .006 78) · `--color-ghost` oklch(87% .005 78) · `--color-rule` = ink · `--color-rule-light` oklch(83% .005 78) · `--color-pull-bg` oklch(94% .009 78) · `--color-accent` oklch(52% .15 78) · `--color-paper` white |
| Fonts | `--font-display` (Playfair) · `--font-body` (Source Serif 4) · `--font-label` (Inter) |
| Type scale | `--text-2xs` 9 · `--text-xs` 10.5 · `--text-body` 13.5 · `--text-md` 15.5 · `--text-lg` 19 · `--text-xl` 26 · `--text-2xl` 38 · `--text-3xl` 48 · `--text-4xl` 80 (px) |
| Spacing | `--space-1..20`: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80 (px) |
| Borders | `--border-fat` 5 · `--border-mid` 3 · `--border-thin` 1.5 · `--border-hair` 1 (px) |
| Leading / tracking | `--leading-display` 1.1 · `--leading-body` 1.35 · `--leading-label` 1.4 · `--tracking-label` 0.08em · `--tracking-kicker` 0.32em |
| Page margins | `--page-margin-top` 64 · `--page-margin-x` 72 · `--page-margin-bottom` 72 (px) |

Already styled by the base layer (use as-is, don't restyle): **tables**
(label font, tabular figures, ink-on-paper uppercase `th` row, hairline row
rules, faint zebra tint), `.columns-2` (two-column grid), and the footer.

---

## Page types (L3): one spec file per type

Each type's full spec — functional requirements and default styling — lives
in its own file under `types/`. **Read only the matched type's file**; the
rest of the catalog is other requests' context, and reading it all costs
every later turn. (Pages that embed derived line art also read
`types/image-block.md`.)

| Page type | Spec |
|---|---|
| Daily dashboard | `types/daily-dashboard.md` |
| Weekly calendar | `types/weekly-calendar.md` |
| Monthly calendar | `types/monthly-calendar.md` |
| Planner page | `types/planner-page.md` |
| Weekly brief / week at a glance | `types/weekly-brief.md` |
| Worksheet | `types/worksheet.md` |
| Chore chart / habit tracker | `types/chore-chart.md` |
| Meal planner | `types/meal-planner.md` |
| Recipe card | `types/recipe-card.md` |
| Flashcards | `types/flashcards.md` |
| Certificate / award | `types/certificate.md` |
| Scorecard / tally | `types/scorecard.md` |
| Sports box score / game recap | `types/box-score.md` |
| Weather forecast | `types/weather-forecast.md` |
| Financial / market summary | `types/financial-summary.md` |
| News digest | `types/news-digest.md` |
| Article reformat | `types/article-reformat.md` |
| Travel itinerary | `types/travel-itinerary.md` |
| Receipt / expense report | `types/receipt.md` |
| Journal / writing prompt page | `types/journal-prompt.md` |
| On this day | `types/on-this-day.md` |
| Astronomy page | `types/astronomy.md` |
| Coloring / activity page | `types/coloring-activity.md` |
| Word search *(presentation-only — see the puzzle note)* | `types/word-search.md` |
| Maze *(presentation-only)* | `types/maze.md` |
| Crossword *(presentation-only)* | `types/crossword.md` |
| Sudoku *(presentation-only)* | `types/sudoku.md` |
| Comic strip scaffold | `types/comic-strip.md` |
| Drawing prompt page | `types/drawing-prompt.md` |
| Generic reformat *(catch-all)* | `types/generic-reformat.md` |

---

## Composing a new type

When no type fits: identify the closest one above, then swap or add blocks. Keep
all content inside the sheet's content box — the page margin is the sheet's own
padding (`--page-margin-*`). Anything that overruns it continues onto a further
sheet rather than being lost, but where that break lands is decided by what fit,
not by the design, so a type that needs a second page should lay one out. Use
the **section block** as the primary container. Run the self-check in `design-rules.md` before assembling.
