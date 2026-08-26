# Certificate / award

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

**Landscape** — set `orientation` to `landscape`. The page prints on a letter
sheet in landscape: 1056×816px, with a content box roughly **912px wide × 680px
tall**. The shell's footer sits *inside* that box and takes 41px, so content has
~639px of height to work with.

*Functional requirements:*
- The outermost frame must FILL the content box — a certificate floating in
  dead space looks unfinished: `width: 100%; min-height: 620px; display: flex;
  flex-direction: column; justify-content: space-between;` so the rhythm
  spreads the full height. No fixed widths over 912px, no negative offsets,
  nothing positioned outside the frame.
- Vertical rhythm, top to bottom: kicker line (grade/team/year) → award title
  (display font, at most 2 lines) → thin rule + ornament divider → presentation
  line (italic, "This certificate is proudly presented to") → recipient name
  area (a scripted name or a blank hand-writing rule: centered border-bottom
  line at ~70% width — never a row of dash characters) → reason text (italic,
  centered, max-width ~440px) → signature grid (2–3 columns, thin rule above
  each role label) → optional seal/date row.
- One sheet, generous whitespace — do not overfill.
- **Robustness:** put ALL layout-critical styling INLINE on the elements
  (`style="..."` with `var()` tokens): frame borders and padding, decoration
  positions, type sizes. Reserve `custom_css` for the `:root` token block and
  minor refinement. Inline styles always survive; `custom_css` is dropped
  entirely on degrade, and the page must still look like a certificate without
  it.
- Every decorative `<svg>` MUST carry explicit `width` and `height` attributes
  (40–90px) so it can never render full-width. At most 2–3 decorative motifs.

*Default styling:* a stately double-border frame (`--border-mid` outer + nested
`--border-hair` inner) in `var(--color-ink)`/`var(--color-accent)` with
`--space-10` inner padding. Kicker at `--tracking-kicker`; award title at
`--text-2xl`–`--text-3xl`; ornament divider (· ❋ ·); signature role labels in
the label font at `--text-2xs`. Decorative motifs (stars, seals, laurels, sport
icons) as stroke-outline inline SVG in the token palette (`fill="none"`,
stroked paths — see design rule 1a), absolutely positioned inside the frame
corners. Set `font_import` for a display/script pairing matching the mood
(classic: Playfair Display + Dancing Script; athletic: Oswald; playful:
Fredoka). The award title or recipient name is the hero element.
