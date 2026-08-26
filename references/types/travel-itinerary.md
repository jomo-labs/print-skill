# Travel itinerary

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

**Portrait.**

*Functional requirements:* header with trip title, date range, travelers. Per
day: a day header ("Day 1 — Monday, June 3") then a timeline of time +
activity, with the address beneath for GPS lookup and notes in italic.
Hotels/flights: confirmation # in a small box at right, check-in/out times
prominent. Packing list on request: a 3-column ☐ checklist grid at the end. If
details are vague, structure them logically with reasonable times.

*Default styling:* day header in the display font with a bottom rule; times
bold in a ~60px left margin; addresses in `var(--color-dim)` at `--text-2xs`.
