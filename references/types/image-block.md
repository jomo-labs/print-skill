# Image block — derived line art, normalized and checked

Read this whenever a page embeds a raster image — a coloring page, an
image page, a drawing prompt's reference art, or spot decoration derived
from a photo. The Image block is a placed raster image sized to a region:
full-area for coloring pages, spot-sized for decoration. Minimum 300 DPI
at the printed size.

coloring pages, spot-sized for decoration. Minimum 300 DPI at the printed size.
Normalize any line-art raster — model-generated or user-supplied — before
embedding it:

```bash
magick in.jpg -colorspace Gray -filter Lanczos -resize 2100x \
              -threshold 80% -type bilevel -morphology Dilate Disk:1 out.png
```

**Resize before thresholding, never after.** Thresholding at native
resolution shatters thin anti-aliased strokes into fragments; resizing
first and thresholding second yields clean closed lines. The naive order
looks reasonable and silently destroys the art. `Dilate Disk:1` restores
stroke weight — models emit hairlines and will not reliably obey a prompt
asking for bold ones. `Disk:2` is already too heavy: it clogs facial
features.

Tune `-threshold` by eye, not by faith — a good source has a wide plateau
(58–78% all worked on one test image); a source with no plateau is
marginal. Contact sheet:

```bash
for T in 62 70 78 86; do magick in.jpg -colorspace Gray -resize 2100x \
  -threshold ${T}% -crop 500x400+800+600 +repage t$T.png; done
magick t*.png +append sheet.png   # then look at it
```

Two checks catch the failures nothing downstream can repair. Run both on
the **source**, before normalizing:

| check | command tail | fails when |
|---|---|---|
| corners white >98% | `-colorspace Gray -format "%[fx:100*p{40,40}]"` | the art is really a *photo of a printed page* — desk, page curl, shadow |
| min block luma >45% | `-colorspace Gray -scale 12x16! -format "%[fx:100*minima]"` | solid black masses that soak ink and can't be colored |

Total ink coverage is **not** a useful gate, though it is the obvious one to
reach for: a page with dense black fans can carry *less* total ink than a
good one while being far worse. Colour needs no gate either — greyscale
conversion destroys it, so a wrongly colored-in object normalizes to a clean
outline on its own. (Thresholds derived from three samples; widen them if a
real page trips one.)
