# Sports box score / game recap

**Portrait** or landscape depending on how many games.

*Functional requirements:* real data only — fetch it (see the Gather step in
`SKILL.md`); never fabricate scores. Include: final score, team records,
quarter/inning line score, top 1–2 performers per team with stat lines, and a
one-sentence recap. Multiple games stack as repeated score blocks.

*Default styling:* score/stat table (tabular figures come from the base layer);
final-score numbers display `--text-3xl`; status ("Final") in
the label font small caps at `--text-2xs`.
