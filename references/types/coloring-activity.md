# Coloring / activity page

Part of the print skill's page-type catalog. `references/page-types.md`
holds the routing table, the shared **content blocks** this spec names
(section block, checklist block, lined writing area, …), the sheet
geometry, and the theming rule: on a themed request, *Default styling*
below is dropped entirely and only *Functional requirements* survive.

Title + full-area **image block** of **pure black line art on white**.
**Portrait** or landscape to match the image.

*Functional requirements:*
- Clean black outlines, no shading, no fill, white background. Bold simple
  lines for young kids; finer detail for adults. Verify it's line art, not a
  shaded illustration.
- Image resolution: ~**2100×2875px** (300 DPI across the 7.0 × 9.6 in portrait
  content box). Larger is fine; smaller prints soft.
- A user-provided image file is embedded as a data URI (grayscale by default,
  per the theme's `--image-filter`), after the **Image block** normalize pass.
- Size the art by **height, not width**: this aspect sits close to the content
  box's own, so `width:100%` overflows the sheet. Budget `max-height` =
  920px − title − footer; ~815px at the default `--text-xl` title, ~830px if
  you drop the title to `--text-lg` to buy the art more room.
- For a prompt-driven page with no image, use **Drawing prompt page** below.

*Turning a photograph into line art.* Needs an image backend
(`harness-support.md` Part 2); with none, hand-author the art as stroked SVG
per design rule 1a and say so. Keep the division of labour clear: the
**model** supplies composition, perspective and likeness — things that cannot
be hand-authored — while the **normalize pass** supplies resolution, 1-bit
conversion and line weight. Do not spend prompt iterations on anything the
normalize pass fixes deterministically; that is wasted effort.

Three failure modes recur, and all three must be closed *in the prompt*
because normalization cannot repair them. Ask for a **flat digital line-art
image** — naming a "coloring book page" invites a rendered photograph of a
physical book, complete with desk, page curl and a colored-in object. Forbid
**solid black anywhere**, requiring every object be an outline with a white
interior; call out dense radiating detail (fan pleats, ceiling planks)
specifically and ask for open white hubs, or converging lines fill in as
black masses. And require small signs and labels be **left blank**, or the
model invents scribbled lettering.

Expect these to trade against each other: closing one loophole commonly
reopens another, so re-run both Image-block checks after every iteration
rather than assuming a prompt that worked once still holds.

*Default styling:* title display `--text-xl`, centered above the
image; no frame around the art.
