# Design Rules and Self-Check

The design invariants every generated page must satisfy, and the checklist you run
against your own `custom_css` / `font_import` before assembly. Read this in full
before writing any CSS. In the original server pipeline these rules were enforced
mechanically by a validator that rejected the CSS and forced a retry; here **you are
the validator** — run Part B honestly, every time.

---

## Platform invariants — inherited by every theme

Enforced by `assets/shell/document.css` or the checklist below. A theme spec
must not restate them and cannot opt out — it describes only what it changes.

- **Sheet and margin.** The sheet is a fixed physical size and its padding
  (`--page-margin-*`, 4px base unit) IS the print margin, printed 1:1. A theme
  may retune it; the content box (rule 5) moves with it.
- **The footer eats the last ~41px.** The shell's footer sits *inside* the
  content box and costs 41px on every sheet (32px margin-top, 8px padding-top,
  1px rule; its spans are empty, so it adds no text height). Content has to come
  in **strictly under** box height − 41 or the shell paginates — landing exactly
  on the box height is already too tall. The quoted content-box heights in rule 5
  are the box; subtract 41 to get what content can actually use.
- **Empty, overflow, and underfill.** An empty block keeps its frame and label
  (Principle IV). Overflow drops the body type-scale one step, then shortens or
  splits — never truncate, never spill past the sheet edge. Underfill is the
  mirror: content filling well under the content box (rule 5) — roughly two
  thirds of its height or less — reads as unfinished and wastes the paper.
  Scale up rather than pad: body type a step larger, wider spacing, bigger
  fillable areas (writing lines, drawing frames, cells), or a roomier layout —
  never filler content. Space the user fills in by hand or on screen counts as
  filled.
- **Containers clip, they never overlap.** Structural containers (div,
  section, li's list, table cells, …) carry `overflow: clip` from the document
  stylesheet: on paper, content painted over a neighbouring block is never
  right, so a fixed-size box cuts what outgrows it. The cut is an error state,
  not a layout tool — the shell detects content past a clip edge, outlines the
  container in red on screen, and fails the Step 6 fit check with the
  container's selector — so never size a container smaller than its content on
  purpose. Design content to fit its box (Principle VII); a container that
  genuinely must bleed (rare — an intentional full-bleed motif) opts out with
  `overflow: visible` and owns the overlap it allows. Text elements
  (headings, p, span) are exempt so glyph ink is never sheared; a 6px
  `overflow-clip-margin` gives tilted motifs and print-flat shadows room at a
  flush edge.
- **Contrast and type floors.** WCAG AA: 4.5:1 body, 3:1 large or bold accent.
  Body copy >=13.5px, 16px+ for kids'. Label-font metadata (dateline, table
  text, table headers, footer) runs 9-10.5px and is never body copy. A theme
  states the measured ratios for its own accents.
- **Tabular figures** are already set on tables and score displays.

---

## Part A — Design rules

1. **No fill rule** — color lives only in text, strokes/borders, and print-flat
   shadows, never as a background fill. Do NOT use `background`, `background-color`,
   or `background-image` to express accent/brand color, and do not use `filter`,
   `backdrop-filter`, or `mix-blend-mode` at all. Callout boxes, numbered circles,
   banners, and tips sections must not have colored backgrounds. Use `border-left`,
   `color`, `border-color`, or a PRINT-FLAT shadow to express brand color instead —
   zero blur radius, solid var() color: `box-shadow: 8px 8px 0 var(--color-accent)`
   is legal, `box-shadow: 0 4px 12px ...` is not, and the same applies to
   text-shadow. A blurred shadow is a gradient, and gradients print as muddy
   dithered ink (checked in the self-check below). The sheet's own drop shadow is
   the viewer's chrome, not yours — it is fixed, it never prints, and no token or
   rule of yours changes it, so never rely on any shadow for printed identity.
   The only backgrounds ever allowed are
   `var(--color-ink)`, `var(--color-paper)`, `var(--color-pull-bg)`,
   `transparent`, `none`, or `inherit`. Never
   `var(--color-accent)` as a background.

   Tables handle themselves (`th` inverted, even rows tinted — defaults a theme
   may override). **Elsewhere use the `.invert` and `.tint` classes rather than
   declaring a background**: the strip is value-blind, so a hand-declared ink
   band loses its fill, keeps its paper-colored text and prints white-on-white.
   Small bands and headers only.

1a. **Pictorial shapes are SVG, not CSS** — draw icons, balls, badges, stars, and
   any other pictorial artwork as inline SVG with `fill="none"` and stroked paths
   (`stroke="currentColor"` or a `var(--color-*)` token), never by compositing CSS
   backgrounds (radial/conic/linear gradients), pseudo-element fills, or inset
   box-shadows — every one of those is a fill in disguise and fails the same
   self-check as rule 1. Stroke-outline SVG also prints crisply and stays colorable
   by hand, which fills never are. This rule governs artwork you **draw**, not
   artwork you **place**: a sourced SVG or a normalized raster spot may carry its
   own fills, and rule 1's background allowlist still applies to both. For how to
   end up with a mark that reads as its subject at all — sourcing it, judging it
   at printed size, or drawing it — see "Getting a mark that reads" in
   `themes/README.md`. That matters most where the art IS the deliverable:
   hand-authored line art on a coloring, image or drawing-prompt page when no
   image backend is available.

2. **No hardcoded colors** — NEVER use a literal color (`#hex`, `rgb()`, `rgba()`,
   `hsl()`, `oklch()`, or a named CSS color like `red`/`cornflowerblue`) directly
   on an element. Only `var(--color-*)` tokens. A literal color value is only valid
   when *defining* a token inside a `:root { ... }` override — e.g.
   `:root { --color-accent: oklch(35% 0.12 240); --font-display: 'Bangers', cursive; }`
   — never inlined again elsewhere.

3. **Ad-hoc theming is wide open, except paper.** Freely define your own accent,
   ink, rule, and subtle-tone colors, your own headline/body/label fonts, and your
   own page chrome — border weight, corner treatment, frame inset — to
   match whatever theme, character, or mood the request implies. The one token you
   may never move is `--color-paper`: it must stay exactly `white` (or be left
   alone). Every token you redefine applies to the printable document only: the
   server's editing chrome (toolbar, edit overlay) renders in a shadow root with a
   private palette, so no override reaches it — and no override can break it.

3a. **Font choice must always resolve to a real, loaded typeface** — the shell
   preloads ONLY the default trio (Playfair Display, Source Serif 4, Inter). Naming
   ANY other font family requires also setting `font_import` to a matching Google
   Fonts URL, or it will render in a fallback face. Do NOT reach for OS-bundled
   fonts like `Comic Sans MS`, `Chalkboard SE`, `Papyrus`, or `Brush Script MT` —
   they render inconsistently (or not at all) depending on the viewer's device and
   aren't guaranteed installed anywhere the page gets viewed or printed. There is
   almost always a Google Font that captures the same character more reliably —
   e.g. for a bold cartoon/comic feel use `Bangers`, `Luckiest Guy`, or `Fredoka`;
   for handwritten/playful use `Patrick Hand` or `Caveat`; for a mono/typewriter
   feel use `Space Mono` or `Share Tech Mono`. When in doubt, name a specific
   Google Font and set `font_import` — don't fall back to a generic system or
   generic CSS keyword (`cursive`, `fantasy`, `monospace`) as the primary choice.

4. **Discrete pages** — one `<div class="page">` = one physical sheet. Never rely
   on CSS page-break properties to split content. Design content to fit within the
   paper height. (An answer key is the one sanctioned second sheet — it rides the
   `answer_key_html` channel and the assembly procedure wraps it; never author it
   as a second page inside `content_html`. See `assembly.md`.)

5. **Orientation** — judge it from the content's shape and declare it via the
   `orientation` channel only, which is independent of `paper` (the size axis).
   Wide-grid content — monthly calendars, weekly meal grids, seating charts,
   multi-column schedules, scoreboards, timelines, award certificates — prints
   better LANDSCAPE: set `orientation` to `landscape` and design for a
   1056px-wide × 816px-tall sheet (content box ~912px wide × ~680px tall, of
   which ~639px is usable once the footer takes its 41px),
   filling the height. Tall, list-like content stays portrait (the default;
   content box ~672px wide × ~920px tall, ~879px usable). Never express orientation yourself
   with `@page` or body sizing — the `orientation` channel is the only
   mechanism.

### Section marking

Wrap each top-level content block in a `<div data-mp-section="[type]">` where type
is one of: `header`, `calendar`, `checklist`, `scores`, `schedule`, `notes`,
`table`, `writing`, `image`, `custom`. Do not mark the `<footer>` element — it is
structural. Example: `<div data-mp-section="notes">...</div>`. The shell's print
CSS uses these markers to break at section boundaries when content genuinely
overflows, never mid-block — and the shell's pagination keeps a marked section
whole whenever it fits on a sheet of its own.

---

## Part B — Self-check (run before every assembly)

Check your `custom_css` and `font_import` against every item, in this order — it
runs most-fundamental-first. Empty `custom_css` passes items 1–7 trivially; empty
`font_import` passes item 8.

1. **No markup breakout, no remote loads.** `custom_css` contains no `<` followed
   by a letter or `/` (nothing that could close the page's `<style>` tag), no
   `@import`, and no `url(` anywhere. Fonts are the `font_import` field's job;
   nothing else may load a remote resource.

2. **No backslashes.** `custom_css` contains no `\` character at all. CSS escape
   sequences (`\62 ackground` is `background`, `@\69mport` is `@import`) can smuggle
   banned constructs past a text check, and model-authored CSS never legitimately
   needs them — so they are banned outright.

3. **Paper stays white.** Every `--color-paper:` declaration (if any) has the value
   `white`, `#fff`, or `#ffffff` — nothing else. Best: don't override it at all.

4. **Backgrounds from the allowlist only.** Every `background:` /
   `background-color:` value is exactly one of `var(--color-ink)`,
   `var(--color-paper)`, `var(--color-pull-bg)`, `transparent`,
   `none`, `inherit` — *exactly*: no `!important` suffix, no multi-part shorthand;
   the bare keyword or var() is the whole value. Every `background-image:` value
   is `none`. The properties `filter`, `backdrop-filter`, and `mix-blend-mode`
   appear nowhere, except defining `--image-filter` inside `:root`. No `box-shadow` contains `inset` (an inset shadow is a
   disguised full-element fill).

5. **Shadows are print-flat.** In every `box-shadow` and `text-shadow` layer
   (layers are comma-separated), the third length — the blur radius — is `0` or
   absent. `8px 8px 0 var(--color-accent)` passes; `0 4px 12px ...` fails.

6. **No literal colors outside `:root { }`.** Outside your `:root` token block
   there is no `#hex` color, no color function (`rgb()`, `rgba()`, `hsl()`,
   `hsla()`, `oklch()`, `oklab()`, `lab()`, `lch()`, `color()`), and no CSS named
   color keyword — including `white`; even white goes through a token outside
   `:root`. The keywords `transparent` and `currentColor` are fine — they're
   functional, not brand color.

7. **Inline styles obey the same color rules.** Rules 1–6 apply to `style="..."`
   attributes inside `content_html` too: `var(--color-*)` tokens only, allowlisted
   backgrounds, no blurred or inset shadows.

8. **`font_import` is a Google Fonts URL and nothing else.** It must literally
   start with `https://fonts.googleapis.com/` and contain only letters, digits, and
   the characters `/ ? = & + : , . @ ; _ -`. No other host, no protocol-relative
   URL, no whitespace, no backslash. If any of that fails, drop the `font_import`
   and pick a font from the preloaded trio instead.

---

## Part C — If a check fails: fix, then degrade

- **Fix pass:** correct every violation you found and re-run the full checklist
  (a fix can introduce a new violation — e.g. removing a gradient but adding an
  inset shadow — which is exactly why you re-run all of Part B, not just the item
  that failed).
- **Degrade:** if after **two** fix passes the CSS still fails any check, stop
  polishing: drop `custom_css` and `font_import` entirely and assemble with the
  shell's default theme. Keep `content_html`, `paper`, and `answer_key_html` — an
  answer key is pedagogical content and must survive. Tell the user in your report
  that the custom styling was dropped and the page uses the default theme.
- Because degrade is always possible, put **layout-critical styling inline** on the
  elements themselves (using `var()` tokens) for page types whose identity depends
  on structure — a certificate must still read as a certificate with `custom_css`
  gone. Reserve `custom_css` for the `:root` token block and typographic
  refinement. (See the per-type notes in `page-types.md`.)
