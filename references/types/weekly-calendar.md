# Weekly calendar

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

One-week view. **Landscape** (7 columns fill the width better).

*Functional requirements:*
- The 7 dates for the requested week, weekday labels, and any known events.
- Each day cell holds a weekday abbreviation, the date number, and open space
  for events.
- Use the **calendar grid** block; no filled cell backgrounds.

*Default styling:* weekday abbreviation `--text-2xs` uppercase label font;
date number `--text-xl` display (`--text-lg` if dense); event space
`--text-xs` body; `--border-hair` cell rules. Fridge version: roomier cells,
bigger numbers.
