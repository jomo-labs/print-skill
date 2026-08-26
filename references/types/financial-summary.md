# Financial / market summary

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

**Portrait.** Data-dense.

*Functional requirements:* real data only — fetch each quote. Market overview
at top (3 columns: index value, day change, % change; arrows for direction),
then a stock table (Ticker | Company | Price | Change | % Change | 52W High |
52W Low) with right-aligned amounts, and an "As of market close, DATE" stamp.

*Default styling:* label font throughout, display font for the header only;
positive values bold in ink, negative in `var(--color-dim)`.
