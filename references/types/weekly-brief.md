# Weekly brief / week at a glance

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

A one-sheet family week overview. **Portrait.**

*Functional requirements:*
- Header: family name (or "Weekly Brief") + week label on the right.
- Week grid, 7 rows (Mon–Sun) × 3 columns: day name + date (~72px), a small
  weather/temp cell if data was provided (blank placeholder otherwise), and an
  events/tasks column (listed events, or blank writing lines).
- A **Dinner Plan** section between grid and footer: 7 labeled blank lines.
- If upcoming events/milestones are mentioned, a "Coming Up" strip with
  countdown badges ("Emma's Birthday · 12d away") above the footer.
- Must fit one letter page portrait.

*Default styling:* grid borders `--border-thin` `var(--color-rule)` outer,
`--border-hair` `var(--color-rule-light)` inner; day column labels in
`var(--font-label)`.
