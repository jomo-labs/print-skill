// Assembly fails when custom css references a token nothing defines — an
// undefined var() silently invalidates its declaration (a margin collapses to
// 0 with no visible error), so it must be caught at assembly, not by eye.
// Pins the unit (findUndefinedTokenRefs) and the CLI wiring: undefined names
// fail verification with a nearest-token hint; fallbacks and self-defined
// tokens pass.
//
// Also pins the other half of that story: the token quick reference in
// references/page-types.md, which is where the authored names come from. That
// table once read "--space-1..20: 4, 8, 12, ... 80" — 20 names against 11
// values — which is exactly how `var(--space-7)` gets authored and how the
// stylesheet ends up being grepped by a reader the table promised not to send
// there. The cross-check below asserts both directions (documented ⊆ defined
// and defined ⊆ documented) so that drift cannot come back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findUndefinedTokenRefs } from "../lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "assemble-cli.mjs");

const CONTENT = `<div data-mp-section="hero"><h1>Tokens</h1><p>Body text.</p></div>`;

const run = (args) => new Promise((resolve) => {
  execFile(process.execPath, args, { maxBuffer: 8 * 1024 * 1024 },
    (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, stdout, stderr }));
});

async function assemble(dir, css) {
  const contentFile = path.join(dir, "content.html");
  await fs.writeFile(contentFile, CONTENT);
  const args = [CLI, "--content", contentFile, "--title", "Token Test",
                "--out-dir", path.join(dir, "out")];
  if (css !== undefined) {
    const cssFile = path.join(dir, "overrides.css");
    await fs.writeFile(cssFile, css);
    args.push("--css", cssFile);
  }
  return run(args);
}

test("findUndefinedTokenRefs: undefined names, fallbacks, suggestions", () => {
  const html = `<style>
    :root { --space-6: 24px; --space-8: 32px; --color-accent: teal; }
    .a { margin: var(--space-7); }
    .b { gap: var(--space-7); padding: var(--space-9, 8px); }
    .c { color: var(--color-accent); border-color: var(--color-accnet); }
  </style>`;
  const refs = findUndefinedTokenRefs(html);
  assert.deepEqual(refs.map((r) => r.name), ["--color-accnet", "--space-7"]);
  const space7 = refs.find((r) => r.name === "--space-7");
  assert.equal(space7.count, 2);
  assert.equal(space7.suggestion, "--space-6, --space-8");
  // --space-9 carried a fallback: it resolves, so it is not flagged.
  assert.ok(!refs.some((r) => r.name === "--space-9"));
});

test("undefined token in custom css fails verification with a hint", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "tok-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = await assemble(dir, `.x { margin-bottom: var(--space-7); }`);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /structural verification FAILED/);
  assert.match(r.stderr, /var\(--space-7\) resolves to nothing/);
  assert.match(r.stderr, /nearest defined: --space-6, --space-8/);
});

test("tokens the override defines itself, and fallbacks, assemble clean", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "tok-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = await assemble(dir,
    `:root { --rc-gutter: 18px; }\n` +
    `.x { margin-bottom: var(--rc-gutter); padding-top: var(--space-99, 4px); }`);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /structural verification: ok/);
});

// ── The documented token table vs the stylesheet ────────────────────────────

const SKILL_DIR = path.resolve(HERE, "..", "..");
const DOC = path.join(SKILL_DIR, "references", "page-types.md");
const SHEET = path.join(SKILL_DIR, "assets", "shell", "document.css");

// One entry per row of the quick reference table. `prefixes` is what makes the
// second direction checkable: it says which stylesheet tokens that row is
// responsible for, so a token added to :root under one of these prefixes and
// not written into the table fails. Prefixes are deliberately narrow —
// `--page-margin-` and not `--page-`, because --page-border and
// --page-frame-inset are surface tokens a theme sets, not authoring tokens the
// table is for. --image-filter is the same and belongs to no row.
const ROWS = [
  { row: "Ink",                prefixes: ["--color-"],   values: true },
  // The Fonts row documents family names in prose ("(Playfair)"), not the
  // stylesheet's full fallback stacks, so it is checked for presence only.
  { row: "Fonts",              prefixes: ["--font-"],    values: false },
  { row: "Type scale",         prefixes: ["--text-"],    values: true },
  { row: "Spacing",            prefixes: ["--space-"],   values: true },
  { row: "Borders",            prefixes: ["--border-"],  values: true },
  { row: "Leading / tracking", prefixes: ["--leading-", "--tracking-", "--display-overhang"],
    values: true },
  { row: "Page margins",       prefixes: ["--page-margin-"], values: true },
];

// Normalisation, so a value carrying a calc()/oklch() expression compares by
// meaning rather than by character. Two rules, and only these two: every run
// of whitespace collapses to one space, and every number is compared by its
// value rather than its spelling (the table writes the oklch chroma .005 where
// the stylesheet writes 0.005, and 0.15 where it writes 0.150). A genuine
// difference in magnitude, unit or function shape still fails.
const norm = (v) => v.trim().replace(/\s+/g, " ")
  .replace(/(?:\d+\.\d+|\.\d+|\d+)/g, (n) => String(parseFloat(n)));

function documentedTable(md) {
  const out = new Map();          // row label -> Map(token -> value|null)
  for (const { row, values } of ROWS) {
    const line = md.split("\n").find((l) => l.startsWith(`| ${row} |`));
    assert.ok(line, `page-types.md has no "${row}" row in the token table`);
    let cell = line.split("|")[2].trim();
    // A trailing "(px)" is the row's unit, not part of the last value.
    let unit = "";
    if (cell.endsWith("(px)")) { unit = "px"; cell = cell.slice(0, -4).trim(); }
    const entries = new Map();
    for (const part of cell.split("·")) {
      const m = part.trim().match(/^`(--[A-Za-z0-9_-]+)`\s*(.*)$/);
      assert.ok(m, `unparsable entry in the "${row}" row: ${part.trim()}`);
      let value = m[2].trim();
      if (!values) { entries.set(m[1], null); continue; }
      // "= ink" means "the same value as --color-ink" — resolved after the
      // whole row is read, since the alias may point forward.
      if (/^= /.test(value)) entries.set(m[1], { alias: `--color-${value.slice(2).trim()}` });
      else entries.set(m[1], norm(/^[\d.]+$/.test(value) ? value + unit : value));
    }
    for (const [name, v] of entries) {
      if (v && v.alias) {
        const target = entries.get(v.alias);
        assert.ok(typeof target === "string",
          `${name} aliases ${v.alias}, which the table does not give a value`);
        entries.set(name, target);
      }
    }
    out.set(row, entries);
  }
  return out;
}

function definedTokens(css) {
  // document.css declares its tokens in exactly one :root block; anything
  // outside it is a consumer, not a definition.
  const start = css.indexOf(":root {");
  assert.notEqual(start, -1, "document.css has no :root block");
  const block = css.slice(start, css.indexOf("\n}", start));
  const out = new Map();
  for (const [, name, value] of block.matchAll(/^\s*(--[A-Za-z0-9_-]+):\s*([^;]+);/gm)) {
    out.set(name, norm(value.replace(/\/\*[\s\S]*?\*\//g, "")));
  }
  return out;
}

test("every documented token exists in document.css with the documented value", async () => {
  const documented = documentedTable(await fs.readFile(DOC, "utf-8"));
  const defined = definedTokens(await fs.readFile(SHEET, "utf-8"));
  for (const [row, entries] of documented) {
    for (const [name, value] of entries) {
      assert.ok(defined.has(name),
        `page-types.md "${row}" documents ${name}, which document.css does not define`);
      if (value !== null) {
        assert.equal(defined.get(name), value,
          `page-types.md "${row}" gives ${name} as "${value}"; document.css says "${defined.get(name)}"`);
      }
    }
  }
});

test("every token document.css defines in a documented family is in the table", async () => {
  const documented = documentedTable(await fs.readFile(DOC, "utf-8"));
  const defined = definedTokens(await fs.readFile(SHEET, "utf-8"));
  for (const { row, prefixes } of ROWS) {
    const entries = documented.get(row);
    for (const name of defined.keys()) {
      if (!prefixes.some((p) => name.startsWith(p))) continue;
      assert.ok(entries.has(name),
        `document.css defines ${name}, which the "${row}" row of page-types.md omits`);
    }
  }
});

test("the spacing scale is documented step by step, with no invented steps", async () => {
  // The regression test for the "--space-1..20: 4, 8, 12, ..." range notation:
  // a run authoring from the table must not be able to reach --space-7.
  const documented = documentedTable(await fs.readFile(DOC, "utf-8"));
  const spacing = documented.get("Spacing");
  assert.deepEqual([...spacing.keys()], [
    "--space-1", "--space-2", "--space-3", "--space-4", "--space-5", "--space-6",
    "--space-8", "--space-10", "--space-12", "--space-16", "--space-20"]);
  for (const gap of ["--space-7", "--space-9", "--space-11", "--space-14"]) {
    assert.ok(!spacing.has(gap), `${gap} does not exist and must not be documented`);
  }
  assert.equal(spacing.get("--space-1"), "4px");
  assert.equal(spacing.get("--space-20"), "80px");
});

test("--display-overhang is documented with its expression, not just its name", async () => {
  const documented = documentedTable(await fs.readFile(DOC, "utf-8"));
  const value = documented.get("Leading / tracking").get("--display-overhang");
  assert.equal(value, "max(0em, calc((1.22em - var(--leading-display) * 1em) / 2))");
});
