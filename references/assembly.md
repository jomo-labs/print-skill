# Assembly

The mechanical procedure that turns your authored channels into the final HTML
file. Read this when you're ready to assemble (after the self-check in
`design-rules.md` passes). Every step is anchor-exact — follow it literally.

The document template (`assets/page_template.html`) is the page skeleton —
a pure document with no chrome markup. The shell it links relatively
(`assets/shell/shell.css`, `assets/shell/shell.js`, `assets/shell/chat.js`)
is the single source of truth for design tokens, the toolbar, paper-size
switching, edit mode, the chat panel, and WYSIWYG print geometry — all
injected at runtime, never baked into the page. You never author or retype
any of these files — **copy them, then make targeted insertions at the
anchors below.**

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

### 1. Output directory, gitignore, copy the shell

Generated pages are build artifacts, not sources — they live under a
gitignored `build/` directory, in a subdirectory scoped to the project, and
users reach them through the local server URL, never the file path:

```
<outdir> = <cwd>/build/<project-slug>/
```

`<project-slug>` is the working directory's basename run through the same
slug rule as filenames (lowercase, non-alphanumerics → single hyphen,
trimmed). If the user asked for an explicit output location, that wins —
skip the build/ convention entirely.

```bash
mkdir -p <outdir>/shell
cp <skill-dir>/assets/page_template.html <outdir>/<output>.html
cp -f <skill-dir>/assets/shell/* <outdir>/shell/
```

**Gitignore** (once per project): if `<cwd>` is inside a git repository and
`git check-ignore -q build` fails, append a `build/` line to `<cwd>/.gitignore`
(creating the file if needed).

Output filename: the title, lowercased, every run of non-alphanumeric characters
replaced with a single hyphen, leading/trailing hyphens trimmed, plus `.html`
(e.g. "Weekly Meal Planner" → `weekly-meal-planner.html`).

The generated page is a **pure document**: it links only `shell/document.css`
(tokens, page geometry, print rules) by relative path and contains no chrome
markup and no scripts. Opened directly as a file it is a plain printable HTML
page; the local server wraps it at serve time by injecting `chrome.css` +
`shell.js` + `chat.js` (toolbar, edit mode, chat panel) — always the skill's
current chrome, so shell updates apply automatically to already-generated
pages. The `shell/` directory must still sit next to the pages (for the
stylesheet, and for older pages that link scripts directly) — **refresh it on
every assembly** (the `cp -f`, never "skip if present"): shell files are
runtime assets nobody edits in place, so overwriting is always safe, while a
stale copy from an older skill version breaks `file:`-opened pages.

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

### 5. Body configuration attributes (paper and/or live_edit set)

The document carries per-page configuration as **data attributes on `<body>`**
— never as script calls (the runtime chrome reads them at load). Replace the
literal `<body>` tag with `<body …>` carrying only the attributes that apply:

- `data-mp-paper="{paper}"` when `paper` is one of the allowlisted values —
  `a4`, `legal`, `half`, `landscape`. Anything else (including letter): omit
  the attribute; the page opens letter portrait. (The value lands inside an
  HTML attribute, which is why the allowlist is strict.)
  When set, ALSO replace the static line inside `<style id="dynamic-page-css">`
  with the matching size — `a4` → `A4`, `legal` → `legal`, `half` →
  `5.5in 8.5in`, `landscape` → `letter landscape` — e.g.
  `@page { size: A4; margin: 0; }`. A page opened directly (script-less) then
  prints its configured paper exactly; `document.css` sizes the on-screen
  sheet from the body attribute.
- `data-mp-live-edit="1"` — this exact literal — when `live_edit` is `yes`.
  Absence is the flag's false state: the Chat panel then runs in manual
  copy/paste mode.

Both set → `<body data-mp-paper="a4" data-mp-live-edit="1">`. Neither set →
leave `<body>` untouched.

### 6. Content

Replace the **first** occurrence of `<!-- CONTENT -->` with `content_html` (the
two-sheet wrapped version from step 2a when applicable). In the single-sheet
case the shell's own footer already sits right after the marker inside `#page` —
do not add another.

## Verification (grep the written file)

- No `<!-- CONTENT -->` remains.
- Exactly one `<style id="content-overrides">`.
- Pure document: exactly one `href="shell/document.css"` link; **no**
  `<script` tags, no `shell/shell.js` reference, and `id="mp-toolbar"` appears
  nowhere (the server injects all chrome at serve time).
- Shell assets current: `<outdir>/shell/document.css` exists and contains
  `--color-ink`; `<outdir>/shell/shell.js` contains `injectChrome`;
  `<outdir>/shell/chat.js` contains `mpChatOnEditMode` (not stale or
  truncated).
- If `font_import` was set: exactly one `<link rel="stylesheet"` whose href starts
  with `https://fonts.googleapis.com/`, placed before the content-overrides tag.
- If two-sheet: `id="mp-nested-sheets"` appears **before**
  `id="content-overrides"`, and `#page` contains exactly two child `.page` divs,
  each ending in a `<footer>`.
- If non-letter paper: the `<body` tag carries `data-mp-paper="<paper>"`.
- If `live_edit` was `yes`: the `<body` tag carries `data-mp-live-edit="1"`;
  otherwise the attribute appears nowhere.

If any check fails, fix the copy — don't start over from a blank file.
