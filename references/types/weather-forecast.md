# Weather forecast

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

**Portrait**, single column, generous whitespace, date/location at top.

*Functional requirements:* real data only — fetch it. Current conditions block
(city, current temp, condition, feels-like, humidity, wind), today's hourly
table (Time | Temp | Condition | Precip%), and a compact 7-day grid (Day | High
| Low | Condition | Rain%). Text glyphs ☀ ⛅ 🌧 ❄ print as black shapes.

*Default styling:* temperature as the hero at `--text-3xl`; base `table`
defaults; labels at `--text-2xs`.
