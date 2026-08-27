# Recipe card

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

A single recipe formatted for kitchen use. **Portrait.**

*Functional requirements:*
- Header: recipe name, then a compact meta row — Prep: X min | Cook: Y min |
  Serves: N.
- Ingredients grouped by component ("For the sauce:"), one per line, quantity
  bold, generous line spacing for checking off.
- Numbered steps with key actions in bold ("Fold gently", "Do not overmix").
- Given a URL: fetch it and extract the actual recipe; strip ads and fluff, and
  attribute the source in the footer. Given a description: write a complete
  recipe.

*Default styling:* two-column layout — ingredients left (~35%), steps right
(~65%); step numbers display `--text-lg`; no images — clean text
for a splattered kitchen environment.
