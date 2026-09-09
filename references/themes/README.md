# Themes

How to execute a theme, named or invented. Read only when the request is
themed — the trigger-phrase index and detection rule live in `routing.md` and
`SKILL.md` Step 1.

Every theme sits on `design-rules.md`'s platform invariants, changing only
what sits on top of them.

## Executing a matched spec

A themed page must be unmistakably in-theme — never a default layout with a
novelty font. Every spec is written as a section-to-token map, so execution is
mechanical:

1. **Tokens** — open `custom_css` with a `:root { ... }` block and copy in
   every token value from the spec's sections 2-5 tables, verbatim. Unlisted
   tokens keep their defaults — don't invent values. Set `font_import` to the
   spec's plain Google Fonts URL (given as a URL, not a CSS `@import` —
   `custom_css` may not contain `@import` or `url(`).
2. **Page chrome** — set `--page-border` in that same block; never write a
   `.page` rule. The frame carries more theme identity than anything else, and
   it is the part of the sheet's chrome that survives onto paper — the sheet's
   drop shadow is fixed preview chrome and never prints.
3. **Signature components** — structure the page out of the spec's section 6
   blocks, using the shared utilities it names (`.kicker`, `.tilt`, `.badge`,
   `.chapter-label`, `.halftone`, `.invert`, `.tint`). Map the content INTO
   those blocks rather than laying it out generically.
4. **Voice** — write every headline, kicker, label, and body sentence in the
   spec's section 1 voice register. The theme lives in the words as much as the
   CSS.
5. Keep the rest of `custom_css` small — component rules consuming tokens,
   never literals restating sizes, weights or spacing.
6. The design rules still apply: no color fills, no literal colors outside the
   `:root` block, `--color-paper` untouched. (Page chrome is the `.page` sheet
   itself.)

## Ad-hoc theme (no matching spec)

Design the theme yourself, to the standard a shipped spec meets. Decide and
execute ALL of, before writing content:

1. **Tokens** — a `:root { ... }` block: the three font families (real Google
   Fonts, `font_import` set), 1-3 accent colors true to the source material,
   and any scale steps the theme moves. Work through `page-types.md`'s token
   quick reference rather than improvising tokens one at a time.
2. **Page chrome** — set `--page-border` deliberately, even if it is `none`.
   The frame is what makes the sheet read as the theme's world at a glance, and
   it is the only page chrome a theme owns — the sheet's drop shadow is fixed
   preview chrome and never prints.
3. **Signature motifs** — invent 2-3 recurring theme-specific components (a
   stamped badge, tilted callouts, section headers with an accent stripe,
   in-world labels) and use them as the page's actual structure, reusing the
   shared utilities where they fit. When one of them draws a *subject* — an
   animal, an object, a symbol — see `references/marks.md`.
4. **Voice** — write every headline, label, and body sentence in the theme's
   characteristic voice and vocabulary.
5. **Check the accents:** each must clear 3:1 on white at the size and weight
   you use it; small text (under ~19px) stays in the neutral ramp. Too light to
   clear it → darken it.
6. The design rules still apply: no color fills, no literal colors outside the
   `:root` block, `--color-paper` untouched. A dark theme is heavy ink and a
   strong frame on white paper, plus `.invert` for a small band — never a dark
   page.

## Adding a new theme

Copy `theme-spec-template.md`, fill out every section including the
section-to-token tables, and save it here as `<name>.md` with a
`**Trigger phrases:**` line under the title — that exact form is what matching
scans for — then add a row to the theme index in `routing.md`. Pick trigger
phrases that are whole words, unlikely to sit inside unrelated ones.
