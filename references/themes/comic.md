# Theme: Comic (Dog Man / kids comic book)

**Trigger phrases:** "Dog Man", "comic book", "comic strip", "Captain
Underpants", "kids comic", or similar.

## 1. Meta & Philosophy

- **Principles specific to this theme:**
  1. Everything is a little too big and a little too excited — comic
     panels don't whisper.
  2. The reader is a kid (or reading with one); confusion is charming,
     not a defect ("Dog Man thinks this is very interesting.").
  3. Structure shows its seams on purpose — thick borders and offset
     shadows read as "constructed," not accidental.
- **Personality adjectives:** loud, earnest, chunky, playful, sincere.
- **Voice & microcopy:** short sentences. Capital letters for EMPHASIS.
  "WOW." as a standalone sentence is acceptable and encouraged. Slightly
  confused, always earnest — never sarcastic or knowing.
- **What makes it distinctive:** the only shipped theme with a hard
  offset shadow and heavy ink border on `.page` chrome, and the only one
  with a dedicated narrator voice. It's built to serve the kids-content
  category of the catalog (chore charts, activity pages, birthday
  wishlists) — the loudest, most personality-forward theme on purpose.

## 2. Typography

| Role | Family | Fallback |
|---|---|---|
| `--font-display` | Bangers | cursive |
| `--font-body` | Patrick Hand | cursive |
| `--font-label` | Patrick Hand | cursive |

```css
@import url('https://fonts.googleapis.com/css2?family=Bangers&family=Patrick+Hand&display=swap');
```

- Weights: both fonts are single-weight display/handwriting faces — no
  weight axis to manage. Never substitute a heavier system font if these
  fail to load; fall back to the `cursive` generic instead.
- Type scale: reuse Newspaper's `--text-*` scale for structural sizing
  (body copy, labels), but display elements (chapter titles, score
  numbers) commonly run larger than Newspaper's `--text-4xl` — see the
  Components section below for the specific oversized numbers already in
  use (52px, 108px).
- Line-height: 1.5–1.6 for body copy (Patrick Hand reads best a little
  looser than serif body text).
- Letter-spacing: display type uses slight positive tracking (0.02–0.1em)
  for the chunky comic-headline feel; body text uses normal tracking.
- OpenType features: none specific to this theme; inherits the tabular-
  figures-in-tables rule (Principle V in `principles.md`).

## 3. Color

- **Neutral ramp:** inherits ink/mid/dim/rule from the shell's default
  Newspaper tokens — Comic does not override neutrals, only adds accent
  colors.
- **Accents:**
  - `--color-blue`: `oklch(48% 0.140 240)` — "Dog Man blue," the primary
    accent (chapter stripes, hero-panel accents).
  - `--color-red`: `oklch(50% 0.190 25)` — "Petey red," callouts only
    (BONK!!!-style exclamations).
  - `--color-yellow`: `oklch(78% 0.180 90)` — highlight accent, used
    sparingly.
- **Rationing rule:** all three accents are text/border only, per the
  no-fill invariant — same rule as every other theme, just with three
  accent hues instead of one.
- **Semantic role mapping:** winner number in `--color-blue` at ~108px;
  loser number in `--color-dim` at ~58px; callout/SFX text in
  `--color-red`; chapter-heading kicker in `--color-blue`.
- **Light/dark:** no dark variant. A dark background would fight the
  comic-panel-on-white-page convention this theme is built around.

## 4. Spacing & Layout

- Base unit: 4px (unchanged from Newspaper).
- Spacing scale: reuses `--space-*`, but panels favor tighter internal
  padding (16–20px) than Newspaper's more generous section rhythm — comic
  panels are meant to feel packed, not airy.
- Page margin/safe area: unchanged, 0.5in.
- Section rhythm: compact — panels stack with less breathing room than
  Newspaper, consistent with comic-page pacing.

## 5. Surface Treatment

- Border weights: reuses `--border-fat`/`--border-mid`/`--border-thin`
  for internal rules, but `.page` chrome uses a bespoke heavier
  treatment (below) that exceeds `--border-fat`.
- **Page chrome:**
  ```css
  .page {
    border: 5px solid var(--color-ink);
    box-shadow: 7px 7px 0 var(--color-ink);  /* comic offset shadow */
  }
  ```
- **Signature motifs:** heavy offset shadow (above) is load-bearing for
  this theme's identity, not optional. `.tilt` (−0.6°) on narrator boxes.
  `.halftone` texture is available for panel backgrounds where a comic-
  print texture is wanted. `.badge` for a "WOOF!" circle stamp on VS
  dividers (outline only, rotated −4°).

## 6. Iconography & Imagery

No formal icon system, consistent with the house minimal/no-fill stance — but this theme leans on
typographic sound effects ("BONK!!!", "WOW.") as its expressive substitute
for icons, rendered in the display font at large size with rotation,
never as image assets.

## 7. Motion

The printed artifact never animates. No theme-specific reduced-motion
note; the shell's toolbar is not reskinned per theme.

## 8. Components & Patterns

- **Signature blocks:**
  - Cover masthead — opens the page: a small uppercase byline ("Dog Man's
    Sports Section — by George and Harold"-style, adapted to the content),
    then a big two-line display title with the second line in
    `--color-blue`, and a right-hand date card separated by a fat border
    with a small rotated handwritten aside.
  - Chapter heading — blue left-border stripe, "Chapter N:" kicker in
    `--color-blue`, title in ink.
  - Narrator box — outlined, `.tilt`-rotated, no fill: "Meanwhile,
    something AMAZING was happening…"
  - Hero stat panel (3-up grid) — blue left accent border, winner number
    at ~108px, description in Dog Man narrator voice, red rotated callout.
  - "The End" colophon — centered, tracked-out display type.
- **Default:** as above.
- **Empty:** an empty hero panel still renders its blue left-accent
  border and player-name label row — never collapses, per Principle IV.
- **Overflow:** per the template default (reduce type-scale one step,
  then shorten the content) — a comic panel that overflows
  should never shrink the offset shadow or border weight to compensate;
  those stay fixed regardless of content length.

## 9. Accessibility

- Contrast: `--color-blue` `oklch(48% 0.140 240)` on white paper measures
  above the WCAG AA 3:1 large/bold-text floor (used at 32px+ for chapter
  titles and hero numbers, which qualifies as large text) but is close
  enough to the floor that it should not be used for small body text —
  this theme never does. `--color-red` `oklch(50% 0.190 25)` similarly
  clears 3:1 for large/bold callout use only. Ink-on-paper body text is
  unaffected (unchanged from Newspaper, well above 4.5:1).
- Minimum body type size: 16px+ (this theme defaults to kids' content
  sizing, per the print skill's audience-adaptation guidance), not
  Newspaper's 13.5px adult default.
- Screen-legibility: Patrick Hand and Bangers are both handwriting/
  display faces that read slightly less crisply on-screen at small sizes
  than in print — mitigated by the 16px+ minimum body size already in
  effect for this theme's typical (kids') audience.
