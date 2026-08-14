# Theme: Newspaper (default)

The default theme, and the theme every other theme is judged
against. If a user names no style, generate in this theme.

## 1. Meta & Philosophy

- **Principles specific to this theme:**
  1. A page is a publication, not a document — masthead, kicker, byline
     conventions apply even to a chore chart.
  2. Restraint is the aesthetic. The look comes from proportion and rule
     weight, not decoration.
  3. Every element earns its place in the hierarchy before it earns a
     visual treatment.
- **Personality adjectives:** editorial, restrained, considered, timeless,
  quietly confident.
- **Voice & microcopy:** third-person, declarative sentences. Section
  kickers in small caps ("TODAY'S AGENDA", not "Your Agenda!"). No
  exclamation points, no emoji. Bylines and datelines where the content
  calls for them (e.g. "Tuesday, June 17" under a masthead).
- **What makes it distinctive:** it's the only shipped theme with zero
  chrome flourish — no border on `.page` chrome beyond the soft drop
  shadow, no signature motif required. Distinctiveness comes entirely
  from typography (Playfair Display display type + Source Serif 4 body)
  and rule-based hierarchy (double rules, kicker labels), not from a
  visual gimmick. This restraint is the brand differentiator.

## 2. Typography

| Role | Family | Fallback |
|---|---|---|
| `--font-display` | Playfair Display | Georgia, serif |
| `--font-body` | Source Serif 4 | Georgia, serif |
| `--font-label` | Inter | system-ui, sans-serif |

- Weights used: Playfair Display 400/700/900 (+ italic); Source Serif 4
  400/600 (+ italic); Inter 300/400/500/600. No weight below 300 anywhere.
- Type scale (px): `--text-body` 13.5, `--text-md` 15.5, `--text-lg` 19,
  `--text-xl` 26, `--text-2xl` 38. Extended scale (for themes/components
  that need finer steps): `--text-2xs` 8.5 … `--text-4xl` 80 — the shell
  predefines only the base five; define extra steps in a `:root` override.
- Line-height: 1.65 for body copy; tighter (1.1–1.2) for display type.
- Letter-spacing: kickers and labels use wide tracking (0.32em–0.38em,
  uppercase); body copy uses normal tracking.
- OpenType features: tabular figures in all tables and score displays
  (Principle V in `principles.md`, "Type is set, not placed").

## 3. Color

- **Neutral ramp:** ink `oklch(11% 0.005 78)`, mid `oklch(44% 0.008 78)`,
  dim `oklch(67% 0.006 78)`, ghost `oklch(87% 0.005 78)`, rule
  `oklch(11% 0.005 78)`, rule-light `oklch(83% 0.005 78)`, pull-bg
  `oklch(94% 0.009 78)` — all derived from hue 78 / warm parchment
  chroma — see the token block in `assets/page_shell.html`.
- **Accent:** `oklch(52% 0.150 78)` (warm amber), subtle tint
  `oklch(93% 0.060 78)`.
- **Rationing rule:** accent appears in kickers, pull-rules, star
  performers, and score highlights only — never as a background, per the
  no-fill invariant.
- **Semantic role mapping:** winner/star values in ink at full weight;
  loser/secondary values in dim; zero/placeholder values in ghost; table
  header rows use ink-on-paper (not a color fill).
- **Light/dark:** Newspaper ships light-on-white only. A dark treatment
  is a generation-time request (custom `:root` tokens via custom_css) —
  and `--color-paper` must stay white either way.

## 4. Spacing & Layout

- Base unit: 4px.
- Spacing scale: 4px increments, from 4px up to ~96px. The shell doesn't
  predefine `--space-*` tokens — define any you use in a `:root` override.
- Page margin/safe area: content stays within 0.5in of the physical edge.
- Section rhythm: generous — sections are separated by a full rule plus
  `--space-6`–`--space-10` of vertical space, never crowded.

## 5. Surface Treatment

- Border weights: `--border-fat` 5px (page border, section rules),
  `--border-mid` 3px (accent stripes, blockquotes), `--border-thin` 1.5px
  (table rules, utility outlines).
- Page chrome: soft drop shadow (`0 6px 48px oklch(0% 0 0 / 0.16)` in the
  runtime shell), no border on `.page` itself.
- Signature motifs: `.tilt`/`.tilt-right` (−0.6°/+1.5° rotation) for
  callouts and narrator-style asides; `.badge` for chapter/section stamps;
  `.halftone` for subtle texture where a comic-adjacent feature calls for
  it. None of these are load-bearing for Newspaper's identity — Newspaper
  reads as itself even with zero motifs applied.

## 6. Iconography & Imagery

No icon system. Where a generated page needs a small mark (a checkbox, a
divider), use a styled `<span>` or a hairline rule, never an icon font or
SVG glyph — consistent with the no-fill, ink-only aesthetic.

## 7. Motion

The printed artifact never animates (see the Theme Spec Template's Motion
section). No theme-specific reduced-motion consideration.

## 8. Components & Patterns

- Signature blocks: masthead with double-rule separator (3px solid, 2px
  gap, 1px solid), kicker labels (9px uppercase, 0.32–0.38em tracking),
  pull-quotes in `--color-pull-bg` tint (never a hard fill).
- **Default:** as described above — kicker, masthead, rule-separated
  sections.
- **Empty:** an empty section still renders its label and a ruled
  boundary — never collapses to nothing (Principle IV, "the blank slot
  must hold its weight").
- **Overflow:** per the template default — reduce body type-scale one
  step, then shorten or split the content; never spill past the safe area.

## 9. Accessibility

- Contrast: ink `oklch(11% 0.005 78)` on paper (white) measures well
  above WCAG AA's 4.5:1 body-text floor; accent `oklch(52% 0.150 78)` on
  paper measures above the 3:1 large/bold-text floor. Both meet the
  template's stated targets with no exception needed.
- Minimum body type size: 13.5px for adult content (this theme's
  default); 16px+ when generating for kids' content, per the print
  skill's audience-adaptation guidance.
- Screen-legibility: no concerns — Source Serif 4 and Inter are both
  designed for screen and print use at these sizes.
