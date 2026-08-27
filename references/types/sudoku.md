# Sudoku *(presentation-only)*

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

9×9 grid. **Portrait.**

*Functional requirements:* givens rendered as provided, empty cells blank. Lay
out user-supplied puzzles; warn if asked to invent one.

*Default styling:* `--border-hair` `var(--color-rule-light)` cell borders with
`--border-thin` `var(--color-rule)` every third line; givens in
`var(--color-ink)` at `--text-lg`.
