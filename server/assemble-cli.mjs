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
//        [--answer-key <key.html>] [--out-dir <dir>] [--check] [--json]
//
// Writes <out-dir>/<slugified-title>.html (out-dir defaults to <cwd>/out),
// runs the full structural verification from assembly.md, and with --check
// also runs the fit + contrast checks (check-cli.mjs) on the result.
// Exit: 0 assembled and every requested check passed · 1 something failed · 2 bad usage
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(HERE, "..");

function parseArgs(argv) {
  const out = { flags: {}, bools: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check" || a === "--json") out.bools.add(a.slice(2));
    else if (a.startsWith("--")) out.flags[a.slice(2)] = argv[++i];
    else return null;
  }
  return out;
}
const parsed = parseArgs(process.argv.slice(2));
if (!parsed || !parsed.flags.content || !parsed.flags.title) {
  console.error(
    'usage: node assemble-cli.mjs --content <content.html> --title "<title>"\n' +
    "         [--css <overrides.css>] [--font-import <url>] [--paper a4|legal|half]\n" +
    "         [--orientation landscape] [--answer-key <key.html>] [--out-dir <dir>]\n" +
    "         [--check] [--json]");
  process.exit(2);
}
const { flags } = parsed;
const asJson = parsed.bools.has("json");
const runChecks = parsed.bools.has("check");

function slugify(title) {
  return (
    String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
    "printable"
  );
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

// ── Step 2: two-sheet wrap (answer key) ────────────────────────────────────
let pageContent = content;
if (answerKey.trim()) {
  const footerMatch = template.match(/<footer>.*?<\/footer>/s);
  const footer = footerMatch ? footerMatch[0] : "<footer><span></span><span></span></footer>";
  pageContent =
    `<div class="page">\n${content}\n${footer}\n</div>\n` +
    `<div class="page">\n${answerKey}\n${footer}\n</div>`;
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
if (answerKey.trim()) {
  check(idx('id="mp-nested-sheets"') !== -1 && idx('id="mp-nested-sheets"') < idx('id="content-overrides"'),
    "mp-nested-sheets must precede content-overrides");
  check(count(/<div class="page">/g) === 2, "expected exactly two nested .page sheets");
  check(count(/<footer><span><\/span><span><\/span><\/footer>/g) >= 3,
    "each nested sheet must end in the shell footer");
}
const bodyTag = (html.match(/<body[^>]*>/) || [""])[0];
if (paper) check(bodyTag.includes(`data-mp-paper="${paper}"`), "body must carry data-mp-paper");
if (landscape) check(bodyTag.includes('data-mp-orientation="landscape"'), "body must carry data-mp-orientation");
if (!landscape) check(!bodyTag.includes("data-mp-orientation"), "portrait pages carry no orientation attribute");

// ── Optional: fit + contrast on the written file, in the same command ──────
let checks = null;
if (runChecks && failures.length === 0) {
  checks = await new Promise((resolve) => {
    execFile(process.execPath, [path.join(HERE, "check-cli.mjs"), outFile],
      { maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({ ok: !err, out: (stdout + stderr).trim() }));
  });
}

const ok = failures.length === 0 && (!checks || checks.ok);
if (asJson) {
  console.log(JSON.stringify({ ok, file: outFile, failures, warnings,
    checks: checks ? { ok: checks.ok, report: checks.out } : null }));
} else {
  console.log(`assembled: ${outFile}`);
  for (const w of warnings) console.error(`warning: ${w}`);
  if (failures.length) {
    console.error("structural verification FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
  } else {
    console.log("structural verification: ok");
  }
  if (checks) console.log(checks.out);
}
process.exit(ok ? 0 : 1);
