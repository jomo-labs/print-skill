# Print Fundamentals

The physics of paper. These are the rules that, when broken, produce a page that
looks fine on screen and wrong when printed. Read this when setting up the sheet
or when a layout must be physically exact.

## Paper sizes

| Name | Inches | Default for |
|------|--------|-------------|
| US Letter | 8.5 × 11 | US, Canada — our default |
| US Legal | 8.5 × 14 | US legal documents |
| A4 | 8.27 × 11.69 | Rest of world |
| A5 | 5.83 × 8.27 | Small planners, half-sheets |
| Tabloid | 11 × 17 | Posters, large calendars |

Default to **Letter** for US users, **A4** otherwise. When in doubt, Letter and
A4 are close enough that a 0.75 in margin layout prints acceptably on both — but
state which one you targeted.

## The unprintable border (#1 gotcha)

Consumer inkjet and laser printers **cannot print to the edge of the paper**.
There is a mechanical border the rollers grip:
- ~0.25 in (6 mm) on top and sides
- often more at the **bottom** (up to ~0.5 in / 12 mm)

Consequences:
- **Keep all essential content inside a 0.5 in margin.** This is the safe
  default.
- **Do not design for full-bleed on home printers.** A background that runs to
  the edge will show a thin white frame. If the user wants edge-to-edge, that
  requires professional printing.
- Decorative borders and frames should sit at the 0.5 in line, not at the paper
  edge.

## Resolution and DPI

HTML/CSS text, lines, and shapes are **resolution-independent** — they print
crisp at any size. DPI only matters for **raster images** (photos, AI-generated
art).

Rule: a raster image needs **≈300 pixels per printed inch**.

```
required_pixels = printed_inches × 300
```

Examples:
- Full-page coloring image inside margins (7.5 × 10 in) → needs ≈2250 × 3000 px
- Spot illustration printed 2 in wide → needs ≈600 px wide

If an image is too small, either source a larger one or reduce its printed size.
A 1024 × 1024 image prints sharp up to ~3.4 in wide.

## Ink-friendly layout

People print these. Ink is expensive.

- **White is free; solid fills are not.** Avoid large dark backgrounds and
  full-page color washes.
- Use **outlines and hairline borders** instead of filled blocks for structure.
- Design **grayscale-safe**: most home printing is black-and-white. Don't encode
  meaning in color alone — use labels or shapes, not just hue.
- For coloring pages: **minimal ink** — pure black outlines on white, no
  shading, no fills.

## Typography at print sizes

- **Minimum body text:** 13.5px (the shell default) ≈ 10pt — acceptable for
  adults.
- **Kids / early readers:** 18–24pt, generous line spacing.
- **Footers and fine print:** 9px (the shell's footer default) — never go
  smaller; it may not survive the printer.
- Google Fonts loaded by the page embed into the PDF when the browser prints or
  saves it, so the page looks identical on any machine.

## Orientation

- **Portrait** — default for most content
- **Landscape** — use for: weekly/monthly calendars (7 columns need width), wide
  scorecards, chore charts with many day columns, certificates

Declare orientation only through the `paper` channel (assembly injects
`applySize('landscape')` — see `assembly.md`). Never via `@page` or body sizing
— see design rule 5 in `design-rules.md`.

## Margins and binding

- **Default:** the shell manages page padding and print margins; keep content
  inside the 0.5 in safe area.
- **Binding/punch:** add 0.25–0.5 in extra on the binding edge (left for
  portrait).
- **Duplex:** mirror gutters so the inside margin is larger on both sides.

## Professional printing (bleed and crop marks)

Only when the user explicitly wants a commercial print run with edge-to-edge
ink:
- **Bleed:** extend background art 0.125 in beyond every trimmed edge.
- **Crop marks:** thin cut guides outside the trim box.
- Browsers don't add crop marks natively — for a true pro PDF, flag this to the
  user.

Most printables never need this. Confirm before adding the complexity.

## Quick decision table

| Scenario | Setup |
|---|---|
| Home print, content page | Letter, portrait |
| Home print, art/coloring | Letter, pure line art |
| Wide grid (week calendar, scorecard) | Letter, landscape |
| Will be hole-punched / bound | +0.25 in on binding edge |
| Professional edge-to-edge run | +0.125 in bleed, request proof |
