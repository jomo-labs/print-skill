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
  const html = await fs.readFile(r.file, "utf-8");
  assert.ok(html.indexOf('id="mp-nested-sheets"') < html.indexOf('id="content-overrides"'));
  assert.equal((html.match(/<div class="page">/g) || []).length, 2);
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
  const html = await fs.readFile(r.file, "utf-8");
  assert.ok(!html.includes("mp-fit-squeeze"), "no squeeze persisted on failure");
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
