# Theme: Comic (Dog Man / kids comic book)

**Trigger phrases:** "Dog Man", "comic book", "comic strip", "Captain
Underpants", "kids comic", or similar.

Platform invariants (sheet geometry, no animation, grayscale imagery,
empty/overflow behavior, contrast floors, tabular figures) are in
`design-rules.md` and are not restated here — only what Comic changes is below.

## 1. Meta & Philosophy

- **Principles specific to this theme:**
  1. Everything is a little too big and a little too excited — comic panels
     don't whisper.
  2. The reader is a kid (or reading with one); confusion is charming, not a
     defect ("Dog Man thinks this is very interesting.").
  3. Structure shows its seams on purpose — thick borders and offset shadows
     read as "constructed," not accidental.
- **Personality adjectives:** loud, earnest, chunky, playful, sincere.
- **Voice & microcopy:** short sentences. Capital letters for EMPHASIS. "WOW."
  as a standalone sentence is acceptable and encouraged. Slightly confused,
  always earnest — never sarcastic or knowing.
- **What makes it distinctive:** the only shipped theme that puts a hard offset
  shadow and a heavy ink border on the sheet, and the only one with a dedicated
  narrator voice — where Newspaper's identity is restraint, Comic's is a frame
  you can see from across the room. It's built to serve the kids-content category of the catalog
  (chore charts, activity pages, birthday wishlists) — the loudest, most
  personality-forward theme on purpose.

## 2. Typography

| Token | Value | Fallback |
|---|---|---|
| `--font-display` | Bangers | cursive |
| `--font-body` | Patrick Hand | cursive |
| `--font-label` | Patrick Hand | cursive |

`font_import`:
`https://fonts.googleapis.com/css2?family=Bangers&family=Patrick+Hand&display=swap`

- Weights: both are single-weight display/handwriting faces — no weight axis to
  manage. Never substitute a heavier system font if they fail to load; fall
  back to the `cursive` generic.
- Scale changes — the body step moves up for this theme's audience, and the
  display steps go bigger than Newspaper needs:

| Token | Value | Why |
|---|---|---|
| `--text-body` | 16px | kids' content floor |
| `--text-3xl` | 52px | chapter titles, secondary hero numbers |
| `--text-4xl` | 108px | the winner number on a hero stat panel |

| Token | Value | Why |
|---|---|---|
| `--leading-body` | 1.55 | Patrick Hand reads looser than a serif body |
| `--tracking-display` | 0.04em | the chunky comic-headline feel (0.02-0.1em range) |

## 3. Color

- **Neutral ramp:** unchanged from the default — Comic overrides no neutrals.
- **Accents** (theme-specific tokens, all text/border only):

| Token | Value | Use |
|---|---|---|
| `--color-blue` | `oklch(48% 0.140 240)` | "Dog Man blue" — chapter stripes, hero-panel accents |
| `--color-red` | `oklch(50% 0.190 25)` | "Petey red" — callouts and BONK!!!-style exclamations only |
| `--color-yellow` | `oklch(78% 0.180 90)` | highlight accent, used sparingly |

- **Rationing rule:** three accent hues instead of one, but the same no-fill
  rule — text and borders only.
- **Semantic role mapping:** winner number in `--color-blue` at `--text-4xl`;
  loser number in `--color-dim` around `--text-3xl`; callout/SFX text in
  `--color-red`; chapter-heading kicker in `--color-blue`.

## 4. Spacing & Density

Default `--space-*` scale and page margins. Panels favor the tighter steps
(`--space-4`-`--space-5` internal padding) and a compact section rhythm — comic
panels are meant to feel packed, not airy.

## 5. Surface & Motifs

| Token | Value |
|---|---|
| `--page-border` | `5px solid var(--color-ink)` |
| `--page-shadow` | `7px 7px 0 var(--color-ink)` |

- **Page chrome:** the heavy ink frame and hard offset shadow are load-bearing
  for this theme's identity, not optional. The offset shadow is screen-only, so
  the frame carries the look in print — and since a sheet-edge border can be
  clipped by a desktop printer's unprintable margin, repeat the frame as a
  bordered wrapper inside the page margin (`--border-fat` ink) whenever the
  page is headed for a home printer rather than the PDF.
  Border weights otherwise stay at the defaults.
- **Signature motifs:** `.tilt` (default -0.6deg) on narrator boxes;
  `.halftone` for panel texture where a comic-print feel is wanted; `.badge`
  for a "WOOF!" circle stamp on VS dividers (outline only); `.chapter-label`
  for chapter kickers, restyled to `--color-blue`.
- **Marks and imagery:** no icon system. This theme's expressive substitute is
  typographic sound effects ("BONK!!!", "WOW.") set in the display font at
  large size with rotation — never image assets.

## 6. Components & Patterns

- **Cover masthead** — a small uppercase byline ("Dog Man's Sports Section — by
  George and Harold"-style, adapted to the content), then a big two-line
  display title with the second line in `--color-blue`, and a right-hand date
  card separated by a `--border-fat` rule with a small rotated handwritten
  aside.
- **Chapter heading** — `.chapter-label` stripe in `--color-blue`, "Chapter N:"
  kicker, title in ink.
- **Narrator box** — outlined, `.tilt`-rotated, no fill: "Meanwhile, something
  AMAZING was happening…"
- **Hero stat panel** (3-up grid) — blue left accent border, winner number at
  `--text-4xl`, description in the narrator voice, red rotated callout.
- **"The End" colophon** — centered, tracked-out display type.
- **Overflow deviation:** a comic panel that overflows never shrinks its offset
  shadow or border weight to compensate — those stay fixed regardless of
  content length. Reduce type or shorten the content instead.

## 7. Contrast evidence

- `--color-blue` `oklch(48% 0.140 240)` on white clears the 3:1 large/bold
  floor and is used at 32px+ (chapter titles, hero numbers). It sits close
  enough to the floor that it must not carry small body text — this theme never
  does that.
- `--color-red` `oklch(50% 0.190 25)` likewise clears 3:1 for large/bold
  callout use only.
- Body type floor: 16px+ (`--text-body` is retuned above), since this theme
  defaults to kids' content.
- Screen-legibility: Patrick Hand and Bangers read slightly less crisply
  on-screen at small sizes than in print — mitigated by the 16px body floor
  already in effect.
