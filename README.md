# print-skill

**Give your agent the ability to make beautiful printables.** One request in,
one print-ready HTML file out.

```bash
npx skills add jomo-labs/print-skill
```

> make me a weekly chore chart for Maya (9) and Leo (6)

## Why

Ask a model for "printable HTML" and you get a web page: ink-hungry fills,
backgrounds that vanish in the print dialog, content clipped at the sheet
edge. This skill packages print as a design discipline:

- **Built for paper** — ink-friendly, grayscale-safe, inside the margins real
  printers can reach.
- **Interactive, self-contained output** — every file ships a **Print / Save
  PDF** button, double-click text editing, paper-size switching, and auto
  print-fit: one page means one sheet.
- **20+ page types** — worksheets with answer keys, chore charts,
  certificates, calendars, meal plans, scorecards, word searches, comic
  scaffolds, and a catch-all for anything else.
- **Themeable in one phrase** — "…in the style of Dog Man" restyles fonts,
  palette, page chrome, even the writing voice.
- **Zero runtime** — markdown plus one HTML asset. No Python, no build. Works
  in any [skills-compatible agent](https://agentskills.io).

## Manual install

```bash
git clone https://github.com/jomo-labs/print-skill .claude/skills/print
```

## License

[Apache 2.0](LICENSE)
