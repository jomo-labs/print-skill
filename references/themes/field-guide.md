# Theme: Field guide (vintage naturalist)

**Trigger phrases:** "field guide", "botanical", "naturalist", "nature
journal", "herbarium", "specimen", "Audubon", "vintage science", "apothecary",
"old encyclopedia", or similar.

Platform invariants are in `design-rules.md`; only what Field guide changes is
below.

## 1. Meta & Philosophy

- **Principles specific to this theme:**
  1. Every item is a specimen: it gets a number, a name, and a caption, in that
     order, whether it is a bird, an ingredient or a chore.
  2. The page is a plate from a book. Generous margins, a centered axis, and one
     dominant illustration position — the layout of a lithographic plate, not of
     a form.
  3. Annotation over decoration. Ornament earns its place only as a rule, a
     bracket, or a caption mark; nothing is added purely to fill space.
  4. Old-book restraint reads as expensive. Two type sizes and a hairline rule
     do more here than any flourish.
- **Personality adjectives:** studied, patient, elegant, slightly antique,
  curious.
- **Voice & microcopy:** third person, descriptive, unhurried. Captions in the
  present tense with a scientific-register aside ("Common in gardens; forages at
  dusk."). Latinate binomials in italic where they are real — never invented.
  Labels are nouns, not instructions: "Habitat", not "Write the habitat here".
- **What makes it distinctive:** the only shipped theme with a centered
  compositional axis and a caption system, and the only one that treats the
  drawn mark as the page's subject rather than as chrome. Where Newspaper is
  restrained and modern, Field guide is restrained and old.

## 2. Typography

| Token | Value | Fallback |
|---|---|---|
| `--font-display` | Cormorant Garamond | Georgia, serif |
| `--font-body` | EB Garamond | Georgia, serif |
| `--font-label` | Cormorant Garamond | Georgia, serif |

`font_import`:
`https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap`

- Weights used: Cormorant Garamond 500/600/700 (+ italic) for display and
  labels; EB Garamond 400/500 (+ italic) for body. **Never Cormorant 300 or
  400 above 24px** — the face is drawn light and large display sizes need 600 or
  the strokes go spidery on paper.
- One family serves display and label on purpose: a plate is set from a single
  case. The label role separates by case and tracking, not by family.
- Scale changes:

| Token | Value | Why |
|---|---|---|
| `--text-2xs` | 9.5px | Garamond's small sizes need a touch more than a sans does |
| `--text-body` | 14.5px | EB Garamond's x-height is small; 13.5px reads as 12 |
| `--text-2xl` | 42px | plate titles carry the page and Cormorant is narrow |

| Token | Value | Why |
|---|---|---|
| `--leading-body` | 1.5 | book leading, not newsprint leading — this is the one place Field guide is looser than Newspaper |
| `--tracking-display` | 0.01em | Cormorant sets tight; a hair of tracking opens the title |
| `--tracking-label` | 0.16em | specimen labels are letterspaced small caps |

- OpenType: use oldstyle figures (`font-variant-numeric: oldstyle-nums`) in
  running prose and captions — both faces have them, and lining figures in a
  Garamond paragraph read as a modern intrusion. **Tabular lining figures stay**
  in any column of numbers that has to align; the two rules do not conflict
  because they apply to different roles.

## 3. Color

- **Neutral ramp:** unchanged. The default ramp is already hue 78 warm
  parchment, which is exactly this theme's ground — overriding it would only
  move it away.
- **Accents** (text and borders only):

| Token | Value | Use |
|---|---|---|
| `--color-moss` | `oklch(45% 0.075 140)` | the primary accent — plate rules, specimen numbers, botanical marks |
| `--color-rust` | `oklch(48% 0.120 45)` | annotations, the "noted in the field" mark, seasonal or warning content |
| `--color-indigo` | `oklch(44% 0.090 250)` | water, sky, and cool-subject marks; the secondary when a page needs two |

- `--color-accent` binds to `--color-moss`.
- **Rationing rule:** one accent per plate. A page that is about a plant is
  moss throughout; a page about a river is indigo throughout; rust is the
  annotation color on either and never the dominant one. Rules and marks may
  take the accent; body text stays in the neutral ramp even though the contrast
  would allow otherwise, because a page of colored prose stops reading as a
  book.
- **Semantic role mapping:** specimen number `--color-moss` in the label face;
  caption `--color-mid` in italic; plate rule `--color-moss` at
  `--border-hair`; annotation or aside `--color-rust`; empty write-in rule
  `--color-rule-light`; table header `--color-mid` small caps over a hairline
  (overriding the baseline's reversed `th` band, which is far too heavy for a
  plate).

## 4. Spacing & Density

The one theme that moves the page box. Plates are margin-rich:

| Token | Default | Value |
|---|---|---|
| `--page-margin-top` | 64px | `88px` |
| `--page-margin-x` | 72px | `96px` |
| `--page-margin-bottom` | 72px | `88px` |

That costs roughly 48px of content width, which is the point — a narrower
measure is what makes a Garamond page read as a book rather than a report. The
`--space-*` scale is unchanged. Content is set to a measure of about 68
characters and never justified.

## 5. Surface & Motifs

| Token | Value |
|---|---|
| `--page-border` | `1px solid var(--color-rule-light)` |
| `--page-frame-inset` | `18px` |
| `--border-hair` | `0.75px` |

- **Page chrome:** a single hairline frame sitting inset from the margin — the
  plate edge. It is deliberately near-invisible at a glance and unmistakable up
  close, which is the whole register of the theme. Not `none`: without the frame
  the page reads as a Newspaper variant.
- **Signature motifs:** a **specimen number** — a small-caps roman numeral or
  figure in `--color-moss` set flush left of each item's name; a **caption
  bracket**, a hairline rule 40px wide above an italic caption; a **plate
  header**, the title centered on the page axis with a hairline rule above and
  below at the same 40px width; and **annotation rules**, hairline write-in
  lines at 32px pitch for a page that expects handwriting. Uses `.kicker` for
  the plate's classification line. `.halftone`, `.badge` and `.tilt` are not
  used — nothing in an engraved plate is stamped or crooked.
- **Marks and imagery:** `--image-filter` unchanged (`grayscale(100%)`), which
  suits the theme exactly — an engraving is monochrome. The icon system is
  **stroked natural-history line art**: inline SVG, `fill="none"`, stroke
  `var(--color-moss)` or `var(--color-ink)` at 2 units on a 100-unit viewBox,
  printed 1–2in. This is the theme most likely to want a drawn subject, so the
  "Getting a mark that reads" discipline in `README.md` is not optional here:
  name the two or three diagnostic features before drawing (an oak leaf is its
  lobed margin; a wren is a cocked tail and a fine bill), work from a reference
  for proportion, and judge the candidate at printed size. One good mark per
  plate beats four approximate ones.

## 6. Components & Patterns

- **Plate header** — hairline rule, classification kicker in tracked small
  caps, centered title at `--text-2xl` in Cormorant 600, hairline rule,
  optional italic subtitle in `--color-mid`.
- **Specimen entry** — number in `--color-moss`, name in the display face at
  `--text-lg`, italic binomial or subtitle, then two to four lines of
  descriptive body. Entries are separated by whitespace, not by rules.
- **Annotated figure** — the drawn mark with hairline leader rules running to
  small-caps labels set at the plate's outer margin. The one place this theme
  spends horizontal space.
- **Field notes block** — annotation rules at 32px pitch under a small-caps
  heading, for anything the reader is meant to write.
- **Index / key strip** — a two-column list in the body face at `--text-xs`,
  oldstyle figures, hairline column rule between.
- **Overflow deviation:** an overflowing plate drops specimens rather than
  tightening the margins or the leading. The margin is the theme.

## 7. Contrast evidence

Measured against white paper, sRGB-clamped:

- `--color-moss` `oklch(45% 0.075 140)` — **7.21:1**. Clears AA for body text
  at any size; used at `--text-2xs` for specimen numbers without concern.
- `--color-rust` `oklch(48% 0.120 45)` — **6.87:1**. Safe at any size.
- `--color-indigo` `oklch(44% 0.090 250)` — **7.74:1**. Safe at any size.

All three sit inside the sRGB gamut. All three are comfortably above the floor,
which is why the rationing rule above is a design constraint rather than an
accessibility one.

Body type floor: **14.5px** (`--text-body` above), raised from the default
because EB Garamond's small x-height makes 13.5px read a size smaller than the
default serif does at the same nominal value.
