# Design Rules

The design invariants every generated page must satisfy. Read this in full before
writing any CSS. Part A is judgement and is yours to hold. Part B is the
mechanical half and assembly runs it for you — write CSS that obeys Part A and
the lint will have nothing to say.

---

## Platform invariants — inherited by every theme

Enforced by `assets/shell/document.css` or the Part B lint. A theme spec
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
  mirror, and a page can underfill two ways. It can stop short: content
  reaching roughly two thirds of the content box (rule 5) or less reads as
  unfinished. Or it can be stretched: content spread with spacing until it
  reaches the bottom margin while covering almost none of the sheet — which
  looks composed and is the harder one to see, because every measure of extent
  calls it full. The fit check reports both (`fill: N% height, N% ink`) and
  warns below 70% height or 30% ink.
  The remedies are not interchangeable. A page that stops short can be scaled
  up: body type a step larger, wider spacing, bigger fillable areas (writing
  lines, drawing frames, cells), or a roomier layout. A page that is stretched
  has already spent its spacing — more of it makes the page emptier, not
  fuller — so it needs more content, or larger functional blank areas. Never
  filler content, either way. Blank space left intentionally for the user to
  fill in — by pen or on screen — counts as filled; only purposeless emptiness
  is underfill.
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
  (headings, p, span) are never clipped themselves — but the container around
  them is, and glyph ink paints outside the text element's own box: at
  `--leading-display` the line box is tighter than the face, so a heading's
  descenders (and at tight leading its ascenders) hang past its border box
  into the container's clip. **That clearance must come from layout**, never
  from the 6px `overflow-clip-margin` — the slack is a fixed length meant for
  tilted motifs and print-flat shadows, it does not grow with the type, and
  at the top of the display scale the ink outgrows it and prints sheared. The
  element defaults carry the clearance as `padding-block:
  var(--display-overhang)` on `h1`/`h2`; put the same padding on anything
  else you set `--leading-display` on. Zeroing a display heading's *margin*
  is fine — that is what the padding is for — but never zero its padding, and
  never count on its bottom margin instead: a last child's margin collapses
  through its parent and buys the heading nothing.
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
   dithered ink (the Part B lint catches it). The sheet's own drop shadow is
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
   Part B lint as rule 1. Stroke-outline SVG also prints crisply and stays colorable
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

   NEVER infer a token name. The only valid `var()` names are the ones
   `assets/shell/document.css` actually defines — that file is the canonical
   token list — plus any your own `:root` override defines. Do not extrapolate
   from the names you've seen (`--space-6` existing does not mean `--space-7`
   does): an undefined `var()` silently drops its whole declaration, and
   assembly fails on it.

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

## Part B — Enforced at assembly, by machine

These nine checks are not yours to run. `server/lint-cli.mjs` executes them over
your authored `custom_css`, the inline `style="..."` attributes in
`content_html`, and `font_import` — automatically, inside the Step 5 assemble
command, ahead of anything that renders. It reports **every** violation in one
pass, each with its line and the offending declaration. Never grep your own CSS
for them.

What it enforces: (1) no markup breakout or remote load — no `<` followed by a
letter or `/`, no `@import`, no `url(`; fonts are `font_import`'s job. (2) No `\`
anywhere in `custom_css`: a CSS escape (`@\69mport` is `@import`) smuggles banned
constructs past a text check, and authored CSS never needs one. (3) Paper stays
white — `--color-paper` is `white`/`#fff`/`#ffffff` or left alone. (4) The
background allowlist, the `filter`/`backdrop-filter`/`mix-blend-mode` ban (the
one exception is defining `--image-filter` inside `:root`) and no `inset`
shadow — Part A rule 1. (5) A blur radius of `0` or absent in every shadow
layer — Part A rule 1. (6) No literal color outside `:root`, `white` included;
`transparent` and `currentColor` are fine — Part A rule 2. (7) The same six over
inline styles. (8) `font_import` is a plain `https://fonts.googleapis.com/` URL;
anything else is **dropped with a warning**, not a failure, so pick a font from
the preloaded trio when that happens. (9) Display leading (`var(--leading-display)`
or anything under ~1.2) comes with `padding-block: var(--display-overhang)`, and
no rule zeroes an `h1`/`h2`'s padding — the clip invariant above.

---

## Part C — If the lint fails: fix, then degrade

- **Fix pass:** the report is complete — every violation, with its line. Fix all
  of them in one pass and re-run the Step 5 command. There is nothing to
  re-audit by hand.
- **Degrade:** if the lint still fails after **two** fix passes, stop polishing:
  drop `custom_css` and `font_import` entirely and assemble with the shell's
  default theme. Keep `content_html`, `paper`, and `answer_key_html` — an answer
  key is pedagogical content and must survive. Tell the user in your report that
  the custom styling was dropped and the page uses the default theme.
- Because degrade is always possible, put **layout-critical styling inline** on the
  elements themselves (using `var()` tokens) for page types whose identity depends
  on structure — a certificate must still read as a certificate with `custom_css`
  gone. Reserve `custom_css` for the `:root` token block and typographic
  refinement. (See the per-type notes in the `types/` spec files, indexed in `routing.md`.)
