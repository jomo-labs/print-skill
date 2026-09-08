# Theme: Sports (broadcast scoreboard)

**Trigger phrases:** "baseball", "basketball", "soccer", "football", "hockey",
"World Cup", "little league", "varsity", "sports theme", "sports card",
"trading card", "stadium", "jersey", or similar.

Deliberately NOT triggered by "score", "box score", "game", "standings" or a
bare team name: those are page-type cues (`page-types.md` row 3), not a named
visual identity, and a plain box-score request is not a themed request at all.

Platform invariants are in `design-rules.md`; only what Sports changes is below.

## 1. Meta & Philosophy

Broadcast-scoreboard energy: one number per block is the subject and gets the
display size; everything else is a tracked, uppercase stat abbreviation.
Condensed type buys density at arm's-length fridge legibility; rules divide
cells, never fills. Voice is present-tense and clipped — team or player name
first, then the fact.

## 2. Typography

| Token | Value | Fallback |
|---|---|---|
| `--font-display` | Oswald | Impact, sans-serif |
| `--font-body` | Barlow | system-ui, sans-serif |
| `--font-label` | Barlow Condensed | system-ui, sans-serif |

`font_import`:
`https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Barlow:ital,wght@0,400;0,500;0,600;1,400&family=Barlow+Condensed:wght@500;600;700&display=swap`

- Weights used: Oswald 500/600/700 for display and figures; Barlow 400/500/600
  (+ italic) for body; Barlow Condensed 600/700 for labels. Never Oswald 200 or
  300 — the strokes thin out to nothing at print resolution.
- Scale changes:

| Token | Value | Why |
|---|---|---|
| `--text-2xs` | 9.5px | stat abbreviations set in a condensed face need the extra half-pixel |
| `--text-body` | 14px | Barlow's x-height runs small for a sans |
| `--text-3xl` | 56px | secondary figures, opponent's score |
| `--text-4xl` | 96px | the scoring figure — one per block, never two |

| Token | Value | Why |
|---|---|---|
| `--leading-display` | 0.92 | condensed figures stack tight; broadcast slabs have almost no gap |
| `--tracking-display` | -0.01em | Oswald is already condensed — do not track it out |
| `--tracking-label` | 0.14em | stat abbreviations read as abbreviations only when tracked |
| `--tracking-kicker` | 0.26em | pulled in from the default 0.32em; the condensed label face needs less |

- OpenType: tabular figures are already the baseline default and are
  load-bearing here — every figure column must align. Do not disable them.

## 3. Color

- **Neutral ramp** — cool graphite, hue 250, on the same L steps as the default:

| Token | Value |
|---|---|
| `--color-ink` | `oklch(11% 0.006 250)` |
| `--color-mid` | `oklch(44% 0.010 250)` |
| `--color-dim` | `oklch(67% 0.008 250)` |
| `--color-ghost` | `oklch(87% 0.006 250)` |
| `--color-rule` | `oklch(11% 0.006 250)` |
| `--color-rule-light` | `oklch(83% 0.006 250)` |
| `--color-pull-bg` | `oklch(94% 0.010 250)` |

- **Accents** (text and borders only):

| Token | Value | Use |
|---|---|---|
| `--color-team` | `oklch(42% 0.120 250)` | the primary/home identity — winner figures, masthead rule, kicker |
| `--color-live` | `oklch(50% 0.190 25)` | live/final flags, records broken, the one thing on the page that is urgent |
| `--color-turf` | `oklch(48% 0.110 150)` | positive deltas, "W", completed rows |

- **Rationing rule:** one accent dominant per page — `--color-team` — with
  `--color-live` on at most three marks and `--color-turf` on outcome glyphs
  only. Never a fill, never a highlighter band behind a row; a leading row is
  marked by a `--border-fat` left rule in `--color-team`, not by a tint.
- **Semantic role mapping:** winner figure `--color-team` at `--text-4xl`;
  loser figure `--color-dim` at `--text-3xl`; zero or DNP `--color-ghost`;
  table header row `--color-mid` on a `--border-mid` bottom rule; kicker
  `--color-team`; "FINAL"/"LIVE" flag `--color-live`.

## 4. Spacing & Density

Default `--space-*` scale and page margins. Density comes from the type, not
from moved spacing: stat tables use `--space-1`/`--space-2` cell padding, and
the section rhythm stays on the default steps so a scoreboard block and a
paragraph of recap sit on the same grid.

## 5. Surface & Motifs

| Token | Value |
|---|---|
| `--page-border` | `none` |
| `--border-mid` | `2.5px` |
| `--border-hair` | `0.75px` |

- **Page chrome:** no frame, deliberately — the identity is carried by the
  masthead rule and the stat grid.
- **Signature motifs:** `.kicker` for the matchup line; a **rail number** — the
  figure set in the display font at `--text-4xl`, sitting in a left column with
  a `--border-fat` rule in `--color-team` beside it; a **stat strip**, a single
  row of tracked `--text-2xs` abbreviations over a `--border-mid` rule; and a
  **record tag**, `.badge` outlined in `--color-live` for a milestone. `.tilt`
  is not used — nothing on a scoreboard is crooked.
- **Marks and imagery:** `--image-filter` unchanged (`grayscale(100%)`). No
  icon system, and specifically no team logos: a real club mark is a trademark
  and does not survive stroked line art (see "Getting a mark that reads" in
  `README.md`). The substitute is a **wordmark** — the team name set in the
  display font, uppercase, tracked to match the block it labels. Where a sport
  needs a mark, draw the equipment rather than the club: a ball's seam pattern
  reads at an inch, a crest does not.

## 6. Components & Patterns

- **Scoreline header** — kicker matchup line in `--color-team`, then two rail
  numbers side by side separated by a `--border-mid` vertical rule, winner in
  `--color-team` and loser in `--color-dim`, with a right-hand FINAL/date flag.
- **Stat table** — the baseline styles `th` as reversed type on a solid
  `--color-ink` band; Sports **overrides that** to tracked condensed labels in
  `--color-mid` over a `--border-mid` bottom rule. A reversed band is a heavy
  ink fill that a home printer lays down unevenly across a wide table, and it
  competes with the rail number for the darkest mark on the page. Body rows are
  separated by `--border-hair`, figures right-aligned and tabular, and the
  leading row carries a `--border-fat` left rule in `--color-team`. Never
  zebra-striped; that would be a fill.
- **Roster / sign-up grid** — same rule grid, name column left-aligned in the
  body face, remaining columns fixed-width write-in cells at least 28px tall.
  Position or role abbreviations go in the label face.
- **Recap paragraph** — the one place body prose appears; set at `--text-body`
  in a single column no wider than 460px so it does not compete with the grid.
- **Overflow deviation:** a stat table that overflows drops columns from the
  right (least diagnostic first), never reduces the figure size or the rule
  weights — a scoreboard whose numbers shrink to fit has lost the theme.

## 7. Contrast evidence

Against white paper (`--color-paper`), sRGB-clamped:

- `--color-team` — 8.46:1, safe at any size, including the `--text-2xs`
  kicker.
- `--color-live` — 6.63:1 and `--color-turf` — 6.21:1, both safe at any size;
  live is rationed by the rule above, not by contrast.

Body type floor: the default. This theme is not kids-first and does not raise
it — but for a kids' team (little league, a school roster), take the 16px
floor from `comic.md` and say so on the page's own terms.
