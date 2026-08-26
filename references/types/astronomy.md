# Astronomy page

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

**Portrait.**

*Functional requirements:* sun/moon data for a date and place —
sunrise/sunset, first/last light, moonrise/moonset, moon phase (draw the phase
as a stroke-outline SVG), daylight length. Fetch real data for the user's
location.

*Default styling:* a table plus one hero figure; the phase figure sized
90–140px and stroked in `var(--color-ink)`.
