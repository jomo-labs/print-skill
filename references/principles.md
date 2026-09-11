# The Seven Principles of Print

Read alongside `design-rules.md`; theme specs cite these by number.

## I — A publication has a house style, not a per-page style

Every visual decision belongs to the publication, not the piece: named
tokens, decided once, through `var(--color-*)` / `var(--font-*)`
(`design-rules.md` rule 2) — never re-decide an unnamed value mid-page.

## II — Hierarchy does all the work

Every element declares its importance through type alone — size, weight,
italic, space, rule — never a gradient or shadow to fill space. Fill named
typographic roles (display / body / label) — never freelance a font choice
per element. If removing an element loses no information, it was not doing
work.

## III — Nothing is neutral

When laying out multiple items (games, stories, recipes, sections), rank
them first and give the lead item more visual weight — wider column, larger
type, more space above. If you cannot name why a measurement exists, it
should not exist.

## IV — The blank slot must hold its weight

Design the empty state first: if the layout only works full, it does not
work. An empty checklist row still renders its border and label; an image
slot is a proportioned ruled box with a typeset caption line — the slot has
weight, the content fills it.

## V — Type is set, not placed

Curly quotes (“ ” ‘ ’), em dashes (—), proper ellipses (…), en dashes for
ranges (3–2, 60–90 min), and tabular figures wherever numbers stack (already
set on `table` and `.score-box .score`; declare it yourself only for numeric
columns built out of divs).

## VI — Design for the medium, not the preview

Color and shadow are one rule, owned by `design-rules.md` rule 1. The reason
it exists: the screen is a draft, the print is the artifact — anything that
only works in the preview never survives the page.

## VII — The content drives the canvas

Count steps, items, and games before choosing a layout — short content earns
a compact single column, long content earns a grid. The sheet itself adapts:
a certificate wants landscape, a packing list wants half-letter, a European
household wants A4. A break across two pages is a design decision, not an
accident: know the content's length before committing to a layout, not after
it overflows.
