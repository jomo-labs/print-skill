# Theme: Blueprint

**Trigger phrases:** "blueprint", "technical drawing", "architectural",
"schematic".

Platform invariants (sheet geometry, no animation, grayscale imagery,
empty/overflow behavior, contrast floors, tabular figures) are in
`design-rules.md` and are not restated here — only what Blueprint changes is
below.

## 1. Meta & Philosophy

- **Principles specific to this theme:**
  1. Precision reads as care — every line is deliberate, nothing is
     decorative.
  2. The grid is visible, not hidden — this theme shows its structure rather
     than disguising it.
  3. Restraint here means less than Newspaper: one accent hue, no tilt, no
     motif — the discipline of a technical drawing.
- **Personality adjectives:** precise, technical, quiet, exacting, cool.
- **Voice & microcopy:** clipped, specification-style language where the
  content allows it (labels over sentences, e.g. "QTY" not "Quantity:"). No
  exclamation points, no narrator voice — this theme has no persona, only
  precision.
- **What makes it distinctive:** the only shipped theme with a monospace body
  font and no rotation anywhere. It's built to serve the tracker/planner
  category of the catalog (budget trackers, habit trackers, checklists) —
  content that benefits from a precise, measured feel rather than an editorial
  or playful one.

## 2. Typography

| Token | Value | Fallback |
|---|---|---|
| `--font-display` | Rajdhani | sans-serif |
| `--font-body` | Share Tech Mono | monospace |
| `--font-label` | Rajdhani | sans-serif |

`font_import`:
`https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;600&display=swap`

- Weights: Rajdhani 400/600 only — never heavier than 600; this theme's
  precision reads through restraint, not boldness. Share Tech Mono is
  single-weight.
- Scale: unchanged. This theme favors dense, measured layouts over oversized
  hero numbers, so it needs no display steps beyond the defaults.

| Token | Value | Why |
|---|---|---|
| `--leading-body` | 1.45 | tighter than Newspaper, for a tabular reading pattern |

Labels keep the wide kicker tracking for a technical-label feel; body copy sets
at normal tracking.

## 3. Color

- **Neutral ramp:** unchanged from the default.
- **Accent:** `--color-blue` `oklch(52% 0.160 250)` — "blueprint line blue."
  Exactly one accent hue, not Comic's three, matching the restrained
  personality. Bind `--color-accent` to it as well, so the base components
  (dateline, blockquote stripe, score box) pick it up without extra rules.
- **Rationing rule:** blueprint blue appears in rules, borders, and labels
  only.
- **Semantic role mapping:** section labels and grid rules in blueprint blue;
  body content in ink; no separate star/winner role — this theme's typical
  content doesn't have a winner/loser hierarchy to encode.

## 4. Spacing & Density

Default `--space-*` scale and page margins, worked at the tighter end: every
section uses the same spacing interval, reinforcing the "drafted, not composed"
feel — deliberately the opposite of Principle III's editorial weighting, since
Blueprint's whole point is that everything gets equal, precise treatment.

## 5. Surface & Motifs

| Token | Value |
|---|---|
| `--page-border` | `var(--border-thin) solid var(--color-blue)` |
| `--page-shadow` | `none` |

- **Page chrome:** a thin, precise blue frame and no shadow at all — the only
  shipped theme that drops the sheet's drop shadow entirely.
- Border weights: `--border-hair` and `--border-thin` carry everything; this
  theme never uses `--border-fat`.
- **Signature motifs:** none. No tilt, no halftone, no badge stamps — the
  absence of motif is itself the signature.
- **Marks and imagery:** no icon system. Where a technical-drawing feel calls
  for a mark (a checkbox, a status indicator), use a hairline square or a
  thin-ruled box — never a filled icon or emoji.

## 6. Components & Patterns

- **Section label** — technical-spec-style header: uppercase Rajdhani in
  blueprint blue with a hairline rule beneath.
- **Tables and grids** — hairline rules throughout, rather than Newspaper's
  heavier double-rule masthead treatment. The baseline's tabular figures matter
  more here than in any other theme: this content is disproportionately
  numeric.
- **Overflow deviation:** for this theme's tabular content, prefer splitting
  rows across a continuation over shrinking type below the point where numbers
  stay legible.

## 7. Contrast evidence

- `--color-blue` `oklch(52% 0.160 250)` on white clears the 3:1 large/bold
  floor for labels and rules. No exception needed.
- Body type floor: the 13.5px adult default — this theme's content (trackers,
  planners) is adult-oriented.
- Screen-legibility: Share Tech Mono is a narrow monospace face and reads a
  little tighter on-screen than Source Serif 4 at the same size. No mitigation
  needed at this theme's sizes, but don't drop body size below 13.5px for this
  theme specifically.
