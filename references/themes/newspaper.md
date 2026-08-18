# Theme: Newspaper (default)

The default theme, and the theme every other theme is judged against. If a user
names no style, generate in this theme.

Newspaper is also the **base layer itself**: its token values are the ones
declared in `assets/shell/document.css`, and the element defaults there are its
components. So a Newspaper page needs no `custom_css` at all — the values below
are documentation of what a page already gets, and the reference every other
theme's overrides are measured against. Keep this file and that stylesheet in
step: if one changes, the other is wrong.

The universal print rules — sheet geometry, no animation, grayscale imagery,
empty/overflow behavior, contrast floors, tabular figures — are in
`design-rules.md`'s "Platform invariants" section and are not restated here.

## 1. Meta & Philosophy

- **Principles specific to this theme:**
  1. A page is a publication, not a document — masthead, kicker, byline
     conventions apply even to a chore chart.
  2. Restraint is the aesthetic. The look comes from proportion and rule
     weight, not decoration.
  3. Every element earns its place in the hierarchy before it earns a visual
     treatment.
- **Personality adjectives:** editorial, restrained, considered, timeless,
  quietly confident.
- **Voice & microcopy:** third-person, declarative sentences. Section kickers
  in small caps ("TODAY'S AGENDA", not "Your Agenda!"). No exclamation points,
  no emoji. Bylines and datelines where the content calls for them (e.g.
  "Tuesday, June 17" under a masthead).
- **What makes it distinctive:** it's the only shipped theme with zero chrome
  flourish — no border on `.page`, no signature motif required.
  Distinctiveness comes entirely from typography (Playfair Display display type
  + Source Serif 4 body) and rule-based hierarchy (double rules, kicker
  labels), not from a visual gimmick. This restraint is the brand
  differentiator.

## 2. Typography

| Token | Value | Fallback |
|---|---|---|
| `--font-display` | Playfair Display | Georgia, serif |
| `--font-body` | Source Serif 4 | Georgia, serif |
| `--font-label` | Inter | system-ui, sans-serif |

`font_import`:
`https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=Inter:wght@300;400;500;600&display=swap`
— already loaded by the page template for every page, themed or not, so a
Newspaper page never sets `font_import`.

- Weights used: Playfair Display 400/700/900 (+ italic); Source Serif 4 400/600
  (+ italic); Inter 300/400/500/600. No weight below 300 anywhere.
- Type scale — the shipped values of the full scale:

| Token | Value | Role |
|---|---|---|
| `--text-2xs` | 9px | dateline, table headers, footer, kicker |
| `--text-xs` | 10.5px | table body, section headings (h3), small labels |
| `--text-body` | 13.5px | body copy |
| `--text-md` | 15.5px | lead paragraphs |
| `--text-lg` | 19px | sub-headings |
| `--text-xl` | 26px | h2 |
| `--text-2xl` | 38px | h1 |
| `--text-3xl` | 48px | score numbers; unused by prose defaults |
| `--text-4xl` | 80px | hero display; unused by Newspaper |

| Token | Value | Role |
|---|---|---|
| `--leading-display` | 1.1 | h1, h2 |
| `--leading-body` | 1.65 | body copy |
| `--leading-label` | 1.4 | labels, kickers, headings in the label font |
| `--tracking-display` | 0 | display type sets at normal tracking |
| `--tracking-label` | 0.08em | section headings (h3) |
| `--tracking-kicker` | 0.32em | `.kicker` and uppercase metadata rows |

Kickers and section headings are **different roles**: `.kicker` is the wide-set
(0.32-0.38em) uppercase label that opens a masthead or section; `h3` is a
tighter-set (0.08em) heading inside running content. Don't collapse them.

## 3. Color

- **Neutral ramp** — all derived from hue 78 / warm parchment chroma:

| Token | Value |
|---|---|
| `--color-ink` | `oklch(11% 0.005 78)` |
| `--color-mid` | `oklch(44% 0.008 78)` |
| `--color-dim` | `oklch(67% 0.006 78)` |
| `--color-ghost` | `oklch(87% 0.005 78)` |
| `--color-rule` | `oklch(11% 0.005 78)` |
| `--color-rule-light` | `oklch(83% 0.005 78)` |
| `--color-pull-bg` | `oklch(94% 0.009 78)` |
| `--color-bg` | `oklch(93% 0.010 78)` |

- **Accent:** `--color-accent` `oklch(52% 0.150 78)` (warm amber);
  `--color-accent-subtle` `oklch(93% 0.060 78)`.
- **Rationing rule:** accent appears in kickers, pull-rules, star performers,
  score highlights, and the dateline only — never as a background.
- **Semantic role mapping:** winner/star values in ink at full weight;
  loser/secondary values in `--color-dim`; zero/placeholder values in
  `--color-ghost`; section headings and kickers in `--color-mid`; dateline in
  `--color-accent`; table header rows inverted ink-on-paper; alternating table
  rows tinted `--color-pull-bg`.
- **Light/dark:** Newspaper ships light-on-white only, and `--color-paper` is
  locked white platform-wide. An inverted band is available as `.invert` for
  small mastheads and headers, not as a page treatment.

## 4. Spacing & Density

- `--space-1` … `--space-20` on a 4px base unit: 4, 8, 12, 16, 20, 24, 32, 40,
  48, 64, 80px. Newspaper uses the defaults unchanged.
- Page margin: the default `--page-margin-top` 64px / `--page-margin-x` 72px /
  `--page-margin-bottom` 72px, i.e. a ~672x920px content box on letter
  portrait.
- Section rhythm: generous — sections are separated by a rule plus
  `--space-6`-`--space-10` of vertical space, never crowded.

## 5. Surface & Motifs

| Token | Value |
|---|---|
| `--border-fat` | 5px — section rules, accent stripes |
| `--border-mid` | 3px — blockquote stripe, badge outline |
| `--border-thin` | 1.5px — boxed components, utility outlines |
| `--border-hair` | 1px — table rules, `hr`, footer rule |
| `--page-border` | `none` |
| `--page-shadow` | `0 6px 48px oklch(0% 0 0 / 0.16)` (screen only; print strips it) |

- **Page chrome:** no border, soft drop shadow. Newspaper is the only shipped
  theme whose sheet carries no frame onto paper — the restraint is the point.
- **Signature motifs:** none required. The shared opt-in utilities
  (`.tilt` / `.tilt-right` at `--tilt-angle` -0.6deg / 1.5deg, `.badge`,
  `.chapter-label`, `.halftone`) exist in the base layer for any theme to use,
  and Newspaper applies none of them by default. It reads as itself with zero
  motifs.
- **Marks and imagery:** no icon system. Where a page needs a small mark (a
  checkbox, a divider), use a styled `<span>` or a hairline rule.

## 6. Components & Patterns

Signature blocks:

- **Masthead** — double-rule separator (3px solid, 2px gap, 1px solid) under a
  display-font title, optional `.kicker` above it.
- **Kicker** (`.kicker`) — `--text-2xs`, uppercase, `--tracking-kicker`, in
  `--color-mid`.
- **Dateline** (`.dateline`) — `--text-2xs` in `--color-accent`, sitting under
  the masthead. The one place accent carries small text, by convention.
- **Pull-quote** — `--color-pull-bg` tint via `.tint`, or a
  `--border-mid` accent stripe (`blockquote`'s default: mid-weight left rule,
  italic, `--color-mid`).
- **Table** — label font at `--text-xs` with tabular figures; header row
  inverted ink-on-paper at `--text-2xs` uppercase; `--border-hair` row rules;
  even rows tinted `--color-pull-bg`. This zebra striping is the shipped
  default, not an opt-in.
- **Score box** (`.score-box`) — `--border-thin` accent frame, score at
  `--text-3xl` in the display font with tabular figures, team label at
  `--text-xs` in the label font.
- **Column grids** (`.columns-2`, `.columns-3`) — equal-width grids at 1.5em /
  1em gaps. Per Principle III, reach for them only when the items really are
  equal.
- **Footer** — every sheet carries one: `--space-8` above, `--border-hair` top
  rule, `--text-2xs` label font in `--color-dim`, two slots spaced apart.
- **Inverted band** (`.invert`) — ink surface, paper text, for a masthead strip
  or a header row. Small bands only.

Newspaper follows the baseline's empty and overflow behavior with no
deviations.

## 7. Contrast evidence

- `--color-ink` `oklch(11% 0.005 78)` on white measures well above the 4.5:1
  body floor.
- `--color-accent` `oklch(52% 0.150 78)` on white clears the 3:1 large/bold
  floor. It is used for small metadata in exactly one place — `.dateline` at
  `--text-2xs` — which is an accepted exception: a date line is redundant
  metadata, never the page's information payload.
- Body type floor: 13.5px adult, 16px+ for kids' content.
- Screen-legibility: no concerns — Source Serif 4 and Inter are both designed
  for screen and print at these sizes.
