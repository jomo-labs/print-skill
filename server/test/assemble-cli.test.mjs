// assemble-cli.mjs executes the assembly.md procedure as one command, then
// always runs the fit and contrast checks on the result. These tests pin the
// CLI to the doc's own verification list for each channel combination, to the
// page budget (--max-sheets, default 1), and to the squeeze contract: a small
// overflow is tightened into fitting and persisted; a large one fails with
// the section table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "assemble-cli.mjs");
const FIT = path.join(HERE, "..", "fit-cli.mjs");

const CONTENT = `<div data-mp-section="hero"><h1>Assembled</h1><p>Body text.</p></div>`;
const KEY = `<div data-mp-section="key"><h2>Answer Key</h2><p>42.</p></div>`;
const FOOTER = "<footer><span></span><span></span></footer>";

const run = (args, opts = {}) => new Promise((resolve) => {
  execFile(process.execPath, args, { maxBuffer: 8 * 1024 * 1024, ...opts },
    (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, stdout, stderr }));
});

async function assemble(dir, extra = [], { content = CONTENT, title = "CLI Test Page" } = {}) {
  const contentFile = path.join(dir, "content.html");
  await fs.writeFile(contentFile, content);
  const r = await run([CLI, "--content", contentFile, "--title", title,
                       "--out-dir", path.join(dir, "out"), ...extra]);
  r.file = path.join(dir, "out",
    title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") + ".html");
  return r;
}

// Token-margined rows, counted against the DOCUMENTED squeeze floors (spacing
// to 75%, type to 92%): 17 fit as authored, 19 need a spacing-only squeeze, 22
// is past the floors, and the 60-row variant is beyond any squeeze. The counts
// were once higher, tuned against a ladder whose rungs multiplied instead of
// replacing — an effective 0.54 spacing, which rescued far more than the
// floors allow.
const overflowRows = (n) => `<div data-mp-section="hero"><h1>Overflow</h1></div>\n` +
  Array.from({ length: n }, (_, i) =>
    `<div data-mp-section="row-${i}" style="margin-bottom: var(--space-4);">` +
    `<h3 style="margin:0">Item ${i}</h3><p style="margin:0">Line of body text ${i}.</p></div>`).join("\n");

test("basic assembly passes verification and both checks", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "asm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = await assemble(dir);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /structural verification: ok/);
  assert.match(r.stdout, /fits: 1 sheet, as authored/);
  assert.match(r.stdout, /contrast ok/);
  // No --answer-key: lint-cli runs exactly once (over --content only) — the
  // no-answer-key path is unaffected by the second, key-only invocation that
  // only fires when --answer-key is given.
  assert.equal((r.stdout.match(/css lint: ok/g) || []).length, 1);
  const html = await fs.readFile(r.file, "utf-8");
  assert.ok(html.includes("--color-ink"), "document.css inlined");
  assert.ok(!html.includes("<!-- CONTENT -->"));
  assert.ok(!html.includes("<script"));
});

test("custom css lands in content-overrides, after the document styles", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "asm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const css = `:root { --color-accent: oklch(0.45 0.1 250); }`;
  const cssFile = path.join(dir, "over.css");
  await fs.writeFile(cssFile, css);
  const r = await assemble(dir, ["--css", cssFile]);
  assert.equal(r.code, 0, r.stderr);
  const html = await fs.readFile(r.file, "utf-8");
  assert.ok(html.includes(css));
  assert.ok(html.indexOf('id="mp-document-css"') < html.indexOf('id="content-overrides"'));
});

test("paper and orientation set body attributes and the @page size", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "asm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = await assemble(dir, ["--paper", "a4", "--orientation", "landscape"]);
  assert.equal(r.code, 0, r.stderr);
  const html = await fs.readFile(r.file, "utf-8");
  const body = html.match(/<body[^>]*>/)[0];
  assert.ok(body.includes('data-mp-paper="a4"'));
  assert.ok(body.includes('data-mp-orientation="landscape"'));
  assert.ok(html.includes("@page { size: A4 landscape; margin: 0; }"));
});

test("an answer key makes a two-sheet document within the default budget", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "asm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const keyFile = path.join(dir, "key.html");
  await fs.writeFile(keyFile, KEY);
  const r = await assemble(dir, ["--answer-key", keyFile]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /fits: 2 sheets, as authored/);
  // A clean answer key still lints and assembles fine — lint-cli runs once
  // for --content and once for --answer-key, both clean.
  assert.equal((r.stdout.match(/css lint: ok/g) || []).length, 2);
  const html = await fs.readFile(r.file, "utf-8");
  assert.ok(html.indexOf('id="mp-nested-sheets"') < html.indexOf('id="content-overrides"'));
  assert.equal((html.match(/<div class="page">/g) || []).length, 2);
});

test("a banned inline style in the answer key fails the build (Part B item 7)", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "asm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const keyFile = path.join(dir, "key.html");
  // A literal color outside :root is item 6, caught in inline style="" via
  // item 7 — the same predicate the main content is linted under.
  await fs.writeFile(keyFile, `<div style="color: red">Key</div>`);
  const r = await assemble(dir, ["--answer-key", keyFile], { title: "Bad Key" });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /css lint FAILED/);
  assert.match(r.stderr, /item 6,/);
  assert.match(r.stderr, /key\.html/, "the finding names the key file, not content.html");
  await assert.rejects(fs.access(r.file), /ENOENT/,
    "a lint-failing build with no prior page must leave none behind");
});

test("a lint-failing rebuild leaves a pre-existing good page in place", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "asm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const good = await assemble(dir, [], { title: "Stable Name" });
  assert.equal(good.code, 0, good.stderr);
  const goodHtml = await fs.readFile(good.file, "utf-8");

  // Rebuild at the SAME title (same output filename) with content that fails
  // the Part B lint outright.
  const bad = await assemble(dir, [], {
    content: `<div style="color: red">bad</div>`,
    title: "Stable Name",
  });
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /css lint FAILED/);
  assert.match(bad.stderr, /left untouched/);

  const afterHtml = await fs.readFile(good.file, "utf-8");
  assert.equal(afterHtml, goodHtml,
    "the failed rebuild must not have overwritten the last good page");
  assert.ok(!afterHtml.includes("bad</div>"), "the broken content never landed on disk");
});

test("a lint-failing rebuild leaves no stray temp file behind in out-dir", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "asm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = await assemble(dir, [], { content: `<div style="color: red">bad</div>`, title: "Litter" });
  assert.equal(r.code, 1);
  const entries = await fs.readdir(path.join(dir, "out"));
  assert.deepEqual(entries, [], "no temp or partial file should remain after a lint failure");
});

test("a passing build writes to the exact same path as before (rename regression guard)", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "asm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const first = await assemble(dir, [], { title: "Reprint Me" });
  assert.equal(first.code, 0, first.stderr);
  const expectedPath = path.join(dir, "out", "reprint-me.html");
  assert.equal(first.file, expectedPath);
  const firstHtml = await fs.readFile(first.file, "utf-8");
  assert.ok(firstHtml.includes("Assembled"));

  // A second passing build at the same title lands at the same path and its
  // content really is replaced (the rename overwrites, it doesn't refuse).
  const second = await assemble(dir, [], {
    content: `<div data-mp-section="hero"><h1>Reassembled</h1><p>New body.</p></div>`,
    title: "Reprint Me",
  });
  assert.equal(second.code, 0, second.stderr);
  assert.equal(second.file, expectedPath);
  const secondHtml = await fs.readFile(second.file, "utf-8");
  assert.ok(secondHtml.includes("Reassembled"));
  assert.ok(!secondHtml.includes("Assembled</h1>"));

  // And no temp files were left behind alongside it.
  const entries = await fs.readdir(path.join(dir, "out"));
  assert.deepEqual(entries, ["reprint-me.html"]);
});

test("a non-Google-Fonts URL is dropped with a warning, never embedded", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "asm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = await assemble(dir, ["--font-import", 'https://evil.example/steal.css"><script>x()</script>']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /font-import dropped/);
  const html = await fs.readFile(r.file, "utf-8");
  assert.ok(!html.includes("evil.example"));
  assert.ok(!html.includes("<script"));
});

test("the page budget: 3 authored sheets fail by default, pass with --max-sheets 3", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "asm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const three = Array.from({ length: 3 }, (_, i) =>
    `<div class="page"><h1>Sheet ${i + 1}</h1>${FOOTER}</div>`).join("\n");
  const denied = await assemble(dir, [], { content: three, title: "Fun Pack" });
  assert.equal(denied.code, 1);
  assert.match(denied.stderr, /page budget is 1/);
  const allowed = await assemble(dir, ["--max-sheets", "3"], { content: three, title: "Fun Pack" });
  assert.equal(allowed.code, 0, allowed.stderr);
  assert.match(allowed.stdout, /fits: 3 sheets, as authored/);
});

test("a small overflow is squeezed into fitting and persisted; re-runs don't compound", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "asm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = await assemble(dir, [], { content: overflowRows(19), title: "Squeeze Me" });
  assert.equal(r.code, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /squeezed to fit: spacing/);
  assert.match(r.stdout, /fits: 1 sheet, squeezed/);
  assert.match(r.stdout, /contrast ok/, "contrast validated the squeezed sizes");
  const html = await fs.readFile(r.file, "utf-8");
  assert.equal((html.match(/id="mp-fit-squeeze"/g) || []).length, 1);
  // squeeze block must come after content-overrides so its tokens win
  assert.ok(html.indexOf('id="content-overrides"') < html.indexOf('id="mp-fit-squeeze"'));
  // a second fit run re-derives from authored sizes — still exactly one block
  const again = await run([FIT, r.file]);
  assert.equal(again.code, 0, again.stderr);
  const html2 = await fs.readFile(r.file, "utf-8");
  assert.equal((html2.match(/id="mp-fit-squeeze"/g) || []).length, 1);
});

test("an overflow beyond the squeeze floors fails with the section table", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "asm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = await assemble(dir, [], { content: overflowRows(60), title: "Way Too Big" });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /does not fit: authored 1 sheet/);
  assert.match(r.stderr, /squeeze floors .* were not enough/);
  assert.match(r.stderr, /cut \d+px/);
  assert.match(r.stderr, /row-0/, "section table names the blocks");
  // No prior good page existed at this path, and the build failed: the
  // temp-write-then-rename means nothing is ever written to it at all —
  // a stronger guarantee than "no squeeze persisted", which is now moot
  // because there is no file to inspect.
  await assert.rejects(fs.access(r.file), /ENOENT/,
    "a fit failure with no prior page must leave none behind");
});

test("editing content down removes a stale squeeze on the next fit run", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "asm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = await assemble(dir, [], { content: overflowRows(19), title: "Shrinking" });
  assert.equal(r.code, 0, r.stderr);
  // cut the content way down, in place, as an edit would
  let html = await fs.readFile(r.file, "utf-8");
  html = html.replace(/<div data-mp-section="row-(?:[5-9]|1\d|2\d)"[\s\S]*?<\/div>\n?/g, "");
  await fs.writeFile(r.file, html);
  const again = await run([FIT, r.file]);
  assert.equal(again.code, 0, again.stderr);
  assert.match(again.stdout, /fits without the previous squeeze — removed it/);
  const html2 = await fs.readFile(r.file, "utf-8");
  assert.ok(!html2.includes("mp-fit-squeeze"));
});
