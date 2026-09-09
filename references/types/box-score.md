# Sports box score / game recap

**Portrait** or landscape depending on how many games.

*Functional requirements:* real data only — fetch it (see the Gather step in
`SKILL.md`); never fabricate scores. Include: final score, team records,
quarter/inning line score, top 1–2 performers per team with stat lines, and a
one-sentence recap. Multiple games stack as repeated score blocks.

*Default styling:* set in **the newsprint scale** (`page-types.md`). It moves
only the prose and display steps, so tables, stat lines and status labels keep
their base sizes and stay scannable — a page that is mostly numbers loses
nothing to it, and a sports sheet bound in with a news digest then matches it
instead of drifting. Otherwise: score/stat table (tabular figures come from the
base layer); final-score numbers display `--text-3xl`; status ("Final") in the
label font small caps at `--text-2xs`.
