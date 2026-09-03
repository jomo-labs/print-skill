# Page Types: Blocks, Geometry, and Layouts

The composable content blocks every page type is built from, the sheet geometry
to size them against, and the design tokens to write them in. Read this when
authoring a page. (Which type a request is, and which spec file that type owns,
are both in `routing.md`.)

---

## Theming interaction

Each type's spec file separates ***Functional requirements*** — the data, blocks,
physical dimensions and correctness rules that make it that kind of page —
from ***Default styling***, how it looks when no theme is named, written in
tokens.

When the request is **themed** (see `routing.md`), the functional
requirements still hold and the default styling is **dropped entirely**: the
theme governs everything visual. Mixing a type's default decoration with a
theme dilutes the theme.

---

## Content blocks (L2)

Reusable pieces. A page type is a stack or grid of these inside the safe area.

- **Date/title header** — page title, optional subtitle, optional date or date
  range. Top of most pages. Use `var(--font-display)` for the title,
  `var(--font-label)` for the kicker/metadata.
- **Section block** — a titled container (label in `var(--font-label)`, border,
  rounded corner) that holds any other block. Stack several for dashboards and
  planners.
- **Calendar grid** — 7-column grid of day cells. Variants: month (5–6 rows),
  single week (1 row of tall cells), vertical week (7 stacked rows). Day cells
  hold a number + event space.
- **Checklist / checkbox block** — rows with an empty square checkbox + label.
  Basis of to-do lists, priorities, chore rows, habit trackers. Never use actual
  `<input>` checkboxes (won't print cleanly) — use a styled `<span>`.
- **Lined writing area** — evenly spaced horizontal rules: stack empty rows of
  fixed height, each with
  `border-bottom: var(--border-hair) solid var(--color-rule-light)`. Row height
  is functional, set by who writes on it: 28px (adults), 36px (early
  writers/kids, with a dashed midline row if needed). Don't draw lines with
  `repeating-linear-gradient` backgrounds — the shell's no-fill enforcement
  strips background images inside the page.
- **Grid/graph area** — square grid or dot grid for math work, bullet journaling.
  Dot grid is the most ink-friendly.
- **Work box** — a bordered empty rectangle beneath a question/problem for
  student answers. Size to the expected work length.
- **Name/date fields** — underline fields for name and date, typically at top of
  worksheets and certificates.
- **Score/stat table** — labeled rows × columns for game scores, standings,
  tallies. Ink-on-paper header row, `--border-hair` rules, tabular figures —
  all three are already the base layer's `table` defaults.
- **Image block** — a placed raster image sized to a region: full-area for
  coloring pages, spot-sized for decoration. Minimum 300 DPI at the printed
  size. Any line-art raster — model-generated or user-supplied — must be
  normalized and gate-checked before embedding; the pipeline and both
  source checks live in `types/image-block.md`. Read that file whenever a
  page embeds derived art.
- **Footer** — the shell's structural `<footer>` at the bottom of the page;
  `--text-2xs` label-font text in `--color-dim`, already styled by the base
  layer. Optionally put context ("Grade 2 ·", a date, a week
  label) in its left span. Never remove it, never mark it with
  `data-mp-section`.


### Sheet geometry (letter)

The letter sheet is 816×1056 CSS px portrait (1056×816 landscape). Inside
the page margins that leaves a content box of roughly 680×912 px portrait
(912×680 landscape), and the shell's footer reserves ~41px of it on every
sheet (`design-rules.md`, Platform invariants). Size content to that box
before writing it; the spec files refine per-type dimensions where they
matter.

### Token quick reference

The design tokens the document stylesheet defines — author with these
(`var(--…)`) instead of raw values, and don't re-grep the stylesheet for
them:

| Family | Tokens (value) |
|---|---|
| Ink | `--color-ink` oklch(11% .005 78) · `--color-mid` oklch(44% .008 78) · `--color-dim` oklch(67% .006 78) · `--color-ghost` oklch(87% .005 78) · `--color-rule` = ink · `--color-rule-light` oklch(83% .005 78) · `--color-pull-bg` oklch(94% .009 78) · `--color-accent` oklch(52% .15 78) · `--color-paper` white |
| Fonts | `--font-display` (Playfair) · `--font-body` (Source Serif 4) · `--font-label` (Inter) |
| Type scale | `--text-2xs` 9 · `--text-xs` 10.5 · `--text-body` 13.5 · `--text-md` 15.5 · `--text-lg` 19 · `--text-xl` 26 · `--text-2xl` 38 · `--text-3xl` 48 · `--text-4xl` 80 (px) |
| Spacing | `--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 · `--space-5` 20 · `--space-6` 24 · `--space-8` 32 · `--space-10` 40 · `--space-12` 48 · `--space-16` 64 · `--space-20` 80 (px) |
| Borders | `--border-fat` 5 · `--border-mid` 3 · `--border-thin` 1.5 · `--border-hair` 1 (px) |
| Leading / tracking | `--leading-display` 1.1 · `--leading-body` 1.35 · `--leading-label` 1.4 · `--tracking-display` 0 · `--tracking-label` 0.08em · `--tracking-kicker` 0.32em · `--display-overhang` max(0em, calc((1.22em - var(--leading-display) * 1em) / 2)) |
| Page margins | `--page-margin-top` 64 · `--page-margin-x` 72 · `--page-margin-bottom` 72 (px) |

The spacing scale is **non-contiguous**: it is the eleven steps listed above
and nothing else — there is no `--space-7`, `--space-9`, `--space-11`, or any
step past 20. `var()` on a name that isn't there resolves to nothing and
silently voids the whole declaration, so assembly fails the build rather than
shipping it. `--display-overhang` is the padding display type needs to keep
its ink out of a container's clip (see design-rules.md).

Already styled by the base layer (use as-is, don't restyle): **tables**
(label font, tabular figures, ink-on-paper uppercase `th` row, hairline row
rules, faint zebra tint), `.columns-2` (two-column grid), and the footer.

---

## Composing a new type

When no type fits: identify the closest one in `routing.md`, then swap or add
blocks. Keep
all content inside the sheet's content box — the page margin is the sheet's own
padding (`--page-margin-*`). Anything that overruns it continues onto a further
sheet rather than being lost, but where that break lands is decided by what fit,
not by the design, so a type that needs a second page should lay one out. Use
the **section block** as the primary container. Assembly runs the Part B lint over your CSS
automatically (`design-rules.md`).
