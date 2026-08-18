# Themes

How to match a themed request to a named theme spec, and how to execute a theme
— named or invented. Read this only when the request is themed (the theme
detection rule lives in `SKILL.md`). Then load **only** the one matching spec
file; reading every spec defeats on-demand loading.

Every theme sits on the platform baseline in `design-rules.md` ("Platform
invariants"): sheet geometry and margins, no animation, grayscale imagery,
empty/overflow behavior, contrast floors, tabular figures, paper stays white.
A theme changes what sits on top of that baseline and never restates it.

## Index and trigger phrases

| Theme | File | Trigger phrases |
|---|---|---|
| Newspaper | `newspaper.md` | *(default — no triggers; it is the base layer, used whenever no style is named, which is not a themed request)* |
| Comic | `comic.md` | "Dog Man", "comic book", "comic strip", "Captain Underpants", "kids comic" |

**Matching is forgiving about punctuation and spacing**: compare trigger
phrases and the request with everything lowercased and non-alphanumerics
stripped, so "dogman" = "Dog Man" = "dog-man".

**A trigger must match whole words, not any substring.** "comic" matches "comic
book" and "a comic-strip layout"; it does **not** match "economic". Check that
the character before and after the match is a word boundary (start/end of the
request, or a character that was stripped as punctuation or whitespace) —
otherwise it isn't a match. First match wins. Ignore trigger phrases shorter
than 4 characters.

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
2. **Page chrome** — `--page-border` and `--page-shadow` are set in that same
   block. Do not write a `.page` rule; the stylesheet already consumes both
   tokens. This pair carries more theme identity than anything else, and only
   the border survives onto paper.
3. **Signature components** — structure the page out of the spec's section 6
   blocks, reproducing their described construction, and use the shared opt-in
   utilities the spec names (`.kicker`, `.tilt`, `.badge`, `.chapter-label`,
   `.halftone`, `.invert`, `.tint`). Map the request's content INTO those
   blocks rather than laying it out generically.
4. **Voice** — write every headline, kicker, label, and body sentence in the
   spec's section 1 voice register. The theme lives in the words as much as the
   CSS.
5. Beyond the token block, `custom_css` should be small: component rules that
   consume tokens. If you find yourself restating font sizes, rule weights, or
   spacing as literals, you're bypassing the scale — go back to the tokens.
6. The design rules still apply: no color fills, no literal colors outside the
   `:root` block, `--color-paper` untouched. ("Page chrome" above means the
   `.page` sheet itself — the server's toolbar and chat panel render in a
   shadow root and never take a theme.)

## Ad-hoc theme (no matching spec)

Design the theme yourself, to the same standard a shipped spec meets. Before
writing content, decide and then execute ALL of:

1. **Tokens** — a `:root { ... }` block covering, at minimum: the three font
   families (real Google Fonts, with `font_import` set), 1-3 accent colors true
   to the theme's source material, and any `--text-*`, `--leading-*`,
   `--tracking-*`, `--border-*` or `--space-*` steps the theme moves. Work
   through the section-to-token map in `theme-spec-template.md` rather than
   improvising a token here and there.
2. **Page chrome** — set `--page-border` and `--page-shadow` deliberately, even
   if one is `none`. A distinctive frame (weight, style, a hard non-inset
   offset shadow) is what makes the sheet read as the theme's world at a
   glance. Remember the shadow is screen-only: the border has to carry the look
   in print.
3. **Signature motifs** — invent 2-3 recurring theme-specific components (a
   stamped badge, tilted callouts, section headers with an accent stripe,
   in-world labels) and use them as the page's actual structure, reusing the
   shared utilities where they fit.
4. **Voice** — write every headline, label, and body sentence in the theme's
   characteristic voice and vocabulary.
5. **Check your accents before committing to them:** each accent must clear
   3:1 against white for the size and weight you use it at, and small text
   (under ~19px) stays in the neutral ramp. If an accent is too light to clear
   that, darken it rather than using it small.
6. The design rules still apply: no color fills, no literal colors outside the
   `:root` block, `--color-paper` untouched. A dark theme is expressed as heavy
   ink and a strong frame on white paper, plus `.invert` for a small band —
   never a dark page. ("Page chrome" above means the `.page` sheet itself — the
   server's toolbar and chat panel render in a shadow root and never take a
   theme.)

If the user is likely to want this theme again, offer to save it: fill out the
template as `<name>.md` per the next section, so the next request lands on a
spec instead of a fresh improvisation.

## Adding a new theme

Copy `theme-spec-template.md`, fill out every section — including the
section-to-token tables, which are what makes the spec executable — and save it
here as `<name>.md` with a `**Trigger phrases:**` line right under the title,
then add a row to the index table above. Keep the trigger-phrase line in that
exact markdown form: it's what matching scans for. Choose trigger phrases that
are whole words unlikely to appear inside unrelated words.
