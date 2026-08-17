# Assembly

The mechanical procedure that turns your authored channels into the final HTML
file. Read this when you're ready to assemble (after the self-check in
`design-rules.md` passes). Every step is anchor-exact — follow it literally.

The shell is the single source of truth for design tokens, the toolbar,
paper-size switching, edit mode, the chat panel, and WYSIWYG print geometry.
It is four files: the thin page skeleton (`assets/page_shell.html`) and the
shared assets it links relatively (`assets/shell/shell.css`,
`assets/shell/shell.js`, `assets/shell/chat.js`). You never
author or retype any of them — **copy the files, then make targeted insertions
at the anchors below.**

## Inputs (the authored channels)

| Channel | Required | What it is |
|---|---|---|
| `content_html` | yes | The page content. Inserted inside `<div class="page">` — no wrapper, no footer, no `<html>`/`<head>`/`<body>` tags of your own. |
| `title` | yes | The page title (used for the filename and your report). |
| `custom_css` | no | Style overrides; lands in `<style id="content-overrides">`. Must have passed the self-check. |
| `font_import` | no | A Google Fonts URL; becomes a `<link>`. Must have passed self-check item 8. |
| `paper` | no | One of `a4`, `legal`, `half`, `landscape`. Empty/anything else = letter portrait. |
| `live_edit` | no | `yes` only when your harness passed the checks in `references/harness-support.md` (reachability gate + capability ladder). Anything else = the page's Chat panel runs in manual copy/paste mode. |
| `answer_key_html` | no | Answer-key content for worksheets only — makes this a two-sheet document (step 2). Never author the key as a second page inside `content_html`. |

## Procedure

### 1. Copy the shell

```bash
cp <skill-dir>/assets/page_shell.html <outdir>/<output>.html
cp -r <skill-dir>/assets/shell <outdir>/shell   # once per output directory
```

Output filename: the title, lowercased, every run of non-alphanumeric characters
replaced with a single hyphen, leading/trailing hyphens trimmed, plus `.html`
(e.g. "Weekly Meal Planner" → `weekly-meal-planner.html`). Write to the current
working directory unless the user asked for a location.

The page links `shell/shell.css` and `shell/shell.js` by relative path, so the
`shell/` directory must sit next to the generated pages — copy it if it isn't
already there (skip if present; don't duplicate per page). The relative links
mean the page works both served by the local server and opened directly as a
file.

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
  /* Sheet height fallback only — the shell's applySize() sets the exact
     min-height for the selected paper as an inline style on every nested
     sheet, in both screen and print (WYSIWYG: each nested sheet IS one full
     printed page). */
  min-height: 1056px;
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
  /* Only the on-screen gap between sheets goes away — each sheet keeps its
     full paper-size geometry so print matches the screen exactly. */
  #page > .page { margin: 0 !important; }
}
</style>
```

The shell's print CSS and `applySize()` already handle the nested-sheet
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

### 5b. Live edit flag (live_edit is `yes`)

Insert immediately **before** `</body>` (after the `applySize` line when both
are present):

```html
<script>setLiveEditSupported(true);</script>
```

This exact literal, in full — nothing is interpolated. When `live_edit` is
anything but `yes`, insert nothing: absence is the flag's false state, and
the Chat panel then runs in manual copy/paste mode. (There is no
`setLiveEditSupported(false)` variant to inject.)

### 6. Content

Replace the **first** occurrence of `<!-- CONTENT -->` with `content_html` (the
two-sheet wrapped version from step 2a when applicable). In the single-sheet
case the shell's own footer already sits right after the marker inside `#page` —
do not add another.

## Verification (grep the written file)

- No `<!-- CONTENT -->` remains.
- Exactly one `<style id="content-overrides">`.
- The shell links are intact: one `href="shell/shell.css"`, one
  `src="shell/shell.js"`, and one `src="shell/chat.js"`;
  `<outdir>/shell/shell.js` exists and contains `function applySize`, and
  `<outdir>/shell/chat.js` exists and contains `dispatchIntent` (assets
  copied, not truncated).
- If `font_import` was set: exactly one `<link rel="stylesheet"` whose href starts
  with `https://fonts.googleapis.com/`, placed before the content-overrides tag.
- If two-sheet: `id="mp-nested-sheets"` appears **before**
  `id="content-overrides"`, and `#page` contains exactly two child `.page` divs,
  each ending in a `<footer>`.
- If non-letter paper: `applySize('...')` appears before `</body>`.
- If `live_edit` was `yes`: `setLiveEditSupported(true)` appears before
  `</body>`; otherwise it appears nowhere.

If any check fails, fix the copy — don't start over from a blank file.
