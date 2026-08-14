# The Seven Principles of Print

The design codex behind every page this skill produces — what separates a
printout that looks like it came from a real publication from one that looks
like it came from a computer. Read this alongside `design-rules.md` when
authoring; the theme specs cite these principles by number.

**Premise:** a physical printout is permanent. There is no hover to reveal, no
scroll for more, no second chance. The design must be right before it leaves
the screen.

## I — A publication has a house style, not a per-page style

Scattered literal values (`#ccc` here, `#ddd` there) are local accidents —
someone's best guess at "a light border" in the moment, never reconciled with
the border two sections over. Every visual decision belongs to the
publication, not the piece: named tokens, decided once. This is why the design
rules allow color and font values only through `var(--color-*)` /
`var(--font-*)` (see `design-rules.md` rule 2) — never re-decide an unnamed
value mid-page.

## II — Hierarchy does all the work

Print has no hover states, no animation, no interactivity. The only tools are
size, weight, italic, space, and rule — and that discipline is what makes
newspaper typography beautiful. Every element declares its importance through
type alone. The moment you reach for a gradient or a soft shadow to fill
space, you have admitted the hierarchy is not working hard enough: cut the
decoration, fix the hierarchy. If removing an element loses no information,
the element was not doing work. Fill named typographic roles (display / body /
label) — never freelance a font choice per element.

## III — Nothing is neutral

Every measurement on a printed page is a statement. A `1fr / 1fr` grid says
these two things are equal — and in a sports page or news digest they almost
never are; one item is the lead story. Equal padding on every section says all
sections matter the same. They do not. Perfectly symmetric layouts read as
*generated*; real newspaper grids breathe.

**In practice:** when laying out multiple items (games, stories, recipes,
sections), rank them first and give the lead item more visual weight — wider
column, larger type, more space above. If you cannot name why a measurement
exists, it should not exist.

## IV — The blank slot must hold its weight

When data hasn't arrived — a blank to be filled in by hand, a pending
statistic, a missing image — the layout should still look intentional. A
ruled rectangle with a caption baseline does structural work even when empty;
a faint placeholder floating in a grey box is just a void with something in
it. Design the empty state first: if the layout only works full, it does not
work. An empty checklist row still renders its border and label; an image
slot is a proportioned ruled box with a typeset caption line — the slot has
weight, the content fills it.

## V — Type is set, not placed

Curly quotes (“ ” ‘ ’), em dashes (—), proper ellipses (…), en dashes for
ranges (3–2, 60–90 min), `font-variant-numeric: tabular-nums` on every table
and score display. These are not pedantry — they are the difference between
text that was *set* (a craftsperson made decisions about it) and text that was
*output* (a machine emitted it and moved on). A reader never consciously
notices a straight apostrophe, but they feel the difference between a page
that was composed and a page that was printed. Typographic correctness is
invisible; typographic incorrectness is not.

## VI — Design for the medium, not the preview

The screen is a draft; the print is the artifact. A background fill that
disappears when ink hits paper only ever existed in the preview. Color
belongs in text and borders, where it survives the journey to the page. The
test: mentally turn off background colors and read the page — if the
hierarchy collapses, the design was living in the fills. A blur is a gradient
by another name, and a gradient reaching a household inkjet becomes muddy
dither, so the only shadow allowed is print-flat: `Xpx Ypx 0 var(--color-*)`,
a second stroke of ink that reads as deliberate. This principle is enforced
mechanically by the self-check in `design-rules.md` Part B.

## VII — The content drives the canvas

A recipe with four steps and one with ten are different objects; forcing both
into the same layout produces one page with empty panels and another that
overflows mid-sentence. **Count steps, items, and games before choosing a
layout** — short content earns a compact single column, long content earns a
grid. The sheet itself is part of the adaptation: a certificate wants
landscape (a name set wide is the design; the same words stacked tall are a
form), a packing list wants half-letter, a European household wants A4.

When content genuinely needs two pages, the break is a design decision, not a
consequence — each page should feel complete, a spread rather than an
accident. There is no print-time safety net: print is WYSIWYG, so content
that overflows the on-screen sheet boundary spills onto a second printed
sheet exactly as shown. The only fix for overflow is knowing the content
length before committing to the layout.
