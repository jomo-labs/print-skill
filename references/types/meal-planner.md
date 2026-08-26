# Meal planner

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

Weekly meal grid + shopping list. **Landscape** — the 7-day grid needs the
width; design for the ~912×680px content box — ~639px of that height is
usable once the footer takes its 41px — and fill it.

*Functional requirements:*
- Two-column grid, roughly 66% / 34%.
- LEFT — the week grid: 7 day rows (Mon–Sun). Each row: a day label cell plus
  Breakfast / Lunch / Dinner entries. Suggest REAL meal names ("Sheet Pan Lemon
  Herb Chicken", not "chicken").
- RIGHT — shopping list grouped by category (Produce, Proteins, Dairy, Pantry,
  Other), each item a bordered checkbox square + name; the list consolidates
  ingredients across the week.
- Varied, realistic, family-friendly meals; quick weeknight dinners (Tue–Thu),
  more involved weekend cooking. Honor any dietary preferences or family size.

*Default styling:* meal-type labels in tiny uppercase `var(--color-dim)`, meal
name in `var(--color-ink)`; `--border-hair` rules between rows, heavier
`--border-thin` `var(--color-rule)` day separators; category headers in
`var(--font-label)` small caps with an accent left-stripe.
