# Word search *(presentation-only — see the puzzle note in `page-types.md`)*

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

A letter-grid puzzle with a hidden word list. **Portrait.**

*Functional requirements:*
- Grid: 15×15 default (12×12 for ≤8-year-olds, 18×18 for adults). Every cell
  holds an uppercase letter — no blanks.
- Cells are square and evenly sized (26px is the workable default at 15×15):
  `display: grid; grid-template-columns: repeat(15, 26px); gap: 0`, each cell
  `width: 26px; height: 26px; text-align: center; line-height: 26px`.
- If the user supplied the grid, lay it out verbatim. If you generate one,
  place words horizontally/vertically/diagonally, fill the rest with random
  capitals — then re-check that every listed word actually appears, and say the
  grid should be spot-checked.

*Default styling:* cells label `--text-body`, weight 600, in
`var(--color-ink)`, with `--border-hair` `var(--color-rule-light)` borders;
word list below the grid label `--text-xs`, 3 columns.
