# Flashcards

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

Printable study cards. **Portrait.**

*Functional requirements:*
- Standard index-card proportions (3.5" × 2.5"), 4 cards per page (2 × 2 CSS
  grid), dashed borders as cut lines, tiny card number top-right.
- All FRONT cards first, then all BACK cards in the same order on following
  sheets, with "— FRONT —" / "— BACK —" section headers, so double-sided
  printing lines up.
- 8–16 concise cards — one fact or concept per card.

*Default styling:* front term centered display `--text-lg`; back
definition centered body `--text-body`; high contrast.
