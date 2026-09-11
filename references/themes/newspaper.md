# Theme: Newspaper (default)

The default theme, used whenever no style is named — and the **base layer
itself**: these are the values in `assets/shell/document.css`, so a Newspaper
page needs no `custom_css`. If this file and that stylesheet disagree, one of
them is wrong. Platform invariants live in `design-rules.md`.

## 1. Meta & Philosophy

A publication, not a document: masthead, kicker and byline conventions apply
even to a chore chart. Restraint is the aesthetic — proportion and rule weight
carry it, not decoration or chrome (no frame, no required motif). Voice is
third-person and declarative, no exclamation points, no emoji; section kickers
run in small caps ("TODAY'S AGENDA", not "Your Agenda!").

## 2. Typography

| Token | Value | Fallback |
|---|---|---|
| `--font-display` | Playfair Display | Georgia, serif |
| `--font-body` | Source Serif 4 | Georgia, serif |
| `--font-label` | Inter | system-ui, sans-serif |

`font_import`:
`https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=Inter:wght@300;400;500;600&display=swap`
— already in the page template, so Newspaper never sets `font_import`.

- Weights used: Playfair Display 400/700/900 (+ italic); Source Serif 4 400/600
  (+ italic); Inter 300/400/500/600. No weight below 300 anywhere.
- Type scale:

| Token | Value | Role |
|---|---|---|
| `--text-2xs` | 9px | dateline, table headers, footer, kicker |
| `--text-xs` | 10.5px | table body, section headings (h3), small labels |
| `--text-body` | 13.5px | body copy |
| `--text-md` | 15.5px | lead paragraphs |
| `--text-lg` | 19px | sub-headings |
| `--text-xl` | 26px | h2 |
| `--text-2xl` | 38px | h1 |
| `--text-3xl` | 48px | score numbers |
| `--text-4xl` | 80px | hero display, unused here |

| Token | Value | Role |
|---|---|---|
| `--leading-display` | 1.1 | h1, h2 |
| `--leading-body` | 1.65 | body copy, unchanged; `types/news-digest.md` tightens it per page, not the theme |
| `--leading-label` | 1.4 | labels, kickers, headings in the label font |
| `--tracking-display` | 0 | display type sets at normal tracking |
| `--tracking-label` | 0.08em | section headings (h3) |
| `--tracking-kicker` | 0.32em | `.kicker` and uppercase metadata rows |

`.kicker` (wide-set, 0.32em, opens a masthead or section) and `h3` (tighter,
0.08em, a heading inside running content) are different roles — don't
collapse them.

## 3. Color

- **Neutral ramp** — all derived from hue 78 / warm parchment chroma:

| Token | Value |
|---|---|
| `--color-ink` | `oklch(11% 0.005 78)` |
| `--color-mid` | `oklch(44% 0.008 78)` |
| `--color-dim` | `oklch(56% 0.006 78)` |
| `--color-ghost` | `oklch(87% 0.005 78)` |
| `--color-rule` | `oklch(11% 0.005 78)` |
| `--color-rule-light` | `oklch(83% 0.005 78)` |
| `--color-pull-bg` | `oklch(94% 0.009 78)` |

- **Accent:** `--color-accent` `oklch(52% 0.150 78)`. One accent only; a theme
  wanting a tinted surface retunes `--color-pull-bg` and uses `.tint`.
- **Rationing rule:** accent appears in kickers, pull-rules, star performers,
  score highlights, and the dateline only — never as a background.
- **Semantic role mapping:** winner/star values in ink at full weight;
  loser/secondary values in `--color-dim`; zero/placeholder values in
  `--color-ghost`; section headings and kickers in `--color-mid`; dateline in
  `--color-accent`; table header rows inverted ink-on-paper; alternating table
  rows tinted `--color-pull-bg`.
- **Light/dark:** light-on-white only (`--color-paper` is locked white
  platform-wide). `.invert` gives a small inverted band — mastheads/headers
  only, never a page treatment.

## 4. Spacing & Density

- `--space-1` … `--space-20` on a 4px base unit: 4, 8, 12, 16, 20, 24, 32, 40,
  48, 64, 80px. Newspaper uses the defaults unchanged.
- Page margin: defaults unchanged (`--page-margin-top` 64px /
  `--page-margin-x` 72px / `--page-margin-bottom` 72px; resulting content box
  in `design-rules.md`).
- Section rhythm: close-set — sections are separated by a rule plus
  `--space-4`-`--space-6` of vertical space. Restraint lives in rule weight and
  type, **not** in empty space.
- Density expectation: the sheet carries content to the bottom margin, and
  carries it the whole way down. Height and ink are different questions —
  spacing buys the first without buying the second, so a page that runs to
  the bottom on air is underfilled, not composed (principles.md VII). Fit it
  by writing to the space in the first draft; never by opening the rhythm.
  The fit check reports both numbers and warns below 30% ink, and the
  one-pass rule in `design-rules.md` applies: one adjustment, then ship.

## 5. Surface & Motifs

| Token | Value |
|---|---|
| `--border-fat` | 5px — section rules, accent stripes |
| `--border-mid` | 3px — blockquote stripe, badge outline |
| `--border-thin` | 1.5px — boxed components, utility outlines |
| `--border-hair` | 1px — table rules, `hr`, footer rule |
| `--page-border` | `none` |
| `--page-frame-inset` | 48px (0.5in) on every edge — derived from the page margin; the shell floors what it paints at 24px (0.25in), so neither a theme override nor a fit squeeze can put the frame in the unprintable edge |
| `--image-filter` | `grayscale(100%)` |

- **Page chrome:** no border — the sheet carries no frame onto paper.
- **Signature motifs:** none required. Shared opt-in utilities (`.tilt` /
  `.tilt-right` at `--tilt-angle` -0.6deg / 1.5deg, `.badge`, `.chapter-label`,
  `.halftone`) exist for any theme; Newspaper uses none by default.
- **Marks and imagery:** no icon system — a small mark (checkbox, divider) is a
  styled `<span>` or a hairline rule. Images run grayscale (`--image-filter`).

## 6. Components & Patterns

Signature blocks:

- **Masthead** — double-rule separator (3px solid, 2px gap, 1px solid) under a
  display-font title, optional `.kicker` above it.
- **Kicker** (`.kicker`) — `--text-2xs`, uppercase, `--tracking-kicker`, in
  `--color-mid`.
- **Dateline** (`.dateline`) — `--text-2xs` in `--color-accent`, under the
  masthead.
- **Pull-quote** — `--color-pull-bg` tint via `.tint`, or a
  `--border-mid` accent stripe (`blockquote`'s default: mid-weight left rule,
  italic, `--color-mid`).
- **Table** — label font at `--text-xs`, tabular figures; header row inverted
  at `--text-2xs` uppercase; `--border-hair` row rules; even rows tinted
  `--color-pull-bg`. A theme may override either with its own `th` / `td`
  rules.
- **Score box** (`.score-box`) — `--border-thin` accent frame, score at
  `--text-3xl` in the display font with tabular figures, team label at
  `--text-xs` in the label font.
- **Column grids** (`.columns-2`, `.columns-3`) — equal widths, 1.5em / 1em
  gaps. Per Principle III, only when the items really are equal.
- **Footer** — on every sheet: `--space-8` above, `--border-hair` top rule,
  `--text-2xs` label font in `--color-dim`, two slots.
- **Inverted band** (`.invert`) — ink surface, paper text; small bands only.

Empty, overflow, and underfill behavior: the baseline's, unchanged.

## 7. Contrast evidence

- `--color-ink` clears the 4.5:1 body floor easily.
- `--color-accent` clears the 3:1 large/bold floor. `.dateline` at
  `--text-2xs` is an accepted exception — redundant metadata, never the
  page's payload.
- Body type floor: 13.5px adult, 16px+ for kids' content.
