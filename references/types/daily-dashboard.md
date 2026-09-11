# Daily dashboard

A "today page": date header + stacked section blocks — agenda, top priorities,
sports scores, weather, notes, habit row. **Portrait.** The most composable
type; add/remove sections to taste.

*Functional requirements:*
- Today's date, and whatever each section needs. Fetch live data (scores,
  weather) — never invent values.
- Priorities use the **checklist block**; notes use the **lined writing area**;
  a score section uses a compact **score/stat table**.

*Default styling:* each zone is a **section block** with a `--border-thin`
outline and a `.kicker` label; `--space-6` between sections.
