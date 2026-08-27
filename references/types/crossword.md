# Crossword *(presentation-only)*

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

**Portrait.**

*Functional requirements:* a numbered grid (CSS grid of white cells and ink
block cells, numbers in the top-left corner of entry cells) with Across/Down
clue columns below or beside. Lay out user-supplied grids and clues; a
self-generated crossword is very hard to get right — prefer asking for the
content.

*Default styling:* cell numbers `--text-2xs`; block cells `.invert`; clue
columns `--text-xs` label font.
