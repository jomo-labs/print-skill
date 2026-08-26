# Comic strip scaffold

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

Blank panels for kids to draw their own story — no pre-drawn art. **Portrait**
for 2 panels; **landscape** for 3–6 panels.

*Functional requirements:*
- Panels: 2–6 bordered rectangles in rows, each ≥ 2.5 in tall for drawing room.
- Inside each panel: a speech-bubble outline (empty `<div>` with
  `border-radius`, ~30% of panel width) and a caption strip ~20px tall at the
  bottom.
- Younger kids (≤8): 2–3 large panels; older: 4–6 smaller panels.

*Default styling:* panel and bubble borders `--border-thin`
`var(--color-rule)`; caption strip separated by `--border-hair`
`var(--color-rule-light)`; small panel number in `--color-dim` at the caption
strip's bottom-right.
