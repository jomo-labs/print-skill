# Monthly calendar

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

Classic month grid, 7 columns × 5–6 rows. **Landscape** for writing room;
portrait for a wall look.

*Functional requirements:*
- **Always compute real dates** — and double-check them. Work out the first
  weekday and day count for the requested month/year explicitly (handle
  February and leap years; don't hardcode 30/31), then verify one known anchor
  (e.g. what weekday the 1st falls on) before writing the grid. A calendar with
  the dates on the wrong weekdays is worse than no calendar.
- Month/year header, correct day layout, optional holidays/events.

*Default styling:* month/year at `--text-2xl` display; weekday header row
`--text-2xs` uppercase label font; `--border-hair` cell rules; date numbers
top-left in `--color-mid`.
