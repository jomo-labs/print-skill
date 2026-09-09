# The newsprint scale

The stylesheet for page types that set prose in columns and read as a
publication (`types/news-digest.md`, `types/box-score.md`). Read it in Step 3's
batch, paste the block below into `custom_css` as-is, and write the content in
its class vocabulary. Body copy stays at the 13.5px floor; what changes is the
leading, the display steps, the page margins and the spacing between things.

```css
:root {
  --page-margin-top: 48px; --page-margin-x: 48px; --page-margin-bottom: 56px;
  --leading-body: 1.4;
  --text-lg: 16px;     --text-xl: 22px;
  --text-2xl: 32px;    --text-3xl: 41px;
}
.hed { font-family: var(--font-display); line-height: var(--leading-display); padding-block: var(--display-overhang); margin: 0; }
.masthead { text-align: center; border-bottom: var(--border-mid) solid var(--color-ink); padding-bottom: var(--space-1); margin-bottom: var(--space-2); }
.nameplate { font-size: var(--text-3xl); font-weight: 700; margin: var(--space-1) 0; }
.ears { margin: 0; color: var(--color-mid); }
.section-head { border-bottom: var(--border-mid) solid var(--color-ink); padding-bottom: var(--space-1); margin-bottom: var(--space-2); }
.section-head h1 { font-size: var(--text-2xl); font-weight: 700; margin: 0; }
.story h2 { font-size: var(--text-lg); font-weight: 700; margin-bottom: 2px; }
.story.lead h2 { font-size: var(--text-xl); }
.deck { font-size: var(--text-md); color: var(--color-mid); margin: 2px 0 var(--space-1); line-height: 1.3; }
.dateline { margin: 0 0 var(--space-1); color: var(--color-mid); }
.story p { margin: 0 0 var(--space-1); }
.flow-2 { column-count: 2; column-gap: var(--space-4); column-rule: var(--border-hair) solid var(--color-rule-light); }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 var(--space-4); }
.grid-2 > .story + .story { border-left: var(--border-hair) solid var(--color-rule-light); padding-left: var(--space-4); }
.story.lead, .grid-2, .story.wide { border-top: var(--border-hair) solid var(--color-rule); padding-top: var(--space-2); margin-bottom: var(--space-2); }
.rail { margin-bottom: var(--space-2); }
.rail table { margin: 0; }
```

## Vocabulary

- **Masthead:** `<div class="masthead"><p class="kicker ears">date · slogan</p><h1 class="hed nameplate">Name</h1><p class="kicker ears">sections</p></div>`. An inside page opens with `<div class="section-head"><h1 class="hed">Sports</h1><p class="kicker ears">…</p></div>` instead.
- **Score rail:** `<div class="rail"><table>…</table></div>` — one header row of team names, one row of results; ~50px.
- **Story:** `<div class="story"><h2 class="hed">Headline</h2><p class="dateline kicker">SOURCE · PLACE</p><p>…</p></div>`. The lead adds `class="story lead"`, a `<p class="deck">` after the headline, and wraps its paragraphs in `<div class="flow-2">` so they flow in two ruled columns. A full-width story below the fold is `class="story wide"` with the same `flow-2` body.
- **Two stories side by side:** `<div class="grid-2"><div class="story">…</div><div class="story">…</div></div>` — the second gets a hairline to its left.
- **Display type** always carries `class="hed"` — it supplies the `--display-overhang` padding Part B item 9 requires, so no per-element rule is needed.

## What it holds

Measured on a two-sheet Letter paper (2026-09-08): a masthead, a score rail, a
lead with deck and three ~50-word paragraphs, two ~70-word stories side by side
and one ~65-word full-width story filled sheet one to 86% height at 57% ink; a
sports page of two small box-score tables with ~35-word recaps, a four-row
table and a 12×12 word search with 28px cells filled sheet two to 86% at 54%.
Those are the `types/news-digest.md` sentence budgets, and they held with no
squeeze. At the base margins and spacing the same content needed a spacing
squeeze to the 75% floor.

The label-font steps (`--text-2xs` 9px, `--text-xs` 10.5px) stay at base: they
are already at the floor `design-rules.md` states, and holding them *raised*
ink coverage (66%→68% front, 51%→54% sports) at no cost to fit.
