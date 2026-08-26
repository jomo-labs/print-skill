# Chore chart / habit tracker

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

Task rows × day/date columns, with checkboxes at intersections. **Landscape**
(many columns). Header names the person/family and time period.

*Functional requirements:*
- Grid: first column person (or task) names; then Mon–Sun day columns; each
  cell holds the chore with a ☐ checkbox (styled span). A star row (☆ per day)
  or last-row-per-person for earned stars.
- If the user names children, use those names; if ages are given, assign
  age-appropriate chores; otherwise "Child 1"/"Child 2". 1–2 chores per cell.
- A "Notes" or "Reward" footer section for the family to write in their reward
  system.
- Ink-friendly: empty checkboxes, no dark fills.

*Default styling:* `--border-hair` `var(--color-rule-light)` cell borders; day
headers in `var(--font-label)` small caps; header row inverted ink-on-paper
(`.invert`); alternating rows may use `.tint`.
