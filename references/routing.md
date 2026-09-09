# Routing: page type and theme

Both routing tables, in one file — this is all Step 1 needs. Match here and come
out with a type slug and, when the request is themed, a theme slug; Step 3 reads
everything they point at in one command.

---

## Page type

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
| 22 | News digest | "news", "newspaper", "morning paper", "front page", "edition", "headlines", "top stories", "briefing" | Late — its keywords are broad |
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

### One spec file per type

Each type's full spec — functional requirements and default styling — lives
in its own file under `types/`. **Read only the matched type's file**; the
rest of the catalog is other requests' context, and reading it all costs
every later turn. (Pages that embed derived line art also read
`types/image-block.md`.) A row that names a second file — `newsprint.md`, at
`references/newsprint.md` — loads both in Step 3's one batched command.

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
| Sports box score / game recap | `types/box-score.md` + `newsprint.md` |
| Weather forecast | `types/weather-forecast.md` |
| Financial / market summary | `types/financial-summary.md` |
| News digest | `types/news-digest.md` + `newsprint.md` |
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

## Theme

Only when the request is themed (the detection rule is in `SKILL.md` Step 1).
Load the **one** matching spec; reading every spec defeats on-demand loading.

| Theme | File | Trigger phrases |
|---|---|---|
| Newspaper | `newspaper.md` | *(default — no triggers; it is the base layer, used whenever no style is named, which is not a themed request)* |
| Comic | `comic.md` | "Dog Man", "comic book", "comic strip", "Captain Underpants", "kids comic" |
| Sports | `sports.md` | "baseball", "basketball", "soccer", "football", "hockey", "World Cup", "little league", "varsity", "sports theme", "trading card", "stadium", "jersey" |
| Arcade | `arcade.md` | "8-bit", "8 bit", "arcade", "pixel art", "video game", "retro game", "game console", "Minecraft", "Mario", "Zelda", "Pokemon" |
| Field guide | `field-guide.md` | "field guide", "botanical", "naturalist", "nature journal", "herbarium", "specimen", "Audubon", "vintage science", "apothecary", "old encyclopedia" |

**Matching is forgiving about punctuation and spacing**: compare trigger
phrases and the request with everything lowercased and non-alphanumerics
stripped, so "dogman" = "Dog Man" = "dog-man".

**A trigger must match whole words, not any substring** — "comic" matches "a
comic-strip layout" but NOT "economic", so check for a word boundary either
side. Ignore trigger phrases shorter than 4 characters.

**First match wins, scanning the index top to bottom** — not the earliest match
in the request text. Row order is therefore load-bearing now that a request can
plausibly hit two themes: "a baseball page in a Dog Man theme" matches Comic,
because Comic sits above Sports. The order encodes specificity — a named
property beats a genre, and a genre beats a period look — so a new theme goes
in at the row where its triggers are more specific than everything below it and
less specific than everything above.

If a trigger matches → load `themes/<file>` and follow **Executing a matched
spec** in `themes/README.md`. If the request is themed but nothing matches ("in
the style of Batman") → follow **Ad-hoc theme** in that same file. Either way
`themes/README.md` is part of Step 3's batch.
