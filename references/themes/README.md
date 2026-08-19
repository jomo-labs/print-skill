# Themes

How to match a themed request to a named theme spec, and how to execute a theme
— named or invented. Read this only when the request is themed (the theme
detection rule lives in `SKILL.md`). Then load **only** the one matching spec
file; reading every spec defeats on-demand loading.

Every theme sits on the platform invariants in `design-rules.md` and changes
only what sits on top of them.

## Index and trigger phrases

| Theme | File | Trigger phrases |
|---|---|---|
| Newspaper | `newspaper.md` | *(default — no triggers; it is the base layer, used whenever no style is named, which is not a themed request)* |
| Comic | `comic.md` | "Dog Man", "comic book", "comic strip", "Captain Underpants", "kids comic" |

**Matching is forgiving about punctuation and spacing**: compare trigger
phrases and the request with everything lowercased and non-alphanumerics
stripped, so "dogman" = "Dog Man" = "dog-man".

**A trigger must match whole words, not any substring** — "comic" matches "a
comic-strip layout" but NOT "economic", so check for a word boundary either
side. First match wins. Ignore trigger phrases shorter than 4 characters.

If a trigger matches → follow **Executing a matched spec**. If the request is
themed but nothing matches ("in the style of Batman") → follow **Ad-hoc
theme**.

## Executing a matched spec

A themed page must be unmistakably in-theme — never a default layout with a
novelty font. Every spec is written as a section-to-token map (see
`theme-spec-template.md`), so execution is mechanical:

1. **Tokens** — open `custom_css` with a `:root { ... }` block and copy in
   every token value from the spec's sections 2-5 tables, verbatim. Tokens the
   spec doesn't list keep their defaults; don't invent values for them. Set
   `font_import` to the spec's plain Google Fonts URL (it is given as a URL,
   not a CSS `@import` — `custom_css` may not contain `@import` or `url(`).
2. **Page chrome** — set `--page-border` in that same block; never write a
   `.page` rule. The frame carries more theme identity than anything else, and
   it is the part of the sheet's chrome that survives onto paper. (The sheet's
   drop shadow is not themeable — it is fixed preview chrome, not part of the
   printable.)
3. **Signature components** — structure the page out of the spec's section 6
   blocks, using the shared utilities it names (`.kicker`, `.tilt`, `.badge`,
   `.chapter-label`, `.halftone`, `.invert`, `.tint`). Map the content INTO
   those blocks rather than laying it out generically.
4. **Voice** — write every headline, kicker, label, and body sentence in the
   spec's section 1 voice register. The theme lives in the words as much as the
   CSS.
5. Keep the rest of `custom_css` small — component rules consuming tokens.
   Restating sizes, weights or spacing as literals means you're bypassing the
   scale.
6. The design rules still apply: no color fills, no literal colors outside the
   `:root` block, `--color-paper` untouched. ("Page chrome" means the `.page`
   sheet itself.)

## Ad-hoc theme (no matching spec)

Design the theme yourself, to the same standard a shipped spec meets. Before
writing content, decide and then execute ALL of:

1. **Tokens** — a `:root { ... }` block: the three font families (real Google
   Fonts, `font_import` set), 1-3 accent colors true to the source material,
   and any scale steps the theme moves. Work through the section-to-token map
   in `theme-spec-template.md` rather than improvising tokens one at a time.
2. **Page chrome** — set `--page-border` deliberately, even if it is `none`.
   The frame is what makes the sheet read as the theme's world at a glance, and
   it is the only page chrome a theme owns — the sheet's drop shadow is fixed
   preview chrome and never prints.
3. **Signature motifs** — invent 2-3 recurring theme-specific components (a
   stamped badge, tilted callouts, section headers with an accent stripe,
   in-world labels) and use them as the page's actual structure, reusing the
   shared utilities where they fit.
4. **Voice** — write every headline, label, and body sentence in the theme's
   characteristic voice and vocabulary.
5. **Check the accents:** each must clear 3:1 on white at the size and weight
   you use it; small text (under ~19px) stays in the neutral ramp. Too light to
   clear it → darken it.
6. The design rules still apply: no color fills, no literal colors outside the
   `:root` block, `--color-paper` untouched. A dark theme is heavy ink and a
   strong frame on white paper, plus `.invert` for a small band — never a dark
   page.

If the user is likely to want this theme again, offer to save it: fill out the
template as `<name>.md` per the next section, so the next request lands on a
spec instead of a fresh improvisation.

## Adding a new theme

Copy `theme-spec-template.md`, fill out every section including the
section-to-token tables, and save it here as `<name>.md` with a
`**Trigger phrases:**` line right under the title — that exact form is what
matching scans for — then add a row to the index above. Pick trigger phrases
that are whole words unlikely to sit inside unrelated ones.
