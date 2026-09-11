# News digest

**Portrait.** 1–2 pages of content, fetched fresh.

*Functional requirements:* masthead-style header ("MORNING BRIEFING" or the
topic) with the date below; per story a headline, a dateline (SOURCE · DATE),
and a lede of **about 4–5 sentences — roughly 80 words** — carrying the context
a reader needs to understand the story without looking it up: what happened,
the numbers, and what happens next. Six sentences is the **lead story's**
allowance, not every story's; written at that length throughout, five stories
overrun their sheet badly enough that no squeeze recovers it. The lead takes a
deck and 3–4 short column-set paragraphs. Optionally a pull quote. No images
or URLs — nothing that wastes ink.

*Density:* this is the page type that most depends on it — but the axis is
depth, not count. Carry **4–5 stories** in two columns on letter portrait and
fill the sheet by developing them, never by adding a seventh: a story cut to
three lines is a headline with a footnote, and a page of those is a poster,
not a paper. Plan the count and the sentence budget in the sizing ledger and
write to it in the first draft — never open up the rhythm to reach the bottom
margin. The fit check reports height and ink separately for exactly this
reason: spacing raises the first and not the second. Underfill here means the
ledes are too thin, not that a story is missing. If the first assembly still
reports underfill, one addition and one re-assembly is the budget
(`design-rules.md`, underfill); ship after that.

*The sheet budget:* four to five developed stories fill a letter sheet on their own.
Anything else the front page carries — a scoreboard band, a weather strip, a
teaser to an inside page — competes with the stories for that room and has to
earn it at one line. Set it as a single tabular rail (~50px), not a row of
score boxes (~146px for the same four results); the rail reads better on a
news page anyway, and the boxes belong on the sports sheet where the games
are actually covered.

*Default styling:* set in **the newsprint scale** — paste the stylesheet in
`references/newsprint.md` into `custom_css` and write the content in its class
vocabulary (masthead, rail, story, lead, deck, dateline, flow-2, grid-2). Body
copy stays at 13.5px; the sentence budget above is what fills a sheet at that
scale, measured — over it, cut ledes before adding a sheet.

2-column grid for 3+ stories, single column for 1–2; headline display
`--text-lg` bold; dateline in small caps via `.kicker`; pull quote in a
left-border box (`blockquote`); `--border-hair` rules between stories, not
boxes.
