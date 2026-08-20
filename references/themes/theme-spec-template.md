# Theme Spec Template

The schema every theme must satisfy. A spec lives at
`references/themes/<name>.md`, loaded on demand; this file is the checklist it
fills out, not a spec itself.

**A theme spec describes only what its theme changes.** Everything universal to
print lives once in the "Platform invariants" section of `design-rules.md`;
never restate it per theme. If a section below doesn't apply, say so in one line
with the reason — never pad it with boilerplate ("page margin: unchanged").

## Section-to-token map

Every visual decision reaches the page through a CSS variable in
`assets/shell/document.css`, so sections 2-5 are token tables: executing the
theme means copying their values into a `:root { ... }` block in `custom_css`.

| Section | Tokens it sets |
|---|---|
| 2. Typography | `--font-display` `--font-body` `--font-label`; `--text-2xs` `--text-xs` `--text-body` `--text-md` `--text-lg` `--text-xl` `--text-2xl` `--text-3xl` `--text-4xl`; `--leading-display` `--leading-body` `--leading-label`; `--tracking-display` `--tracking-label` `--tracking-kicker` |
| 3. Color | `--color-ink` `--color-mid` `--color-dim` `--color-ghost` `--color-rule` `--color-rule-light` `--color-pull-bg`; `--color-accent`; any theme-specific accent tokens it introduces (`--color-blue`, …). `--color-paper` is locked to white and may not be set. |
| 4. Spacing & density | `--space-1` … `--space-20`; `--page-margin-top` `--page-margin-x` `--page-margin-bottom` |
| 5. Surface & motifs | `--border-fat` `--border-mid` `--border-thin` `--border-hair`; `--page-border` `--page-frame-inset`; `--tilt-angle` `--tilt-angle-right`; `--image-filter` |
| 1, 6, 7 | No tokens — voice, component structure, and contrast evidence are prose. |

A token the spec doesn't list keeps its default value. State only the ones the
theme actually moves.

---

## 1. Meta & Philosophy

- **3-6 principles** specific to this theme — not the universal ones in
  `principles.md`, but what makes *this* theme's execution of them distinct.
- **Personality adjectives** — 3-5 words a stranger could use to describe the
  theme's character.
- **Voice & microcopy** — how body text should read when the print skill
  generates content in this theme (tone, sentence length, characteristic
  phrases). Cite an existing example if one exists.
- **What makes it distinctive** — the one or two things that make this theme
  unmistakably itself, distinct from the other shipped themes. Not generic.

## 2. Typography

- A token table for the three families with fallback stacks, plus the Google
  Fonts URL **as a plain URL** — it goes into the `font_import` channel
  verbatim, and `custom_css` may not contain `@import` or `url(`.
- Weights actually used, and any weights explicitly avoided (e.g. "never use
  300 — reads too thin at print resolution").
- Any `--text-*` steps the theme retunes, and any it adds beyond the scale.
- Any `--leading-*` / `--tracking-*` values the theme changes, by role.
- OpenType features beyond the baseline's tabular figures, if any.

## 3. Color

- **Neutral ramp** — ink / mid / dim / ghost / rule / rule-light / pull-bg on
  a consistent OKLCH hue+chroma formula (`newspaper.md` has the reference
  values), never hand-picked per token. Keeping the default ramp: say so.
- **Accent(s)** — the theme's accent color(s) and any subtle/tint variant,
  with the token name each one binds to.
- **Rationing rule** — where accent may and may not appear, per the no-fill
  principle (text, borders, rules — never as a background).
- **Semantic role mapping** — which token each visual role resolves to
  (winner/loser, star performer, zero value, table header, kicker).

## 4. Spacing & Density

Only what this theme changes: retuned `--space-*` steps, a tighter or looser
section rhythm, different internal padding for panels, or moved
`--page-margin-*` values (which move the content box with them). A theme on
the default rhythm says so in one line.

## 5. Surface & Motifs

- Border weights per role, where they differ from the defaults (5 / 3 / 1.5 /
  1px).
- **Page chrome** — `--page-border` (and `--page-frame-inset` if the frame
  should sit closer in or further out than the default half-margin). The frame
  is the single strongest carrier of theme identity; state it, even when it is
  `none`. It is also the whole of the page chrome a theme sets: the sheet's
  drop shadow is fixed preview chrome, not a token, because it never reaches
  paper.
- **Signature motifs** — theme-specific flourishes, and which of the shared
  opt-in utilities (`.tilt`, `.tilt-right`, `.badge`, `.chapter-label`,
  `.halftone`, `.kicker`) the theme uses, with any `--tilt-angle` change.
  These utilities are theme-neutral and applied by nothing unless a theme
  calls for them — a theme with no motifs states "none" rather than inventing
  one to fill the section.
- **Marks and imagery** — `--image-filter` (default `grayscale(100%)`; color
  photos dither badly on home printers, so `none` is a deliberate choice), plus
  any substitute this theme uses for drawn icons (Comic's typographic sound
  effects) or the kind of mark a checkbox should be. State "no icon system" if
  it has none. When the theme *does* draw a subject, record each mark so a later
  run reproduces it instead of redrawing from scratch: the subject, the
  diagnostic features that make it read (see "Drawing a mark that reads" in
  `README.md`), and the stroke weight and viewBox it was drawn at.

## 6. Components & Patterns

- **Signature content blocks** — which of the standard content blocks (see
  `references/page-types.md`) get theme-specific treatment, and how (e.g.
  Comic's narrator box, a chapter heading with an accent stripe). Describe the
  construction concretely enough to rebuild: which tokens, which utilities,
  what proportions.
- **Deviations from the baseline's empty/overflow behavior**, if the theme has
  any — e.g. "an overflowing panel never shrinks its border weight to
  compensate". Omit the section if the theme simply follows the baseline.

## 7. Contrast evidence

The measured ratio of each accent this theme introduces against white paper,
and the size/weight at which it may be used — the one accessibility fact the
platform baseline cannot know in advance. Note any accepted exception
explicitly, with its justification. If the theme changes the body type floor
(e.g. kids' content at 16px+), state that here too.
