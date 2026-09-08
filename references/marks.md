# Getting a Mark That Reads

Read this when a themed run — matched spec or ad-hoc — draws a pictorial
subject: an animal, an object, a symbol.

Design rule 1a says how to *build* a pictorial mark — inline SVG, `fill="none"`,
stroked paths — and the Part B self-check enforces that mechanically. Neither
says how to end up with a mark that is recognizable, and the two are
independent: a mark can pass every check in `design-rules.md` and still read as
the wrong animal.

**Source before you draw.** A hand-drawn mark of a real, known subject — a
character, a logo, a landmark, a species — reads as an approximation of it
however carefully it is constructed. Draw when nothing usable exists, or when
the subject is generic enough that drawing it IS the authentic version: a leaf,
a key, a coffee cup. Otherwise, in order:

1. **Vector.** Inline the SVG and set `fill="currentColor"` (or stroke a
   `var(--color-*)` token) so the mark takes the theme's palette. A placed mark
   is the one case where a filled path is right — rule 1a's `fill="none"`
   governs shapes you draw, not artwork you place.
2. **Raster.** Legitimate as an Image block spot (see `page-types.md`).
   Normalize it, embed it as a base64 data URI — never a remote `src`, the page
   must stay self-contained — and confirm 300 DPI at the printed size.
3. **Trace the raster** when the mark has to recolor with the theme, or when it
   prints small and fine detail matters. `potrace` turns a bilevel PNG into
   paths. Trace the **original**, never the print-normalized copy: dilation and
   speckle suppression fight each other and shred fine detail. Expect tracing to
   cost *more* bytes than the raster it replaces — fine for a local printable,
   but do not reach for it expecting a smaller file.

**Judge every candidate at printed size, not at full size.** This decides
between candidates more often than format does. A technically superior vector
can lose to a raster — fine outlines, and eyes or holes drawn as outlines rather
than solid shapes, collapse at an inch, while solid contrast masses survive. It
cuts the other way too: placed vector rasterizes straight to its target size,
while a large raster must be downsampled to get there, and that downsample is
what breaks fine strokes up. Render the candidate at the size it will really
print, and look at it.

**Licensing.** Check the source's terms. Art licensed for personal use only is
fine on a page someone prints for themselves; it must never be committed into
this skill's own files or a theme spec, which redistributes it.

When you do draw it:

- **Diagnostic features first.** Name the 2-3 traits that make the subject
  identifiable, then draw those before any detail. A spider is jointed legs with
  a raised knee plus a two-part body; a bicycle is two equal circles and a
  triangle frame; an oak leaf is its lobed margin. Miss one of them and no
  amount of added detail rescues the mark.
- **Silhouette over detail.** A stroked mark has no fill and no shading, so
  recognition rides entirely on outline and proportion — interior detail never
  fixes a wrong silhouette. If the subject is not identifiable at thumbnail
  size, it will not be identifiable at full size either.
- **Proportion from reference, not memory.** Memory systematically distorts:
  legs too short, heads too small, wheels unequal. Where the subject has
  canonical proportions — anatomy, vehicles, tools, letterforms — consult a
  reference while drawing. That is an authoring-time act and reaches nothing at
  render time: the generated page stays self-contained, and `custom_css` still
  forbids `url(`.
- **Weight for paper.** Keep the stroke proportionate to the printed size —
  roughly 2-2.5 units on a 100-unit viewBox for a mark printed near an inch —
  and never a hairline, which breaks up or drops out entirely on a home printer.
  Hold one weight across the mark unless the theme deliberately owns the
  variation. Round `stroke-linecap` and `stroke-linejoin` for organic subjects,
  miter for mechanical ones. Keep adjacent strokes at least ~2× the stroke width
  apart; closer than that, ink spread merges them into a blob.
- **Know when not to draw.** Some subjects do not survive stroked line art at
  all — a specific likeness, an intricate logo, a photorealistic scene. Reach
  for a typographic or abstract mark instead, the way `comic.md` substitutes
  sound effects for an icon system. A bad drawing costs the theme more than no
  drawing does.

If the user is likely to want this theme again, offer to save it: fill out the
template as `<name>.md` per the next section, so the next request lands on a
spec instead of a fresh improvisation.

