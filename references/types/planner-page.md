# Planner page

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

A time-blocked daily or weekly planner. **Portrait.**

*Functional requirements:*
- Header, a schedule area (lined area with time labels 6am–10pm down the left
  side), a priorities checklist, a notes area.
- If it will be hole-punched or bound, add 0.25 in extra on the binding edge.

*Default styling:* **section blocks** containing each zone, `--border-thin`
outlines, time labels `--text-2xs` label font.
