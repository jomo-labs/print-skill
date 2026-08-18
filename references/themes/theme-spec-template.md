# Theme Spec Template

The schema every theme — the default (Newspaper) and every named theme — must
satisfy before it's usable. A theme spec lives at
`references/themes/<name>.md` and is loaded on demand by the print skill; this
file is the checklist that spec must fill out, not a spec itself.

**A theme spec describes only what its theme changes.** Everything universal to
print — the sheet and its margins, the no-animation rule, grayscale imagery,
empty/overflow behavior, contrast floors, tabular figures — lives once in the
"Platform invariants" section of `design-rules.md`, which every run reads
anyway. Do not restate any of it per theme. If a section below doesn't apply to
a given theme, say so in one line with the reason; never pad it with baseline
boilerplate ("page margin: unchanged", "motion: none").

## Section-to-token map

Every visual decision a theme makes reaches the page through a CSS variable
defined in `assets/shell/document.css`. Sections 2-5 are therefore written as
token tables: the spec states the value, and executing the theme means copying
those values into a `:root { ... }` block in `custom_css` — nothing is
translated by hand, and nothing else in the stylesheet needs restating.

| Section | Tokens it sets |
|---|---|
| 2. Typography | `--font-display` `--font-body` `--font-label`; `--text-2xs` `--text-xs` `--text-body` `--text-md` `--text-lg` `--text-xl` `--text-2xl` `--text-3xl` `--text-4xl`; `--leading-display` `--leading-body` `--leading-label`; `--tracking-display` `--tracking-label` `--tracking-kicker` |
| 3. Color | `--color-ink` `--color-mid` `--color-dim` `--color-ghost` `--color-rule` `--color-rule-light` `--color-pull-bg`; `--color-accent`; any theme-specific accent tokens it introduces (`--color-blue`, …). `--color-paper` is locked to white and may not be set. |
| 4. Spacing & density | `--space-1` … `--space-20`; `--page-margin-top` `--page-margin-x` `--page-margin-bottom` |
| 5. Surface & motifs | `--border-fat` `--border-mid` `--border-thin` `--border-hair`; `--page-border` `--page-shadow`; `--tilt-angle` `--tilt-angle-right` |
| 1, 6, 7 | No tokens — voice, component structure, and contrast evidence are prose. |

A token the spec doesn't list keeps its default value. State only the ones the
theme actually moves.

---

## 1. Meta & Philosophy

- **3-6 principles** specific to this theme (not the universal print
  principles in `principles.md`, which already apply to every theme — these
  are what makes *this* theme's execution of them distinct).
- **Personality adjectives** — 3-5 words a stranger could use to describe the
  theme's character.
- **Voice & microcopy** — how body text should read when the print skill
  generates content in this theme (tone, sentence length, characteristic
  phrases). Cite an existing example if one exists.
- **What makes it distinctive** — the one or two things that make this theme
  unmistakably itself, distinct from the other shipped themes. This is the
  most-skipped, most-important field — do not leave it generic.

## 2. Typography

- A token table for the three families, each with a fallback stack, plus the
  Google Fonts URL **as a plain URL** (not a CSS `@import` block — it goes
  into the `font_import` channel verbatim, and `custom_css` may not contain
  `@import` or `url(`).
- Weights actually used, and any weights explicitly avoided (e.g. "never use
  300 — reads too thin at print resolution").
- Any `--text-*` steps the theme retunes, and any it adds beyond the scale.
- Any `--leading-*` / `--tracking-*` values the theme changes, by role.
- OpenType features beyond the baseline's tabular figures, if any.

## 3. Color

- **Neutral ramp** — ink / mid / dim / ghost / rule / rule-light / pull-bg,
  derived via a consistent OKLCH hue+chroma formula (see `newspaper.md`'s
  neutral ramp for the reference values) — not hand-picked per token. A theme
  that keeps the default ramp says so in one line and moves on.
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
- **Page chrome** — `--page-border` and `--page-shadow`. These two tokens are
  the single strongest carrier of theme identity; state both, even when one is
  `none`. Print strips the shadow; only the border survives onto paper — and
  because it is drawn at the sheet's outer edge, a desktop printer's
  unprintable margin can clip it (it is exact on screen and in the PDF). A
  theme whose frame must survive a home print run says so here and specifies it
  as a bordered wrapper inside the page margin instead.
- **Signature motifs** — theme-specific flourishes, and which of the shared
  opt-in utilities (`.tilt`, `.tilt-right`, `.badge`, `.chapter-label`,
  `.halftone`, `.kicker`) the theme uses, with any `--tilt-angle` change.
  These utilities are theme-neutral and applied by nothing unless a theme
  calls for them — a theme with no motifs states "none" rather than inventing
  one to fill the section.
- **Marks and imagery direction**, if the theme has one — a substitute for
  drawn icons (Comic's typographic sound effects), or the kind of mark a
  checkbox or status indicator should be. The no-fill, stroked-SVG,
  grayscale-imagery baseline already applies; state only the theme's own
  direction, or "no icon system".

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
