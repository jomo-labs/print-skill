# Financial / market summary

**Portrait.** Data-dense.

*Functional requirements:* real data only — fetch each quote. Market overview
at top (3 columns: index value, day change, % change; arrows for direction),
then a stock table (Ticker | Company | Price | Change | % Change | 52W High |
52W Low) with right-aligned amounts, and an "As of market close, DATE" stamp.

*Default styling:* label font throughout, display font for the header only;
positive values bold in ink, negative in `var(--color-dim)`.
