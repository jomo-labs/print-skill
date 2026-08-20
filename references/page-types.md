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
**Coloring / activity page**, **Sudoku** — see their sections below.

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
- **Image block** — a placed raster image sized to a region. Full-area for
  coloring pages, spot-sized for decoration. Minimum 300 DPI at the printed size.
  Normalize any line-art raster — model-generated or user-supplied — before
  embedding it:

  ```bash
  magick in.jpg -colorspace Gray -filter Lanczos -resize 2100x \
                -threshold 80% -type bilevel -morphology Dilate Disk:1 out.png
  ```

  **Resize before thresholding, never after.** Thresholding at native
  resolution shatters thin anti-aliased strokes into fragments; resizing
  first and thresholding second yields clean closed lines. The naive order
  looks reasonable and silently destroys the art. `Dilate Disk:1` restores
  stroke weight — models emit hairlines and will not reliably obey a prompt
  asking for bold ones. `Disk:2` is already too heavy: it clogs facial
  features.

  Tune `-threshold` by eye, not by faith — a good source has a wide plateau
  (58–78% all worked on one test image); a source with no plateau is
  marginal. Contact sheet:

  ```bash
  for T in 62 70 78 86; do magick in.jpg -colorspace Gray -resize 2100x \
    -threshold ${T}% -crop 500x400+800+600 +repage t$T.png; done
  magick t*.png +append sheet.png   # then look at it
  ```

  Two checks catch the failures nothing downstream can repair. Run both on
  the **source**, before normalizing:

  | check | command tail | fails when |
  |---|---|---|
  | corners white >98% | `-colorspace Gray -format "%[fx:100*p{40,40}]"` | the art is really a *photo of a printed page* — desk, page curl, shadow |
  | min block luma >45% | `-colorspace Gray -scale 12x16! -format "%[fx:100*minima]"` | solid black masses that soak ink and can't be colored |

  Total ink coverage is **not** a useful gate, though it is the obvious one to
  reach for: a page with dense black fans can carry *less* total ink than a
  good one while being far worse. Colour needs no gate either — greyscale
  conversion destroys it, so a wrongly colored-in object normalizes to a clean
  outline on its own. (Thresholds derived from three samples; widen them if a
  real page trips one.)
- **Footer** — the shell's structural `<footer>` at the bottom of the page;
  `--text-2xs` label-font text in `--color-dim`, already styled by the base
  layer. Optionally put context ("Grade 2 ·", a date, a week
  label) in its left span. Never remove it, never mark it with
  `data-mp-section`.

---

## Page types (L3)

### Daily dashboard
A "today page": date header + stacked section blocks — agenda, top priorities,
sports scores, weather, notes, habit row. **Portrait.** The most composable
type; add/remove sections to taste.

*Functional requirements:*
- Today's date, and whatever each section needs. Fetch live data (scores,
  weather) — never invent values.
- Priorities use the **checklist block**; notes use the **lined writing area**;
  a score section uses a compact **score/stat table**.

*Default styling:* each zone is a **section block** with a `--border-thin`
outline and a `.kicker` label; `--space-6` between sections.

### Weekly calendar
One-week view. **Landscape** (7 columns fill the width better).

*Functional requirements:*
- The 7 dates for the requested week, weekday labels, and any known events.
- Each day cell holds a weekday abbreviation, the date number, and open space
  for events.
- Use the **calendar grid** block; no filled cell backgrounds.

*Default styling:* weekday abbreviation `--text-2xs` uppercase label font;
date number `--text-xl` display (`--text-lg` if dense); event space
`--text-xs` body; `--border-hair` cell rules. Fridge version: roomier cells,
bigger numbers.

### Monthly calendar
Classic month grid, 7 columns × 5–6 rows. **Landscape** for writing room;
portrait for a wall look.

*Functional requirements:*
- **Always compute real dates** — and double-check them. Work out the first
  weekday and day count for the requested month/year explicitly (handle
  February and leap years; don't hardcode 30/31), then verify one known anchor
  (e.g. what weekday the 1st falls on) before writing the grid. A calendar with
  the dates on the wrong weekdays is worse than no calendar.
- Month/year header, correct day layout, optional holidays/events.

*Default styling:* month/year at `--text-2xl` display; weekday header row
`--text-2xs` uppercase label font; `--border-hair` cell rules; date numbers
top-left in `--color-mid`.

### Planner page
A time-blocked daily or weekly planner. **Portrait.**

*Functional requirements:*
- Header, a schedule area (lined area with time labels 6am–10pm down the left
  side), a priorities checklist, a notes area.
- If it will be hole-punched or bound, add 0.25 in extra on the binding edge.

*Default styling:* **section blocks** containing each zone, `--border-thin`
outlines, time labels `--text-2xs` label font.

### Weekly brief / week at a glance
A one-sheet family week overview. **Portrait.**

*Functional requirements:*
- Header: family name (or "Weekly Brief") + week label on the right.
- Week grid, 7 rows (Mon–Sun) × 3 columns: day name + date (~72px), a small
  weather/temp cell if data was provided (blank placeholder otherwise), and an
  events/tasks column (listed events, or blank writing lines).
- A **Dinner Plan** section between grid and footer: 7 labeled blank lines.
- If upcoming events/milestones are mentioned, a "Coming Up" strip with
  countdown badges ("Emma's Birthday · 12d away") above the footer.
- Must fit one letter page portrait.

*Default styling:* grid borders `--border-thin` `var(--color-rule)` outer,
`--border-hair` `var(--color-rule-light)` inner; day column labels in
`var(--font-label)`.

### Worksheet
Title + instructions header, **name/date fields**, numbered problems/prompts
with **work boxes** beneath each. **Portrait.**

*Functional requirements (survive theming):*
- Header includes `Name: ________  Date: ________  Score: ___/___` blanks.
- Clearly numbered problems with generous room to work below or beside each.
- 14pt minimum font size for young readers; scale problem count and difficulty
  to the stated grade level.
- Blank writing lines wherever the answer is written out (words, sentences,
  spelling practice).
- An answer key rides the `answer_key_html` channel (assembly wraps it as a
  second sheet — see `assembly.md`); never author it as a second page or a
  page-break inside `content_html`.

*Default styling:*
- Title line display `--text-xl`, naming the topic ("Math
  Practice — Addition"); grade level label `--text-2xs`.
- 2-column layout for short problems (more fit per page); single column for
  longer problems or grids. Work box height ~80px for short answers, ~160px for
  showing work.
- Friendly but clean — no clip art or decorative elements, just typography.
  Generous line spacing; kids need room to write.

### Chore chart / habit tracker
Task rows × day/date columns, with checkboxes at intersections. **Landscape**
(many columns). Header names the person/family and time period.

*Functional requirements:*
- Grid: first column person (or task) names; then Mon–Sun day columns; each
  cell holds the chore with a ☐ checkbox (styled span). A star row (☆ per day)
  or last-row-per-person for earned stars.
- If the user names children, use those names; if ages are given, assign
  age-appropriate chores; otherwise "Child 1"/"Child 2". 1–2 chores per cell.
- A "Notes" or "Reward" footer section for the family to write in their reward
  system.
- Ink-friendly: empty checkboxes, no dark fills.

*Default styling:* `--border-hair` `var(--color-rule-light)` cell borders; day
headers in `var(--font-label)` small caps; header row inverted ink-on-paper
(`.invert`); alternating rows may use `.tint`.

### Meal planner
Weekly meal grid + shopping list. **Landscape** — the 7-day grid needs the
width; design for the ~912×680px content box and fill its height.

*Functional requirements:*
- Two-column grid, roughly 66% / 34%.
- LEFT — the week grid: 7 day rows (Mon–Sun). Each row: a day label cell plus
  Breakfast / Lunch / Dinner entries. Suggest REAL meal names ("Sheet Pan Lemon
  Herb Chicken", not "chicken").
- RIGHT — shopping list grouped by category (Produce, Proteins, Dairy, Pantry,
  Other), each item a bordered checkbox square + name; the list consolidates
  ingredients across the week.
- Varied, realistic, family-friendly meals; quick weeknight dinners (Tue–Thu),
  more involved weekend cooking. Honor any dietary preferences or family size.

*Default styling:* meal-type labels in tiny uppercase `var(--color-dim)`, meal
name in `var(--color-ink)`; `--border-hair` rules between rows, heavier
`--border-thin` `var(--color-rule)` day separators; category headers in
`var(--font-label)` small caps with an accent left-stripe.

### Recipe card
A single recipe formatted for kitchen use. **Portrait.**

*Functional requirements:*
- Header: recipe name, then a compact meta row — Prep: X min | Cook: Y min |
  Serves: N.
- Ingredients grouped by component ("For the sauce:"), one per line, quantity
  bold, generous line spacing for checking off.
- Numbered steps with key actions in bold ("Fold gently", "Do not overmix").
- Given a URL: fetch it and extract the actual recipe; strip ads and fluff, and
  attribute the source in the footer. Given a description: write a complete
  recipe.

*Default styling:* two-column layout — ingredients left (~35%), steps right
(~65%); step numbers display `--text-lg`; no images — clean text
for a splattered kitchen environment.

### Flashcards
Printable study cards. **Portrait.**

*Functional requirements:*
- Standard index-card proportions (3.5" × 2.5"), 4 cards per page (2 × 2 CSS
  grid), dashed borders as cut lines, tiny card number top-right.
- All FRONT cards first, then all BACK cards in the same order on following
  sheets, with "— FRONT —" / "— BACK —" section headers, so double-sided
  printing lines up.
- 8–16 concise cards — one fact or concept per card.

*Default styling:* front term centered display `--text-lg`; back
definition centered body `--text-body`; high contrast.

### Certificate / award
**Landscape** — set `orientation` to `landscape`. The page prints on a letter
sheet in landscape: 1056×816px, with a content box roughly **912px wide × 680px
tall** (a small footer sits below it).

*Functional requirements:*
- The outermost frame must FILL the content box — a certificate floating in
  dead space looks unfinished: `width: 100%; min-height: 620px; display: flex;
  flex-direction: column; justify-content: space-between;` so the rhythm
  spreads the full height. No fixed widths over 912px, no negative offsets,
  nothing positioned outside the frame.
- Vertical rhythm, top to bottom: kicker line (grade/team/year) → award title
  (display font, at most 2 lines) → thin rule + ornament divider → presentation
  line (italic, "This certificate is proudly presented to") → recipient name
  area (a scripted name or a blank hand-writing rule: centered border-bottom
  line at ~70% width — never a row of dash characters) → reason text (italic,
  centered, max-width ~440px) → signature grid (2–3 columns, thin rule above
  each role label) → optional seal/date row.
- One sheet, generous whitespace — do not overfill.
- **Robustness:** put ALL layout-critical styling INLINE on the elements
  (`style="..."` with `var()` tokens): frame borders and padding, decoration
  positions, type sizes. Reserve `custom_css` for the `:root` token block and
  minor refinement. Inline styles always survive; `custom_css` is dropped
  entirely on degrade, and the page must still look like a certificate without
  it.
- Every decorative `<svg>` MUST carry explicit `width` and `height` attributes
  (40–90px) so it can never render full-width. At most 2–3 decorative motifs.

*Default styling:* a stately double-border frame (`--border-mid` outer + nested
`--border-hair` inner) in `var(--color-ink)`/`var(--color-accent)` with
`--space-10` inner padding. Kicker at `--tracking-kicker`; award title at
`--text-2xl`–`--text-3xl`; ornament divider (· ❋ ·); signature role labels in
the label font at `--text-2xs`. Decorative motifs (stars, seals, laurels, sport
icons) as stroke-outline inline SVG in the token palette (`fill="none"`,
stroked paths — see design rule 1a), absolutely positioned inside the frame
corners. Set `font_import` for a display/script pairing matching the mood
(classic: Playfair Display + Dancing Script; athletic: Oswald; playful:
Fredoka). The award title or recipient name is the hero element.

### Scorecard / tally
Game scorecards, brackets, point tallies, bingo. Primarily a **score/stat
table** block. **Landscape** if wide.

*Functional requirements:* pre-fill team/player names if known; score cells
empty and large enough to write in.

*Default styling:* base `table` defaults.

### Sports box score / game recap
**Portrait** or landscape depending on how many games.

*Functional requirements:* real data only — fetch it (see the Gather step in
`SKILL.md`); never fabricate scores. Include: final score, team records,
quarter/inning line score, top 1–2 performers per team with stat lines, and a
one-sentence recap. Multiple games stack as repeated score blocks.

*Default styling:* score/stat table (tabular figures come from the base layer);
final-score numbers display `--text-3xl`; status ("Final") in
the label font small caps at `--text-2xs`.

### Weather forecast
**Portrait**, single column, generous whitespace, date/location at top.

*Functional requirements:* real data only — fetch it. Current conditions block
(city, current temp, condition, feels-like, humidity, wind), today's hourly
table (Time | Temp | Condition | Precip%), and a compact 7-day grid (Day | High
| Low | Condition | Rain%). Text glyphs ☀ ⛅ 🌧 ❄ print as black shapes.

*Default styling:* temperature as the hero at `--text-3xl`; base `table`
defaults; labels at `--text-2xs`.

### Financial / market summary
**Portrait.** Data-dense.

*Functional requirements:* real data only — fetch each quote. Market overview
at top (3 columns: index value, day change, % change; arrows for direction),
then a stock table (Ticker | Company | Price | Change | % Change | 52W High |
52W Low) with right-aligned amounts, and an "As of market close, DATE" stamp.

*Default styling:* label font throughout, display font for the header only;
positive values bold in ink, negative in `var(--color-dim)`.

### News digest
**Portrait.** 1–2 pages of content, fetched fresh.

*Functional requirements:* masthead-style header ("MORNING BRIEFING" or the
topic) with the date below; per story a headline, a dateline (SOURCE · DATE), a
2–3 sentence lede, optionally a pull quote. No images or URLs — nothing that
wastes ink.

*Default styling:* 2-column grid for 3+ stories, single column for 1–2;
headline display `--text-lg` bold; dateline in small caps via
`.kicker`; pull quote in a left-border box (`blockquote`); `--border-hair`
rules between stories, not boxes.

### Article reformat
Long-form reading page from a URL. **Portrait.**

*Functional requirements:* fetch the article; keep only headline, byline/date,
body paragraphs, pull quotes, section headers. No images, ads, or
related-article cruft. Source URL and print date at the bottom. Long articles:
design each `.page` to hold what fits — never CSS page-break properties (design
rule 4).

*Default styling:* single column at maximum readable width; body at
`--text-body` with leading a step looser than default (1.75); drop cap on the
first paragraph (`::first-letter` with a 3-line float); section headers with a
`--border-hair` top rule; the source line in `--color-dim` at `--text-2xs`.

### Travel itinerary
**Portrait.**

*Functional requirements:* header with trip title, date range, travelers. Per
day: a day header ("Day 1 — Monday, June 3") then a timeline of time +
activity, with the address beneath for GPS lookup and notes in italic.
Hotels/flights: confirmation # in a small box at right, check-in/out times
prominent. Packing list on request: a 3-column ☐ checklist grid at the end. If
details are vague, structure them logically with reasonable times.

*Default styling:* day header in the display font with a bottom rule; times
bold in a ~60px left margin; addresses in `var(--color-dim)` at `--text-2xs`.

### Receipt / expense report
**Portrait.** Professional, suitable for business submission.

*Functional requirements:* vendor name large and centered; address/phone small;
date + transaction # small; divider; line-items table (Item | Qty | Price |
Total, right-aligned amounts); Subtotal, Tax, Tip, TOTAL bold at bottom right;
payment method at bottom. From a photo: extract all text and rebuild it as a
clean structured receipt marked "Reconstructed from original receipt". Expense
report variant (multiple receipts or by name): a Date | Vendor | Category |
Amount | Purpose table with a total and `Employee: ______  Approved by: ______`
signature lines.

*Default styling:* label font throughout; amounts right-aligned on tabular
figures; `--border-hair` dividers.

### Journal / writing prompt page
**Portrait.** Keep it quiet and uncluttered — this page is mostly paper.

*Functional requirements:* a dated prompt above a generous **lined writing
area** (28px adult row spacing / 36px kids). Optionally a small quote or mood
row.

*Default styling:* prompt centered display `--text-lg`; rules in
`var(--color-rule-light)` at `--border-hair`.

### On this day
**Portrait.**

*Functional requirements:* a dated history digest — 4–6 events with year
badges, notable births, a "did you know". Use your own knowledge or fetch; keep
each entry to 1–2 sentences.

*Default styling:* year badges via `.badge` or `.kicker`; `--border-hair`
rules between entries.

### Astronomy page
**Portrait.**

*Functional requirements:* sun/moon data for a date and place —
sunrise/sunset, first/last light, moonrise/moonset, moon phase (draw the phase
as a stroke-outline SVG), daylight length. Fetch real data for the user's
location.

*Default styling:* a table plus one hero figure; the phase figure sized
90–140px and stroked in `var(--color-ink)`.

### Coloring / activity page
Title + full-area **image block** of **pure black line art on white**.
**Portrait** or landscape to match the image.

*Functional requirements:*
- Clean black outlines, no shading, no fill, white background. Bold simple
  lines for young kids; finer detail for adults. Verify it's line art, not a
  shaded illustration.
- Image resolution: ~**2100×2875px** (300 DPI across the 7.0 × 9.6 in portrait
  content box). Larger is fine; smaller prints soft.
- A user-provided image file is embedded as a data URI (grayscale by default,
  per the theme's `--image-filter`), after the **Image block** normalize pass.
- Size the art by **height, not width**: this aspect sits close to the content
  box's own, so `width:100%` overflows the sheet. Budget `max-height` =
  920px − title − footer; ~815px at the default `--text-xl` title, ~830px if
  you drop the title to `--text-lg` to buy the art more room.
- For a prompt-driven page with no image, use **Drawing prompt page** below.

*Turning a photograph into line art.* Needs an image backend
(`harness-support.md` Part 2); with none, hand-author the art as stroked SVG
per design rule 1a and say so. Keep the division of labour clear: the
**model** supplies composition, perspective and likeness — things that cannot
be hand-authored — while the **normalize pass** supplies resolution, 1-bit
conversion and line weight. Do not spend prompt iterations on anything the
normalize pass fixes deterministically; that is wasted effort.

Three failure modes recur, and all three must be closed *in the prompt*
because normalization cannot repair them. Ask for a **flat digital line-art
image** — naming a "coloring book page" invites a rendered photograph of a
physical book, complete with desk, page curl and a colored-in object. Forbid
**solid black anywhere**, requiring every object be an outline with a white
interior; call out dense radiating detail (fan pleats, ceiling planks)
specifically and ask for open white hubs, or converging lines fill in as
black masses. And require small signs and labels be **left blank**, or the
model invents scribbled lettering.

Expect these to trade against each other: closing one loophole commonly
reopens another, so re-run both Image-block checks after every iteration
rather than assuming a prompt that worked once still holds.

*Default styling:* title display `--text-xl`, centered above the
image; no frame around the art.

### Word search *(presentation-only — see the puzzle note)*
A letter-grid puzzle with a hidden word list. **Portrait.**

*Functional requirements:*
- Grid: 15×15 default (12×12 for ≤8-year-olds, 18×18 for adults). Every cell
  holds an uppercase letter — no blanks.
- Cells are square and evenly sized (26px is the workable default at 15×15):
  `display: grid; grid-template-columns: repeat(15, 26px); gap: 0`, each cell
  `width: 26px; height: 26px; text-align: center; line-height: 26px`.
- If the user supplied the grid, lay it out verbatim. If you generate one,
  place words horizontally/vertically/diagonally, fill the rest with random
  capitals — then re-check that every listed word actually appears, and say the
  grid should be spot-checked.

*Default styling:* cells label `--text-body`, weight 600, in
`var(--color-ink)`, with `--border-hair` `var(--color-rule-light)` borders;
word list below the grid label `--text-xs`, 3 columns.

### Maze *(presentation-only)*
A rectangular cell maze. **Portrait.**

*Functional requirements:* typical sizes (cols × rows) easy 15×10, medium
20×14, hard 25×18; entrance on the top edge, exit on the bottom, labeled
"IN"/"OUT". Render as SVG `<path>` walls or a CSS grid of cells with selective
borders. If the user supplied the maze structure, render it faithfully; if you
generate one, there is no verifier — tell the user to check it is solvable.

*Default styling:* walls stroked in `var(--color-ink)`; IN/OUT labels in the
label font at `--text-2xs`.

### Crossword *(presentation-only)*
**Portrait.**

*Functional requirements:* a numbered grid (CSS grid of white cells and ink
block cells, numbers in the top-left corner of entry cells) with Across/Down
clue columns below or beside. Lay out user-supplied grids and clues; a
self-generated crossword is very hard to get right — prefer asking for the
content.

*Default styling:* cell numbers `--text-2xs`; block cells `.invert`; clue
columns `--text-xs` label font.

### Sudoku *(presentation-only)*
9×9 grid. **Portrait.**

*Functional requirements:* givens rendered as provided, empty cells blank. Lay
out user-supplied puzzles; warn if asked to invent one.

*Default styling:* `--border-hair` `var(--color-rule-light)` cell borders with
`--border-thin` `var(--color-rule)` every third line; givens in
`var(--color-ink)` at `--text-lg`.

### Comic strip scaffold
Blank panels for kids to draw their own story — no pre-drawn art. **Portrait**
for 2 panels; **landscape** for 3–6 panels.

*Functional requirements:*
- Panels: 2–6 bordered rectangles in rows, each ≥ 2.5 in tall for drawing room.
- Inside each panel: a speech-bubble outline (empty `<div>` with
  `border-radius`, ~30% of panel width) and a caption strip ~20px tall at the
  bottom.
- Younger kids (≤8): 2–3 large panels; older: 4–6 smaller panels.

*Default styling:* panel and bubble borders `--border-thin`
`var(--color-rule)`; caption strip separated by `--border-hair`
`var(--color-rule-light)`; small panel number in `--color-dim` at the caption
strip's bottom-right.

### Drawing prompt page
A bold prompt at the top with a generous blank drawing area. **Portrait.**

*Functional requirements:*
- Prompt text in the top ~20%; a framed drawing area filling ≥40% of page
  height; optional 2–4 lined writing rows below for a caption.
- Prompts are specific and imaginative: "Draw a dragon hatching from an egg",
  not "Draw something fun".
- Young kids: larger prompt type, simpler language, 36px-spaced caption lines.

*Default styling:* prompt centered display `--text-xl`
(`--text-2xl` for young kids); drawing frame `--border-thin`
`var(--color-rule)`; a "Draw here ↓" label in `--color-dim` at `--text-2xs`
just above the frame.

### Generic reformat *(catch-all)*
The user's content, formatted as a beautiful print-ready page.

*Functional requirements:* infer the best structure —
- Long prose or notes → single column, body font, generous line-height.
- Recipe or how-to steps → 2-column (supplies left, numbered steps right).
- Reference or cheat sheet → dense 2–3 column CSS columns.
- Data or comparisons → table with an ink-on-paper header row.
- Short item list → card grid or definition list.

Always: a clear title/masthead at top; body at `--text-body` or larger with
`--leading-body`; source attribution at the bottom if the content came from a
URL.

*Default styling:* the base layer as shipped — display-font title, `.kicker`
labels, `--border-hair` rules, base `table` defaults. No decoration of its own.

---

## Composing a new type

When no type fits: identify the closest one above, then swap or add blocks. Keep
all content inside the sheet's content box — the page margin is the sheet's own
padding (`--page-margin-*`). Anything that overruns it continues onto a further
sheet rather than being lost, but where that break lands is decided by what fit,
not by the design, so a type that needs a second page should lay one out. Use
the **section block** as the primary container. Run the self-check in `design-rules.md` before assembling.
