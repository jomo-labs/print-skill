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

When the request is **themed** (see `themes/README.md`), each page type's
**Functional requirements** below still hold, but its **Default styling** is
dropped entirely — the theme spec (or ad-hoc theme design) governs everything
visual instead. This is deliberate: mixing a type's default fonts and decoration
rules with a theme dilutes the theme.

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
  fixed height, each with `border-bottom: 1px solid var(--color-rule-light)`.
  Spacing by audience: 28px rows (adults), 36px rows (early writers/kids, with
  a dashed midline row if needed). Don't draw lines with
  `repeating-linear-gradient` backgrounds — the shell's no-fill enforcement
  strips background images inside the page.
- **Grid/graph area** — square grid or dot grid for math work, bullet journaling.
  Dot grid is the most ink-friendly.
- **Work box** — a bordered empty rectangle beneath a question/problem for
  student answers. Size to the expected work length.
- **Name/date fields** — underline fields for name and date, typically at top of
  worksheets and certificates.
- **Score/stat table** — labeled rows × columns for game scores, standings,
  tallies. Ink-on-paper header row, hairline borders.
- **Image block** — a placed raster image sized to a region. Full-area for
  coloring pages, spot-sized for decoration. Minimum 300 DPI at the printed size.
- **Footer** — the shell's structural `<footer>` at the bottom of the page; small
  9px text in `--color-dim`. Optionally put context ("Grade 2 ·", a date, a week
  label) in its left span. Never remove it, never mark it with
  `data-mp-section`.

---

## Page types (L3)

### Daily dashboard
A "today page": date header + stacked section blocks — agenda, top priorities,
sports scores, weather, notes, habit row. **Portrait.** The most composable type;
add/remove sections to taste.

- Content: today's date, and whatever each section needs. Fetch live data
  (scores, weather) — never invent values.
- Sections use the **section block** pattern with a thin border and label.
  Priorities use the **checklist block**. Notes use the **lined writing area**.
  A score section uses a compact **score/stat table** inside a section block.

### Weekly calendar
One-week view. **Landscape** (7 columns fill the width better). Each day cell:
weekday abbreviation (label font, uppercase, 9px), large date number (display
font, 22px), open bullet space for events (body font, 11px).

- Content: the 7 dates for the requested week, weekday labels, any known events.
- Use the **calendar grid** block. Hairline borders, no filled backgrounds.
- For a family/fridge version: roomy cells, larger numbers. For a personal
  planner: denser.

### Monthly calendar
Classic month grid. **Landscape** for writing room; portrait for a wall look.
7 columns × 5–6 rows.

- **Always compute real dates** — and double-check them. Work out the first
  weekday and day count for the requested month/year explicitly (handle February
  and leap years; don't hardcode 30/31), then verify one known anchor (e.g. what
  weekday the 1st falls on) before writing the grid. A calendar with the dates on
  the wrong weekdays is worse than no calendar.
- Content: month/year header, correct day layout, optional holidays/events.

### Planner page
A time-blocked daily or weekly planner. **Portrait.** Header, a schedule area
(lined area with time labels 6am–10pm down the left side), a priorities
checklist, a notes area.

- Use **section blocks** to contain each zone.
- If it will be hole-punched or bound, add 0.25 in extra on the binding edge.

### Weekly brief / week at a glance
A one-sheet family week overview. **Portrait.**

*Functional requirements:*
- Header: family name (or "Weekly Brief") + week label on the right.
- Week grid, 7 rows (Mon–Sun) × 3 columns: day name + date (~72px), a small
  weather/temp cell if data was provided (blank placeholder otherwise), and an
  events/tasks column (listed events, or blank writing lines).
- A **Dinner Plan** section between grid and footer: 7 labeled blank lines.
- If upcoming events/milestones are mentioned, a "Coming Up" strip with countdown
  badges ("Emma's Birthday · 12d away") above the footer.
- Must fit one letter page portrait.

*Default styling:* shell tokens throughout (`var(--color-*)`, `var(--font-*)`);
grid borders `1.5px solid var(--color-rule)` outer, `1px solid
var(--color-rule-light)` inner; day column labels in `var(--font-label)`.

### Worksheet
Title + instructions header, **name/date fields**, numbered problems/prompts with
**work boxes** beneath each. **Portrait.**

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
- Title line in the display font, ~20pt, naming the topic ("Math Practice —
  Addition"); grade level in small text if specified.
- 2-column layout for short problems (more fit per page); single column for
  longer problems or grids. Work box height ~80px for short answers, ~160px for
  showing work.
- Friendly but clean — no clip art or decorative elements, just typography.
  Generous line spacing; kids need room to write.

### Chore chart / habit tracker
Task rows × day/date columns, with checkboxes at intersections. **Landscape**
(many columns). Header names the person/family and time period.

*Functional requirements:*
- Grid: first column person (or task) names; then Mon–Sun day columns; each cell
  holds the chore with a ☐ checkbox (styled span). A star row (☆ per day) or
  last-row-per-person for earned stars.
- If the user names children, use those names; if ages are given, assign
  age-appropriate chores; otherwise "Child 1"/"Child 2". 1–2 chores per cell.
- A "Notes" or "Reward" footer section for the family to write in their reward
  system.

*Default styling:* shell tokens only. Hairline cell borders
(`1px solid var(--color-rule-light)`), day headers in `var(--font-label)` small
caps, header row as ink-on-paper (never a color fill), alternating rows may use
`var(--color-pull-bg)`. Ink-friendly: empty checkboxes, white background, no
dark fills.

### Meal planner
Weekly meal grid + shopping list. **Landscape** — the 7-day grid needs the
width; design for the ~912×680px content box and fill its height.

*Functional requirements:*
- Two-column grid, roughly 66% / 34%.
- LEFT — the week grid: 7 day rows (Mon–Sun). Each row: a day label cell plus
  Breakfast / Lunch / Dinner entries — meal-type in tiny uppercase
  `var(--color-dim)`, meal name in `var(--color-ink)`. Suggest REAL meal names
  ("Sheet Pan Lemon Herb Chicken", not "chicken").
- RIGHT — shopping list grouped by category (Produce, Proteins, Dairy, Pantry,
  Other), each item a bordered checkbox square + name; the list consolidates
  ingredients across the week.
- Varied, realistic, family-friendly meals; quick weeknight dinners (Tue–Thu),
  more involved weekend cooking. Honor any dietary preferences or family size.

*Default styling:* rules between rows `var(--color-rule-light)`, heavier day
separators `var(--color-rule)`; category headers in `var(--font-label)` small
caps with an accent left-stripe.

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
(~65%); large step numbers in the display font; no images — clean text for a
splattered kitchen environment.

### Flashcards
Printable study cards. **Portrait.**

*Functional requirements:*
- Standard index-card proportions (3.5" × 2.5"), 4 cards per page (2 × 2 CSS
  grid), dashed borders as cut lines, tiny card number top-right.
- All FRONT cards first, then all BACK cards in the same order on following
  sheets, with "— FRONT —" / "— BACK —" section headers, so double-sided
  printing lines up.
- 8–16 concise cards — one fact or concept per card.

*Default styling:* front term centered and large (~18pt display font); back
definition centered (~13pt body font); high contrast.

### Certificate / award
**Landscape** — set `paper` to `landscape`. The page prints on a letter sheet in
landscape: 1056×816px, with a content box roughly **912px wide × 680px tall** (a
small footer sits below it).

*Functional requirements:*
- The outermost frame must FILL the content box — a certificate floating in dead
  space looks unfinished: `width: 100%; min-height: 620px; display: flex;
  flex-direction: column; justify-content: space-between;` so the rhythm spreads
  the full height. No fixed widths over 912px, no negative offsets, nothing
  positioned outside the frame.
- Vertical rhythm, top to bottom: kicker line (grade/team/year — small caps,
  letter-spacing ~0.3em) → award title (display font, 40–52px, at most 2 lines)
  → thin rule + ornament divider (· ❋ ·) → presentation line (italic, "This
  certificate is proudly presented to") → recipient name area (a scripted name
  or a blank hand-writing rule: centered border-bottom line at ~70% width —
  never a row of dash characters) → reason text (italic, centered, max-width
  ~440px) → signature grid (2–3 columns, thin rule above each role label) →
  optional seal/date row.
- One sheet, generous whitespace — do not overfill.
- **Robustness:** put ALL layout-critical styling INLINE on the elements
  (`style="..."` with `var()` tokens): frame borders and padding, decoration
  positions, type sizes. Reserve `custom_css` for the `:root` token block and
  minor refinement. Inline styles always survive; `custom_css` is dropped
  entirely on degrade, and the page must still look like a certificate without
  it.
- Every decorative `<svg>` MUST carry explicit `width` and `height` attributes
  (40–90px) so it can never render full-width. At most 2–3 decorative motifs.

*Default styling:* a stately double-border frame (e.g. 3px outer + nested 1px
inner) in `var(--color-ink)`/`var(--color-accent)` with generous inner padding
(~40px). Decorative motifs (stars, seals, laurels, sport icons) as stroke-outline
inline SVG in the token palette (`fill="none"`, stroked paths — see design rule
1a), absolutely positioned inside the frame corners. Set `font_import` for a
display/script pairing matching the mood (classic: Playfair Display + Dancing
Script; athletic: Oswald; playful: Fredoka). The award title or recipient name is
the hero element. Signature lines: underline spans with the signer's role beneath
in 9px label font.

### Scorecard / tally
Game scorecards, brackets, point tallies, bingo. Primarily a **score/stat
table** block. **Landscape** if wide. Pre-fill team/player names if known.

### Sports box score / game recap
*Functional requirements:* real data only — fetch it (see the Gather step in
`SKILL.md`); never fabricate scores. Include: final score, team records,
quarter/inning line score, top 1–2 performers per team with stat lines, and a
one-sentence recap. Multiple games stack as repeated score blocks.

*Default styling:* score/stat table with tabular figures; big final-score
numbers in the display font; status ("Final") in label font small caps.

### Weather forecast
Current conditions block (city, current temp huge ~48pt, condition, feels-like,
humidity, wind), today's hourly table (Time | Temp | Condition | Precip%), and a
compact 7-day grid (Day | High | Low | Condition | Rain%). Text glyphs ☀ ⛅ 🌧 ❄
print as black shapes. Single column, generous whitespace, date/location at top.
Real data only — fetch it.

### Financial / market summary
Market overview at top (3 columns: index value, day change, % change; bold for
positive, `var(--color-dim)` for negative, arrows for direction), then a clean
stock table (Ticker | Company | Price | Change | % Change | 52W High | 52W Low),
right-aligned amounts, "As of market close, DATE" stamp. Label font throughout
(data-dense); display font for the header only. Real data only — fetch each
quote.

### News digest
Masthead-style header ("MORNING BRIEFING" or the topic) with the date below.
2-column grid for 3+ stories, single column for 1–2. Per story: headline
(display font, ~16pt bold), dateline in small caps (SOURCE · DATE), a 2–3
sentence lede, optionally a pull quote in a left-border box. Thin rules between
stories, not boxes. No images or URLs — nothing that wastes ink. 1–2 pages of
content, fetched fresh.

### Article reformat
Long-form reading page from a URL. Fetch the article; keep only headline,
byline/date, body paragraphs, pull quotes, section headers. Single column at
maximum readable width; body ~13.5pt with line-height 1.75; drop cap on the
first paragraph (`::first-letter` with a 3-line float); section headers with a
thin top border. No images, ads, or related-article cruft. Source URL and print
date at the bottom in small `var(--color-dim)` text. Long articles: design each
`.page` to hold what fits — never CSS page-break properties (design rule 4).

### Travel itinerary
Header: trip title, date range, travelers. Per day: a day header ("Day 1 —
Monday, June 3", display font, bottom border), then a timeline — time in a bold
~60px left margin, activity right, address in small `var(--color-dim)` text
beneath (for GPS lookup), notes in italic. Hotels/flights: confirmation # in a
small box at right, check-in/out times prominent. Packing list on request: a
3-column ☐ checklist grid at the end. If details are vague, structure them
logically with reasonable times.

### Receipt / expense report
Vendor name large and centered; address/phone small; date + transaction # small;
divider; line-items table (Item | Qty | Price | Total, right-aligned amounts);
Subtotal, Tax, Tip, TOTAL bold at bottom right; payment method at bottom. From a
photo: extract all text and rebuild it as a clean structured receipt marked
"Reconstructed from original receipt". Expense report variant (multiple receipts
or by name): a Date | Vendor | Category | Amount | Purpose table with a total
and `Employee: ______  Approved by: ______` signature lines. Label font
throughout; professional, suitable for business submission.

### Journal / writing prompt page
A dated prompt (display font, centered) above a generous **lined writing area**
(28px adult spacing / 36px kids). Optionally a small quote or mood row. Keep it
quiet and uncluttered — this page is mostly paper.

### On this day
A dated history digest: 4–6 events with year badges, notable births, a "did you
know". Use your own knowledge or fetch; keep each entry to 1–2 sentences.

### Astronomy page
Sun/moon data for a date and place: sunrise/sunset, first/last light, moonrise/
moonset, moon phase (draw the phase as a stroke-outline SVG), daylight length.
Fetch real data for the user's location; a table plus one hero figure.

### Coloring / activity page
Title + full-area **image block** of **pure black line art on white**.
**Portrait** or landscape to match the image.

- With a generated or provided image: clean black outlines, no shading, no fill,
  white background. Bold simple lines for young kids; finer detail for adults.
  Verify it's line art, not a shaded illustration.
- Image DPI: target ≈2250×3000 px for a full Letter page inside margins
  (300 DPI at 7.5×10 in).
- If the user provided an image file, embed it as a data URI, grayscale.
- For a prompt-driven page with no image, use **Drawing prompt page** below.

### Word search *(presentation-only — see the puzzle note)*
A letter-grid puzzle with a hidden word list. **Portrait.**

- Grid: 15×15 default (12×12 for ≤8-year-olds, 18×18 for adults). Every cell
  holds an uppercase letter — no blanks.
- Render as CSS grid: `display: grid; grid-template-columns: repeat(15, 26px);
  gap: 0`. Each cell: `width: 26px; height: 26px; text-align: center;
  line-height: 26px; font-family: var(--font-label); font-size: 13px;
  font-weight: 600; color: var(--color-ink);` border
  `1px solid var(--color-rule-light)`.
- Word list below the grid: label font 12px, 3 columns.
- If the user supplied the grid, lay it out verbatim. If you generate one, place
  words horizontally/vertically/diagonally, fill the rest with random capitals —
  then re-check that every listed word actually appears, and say the grid should
  be spot-checked.

### Maze *(presentation-only)*
A rectangular cell maze. **Portrait.** Typical sizes (cols × rows): easy 15×10,
medium 20×14, hard 25×18; entrance on the top edge, exit on the bottom, labeled
"IN"/"OUT" in 9px label font. Render as SVG `<path>` walls or a CSS grid of
cells with selective borders. If the user supplied the maze structure, render it
faithfully; if you generate one, there is no verifier — tell the user to check
it is solvable.

### Crossword *(presentation-only)*
Numbered grid (CSS grid of white cells and ink block cells, numbers in the top-
left corner of entry cells at ~8px) with Across/Down clue columns below or
beside. Lay out user-supplied grids and clues; a self-generated crossword is
very hard to get right — prefer asking for the content.

### Sudoku *(presentation-only)*
9×9 CSS grid, `1px solid var(--color-rule-light)` cell borders with
`2px solid var(--color-rule)` every third line, givens in `var(--color-ink)`
~18px, empty cells blank. Lay out user-supplied puzzles; warn if asked to invent
one.

### Comic strip scaffold
Blank panels for kids to draw their own story — no pre-drawn art. **Portrait**
for 2 panels; **landscape** for 3–6 panels.

- Panels: 2–6 bordered rectangles in rows, each ≥ 2.5 in tall for drawing room.
- Inside each panel: a speech-bubble outline (empty `<div>` with
  `border-radius`, `border: 2px solid var(--color-rule)`, ~30% of panel width)
  and a caption strip (`border-top: 1px solid var(--color-rule-light)`, 20px
  tall) at the bottom.
- Panel border `2px solid var(--color-rule)`; small panel number in
  `--color-dim` at the caption strip's bottom-right.
- Younger kids (≤8): 2–3 large panels; older: 4–6 smaller panels.

### Drawing prompt page
A bold prompt at the top with a generous blank drawing area. **Portrait.**

- Prompt text (display font, 24–32px, centered) in the top ~20%; a framed
  drawing area (`border: 2px solid var(--color-rule)`) filling ≥40% of page
  height; optional 2–4 lined writing rows below for a caption.
- "Draw here ↓" label (9px, `--color-dim`) just above the frame.
- Young kids: 36px prompt, simpler language, 36px-spaced lines if any.
- Prompts are specific and imaginative: "Draw a dragon hatching from an egg",
  not "Draw something fun".

### Generic reformat *(catch-all)*
The user's content, formatted as a beautiful print-ready page. Infer the best
structure:

- Long prose or notes → single column, body font, generous line-height.
- Recipe or how-to steps → 2-column (supplies left, numbered steps right).
- Reference or cheat sheet → dense 2–3 column CSS columns.
- Data or comparisons → table with an ink-on-paper header row.
- Short item list → card grid or definition list.

Always: a clear title/masthead at top; body ≥ 13.5px with line-height ≥ 1.65;
source attribution at the bottom if the content came from a URL.

---

## Composing a new type

When no type fits: identify the closest one above, then swap or add blocks. Keep
all content inside the 0.5 in safe area. Use the **section block** as the
primary container. Run the self-check in `design-rules.md` before assembling.
