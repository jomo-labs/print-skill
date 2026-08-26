# Maze *(presentation-only)*

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

A rectangular cell maze. **Portrait.**

*Functional requirements:* typical sizes (cols × rows) easy 15×10, medium
20×14, hard 25×18; entrance on the top edge, exit on the bottom, labeled
"IN"/"OUT". Render as SVG `<path>` walls or a CSS grid of cells with selective
borders. If the user supplied the maze structure, render it faithfully; if you
generate one, there is no verifier — tell the user to check it is solvable.

*Default styling:* walls stroked in `var(--color-ink)`; IN/OUT labels in the
label font at `--text-2xs`.
