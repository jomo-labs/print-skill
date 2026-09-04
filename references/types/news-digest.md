# News digest

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

**Portrait.** 1–2 pages of content, fetched fresh.

*Functional requirements:* masthead-style header ("MORNING BRIEFING" or the
topic) with the date below; per story a headline, a dateline (SOURCE · DATE), a
2–3 sentence lede, optionally a pull quote. No images or URLs — nothing that
wastes ink.

*Density:* this is the page type that most depends on it — a briefing sheet
with four stories and air between them is a poster, not a digest. Carry
**enough stories to fill the sheet**: typically 5–7 in two columns on letter
portrait at the default scale, fewer only when the source genuinely has fewer.
Plan that count in the sizing ledger and write to it in the first draft —
more stories, longer ledes, a pull quote — never open up the rhythm to reach
the bottom margin. The fit check reports height and ink separately for
exactly this reason: spacing raises the first and not the second. If the
first assembly still reports underfill, one addition and one re-assembly is
the budget (`design-rules.md`, underfill); ship after that.

*Default styling:* body copy at newsprint leading — `:root { --leading-body:
1.4; }` in `custom_css`, the one token this type overrides (the base layer's
1.65 is set for reading, not for column-set news); 2-column grid for 3+
stories, single column for 1–2; headline display `--text-lg` bold; dateline in small caps via
`.kicker`; pull quote in a left-border box (`blockquote`); `--border-hair`
rules between stories, not boxes.
