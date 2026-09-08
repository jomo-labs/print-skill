# Maze *(presentation-only)*

A rectangular cell maze. **Portrait.**

*Functional requirements:* typical sizes (cols × rows) easy 15×10, medium
20×14, hard 25×18; entrance on the top edge, exit on the bottom, labeled
"IN"/"OUT". Render as SVG `<path>` walls or a CSS grid of cells with selective
borders. If the user supplied the maze structure, render it faithfully; if you
generate one, there is no verifier — tell the user to check it is solvable.

*Default styling:* walls stroked in `var(--color-ink)`; IN/OUT labels in the
label font at `--text-2xs`.
