# Generic reformat *(catch-all)*

The user's content, formatted as a beautiful print-ready page.

*Functional requirements:* infer the best structure —
- Long prose or notes → single column, body font, generous line-height.
- Recipe or how-to steps → 2-column (supplies left, numbered steps right).
- Reference or cheat sheet → dense 2–3 column CSS columns.
- Data or comparisons → table with an ink-on-paper header row.
- Short item list → card grid or definition list.

Always: a clear title/masthead at top; body at `--text-body` or larger with
`--leading-body`; source attribution at the bottom if the content came from a
URL.

*Default styling:* the base layer as shipped — display-font title, `.kicker`
labels, `--border-hair` rules, base `table` defaults. No decoration of its own.
