# Theme Spec Template

The schema every theme — the default (Newspaper) and every named theme —
must satisfy before it's usable. A theme spec lives at
`references/themes/<name>.md` and is loaded on demand by the print skill;
this file is the checklist that spec must fill out, not a spec itself.

Every section below is required. If a section genuinely doesn't apply to a
given theme, say so explicitly with a one-line reason — do not leave it
blank.

Categories are adapted from a general interactive-design-system checklist
to this skill's static, print-only context: a printed page has no hover
state, no loading spinner, no client-side routing. Where a category would
otherwise only make sense for an interactive app, this template redirects
it to what actually applies here (the printed artifact, or the shell's
toolbar chrome around it) rather than forcing empty content.

---

## 1. Meta & Philosophy

- **3–6 principles** specific to this theme (not the universal print
  principles in `principles.md`, which already apply to every theme — these are what makes *this* theme's execution of
  them distinct).
- **Personality adjectives** — 3–5 words a stranger could use to describe
  the theme's character.
- **Voice & microcopy** — how body text should read when the print skill
  generates content in this theme (tone, sentence length, characteristic
  phrases). Cite an existing example if one exists.
- **What makes it distinctive** — the one or two things that make this
  theme unmistakably itself, distinct from the other shipped themes. This
  is the most-skipped, most-important field — do not leave it generic.

## 2. Typography

- Typefaces for `--font-display` / `--font-body` / `--font-label`, with
  fallback stacks.
- Weights actually used, and any weights explicitly avoided (e.g. "never
  use 300 — reads too thin at print resolution").
- Type scale in px (reuse `assets/shell/shell.css`'s `--text-*` scale
  where possible; only introduce new sizes the theme genuinely needs).
- Line-heights and letter-spacing/tracking per role (display, body, label).
- OpenType features used, if any (e.g. tabular figures in tables — see
  Principle V in `principles.md`, "Type is set, not placed").

## 3. Color

- **Neutral ramp** — ink / mid / dim / ghost / rule / rule-light /
  pull-bg, derived via a consistent OKLCH hue+chroma formula (see
  `newspaper.md`'s neutral ramp for the reference values) — not hand-picked
  per theme.
- **Accent(s)** — the theme's accent color(s), plus a subtle/tint variant.
- **Rationing rule** — where accent may and may not appear, per the
  no-fill principle (text, borders, rules — never `background`).
- **Semantic role mapping** — which `--color-*` token each visual role
  maps to (winner/loser, star performer, zero-value, table header, etc.),
  reusing `assets/shell/shell.css`'s existing token names.
- **Light/dark handling** — does this theme have a dark variant? If not,
  say so explicitly.

## 4. Spacing & Layout

- Base spacing unit (the default is 4px).
- Spacing scale used (4px increments unless the theme has a specific
  reason to deviate; the shell predefines no `--space-*` tokens).
- Page margin / safe area (default: 0.5in from the physical edge).
- Section rhythm — the vertical spacing pattern between major page
  sections.

## 5. Surface Treatment

- Border weights per role (reuse `--border-fat` / `--border-mid` /
  `--border-thin` unless the theme needs its own).
- Page chrome — border and/or shadow treatment on `.page`.
- **Signature motifs** (optional) — theme-specific visual flourishes, e.g.
  a tilt/rotation on callouts, a halftone texture, a badge stamp. Existing
  utility classes (`.tilt`, `.tilt-right`, `.badge`, `.chapter-label`,
  `.halftone`) are examples to draw from, not requirements — a theme with
  no signature motifs should say "none" rather than inventing one to fill
  the section.

## 6. Iconography & Imagery

- Icon style, if the theme uses icons at all (the house stance is
  minimal/no-fill line icons only — most themes will state "no icons"
  here).
- Imagery direction, if the theme incorporates photos or illustrations
  (most print content does not).

## 7. Motion

Print-adapted: **the printed artifact itself never animates** — no hover,
no animation, no interactivity in the printed page. The only interactive
chrome is the shell's toolbar, and it is not reskinned per theme. Most
themes should simply state "none" here.

## 8. Components & Patterns

- **Signature content blocks** — which of the standard content blocks
  (see `references/page-types.md`) get theme-specific treatment, and how
  (e.g. Comic's narrator box, chapter heading with color stripe).
- **Print-adapted states** — a printed page has no hover/focus/disabled
  states; instead, describe:
  - **Default** — the normal, populated rendering.
  - **Empty** — how a block renders with no content (e.g. an empty
    checklist section, a table with no rows).
  - **Overflow** — how a block resolves when content is too long for the
    space. Worked example (the default unless a theme spec says
    otherwise): reduce body type-scale one step, then shorten or split
    the content — do not silently truncate or let content spill past the
    page's safe area.

  Real interaction states (hover/active/disabled/focus) belong to the
  shell's toolbar, not the printed page — do not document them per theme.

## 9. Accessibility

- **Contrast targets** — WCAG AA: 4.5:1 minimum for body ink-on-paper
  text, 3:1 minimum for large/bold accent text. State the theme's actual
  measured ratios for its ink and accent colors against its paper color,
  or note an accepted, explicitly justified exception.
- **Minimum body type size** — the default is 13.5px for adult content,
  16px+ for kids' content; state which applies and why.
- **Screen-legibility notes** — anything about the theme that affects
  on-screen readability specifically (e.g. a script/handwritten display
  font that's harder to scan at small sizes on-screen than in print).
