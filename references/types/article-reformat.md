# Article reformat

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

Long-form reading page from a URL. **Portrait.**

*Functional requirements:* fetch the article; keep only headline, byline/date,
body paragraphs, pull quotes, section headers. No images, ads, or
related-article cruft. Source URL and print date at the bottom. Long articles:
design each `.page` to hold what fits — never CSS page-break properties (design
rule 4).

*Default styling:* single column at maximum readable width; body at
`--text-body` with leading a step looser than default (1.75); drop cap on the
first paragraph (`::first-letter` with a 3-line float); section headers with a
`--border-hair` top rule; the source line in `--color-dim` at `--text-2xs`.
