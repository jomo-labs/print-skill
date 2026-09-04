# Theme: Arcade (8-bit / retro video game)

**Trigger phrases:** "8-bit", "8 bit", "arcade", "pixel art", "video game",
"retro game", "game console", "Minecraft", "Mario", "Zelda", "Pokemon", or
similar.

Platform invariants are in `design-rules.md`; only what Arcade changes is below.

## 1. Meta & Philosophy

- **Principles specific to this theme:**
  1. Everything is on a grid of squares. Cells, checkboxes, dividers and marks
     all resolve to whole multiples of an 8px unit — the page should look like
     it was laid out on graph paper, because it was.
  2. Scarcity is the mood. An arcade screen shows a score, a level and three
     lives; it does not show a paragraph. Cut copy until each block is a label
     and a value.
  3. Chrome is diegetic. Section headings are LEVEL 1, a completed row is
     CLEARED, an empty state is INSERT COIN. The page is the interface.
  4. The pixel font is a sign, not a voice. It sets headings and values and
     nothing longer than four words.
- **Personality adjectives:** blocky, cheerful, systematic, low-fi, a little
  deadpan.
- **Voice & microcopy:** uppercase, short, no articles — "PLAYER 1", "STAGE
  CLEAR", "NEW HIGH SCORE". Body prose, where a page needs it, drops back to
  ordinary sentences in the body face; do not write paragraphs in caps.
- **What makes it distinctive:** the only shipped theme on a monospaced stack
  end to end, and the only one whose display face is metrically enormous — its
  scale steps run *down* from the default rather than up, which is stated in
  section 2 because it inverts the usual instinct.

## 2. Typography

| Token | Value | Fallback |
|---|---|---|
| `--font-display` | Press Start 2P | monospace |
| `--font-body` | Space Mono | ui-monospace, monospace |
| `--font-label` | Press Start 2P | monospace |

`font_import`:
`https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap`

- Both faces are single-weight (Space Mono adds 700 and italic). Press Start 2P
  has no bold — never synthesize one with `font-weight`, it smears the pixel
  grid. Emphasis comes from size or from `--color-magenta`.
- **Press Start 2P renders roughly 1.6× its nominal size** — its cap height
  nearly fills the em box. Every display step therefore comes *down*, and the
  face is never set below 10px, where the pixel grid stops resolving on a home
  printer:

| Token | Value | Why |
|---|---|---|
| `--text-2xs` | 10px | the floor for the pixel face; smaller and the stems merge |
| `--text-xs` | 11px | labels, cell headers |
| `--text-body` | 14px | Space Mono body — monospace needs the size a serif does not |
| `--text-lg` | 16px | sub-headings in the pixel face |
| `--text-xl` | 20px | h2 / LEVEL headings |
| `--text-2xl` | 26px | h1 — a 38px h1 in this face is 60px of ink |
| `--text-3xl` | 34px | score figures |
| `--text-4xl` | 48px | the single hero figure |

| Token | Value | Why |
|---|---|---|
| `--leading-display` | 1.5 | the face has no internal leading; 1.1 collides |
| `--leading-body` | 1.6 | monospace body needs the air |
| `--tracking-display` | 0 | the face is already fixed-pitch; tracking it breaks the grid |
| `--tracking-label` | 0.05em | just enough to separate caps |
| `--tracking-kicker` | 0.18em | down from 0.32em — fixed-pitch caps are pre-separated |

- Never set Press Start 2P for a run longer than about four words, and never
  for body copy at any size.

## 3. Color

- **Neutral ramp** — cool CRT gray, hue 285 at very low chroma:

| Token | Value |
|---|---|
| `--color-ink` | `oklch(13% 0.004 285)` |
| `--color-mid` | `oklch(46% 0.006 285)` |
| `--color-dim` | `oklch(68% 0.005 285)` |
| `--color-ghost` | `oklch(88% 0.004 285)` |
| `--color-rule` | `oklch(13% 0.004 285)` |
| `--color-rule-light` | `oklch(84% 0.004 285)` |
| `--color-pull-bg` | `oklch(95% 0.006 285)` |

- **Accents** (text and borders only):

| Token | Value | Use |
|---|---|---|
| `--color-magenta` | `oklch(52% 0.218 350)` | player 1, the active state, the hero figure |
| `--color-cyan` | `oklch(50% 0.091 220)` | player 2, secondary values, grid emphasis |
| `--color-coin` | `oklch(55% 0.120 70)` | coins, stars, rewards — the "earned" color |

- **Rationing rule:** the no-fill rule bites hardest here, because the source
  material is nothing but fills. A sprite is drawn as a grid of *outlined*
  squares, not filled ones; a health bar is a row of outlined cells with the
  filled ones marked by a stroked X, never by a solid block. No color background
  anywhere, and `print-color-adjust` is never set.
- **Semantic role mapping:** hero/score figure `--color-magenta`; secondary
  player or opponent `--color-cyan`; earned/reward marks `--color-coin`;
  locked or spent state `--color-ghost`; LEVEL headings `--color-ink` with a
  `--color-magenta` rule beneath.

## 4. Spacing & Density

Only two steps move, because the default scale is already almost all 8px
multiples (4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80). The two that are not:

| Token | Default | Value | Why |
|---|---|---|---|
| `--space-3` | 12px | `8px` | 12 is the one gap that lands off-lattice mid-block |
| `--space-5` | 20px | `24px` | rounds up rather than down; 20px cells look squeezed against 24px ones |

`--space-1` stays 4px — it is a half-unit, used only for hairline offsets
inside a cell, never for layout. Page margins unchanged. Any write-in cell is a
multiple of 8px on both axes and at least 32px tall.

## 5. Surface & Motifs

| Token | Value |
|---|---|
| `--page-border` | `4px solid var(--color-ink)` |
| `--page-frame-inset` | `0` |
| `--border-fat` | `4px` |
| `--border-mid` | `2px` |
| `--border-thin` | `2px` |
| `--border-hair` | `1px` |

- **Page chrome:** a flush 4px frame at zero inset — the screen bezel. Border
  weights collapse to even numbers because an odd-pixel rule renders as a soft
  1.5px line and breaks the pixel illusion; `--border-thin` and `--border-mid`
  intentionally share a value.
- **Signature motifs:** a **HUD bar** across the top — three tracked label/value
  pairs on one row over a `--border-mid` rule ("PLAYER 1 · LEVEL 3 · SCORE
  004200"); **level headings** as `.chapter-label` reading "LEVEL N" in the
  pixel face with a `--color-magenta` rule; **life pips**, a row of small
  outlined squares standing in for checkboxes; and a **stepped divider** — a
  horizontal rule drawn as three stacked `--border-hair` segments at descending
  widths, which is the theme's staircase in place of a smooth line. `.tilt` is
  never used: nothing in a pixel grid is rotated.
- **Marks and imagery:** `--image-filter` unchanged (`grayscale(100%)`). The
  icon system is **outlined 8×8 square grids** — a heart, a coin, a key drawn as
  stroked squares on an 8-unit lattice, inline SVG, `fill="none"`, stroke
  `var(--color-ink)` at 2 units on a 64-unit viewBox, printed no smaller than
  0.5in. Named game characters are never drawn: a specific likeness does not
  survive stroked line art and is trademarked besides. Substitute the generic
  object the character carries.

## 6. Components & Patterns

- **HUD bar** — as above, the first block on every page, carrying whatever the
  page's three governing facts are (name, date, total).
- **Level block** — a LEVEL heading, one line of instruction in the body face,
  then the block's actual content. Any list of tasks becomes levels.
- **Score panel** — the hero figure at `--text-4xl` in `--color-magenta`, its
  label in the pixel face at `--text-2xs` beneath, leading zeros preserved
  ("004200") because that is what an arcade does.
- **Reward row** — life pips or coin marks in `--color-coin`, one per earned
  unit, on the 8px grid.
- **Empty state** — "INSERT COIN" centered in the pixel face at `--text-lg` in
  `--color-dim`, which is this theme's version of the platform's designed empty
  state.
- **Overflow deviation:** an overflowing block drops whole levels rather than
  compressing the grid — the 8px lattice is not negotiable, and a half-step cell
  is more damaging than a shorter page.

## 7. Contrast evidence

Measured against white paper, sRGB-clamped:

- `--color-magenta` `oklch(52% 0.218 350)` — **6.22:1**. Clears AA for body
  text; safe at the `--text-2xs` 10px floor.
- `--color-cyan` `oklch(50% 0.091 220)` — **5.82:1**. Safe at any size. Note
  this is a *dark* cyan on purpose: an arcade-bright cyan lands near 1.6:1 and
  is unusable on paper, so the theme takes the hue and gives up the brightness.
- `--color-coin` `oklch(55% 0.120 70)` — **4.98:1**. Safe at any size; the
  closest of the three to the floor, so it stays on marks and figures rather
  than carrying a sentence.

All three sit inside the sRGB gamut.

Body type floor: **14px** (`--text-body` above), raised from the default
because monospace at 13.5px reads smaller than a serif at the same size. Kids'
content in this theme takes 16px.
