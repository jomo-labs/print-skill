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
- **Interactive output** — every page ships a **Print / Save PDF** button,
  double-click text editing, paper-size switching, and auto print-fit: one
  page means one sheet.
- **Deterministic PDFs** — a bundled local server (Node + headless Chromium)
  serves your pages and renders pixel-identical PDFs on every machine, no
  dependence on the viewer's browser. Without it, pages still print fine via
  the browser dialog.
- **20+ page types** — worksheets with answer keys, chore charts,
  certificates, calendars, meal plans, scorecards, word searches, comic
  scaffolds, and a catch-all for anything else.
- **Themeable in one phrase** — "…in the style of Dog Man" restyles fonts,
  palette, page chrome, even the writing voice.
- **Tiny footprint** — markdown instructions, a small page shell, and an
  optional local Node server. No build step, no cloud. Works in any
  [skills-compatible agent](https://agentskills.io).

## Headless / automation

No UI required end to end: the agent authors the page with its file tools, and
the PDF renders without a browser or a click — ready for pipelines that format
something printable and ship the file onward (email, cloud print, archive).

```bash
# one-shot: writes weekly-chore-chart.pdf next to the page and exits
node server/render-cli.mjs weekly-chore-chart.html

# or against the running server
curl -o chart.pdf http://127.0.0.1:4949/pdf/weekly-chore-chart.html
```

## Manual install

```bash
git clone https://github.com/jomo-labs/print-skill .claude/skills/print
```

## License

[Apache 2.0](LICENSE)
