# Design Rules and Self-Check

The design invariants every generated page must satisfy, and the checklist you run
against your own `custom_css` / `font_import` before assembly. Read this in full
before writing any CSS. In the original server pipeline these rules were enforced
mechanically by a validator that rejected the CSS and forced a retry; here **you are
the validator** — run Part B honestly, every time.

---

## Platform invariants — inherited by every theme

These hold for every page this skill generates, themed or not. They are
enforced by `assets/shell/document.css` or by the checklist below, not by any
theme spec — **a theme spec must not restate them**, and cannot opt out of
them. A theme describes only what it changes on top of this baseline.

- **Sheet and margin.** The sheet is a fixed physical size (816x1056px for
  letter portrait); its padding IS the print margin, printed 1:1. The
  `--page-margin-*` tokens carry it — 64px top, 72px sides and bottom by
  default, giving a content box of ~672x920px portrait and ~912x680px
  landscape (letter). That sits comfortably inside the 0.5in edge that
  consumer printers can physically reach. A theme may retune the tokens; the
  content box moves with them.
- **Base unit** is 4px, via the `--space-*` scale.
- **Nothing animates.** The printed artifact has no hover, focus, disabled or
  loading state, and no motion of any kind — there is nothing to specify per
  theme. The only interactive chrome is the shell's toolbar and chat panel,
  which are not part of the document.
- **Chrome is isolated from the page.** The toolbar and chat panel render in a
  shadow root and resolve their own private `--mp-*` palette, so nothing a
  theme redefines reaches them and nothing a page writes can break them. Style
  the document; the surrounding UI stays put. The only styles the chrome puts
  back into the document are its layout reservations (room under the toolbar,
  the gutter beside the panel, the edit-mode selection outline), which live in
  `chrome-host.css` in a first cascade layer and hold regardless of page CSS.
- **Imagery is grayscale**, always — `img` carries `filter: grayscale(100%)`
  and author CSS may not use `filter`, so this is not a theme decision.
  Pictorial artwork is stroked SVG (rule 1a below), never an icon font or an
  emoji standing in for a drawn mark.
- **Paper stays white** (rule 3 below), and the sheet's own background is
  locked with a literal, so a `--color-paper` override cannot tint it.
- **Empty and overflow behavior.** An empty block still renders its frame and
  label rather than collapsing (Principle IV). Content that overruns the sheet
  is resolved by reducing the body type-scale one step, then shortening or
  splitting the content — never by truncating it or letting it spill past the
  sheet edge. A theme states these only where it genuinely deviates.
- **Contrast and type floors.** WCAG AA: 4.5:1 for body ink-on-paper, 3:1 for
  large or bold accent text. Body copy is at least 13.5px (16px+ for kids'
  content). The label-font metadata roles — dateline, table text, table
  headers, footer — run 9-10.5px by design; that floor applies to metadata
  only and never to body copy. A theme states the measured ratios for its own
  accent colors, since those are the values the baseline cannot know.
- **Numbers in tables and score displays** carry
  `font-variant-numeric: tabular-nums` from the base stylesheet, so columns
  align without any per-page CSS (Principle V).

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
   dithered ink (checked in the self-check below). The page border's own drop
   shadow is screen-only chrome — print strips it automatically, so never rely on
   any shadow for printed identity. The only backgrounds ever allowed are
   `var(--color-ink)`, `var(--color-paper)`, `var(--color-pull-bg)`,
   `transparent`, `none`, or `inherit`. Never
   `var(--color-accent)` as a background.

   In tables this is automatic — the stylesheet already inverts `th` and tints
   even rows, as ordinary defaults a theme may override with its own `th` /
   `td` rules (they are not force-locked; only the paper surface is). **Everywhere else, reach for the `.invert` and `.tint` utility
   classes rather than declaring a background yourself.** The stylesheet strips
   backgrounds from block elements inside `.page` (`div`, `section`, `p`, `li`,
   `span`, and their siblings) and that strip is value-blind: it cannot tell a
   sanctioned ink masthead band from an accent fill, so a hand-declared
   `background: var(--color-ink)` loses its background but keeps its
   paper-colored text and prints as invisible white-on-white. `.invert` (ink
   surface, paper text) and `.tint` (`--color-pull-bg` surface) survive the
   strip. Use them for small bands and headers only — an inverted block is
   expensive in toner, and a whole inverted section is never the answer.

1a. **Pictorial shapes are SVG, not CSS** — draw icons, balls, badges, stars, and
   any other pictorial artwork as inline SVG with `fill="none"` and stroked paths
   (`stroke="currentColor"` or a `var(--color-*)` token), never by compositing CSS
   backgrounds (radial/conic/linear gradients), pseudo-element fills, or inset
   box-shadows — every one of those is a fill in disguise and fails the same
   self-check as rule 1. Stroke-outline SVG also prints crisply and stays colorable
   by hand, which fills never are.

2. **No hardcoded colors** — NEVER use a literal color (`#hex`, `rgb()`, `rgba()`,
   `hsl()`, `oklch()`, or a named CSS color like `red`/`cornflowerblue`) directly
   on an element. Only `var(--color-*)` tokens. A literal color value is only valid
   when *defining* a token inside a `:root { ... }` override — e.g.
   `:root { --color-accent: oklch(35% 0.12 240); --font-display: 'Bangers', cursive; }`
   — never inlined again elsewhere.

3. **Ad-hoc theming is wide open, except paper.** Freely define your own accent,
   ink, rule, and subtle-tone colors, your own headline/body/label fonts, and your
   own page chrome — border weight, corner treatment, a non-inset drop-shadow — to
   match whatever theme, character, or mood the request implies. The one token you
   may never move is `--color-paper`: it must stay exactly `white` (or be left
   alone). Every token you redefine applies to the printable document only: the
   server's editing chrome (toolbar, chat panel) renders in a shadow root with a
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
   1056px-wide × 816px-tall sheet (content box ~912px wide × ~680px tall),
   filling the height. Tall, list-like content stays portrait (the default;
   content box ~672px wide × ~920px tall). Never express orientation yourself
   with `@page` or body sizing — the `orientation` channel is the only
   mechanism.

### Section marking

Wrap each top-level content block in a `<div data-mp-section="[type]">` where type
is one of: `header`, `calendar`, `checklist`, `scores`, `schedule`, `notes`,
`table`, `writing`, `image`, `custom`. Do not mark the `<footer>` element — it is
structural. Example: `<div data-mp-section="notes">...</div>`. The shell's print
CSS uses these markers to break at section boundaries when content genuinely
overflows, never mid-block.

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
   appear nowhere. No `box-shadow` contains `inset` (an inset shadow is a
   disguised full-element fill). Better still, declare no background at all
   outside `:root` — the sanctioned surfaces are the `.invert` and `.tint`
   classes plus the automatic table fills (rule 1).

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
