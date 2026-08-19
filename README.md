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
- **Interactive output** — served pages get a **Print / Save PDF** button,
  double-click text editing, and paper-size switching, all injected by the
  local server at view time (generated files stay pure printable documents).
  Double-click anything and the page records it — the toolbar names what you
  picked — so you can just say "make this bigger" in the session you're
  already in, and your model looks up what you meant. And when a page stops
  fitting its sheets — because the layout outgrew them, or because you typed
  too much into it — the toolbar says so in red, with a FIX button that hands
  the problem to your model; the message clears itself when the fix lands.
  That chrome renders in its own shadow root, so however wildly a page is
  themed, the controls stay put.
  Print is WYSIWYG: the on-screen sheet and the printed sheet are
  dimension-identical, 1:1.
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

Generated pages land flat in a gitignored `out/` directory as single
self-contained HTML files (styles inlined, no sidecar assets) — users reach
them through the local server URL, which wraps them with the editing chrome;
the raw file opened directly is a plain standalone printable.

```bash
# one-shot: writes weekly-chore-chart.pdf next to the page and exits
node server/render-cli.mjs out/weekly-chore-chart.html

# or against the running server
curl -o chart.pdf http://127.0.0.1:4949/pdf/weekly-chore-chart.html
```

## Manual install

```bash
git clone https://github.com/jomo-labs/print-skill .claude/skills/print
```

## License

[Apache 2.0](LICENSE)
