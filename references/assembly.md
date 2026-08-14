# Assembly

The mechanical procedure that turns your authored channels into the final HTML
file. Read this when you're ready to assemble (after the self-check in
`design-rules.md` passes). Every step is anchor-exact — follow it literally.

The shell (`assets/page_shell.html`) is the single source of truth for design
tokens, the toolbar, paper-size switching, edit mode, and print-fit logic. You
never author it and never retype it — a retyped shell gets silently truncated.
**Copy the file, then make targeted insertions at the anchors below.**

## Inputs (the authored channels)

| Channel | Required | What it is |
|---|---|---|
| `content_html` | yes | The page content. Inserted inside `<div class="page">` — no wrapper, no footer, no `<html>`/`<head>`/`<body>` tags of your own. |
| `title` | yes | The page title (used for the filename and your report). |
| `custom_css` | no | Style overrides; lands in `<style id="content-overrides">`. Must have passed the self-check. |
| `font_import` | no | A Google Fonts URL; becomes a `<link>`. Must have passed self-check item 8. |
| `paper` | no | One of `a4`, `legal`, `half`, `landscape`. Empty/anything else = letter portrait. |
| `answer_key_html` | no | Answer-key content for worksheets only — makes this a two-sheet document (step 2). Never author the key as a second page inside `content_html`. |

## Procedure

### 1. Copy the shell

```bash
cp <skill-dir>/assets/page_shell.html <output>.html
```

Output filename: the title, lowercased, every run of non-alphanumeric characters
replaced with a single hyphen, leading/trailing hyphens trimmed, plus `.html`
(e.g. "Weekly Meal Planner" → `weekly-meal-planner.html`). Write to the current
working directory unless the user asked for a location.

All insertions below are edits to this copy. Insertion order matters: steps 2 → 3
→ 4 all anchor on the literal `<style id="content-overrides"></style>` tag, and
each inserts *before* it (step 4 replaces it), so the custom CSS always ends up
last and wins the cascade.

### 2. Two-sheet documents only (answer_key_html is non-empty)

Skip this step entirely for single-sheet pages.

**2a.** Wrap the content and the key each in its own `.page` div, each carrying
its own copy of the shell's footer, and use the result as the `content_html` for
step 5:

```html
<div class="page">
{content_html}
<footer><span></span><span></span></footer>
</div>
<div class="page">
{answer_key_html}
<footer><span></span><span></span></footer>
</div>
```

(The footer must be an exact copy of the `<footer>...</footer>` element already
inside the shell's `#page` div — copy it from the shell, don't retype it, so the
stamped copies can't drift. The container's own footer stays where it is; the CSS
below hides it on screen and the shell's print rules hide it in print.)

**2b.** Insert this block — verbatim, in full — immediately **before**
`<style id="content-overrides"></style>`:

```html
<style id="mp-nested-sheets">
/* Two-sheet document: nested .page sheets inside the #page container. */
#page { padding: 0 !important; box-shadow: none !important; background: transparent !important; }
#page > footer { display: none; }
#page > .page {
  width: 100%;
  /* Screen-only sheet height. The shell never sets --mp-page-h, so nested
     sheets always use the 1056px letter fallback — on screen a non-letter
     paper choice keeps letter-height sheets. Print is unaffected (min-height
     reset below; pagination is the shell's break rules). */
  min-height: var(--mp-page-h, 1056px);
  margin: 0 0 40px;
  padding: 52px 60px 48px;
  background: var(--color-paper) !important;
  box-shadow: 0 6px 48px oklch(0% 0 0 / 0.16);
  display: flex;
  flex-direction: column;
}
#page > .page:last-child { margin-bottom: 0; }
#page > .page > footer { margin-top: auto; }
@media print {
  #page > .page { min-height: 0 !important; margin: 0 !important; }
}
</style>
```

The shell's print CSS and `computePrintFit()` already handle the nested-sheet
lane (`#page > .page`) — you add nothing else.

### 3. Font link (font_import is set)

Insert immediately **before** `<style id="content-overrides"></style>`:

```html
<link rel="stylesheet" href="{font_import}">
```

Only after re-confirming self-check item 8 (`https://fonts.googleapis.com/`
prefix, restricted charset) — this is the moment the URL enters an HTML
attribute, so it's worth the double check. An unsafe URL gets dropped, not fixed.

### 4. Custom CSS (custom_css is set)

Replace `<style id="content-overrides"></style>` with:

```html
<style id="content-overrides">
{custom_css}
</style>
```

If `custom_css` is empty, leave the tag untouched.

### 5. Paper size (paper is a4, legal, half, or landscape)

Insert immediately **before** `</body>`:

```html
<script>applySize('{paper}');</script>
```

Allowlisted values only — `a4`, `legal`, `half`, `landscape`. Anything else
means: insert nothing; the page stays letter portrait. (This string lands inside
a `<script>`, which is why the allowlist is strict.)

### 6. Content

Replace the **first** occurrence of `<!-- CONTENT -->` with `content_html` (the
two-sheet wrapped version from step 2a when applicable). In the single-sheet
case the shell's own footer already sits right after the marker inside `#page` —
do not add another.

## Verification (grep the written file)

- No `<!-- CONTENT -->` remains.
- Exactly one `<style id="content-overrides">`.
- `function computePrintFit` and `const PAPERS` are present (the shell wasn't
  truncated — the output should be *larger* than the shell asset, never smaller).
- If `font_import` was set: exactly one `<link rel="stylesheet"` whose href starts
  with `https://fonts.googleapis.com/`, placed before the content-overrides tag.
- If two-sheet: `id="mp-nested-sheets"` appears **before**
  `id="content-overrides"`, and `#page` contains exactly two child `.page` divs,
  each ending in a `<footer>`.
- If non-letter paper: `applySize('...')` appears before `</body>`.

If any check fails, fix the copy — don't start over from a blank file.
