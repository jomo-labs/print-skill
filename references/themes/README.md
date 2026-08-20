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
   shared utilities where they fit. When one of them draws a *subject* — an
   animal, an object, a symbol — see "Getting a mark that reads" below.
4. **Voice** — write every headline, label, and body sentence in the theme's
   characteristic voice and vocabulary.
5. **Check the accents:** each must clear 3:1 on white at the size and weight
   you use it; small text (under ~19px) stays in the neutral ramp. Too light to
   clear it → darken it.
6. The design rules still apply: no color fills, no literal colors outside the
   `:root` block, `--color-paper` untouched. A dark theme is heavy ink and a
   strong frame on white paper, plus `.invert` for a small band — never a dark
   page.

### Getting a mark that reads

Design rule 1a says how to *build* a pictorial mark — inline SVG, `fill="none"`,
stroked paths — and the Part B self-check enforces that mechanically. Neither
says how to end up with a mark that is recognizable, and the two are
independent: a mark can pass every check in `design-rules.md` and still read as
the wrong animal.

**Source before you draw.** A hand-drawn mark of a real, known subject — a
character, a logo, a landmark, a species — reads as an approximation of it
however carefully it is constructed. Draw when nothing usable exists, or when
the subject is generic enough that drawing it IS the authentic version: a leaf,
a key, a coffee cup. Otherwise, in order:

1. **Vector.** Inline the SVG and set `fill="currentColor"` (or stroke a
   `var(--color-*)` token) so the mark takes the theme's palette. A placed mark
   is the one case where a filled path is right — rule 1a's `fill="none"`
   governs shapes you draw, not artwork you place.
2. **Raster.** Legitimate as an Image block spot (see `page-types.md`).
   Normalize it, embed it as a base64 data URI — never a remote `src`, the page
   must stay self-contained — and confirm 300 DPI at the printed size.
3. **Trace the raster** when the mark has to recolor with the theme, or when it
   prints small and fine detail matters. `potrace` turns a bilevel PNG into
   paths. Trace the **original**, never the print-normalized copy: dilation and
   speckle suppression fight each other and shred fine detail. Expect tracing to
   cost *more* bytes than the raster it replaces — fine for a local printable,
   but do not reach for it expecting a smaller file.

**Judge every candidate at printed size, not at full size.** This decides
between candidates more often than format does. A technically superior vector
can lose to a raster — fine outlines, and eyes or holes drawn as outlines rather
than solid shapes, collapse at an inch, while solid contrast masses survive. It
cuts the other way too: placed vector rasterizes straight to its target size,
while a large raster must be downsampled to get there, and that downsample is
what breaks fine strokes up. Render the candidate at the size it will really
print, and look at it.

**Licensing.** Check the source's terms. Art licensed for personal use only is
fine on a page someone prints for themselves; it must never be committed into
this skill's own files or a theme spec, which redistributes it.

When you do draw it:

- **Diagnostic features first.** Name the 2-3 traits that make the subject
  identifiable, then draw those before any detail. A spider is jointed legs with
  a raised knee plus a two-part body; a bicycle is two equal circles and a
  triangle frame; an oak leaf is its lobed margin. Miss one of them and no
  amount of added detail rescues the mark.
- **Silhouette over detail.** A stroked mark has no fill and no shading, so
  recognition rides entirely on outline and proportion — interior detail never
  fixes a wrong silhouette. If the subject is not identifiable at thumbnail
  size, it will not be identifiable at full size either.
- **Proportion from reference, not memory.** Memory systematically distorts:
  legs too short, heads too small, wheels unequal. Where the subject has
  canonical proportions — anatomy, vehicles, tools, letterforms — consult a
  reference while drawing. That is an authoring-time act and reaches nothing at
  render time: the generated page stays self-contained, and `custom_css` still
  forbids `url(`.
- **Weight for paper.** Keep the stroke proportionate to the printed size —
  roughly 2-2.5 units on a 100-unit viewBox for a mark printed near an inch —
  and never a hairline, which breaks up or drops out entirely on a home printer.
  Hold one weight across the mark unless the theme deliberately owns the
  variation. Round `stroke-linecap` and `stroke-linejoin` for organic subjects,
  miter for mechanical ones. Keep adjacent strokes at least ~2× the stroke width
  apart; closer than that, ink spread merges them into a blob.
- **Know when not to draw.** Some subjects do not survive stroked line art at
  all — a specific likeness, an intricate logo, a photorealistic scene. Reach
  for a typographic or abstract mark instead, the way `comic.md` substitutes
  sound effects for an icon system. A bad drawing costs the theme more than no
  drawing does.

If the user is likely to want this theme again, offer to save it: fill out the
template as `<name>.md` per the next section, so the next request lands on a
spec instead of a fresh improvisation.

## Adding a new theme

Copy `theme-spec-template.md`, fill out every section including the
section-to-token tables, and save it here as `<name>.md` with a
`**Trigger phrases:**` line right under the title — that exact form is what
matching scans for — then add a row to the index above. Pick trigger phrases
that are whole words unlikely to sit inside unrelated ones.
