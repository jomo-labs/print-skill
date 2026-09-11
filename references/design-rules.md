# Design Rules

The design invariants every generated page must satisfy. Read this in full
before writing any CSS. Part A is judgement, yours to hold; Part B is
mechanical and assembly runs it for you.

---

## Platform invariants — inherited by every theme

Enforced by `assets/shell/document.css` or the Part B lint. A theme spec
must not restate them, and describes only what it changes.

- **Sheet and margin.** The sheet is a fixed physical size and its padding
  (`--page-margin-*`, 4px base unit) IS the print margin, printed 1:1. A theme
  may retune it; the content box (rule 5) moves with it.
- **The footer eats the last ~41px.** The footer sits *inside* the content
  box, costing 41px (32px margin-top, 8px padding-top, 1px rule). Content
  must come in **strictly under** box height − 41 (exactly on it already
  paginates). The quoted content-box heights in rule 5 are the box; subtract
  41 for usable height.
- **Empty, overflow, and underfill.** An empty block keeps its frame and label
  (Principle IV). Overflow drops the body type-scale one step, then shortens
  or splits — never truncate, never spill past the sheet edge. Underfill can
  be too short (≤~2/3 of the content box, rule 5) or stretched (spread with
  spacing to the bottom margin, covering almost none of the sheet). The fit
  check reports both (`fill: N%
  height, N% ink`) and warns below 70% height or 30% ink.
  Remedies rank by cost. A **too-short** page is fixed in `custom_css`
  first: scale the type and spacing tokens up in `:root` (`--text-*` a
  step, `--space-*` by 10–25%), or enlarge functional blank areas (writing
  lines, drawing frames, cells) — a token edit, not a rewrite. A
  **stretched** page needs more content or larger blank areas — never more
  spacing, never filler. Blank space left for the user to fill in counts as
  filled; only purposeless emptiness is underfill.
  **One fill pass.** Underfill warns, not fails: one adjustment, re-assemble
  once, ship what that reports and name the fill numbers — never a second
  rework, and never one that swaps a fill warning for an overflow.
- **Containers clip, they never overlap.** Structural containers (div,
  section, li's list, table cells, …) carry `overflow: clip`: a fixed-size
  box cuts what outgrows it — never size a container smaller than its
  content on purpose; design content to fit its box (Principle VII). A
  container that genuinely must bleed (rare) opts out
  with `overflow: visible` and owns the overlap it allows. A heading's
  descenders (and, at tight leading, its ascenders) can hang past its border
  box; **that clearance must come from layout**, never the 6px
  `overflow-clip-margin`.
  The element defaults carry it as `padding-block: var(--display-overhang)`
  on `h1`/`h2`, and on anything else using `--leading-display`. Zeroing a
  heading's *margin* is fine; never zero its padding or rely on its bottom
  margin instead.
- **Contrast and type floors.** WCAG AA: 4.5:1 body, 3:1 large or bold accent.
  Body copy >=13.5px, 16px+ for kids'. Label-font metadata (dateline, table
  text/headers, footer) runs 9-10.5px, never body copy. A theme states the
  measured ratios for its own accents.
- **Tabular figures** are set on tables and score displays.

---

## Part A — Design rules

1. **No fill rule** — color lives only in text, strokes/borders, and print-flat
   shadows, never as a background fill. Do NOT use `background`,
   `background-color`, or `background-image` for accent/brand color, or
   `filter`, `backdrop-filter`, or `mix-blend-mode` at all. Use
   `border-left`, `color`, `border-color`, or a PRINT-FLAT shadow instead —
   zero blur radius, solid var() color: `box-shadow: 8px 8px 0
   var(--color-accent)` is legal, `box-shadow: 0 4px 12px ...` is not; same
   for text-shadow. The sheet's own drop shadow never prints — never rely on
   any shadow for printed identity.
   Backgrounds allowed: `var(--color-ink)`, `var(--color-paper)`,
   `var(--color-pull-bg)`, `transparent`, `none`, `inherit` — never
   `var(--color-accent)`.

   Tables handle themselves (`th` inverted, even rows tinted — defaults a
   theme may override). **Elsewhere use the `.invert` and `.tint` classes
   rather than declaring a background**: a hand-declared band prints
   white-on-white. Small bands and headers only.

1a. **Pictorial shapes are SVG, not CSS** — draw icons, balls, badges, and
   other pictorial artwork as inline SVG with `fill="none"` and stroked paths
   (`stroke="currentColor"` or a `var(--color-*)` token), never by compositing CSS
   backgrounds (gradients), pseudo-element fills, or inset
   box-shadows — each is a fill in disguise and fails the same
   Part B lint as rule 1. This rule governs artwork you **draw**; a sourced
   SVG or raster spot may carry its own fills (rule 1 still applies). See
   `references/marks.md` for sourcing, judging, and drawing a mark that
   reads.

2. **No hardcoded colors** — NEVER use a literal color (`#hex`, `rgb()`, `rgba()`,
   `hsl()`, `oklch()`, or a named CSS color like `red`/`cornflowerblue`) directly
   on an element. Only `var(--color-*)` tokens. A literal color value is only valid
   when *defining* a token inside a `:root { ... }` override — e.g.
   `:root { --color-accent: oklch(35% 0.12 240); }` — never inlined again
   elsewhere.

   NEVER infer a token name — only names `assets/shell/document.css` or your
   own `:root` override define are valid; an undefined one silently drops
   its declaration, and assembly fails.

3. **Ad-hoc theming is wide open, except paper.** Freely define your own
   accent, ink, rule, and subtle-tone colors, fonts, and page chrome to
   match the theme, character, or mood implied. The one token you may never
   move is `--color-paper`: it must stay exactly `white` (or be left alone).
   Every token you redefine applies only to the printable document, never
   the editing chrome.

3a. **Font choice must always resolve to a real, loaded typeface** — the shell
   preloads ONLY the default trio (Playfair Display, Source Serif 4, Inter).
   Naming any other font requires `font_import` set to a matching Google
   Fonts URL, or it falls back. Do NOT reach for OS-bundled
   fonts (`Comic Sans MS`, `Chalkboard SE`, `Papyrus`, `Brush Script MT`).
   Pick a specific Google Font instead and set
   `font_import` — bold/comic: Bangers, Fredoka; handwritten: Patrick Hand,
   Caveat; mono/typewriter: Space Mono; anything else: any specific Google
   Font, never a generic keyword (`cursive`, `fantasy`, `monospace`).

4. **Discrete pages** — one `<div class="page">` = one physical sheet. Never rely
   on CSS page-break properties; design content to fit the paper height.
   (An answer key is the one sanctioned second sheet, via
   `answer_key_html` — never a second page in `content_html`. See
   `assembly.md`.)

5. **Orientation** — judge it from the content's shape and declare it via the
   `orientation` channel only — independent of `paper` (the size axis).
   Wide-grid content — calendars, schedules, scoreboards — prints better
   LANDSCAPE: set `orientation` to `landscape` and design for a
   1056px-wide × 816px-tall sheet (content box ~912px wide × ~680px tall, of
   which ~639px is usable once the footer takes its 41px),
   filling the height. Tall, list-like content stays portrait (the default;
   content box ~672px wide × ~920px tall, ~879px usable). Never set it via
   `@page` or body sizing.

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

`server/lint-cli.mjs` runs these nine checks over `custom_css`, inline
`style` attributes, and `font_import`, inside the Step 5 assemble command,
reporting every violation in one pass with its line and declaration.

(1) no markup breakout or remote load (no `<letter`, `@import`, `url(`). (2)
no `\` (backslash) anywhere in `custom_css`: a CSS escape (`@\69mport` is
`@import`) can smuggle banned constructs past a text check; authored CSS
never needs one. (3)-(6) paper stays white; the background allowlist,
print-flat shadows, and no literal color outside `:root` — Part A rules 1
and 2. (7) the same over inline `style` attributes, plus no HTML character
reference (`&#117;`, `&amp;`) inside one: the browser decodes a reference
before CSS sees the value — write the character itself (`custom_css` is
exempt). (8) `font_import` is a plain
`https://fonts.googleapis.com/` URL, or it is **dropped with a warning**,
not a failure — pick a font from the preloaded trio. (9)
display-scale type — `font-size` of `var(--text-xl|2xl|3xl|4xl)` or ≥24px,
the `var(--font-display)` face, or `var(--leading-display)` by name or a
number under ~1.2 — must carry `padding-block: var(--display-overhang)`; no
rule zeroes an `h1`/`h2`'s padding. Tight leading on small type is not this
rule.

---

## Part C — If the lint fails: fix, then degrade

- **Fix pass:** fix every violation the report names, in one pass, and
  re-run the Step 5 command.
- **Degrade:** if it still fails after **two** fix passes, drop `custom_css`
  and `font_import` and assemble with the shell's default theme, keeping
  `content_html`, `paper`, and `answer_key_html`. Tell the user in the
  report.
- Because degrade is always possible, put **layout-critical styling inline**
  (`var()` tokens) where identity depends on structure; reserve `custom_css`
  for `:root` tokens and typographic refinement.
