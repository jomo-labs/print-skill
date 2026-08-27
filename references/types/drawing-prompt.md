# Drawing prompt page

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

A bold prompt at the top with a generous blank drawing area. **Portrait.**

*Functional requirements:*
- Prompt text in the top ~20%; a framed drawing area filling ≥40% of page
  height; optional 2–4 lined writing rows below for a caption.
- Prompts are specific and imaginative: "Draw a dragon hatching from an egg",
  not "Draw something fun".
- Young kids: larger prompt type, simpler language, 36px-spaced caption lines.

*Default styling:* prompt centered display `--text-xl`
(`--text-2xl` for young kids); drawing frame `--border-thin`
`var(--color-rule)`; a "Draw here ↓" label in `--color-dim` at `--text-2xs`
just above the frame.
