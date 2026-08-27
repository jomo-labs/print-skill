#!/usr/bin/env node
// One-command assembly: the mechanical procedure in references/assembly.md,
// executed as code instead of as a chain of shell steps.
//
// Why this exists: driven from a model session, every shell command is a full
// API round-trip that re-sends the whole conversation. The assembly procedure
// (mkdir + sed + anchored insertions + a page of verification
// greps) is entirely mechanical — there is nothing to decide between its
// steps — so running it as one command collapses ~6 round-trips into one,
// and makes the "no leftover <!-- CONTENT -->" class of mistake structurally
// impossible instead of merely checked for.
//
// Usage:
//   node assemble-cli.mjs --content <content.html> --title "<Page Title>"
//        [--css <overrides.css>] [--font-import <googlefonts-url>]
//        [--paper a4|legal|half] [--orientation landscape]
//        [--answer-key <key.html>] [--out-dir <dir>] [--max-sheets N]
//
// Writes <out-dir>/<slugified-title>.html (out-dir defaults to <cwd>/out),
// runs the full structural verification from assembly.md, then ALWAYS runs
// the fit check (which may squeeze a near-miss into fitting — see
// fit-cli.mjs) and the contrast check on the written file, in that order
// (fit may rewrite the file; contrast validates the result).
//
// --max-sheets is the user's page budget, default 1 (2 when --answer-key is
// given — the key is the one sanctioned second sheet). Authoring more sheets
// than the budget is an error: a multi-sheet page must be an explicit,
// deliberate choice, passed here as data — never a side effect of writing
// too much.
//
// Exit: 0 assembled and every check passed · 1 something failed · 2 bad usage
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { slugify, takeValue } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(HERE, "..");

const argv = process.argv.slice(2);
const flags = {};
for (const name of ["content", "title", "css", "font-import", "paper",
                    "orientation", "answer-key", "out-dir", "max-sheets"]) {
  flags[name] = takeValue(argv, `--${name}`, undefined);
}
// Anything left over is a bare positional or a flag this CLI doesn't know —
// either way a mistake worth stopping on (a typo'd --max-sheets silently
// ignored would assemble against the wrong page budget).
if (argv.length || !flags.content || !flags.title) {
  if (argv.length) console.error(`assemble-cli: unrecognized argument(s): ${argv.join(" ")}`);
  console.error(
    'usage: node assemble-cli.mjs --content <content.html> --title "<title>"\n' +
    "         [--css <overrides.css>] [--font-import <url>] [--paper a4|legal|half]\n" +
    "         [--orientation landscape] [--answer-key <key.html>] [--out-dir <dir>]\n" +
    "         [--max-sheets N]");
  process.exit(2);
}

const readOrDie = async (p, what) => {
  try {
    return await fs.readFile(path.resolve(p), "utf-8");
  } catch {
    console.error(`assemble-cli: cannot read ${what}: ${p}`);
    process.exit(2);
  }
};

const content = await readOrDie(flags.content, "--content");
const customCss = flags.css ? await readOrDie(flags.css, "--css") : "";
const answerKey = flags["answer-key"] ? await readOrDie(flags["answer-key"], "--answer-key") : "";
const paper = ["a4", "legal", "half"].includes(flags.paper) ? flags.paper : "";
const landscape = flags.orientation === "landscape";

const template = await fs.readFile(path.join(SKILL_DIR, "assets", "page_template.html"), "utf-8");
const documentCss = await fs.readFile(path.join(SKILL_DIR, "assets", "shell", "document.css"), "utf-8");

const warnings = [];

// ── Step 1: out dir, page copy with document.css inlined ───────────────────
const outDir = path.resolve(flags["out-dir"] || path.join(process.cwd(), "out"));
await fs.mkdir(outDir, { recursive: true });

let html = template.replace(/^.*@@DOCUMENT_CSS@@.*$/m, documentCss);

const OVERRIDES_TAG = '<style id="content-overrides"></style>';

// ── Step 2: multi-sheet handling ───────────────────────────────────────────
// Two roads to a nested (multi-sheet) document, both landing on the same CSS:
//  - an answer key: the content and the key each become one sheet;
//  - content that already carries explicit top-level `.page` sheets — the
//    author laid out N sheets deliberately (and passes --max-sheets N).
const preWrapped = /<div class="page">/.test(content);
if (preWrapped && answerKey.trim()) {
  console.error("assemble-cli: --answer-key cannot be combined with content that " +
    "already carries its own .page sheets — put the key in the content, or unwrap it.");
  process.exit(2);
}
let pageContent = content;
if (answerKey.trim() || preWrapped) {
  const footerMatch = template.match(/<footer>.*?<\/footer>/s);
  const footer = footerMatch ? footerMatch[0] : "<footer><span></span><span></span></footer>";
  if (answerKey.trim()) {
    pageContent =
      `<div class="page">\n${content}\n${footer}\n</div>\n` +
      `<div class="page">\n${answerKey}\n${footer}\n</div>`;
  }
  const nested = `<style id="mp-nested-sheets">
/* Two-sheet document: nested .page sheets inside the #page container. */
#page { padding: 0 !important; border: none !important; box-shadow: none !important; background: transparent !important; }
#page > footer { display: none; }
#page > .page {
  width: 100%;
  /* Sheet height fallback only — the shell's applySize() sets the exact
     fixed height for the selected paper as an inline style on every nested
     sheet, in both screen and print (WYSIWYG: each nested sheet IS one full
     printed page; the dimension is immutable, content must fit it). */
  height: 1056px;
  margin: 0 0 var(--space-10);
  /* Same margins and chrome as a single sheet, so an answer key prints with
     the frame its theme gave sheet one. */
  padding: var(--page-margin-top) var(--page-margin-x) var(--page-margin-bottom);
  background: var(--color-paper) !important;
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
</style>`;
  html = html.replace(OVERRIDES_TAG, `${nested}\n${OVERRIDES_TAG}`);
}

// ── Step 3: font link (validated; unsafe URLs are dropped, not fixed) ──────
if (flags["font-import"]) {
  const url = flags["font-import"];
  if (/^https:\/\/fonts\.googleapis\.com\/[A-Za-z0-9/?&=+:;,@._%-]*$/.test(url)) {
    html = html.replace(OVERRIDES_TAG, `<link rel="stylesheet" href="${url}">\n${OVERRIDES_TAG}`);
  } else {
    warnings.push(`font-import dropped (not a plain fonts.googleapis.com URL): ${url}`);
  }
}

// ── Step 4: custom css ─────────────────────────────────────────────────────
if (customCss.trim()) {
  html = html.replace(OVERRIDES_TAG, `<style id="content-overrides">\n${customCss}\n</style>`);
}

// ── Step 5: body attributes + @page size ───────────────────────────────────
if (paper || landscape) {
  const attrs =
    (paper ? ` data-mp-paper="${paper}"` : "") +
    (landscape ? ` data-mp-orientation="landscape"` : "");
  html = html.replace("<body>", `<body${attrs}>`);
  const size = {
    "": landscape ? "letter landscape" : "letter",
    a4: landscape ? "A4 landscape" : "A4",
    legal: landscape ? "legal landscape" : "legal",
    half: landscape ? "8.5in 5.5in" : "5.5in 8.5in",
  }[paper];
  html = html.replace(/@page \{ size: [^;]*; margin: 0; \}/, `@page { size: ${size}; margin: 0; }`);
}

// ── Step 6: content ────────────────────────────────────────────────────────
html = html.replace("<!-- CONTENT -->", pageContent);

const outFile = path.join(outDir, `${slugify(flags.title)}.html`);
await fs.writeFile(outFile, html);

// ── Verification (the grep list at the end of assembly.md, as code) ────────
const count = (re) => (html.match(re) || []).length;
const idx = (s) => html.indexOf(s);
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

check(!html.includes("<!-- CONTENT -->"), "leftover <!-- CONTENT --> marker");
check(count(/<style id="content-overrides">/g) === 1, "expected exactly one content-overrides style");
check(!html.includes("@@DOCUMENT_CSS@@"), "leftover @@DOCUMENT_CSS@@ marker");
check(html.includes("--color-ink"), "document stylesheet not inlined (--color-ink missing)");
check(count(/id="mp-document-css"/g) === 1, "expected exactly one mp-document-css block");
check(idx('id="mp-document-css"') < idx('id="content-overrides"'),
  "mp-document-css must precede content-overrides");
check(!html.includes("shell/"), "generated page must not reference shell/ files");
check(!html.includes("<script"), "generated page must carry no scripts");
check(!html.includes('id="mp-toolbar"'), "generated page must carry no chrome markup");
check(!html.includes("data-mp-live-edit"), "data-mp-live-edit no longer exists");
if (flags["font-import"] && !warnings.length) {
  check(count(/<link rel="stylesheet"/g) === 1, "expected exactly one inserted font link");
  check(idx('<link rel="stylesheet"') < idx('id="content-overrides"'),
    "font link must precede content-overrides");
}
const nestedSheets = count(/<div class="page">/g);
if (answerKey.trim() || preWrapped) {
  check(idx('id="mp-nested-sheets"') !== -1 && idx('id="mp-nested-sheets"') < idx('id="content-overrides"'),
    "mp-nested-sheets must precede content-overrides");
  check(nestedSheets >= 2, "a nested document needs at least two .page sheets");
  if (answerKey.trim()) check(nestedSheets === 2, "expected exactly two nested .page sheets");
  check(count(/<footer><span><\/span><span><\/span><\/footer>/g) >= nestedSheets + 1,
    "each nested sheet must end in the shell footer");
}

// ── The page budget ────────────────────────────────────────────────────────
// One sheet unless the caller says otherwise; the answer key is the one
// sanctioned second sheet. This is where "max pages" stops being a hope in
// the prompt and becomes an enforced input.
const maxSheets = flags["max-sheets"] !== undefined
  ? parseInt(flags["max-sheets"], 10)
  : (answerKey.trim() ? 2 : 1);
if (!Number.isInteger(maxSheets) || maxSheets < 1) {
  console.error(`assemble-cli: --max-sheets must be a positive integer, got: ${flags["max-sheets"]}`);
  process.exit(2);
}
const authoredSheets = nestedSheets || 1;
check(authoredSheets <= maxSheets,
  `authored ${authoredSheets} sheets but the page budget is ${maxSheets} ` +
  `(--max-sheets) — cut content to the budget, or raise it deliberately`);
const bodyTag = (html.match(/<body[^>]*>/) || [""])[0];
if (paper) check(bodyTag.includes(`data-mp-paper="${paper}"`), "body must carry data-mp-paper");
if (landscape) check(bodyTag.includes('data-mp-orientation="landscape"'), "body must carry data-mp-orientation");
if (!landscape) check(!bodyTag.includes("data-mp-orientation"), "portrait pages carry no orientation attribute");

// ── Fit then contrast, always, in that order ───────────────────────────────
// Sequential on purpose: the fit check may rewrite the file (a near-miss gets
// squeezed — see fit-cli.mjs), and the contrast check must measure the sizes
// that will actually print.
console.log(`assembled: ${outFile}`);
for (const w of warnings) console.error(`warning: ${w}`);
if (failures.length) {
  console.error("structural verification FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("structural verification: ok");

const runCheck = (cli) => new Promise((resolve) => {
  execFile(process.execPath, [path.join(HERE, cli), outFile],
    { maxBuffer: 4 * 1024 * 1024 },
    (err, stdout, stderr) => {
      if (stdout.trim()) process.stdout.write(stdout);
      if (stderr.trim()) process.stderr.write(stderr);
      resolve(!err);
    });
});
const fitOk = await runCheck("fit-cli.mjs");
const contrastOk = await runCheck("contrast-cli.mjs");
process.exit(fitOk && contrastOk ? 0 : 1);
