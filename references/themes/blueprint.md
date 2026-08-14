# Theme: Blueprint

**Trigger phrases:** "blueprint", "technical drawing", "architectural",
"schematic".

## 1. Meta & Philosophy

- **Principles specific to this theme:**
  1. Precision reads as care — every line is deliberate, nothing is
     decorative.
  2. The grid is visible, not hidden — this theme shows its structure
     rather than disguising it.
  3. Restraint here means less than Newspaper: one accent hue, no
     tilt, no motif — the discipline of a technical drawing.
- **Personality adjectives:** precise, technical, quiet, exacting, cool.
- **Voice & microcopy:** clipped, specification-style language where the
  content allows it (labels over sentences, e.g. "QTY" not "Quantity:").
  No exclamation points, no narrator voice — this theme has no persona,
  only precision.
- **What makes it distinctive:** the only shipped theme with a
  monospace body font and no tilt/rotation anywhere. It's built to serve
  the tracker/planner category of the catalog (budget trackers, habit
  trackers, checklists) — content that benefits from a precise,
  measured feel rather than an editorial or playful one.

## 2. Typography

| Role | Family | Fallback |
|---|---|---|
| `--font-display` | Rajdhani | sans-serif |
| `--font-body` | Share Tech Mono | monospace |
| `--font-label` | Rajdhani | sans-serif |

```css
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;600&display=swap');
```

- Weights: Rajdhani 400/600 only — never use a heavier weight than 600;
  this theme's precision reads through restraint, not boldness. Share
  Tech Mono is single-weight.
- Type scale: reuses Newspaper's `--text-*` scale; this theme does not
  need larger display sizes than Newspaper since it favors dense,
  measured layouts over oversized hero numbers.
- Line-height: tighter than Newspaper — 1.4–1.5 for monospace body copy,
  consistent with a technical/tabular reading pattern.
- Letter-spacing: labels use wide tracking (matching Newspaper's kicker
  convention) for a technical-label feel; body copy uses normal tracking.
- OpenType features: tabular figures throughout — this theme's content
  (trackers, checklists, budgets) is disproportionately numeric, so this
  matters more here than in any other theme.

## 3. Color

- **Neutral ramp:** inherits ink/mid/dim/rule from the shell's default
  Newspaper tokens, unchanged.
- **Accent:** `--color-blue`: `oklch(52% 0.160 250)` — "blueprint line
  blue," text/border only. This theme uses exactly one accent hue, not
  Comic's three — matching its restrained personality.
- **Rationing rule:** same no-fill rule as every theme; blueprint blue
  appears in rules, borders, and labels only.
- **Semantic role mapping:** section labels and grid rules in blueprint
  blue; body content in ink; no separate "star" or "winner" role — this
  theme's typical content (trackers, checklists) doesn't have a
  winner/loser hierarchy to encode.
- **Light/dark:** no dark variant — a light background reads as
  "drafting paper," which is central to the theme's identity.

## 4. Spacing & Layout

- Base unit: 4px (unchanged from Newspaper).
- Spacing scale: reuses `--space-*`, favoring the tighter end of the
  scale — this theme's tracker/checklist content benefits from a denser,
  more precise rhythm than Newspaper's generous editorial spacing.
- Page margin/safe area: unchanged, 0.5in.
- Section rhythm: tight and even — every section uses the same spacing
  interval, reinforcing the "drafted, not composed" feel (deliberately
  the opposite of Principle III's "nothing is neutral" editorial
  weighting — Blueprint's whole point is that everything gets equal,
  precise treatment).

## 5. Surface Treatment

- Border weights: reuses `--border-thin` (1.5px) as the primary rule
  weight throughout — this theme never uses `--border-fat`.
- **Page chrome:** `border: 1.5px solid var(--color-blue);` — thin,
  precise border, no shadow.
- **Signature motifs:** none. No tilt, no halftone, no badge stamps —
  the absence of motif is itself the signature; signature motifs are
  optional, not mandatory.

## 6. Iconography & Imagery

No icon system, consistent with the house minimal/no-fill stance. Where a technical-drawing feel
calls for a mark (a checkbox, a status indicator), use a simple hairline
square or a thin-ruled box — never a filled icon or emoji.

## 7. Motion

The printed artifact never animates. No theme-specific reduced-motion
note; the shell's toolbar is not reskinned per theme.

## 8. Components & Patterns

- **Signature blocks:** section labels rendered as technical-spec-style
  headers (uppercase Rajdhani, blueprint-blue, thin rule beneath); grids
  and tables use hairline rules throughout rather than Newspaper's
  heavier double-rule masthead treatment.
- **Default:** thin-bordered panels, tabular content, blueprint-blue
  labels.
- **Empty:** an empty tracker row or checklist item still renders its
  hairline border and label — never collapses, per Principle IV.
- **Overflow:** per the template default (reduce type-scale one step,
  then shorten or split the content) — for this theme's typically
  tabular content, prefer adding rows on the next page over shrinking
  type below the point where numbers stay legible.

## 9. Accessibility

- Contrast: blueprint blue `oklch(52% 0.160 250)` on white paper measures
  above the WCAG AA 3:1 large/bold-text floor for labels and rules;
  ink-on-paper body text is unaffected (unchanged from Newspaper, above
  4.5:1). No exception needed.
- Minimum body type size: 13.5px (adult default) — this theme's typical
  content (trackers, planners) is adult-oriented, not kids'-content
  sized.
- Screen-legibility: Share Tech Mono is a narrow monospace face; at
  13.5px it reads slightly tighter on-screen than Source Serif 4 does at
  the same size. No mitigation needed at this theme's target sizes, but
  avoid dropping body size below 13.5px for this theme specifically.
