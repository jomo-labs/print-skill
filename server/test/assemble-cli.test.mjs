// assemble-cli.mjs executes the assembly.md procedure as one command. These
// tests pin the CLI to the doc's own verification list: every rule the manual
// procedure ends with must hold on the CLI's output, for each channel
// combination — and the CLI must refuse (exit 1) rather than emit a page that
// fails its own checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "assemble-cli.mjs");
const run = promisify(execFile);

const CONTENT = `<div data-mp-section="hero"><h1>Assembled</h1><p>Body text.</p></div>`;
const KEY = `<div data-mp-section="key"><h2>Answer Key</h2><p>42.</p></div>`;
const CSS = `:root { --color-accent: oklch(0.45 0.1 250); }`;

async function assemble(dir, extra = [], { content = CONTENT } = {}) {
  const contentFile = path.join(dir, "content.html");
  await fs.writeFile(contentFile, content);
  const args = [CLI, "--content", contentFile, "--title", "CLI Test Page",
                "--out-dir", path.join(dir, "out"), "--json", ...extra];
  try {
    const { stdout } = await run(process.execPath, args);
    return { code: 0, ...JSON.parse(stdout) };
  } catch (e) {
    const payload = e.stdout ? JSON.parse(e.stdout) : {};
    return { code: e.code ?? 1, ...payload };
  }
}

test("basic assembly passes its own verification and inlines the stylesheet", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "asm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = await assemble(dir);
  assert.equal(r.code, 0, JSON.stringify(r.failures));
  assert.equal(r.file, path.join(dir, "out", "cli-test-page.html"));
  const html = await fs.readFile(r.file, "utf-8");
  assert.ok(html.includes("--color-ink"), "document.css inlined");
  assert.ok(!html.includes("<!-- CONTENT -->"));
  assert.ok(!html.includes("<script"));
  assert.ok(html.includes("Assembled"));
});

test("custom css lands in content-overrides, after the document styles", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "asm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cssFile = path.join(dir, "over.css");
  await fs.writeFile(cssFile, CSS);
  const r = await assemble(dir, ["--css", cssFile]);
  assert.equal(r.code, 0, JSON.stringify(r.failures));
  const html = await fs.readFile(r.file, "utf-8");
  assert.ok(html.includes(CSS));
  assert.ok(html.indexOf('id="mp-document-css"') < html.indexOf('id="content-overrides"'));
});

test("paper and orientation set body attributes and the @page size", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "asm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = await assemble(dir, ["--paper", "a4", "--orientation", "landscape"]);
  assert.equal(r.code, 0, JSON.stringify(r.failures));
  const html = await fs.readFile(r.file, "utf-8");
  const body = html.match(/<body[^>]*>/)[0];
  assert.ok(body.includes('data-mp-paper="a4"'));
  assert.ok(body.includes('data-mp-orientation="landscape"'));
  assert.ok(html.includes("@page { size: A4 landscape; margin: 0; }"));
});

test("an answer key makes a two-sheet document with footers on both sheets", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "asm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const keyFile = path.join(dir, "key.html");
  await fs.writeFile(keyFile, KEY);
  const r = await assemble(dir, ["--answer-key", keyFile]);
  assert.equal(r.code, 0, JSON.stringify(r.failures));
  const html = await fs.readFile(r.file, "utf-8");
  assert.ok(html.indexOf('id="mp-nested-sheets"') !== -1);
  assert.ok(html.indexOf('id="mp-nested-sheets"') < html.indexOf('id="content-overrides"'));
  assert.equal((html.match(/<div class="page">/g) || []).length, 2, "two nested sheets");
  assert.ok(html.includes("Answer Key"));
});

test("a non-Google-Fonts URL is dropped with a warning, never embedded", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "asm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = await assemble(dir, ["--font-import", 'https://evil.example/steal.css"><script>x()</script>']);
  assert.equal(r.code, 0, JSON.stringify(r.failures));
  assert.equal(r.warnings.length, 1);
  const html = await fs.readFile(r.file, "utf-8");
  assert.ok(!html.includes("evil.example"));
  assert.ok(!html.includes("<script"));
});

test("a valid Google Fonts URL is inserted before content-overrides", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "asm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const url = "https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap";
  const r = await assemble(dir, ["--font-import", url]);
  assert.equal(r.code, 0, JSON.stringify(r.failures));
  const html = await fs.readFile(r.file, "utf-8");
  assert.ok(html.includes(`<link rel="stylesheet" href="${url}">`));
  assert.ok(html.indexOf(`<link rel="stylesheet"`) < html.indexOf('id="content-overrides"'));
});

test("--check runs the fit and contrast checks and reports them", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "asm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = await assemble(dir, ["--check"]);
  assert.equal(r.code, 0, JSON.stringify(r));
  assert.ok(r.checks && r.checks.ok, "check-cli ran and passed");
  assert.match(r.checks.report, /fits: 1 sheet/);
  assert.match(r.checks.report, /contrast ok/);
});
