# Themes

How to match a themed request to a named theme spec, and how to execute a theme
— named or invented. Read this only when the request is themed (the theme
detection rule lives in `SKILL.md`). Then load **only** the one matching spec
file; reading every spec defeats on-demand loading.

## Index and trigger phrases

| Theme | File | Trigger phrases |
|---|---|---|
| Newspaper | `newspaper.md` | *(default — no triggers; used when no style is named at all, which is not a themed request)* |
| Comic | `comic.md` | "Dog Man", "comic book", "comic strip", "Captain Underpants", "kids comic" |
| Blueprint | `blueprint.md` | "blueprint", "technical drawing", "architectural", "schematic" |

**Matching is forgiving about punctuation and spacing**: compare trigger phrases
and the request with everything lowercased and non-alphanumerics stripped, so
"dogman" ≡ "Dog Man" ≡ "dog-man". A trigger matches anywhere in the request.
First match wins. Ignore trigger-like words shorter than 4 characters.

If a trigger matches → follow **Executing a matched spec**. If the request is
themed but nothing matches ("in the style of Batman") → follow **Ad-hoc theme**.

## Executing a matched spec

A themed page must be unmistakably in-theme — never a default layout with a
novelty font. The spec is written for a standalone-page author; execute it
faithfully, adapted to your output channels:

1. **Tokens** — open `custom_css` with a `:root { ... }` override defining every
   token the spec calls for: `--font-display` / `--font-body` / `--font-label`,
   each accent color, and border weights. Set `font_import` to the spec's Google
   Fonts URL.
2. **Page chrome** — restyle `.page` exactly as the spec's Surface Treatment
   section directs (border weight, offset shadow, etc.). This single rule
   carries more theme identity than anything else — do not skip it.
3. **Signature components** — structure the page out of the spec's signature
   blocks (its Components & Patterns section), reproducing their described
   construction: border treatments, rotations, oversized display numbers,
   badges. Map the request's content INTO those blocks rather than laying it out
   generically.
4. **Voice** — write every headline, kicker, label, and body sentence in the
   spec's Voice & microcopy register. The theme lives in the words as much as
   the CSS.
5. The design rules still apply: no color fills, no literal colors outside the
   `:root` override, `--color-paper` stays white. ("Page chrome" above
   means the `.page` sheet itself — the server's toolbar and chat panel render
   in a shadow root and never take a theme.)

## Ad-hoc theme (no matching spec)

Design the theme yourself — completely. Before writing content, decide and then
execute ALL of:

1. **Tokens** — a `:root { ... }` override in `custom_css` defining
   `--font-display` / `--font-body` (real Google Fonts, with `font_import` set),
   1–3 accent colors true to the theme's source material, and border weights.
2. **Page chrome** — a distinctive `.page` treatment (border weight/style,
   non-inset offset shadow, corner treatment) that evokes the theme's world.
3. **Signature motifs** — invent 2–3 recurring theme-specific components (e.g. a
   stamped badge, tilted callout boxes, chapter/section headers with an accent
   stripe, in-world labels) and use them as the page's actual structure.
4. **Voice** — write every headline, label, and body sentence in the theme's
   characteristic voice and vocabulary.
5. The design rules still apply: no color fills, no literal colors outside the
   `:root` override, `--color-paper` stays white. ("Page chrome" above
   means the `.page` sheet itself — the server's toolbar and chat panel render
   in a shadow root and never take a theme.)

## Adding a new theme

Copy `theme-spec-template.md`, fill out every section, save it here as
`<name>.md` with a `**Trigger phrases:**` line right under the title, and add a
row to the index table above. Keep the trigger-phrase line in that exact
markdown form — it's what matching scans for.
