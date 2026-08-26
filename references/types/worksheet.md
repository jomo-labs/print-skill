# Worksheet

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

Title + instructions header, **name/date fields**, numbered problems/prompts
with **work boxes** beneath each. **Portrait.**

*Functional requirements (survive theming):*
- Header includes `Name: ________  Date: ________  Score: ___/___` blanks.
- Clearly numbered problems with generous room to work below or beside each.
- 14pt minimum font size for young readers; scale problem count and difficulty
  to the stated grade level.
- Blank writing lines wherever the answer is written out (words, sentences,
  spelling practice).
- An answer key rides the `answer_key_html` channel (assembly wraps it as a
  second sheet — see `assembly.md`); never author it as a second page or a
  page-break inside `content_html`.

*Default styling:*
- Title line display `--text-xl`, naming the topic ("Math
  Practice — Addition"); grade level label `--text-2xs`.
- 2-column layout for short problems (more fit per page); single column for
  longer problems or grids. Work box height ~80px for short answers, ~160px for
  showing work.
- Friendly but clean — no clip art or decorative elements, just typography.
  Generous line spacing; kids need room to write.
