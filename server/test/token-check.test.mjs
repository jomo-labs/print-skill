// Assembly fails when custom css references a token nothing defines — an
// undefined var() silently invalidates its declaration (a margin collapses to
// 0 with no visible error), so it must be caught at assembly, not by eye.
// Pins the unit (findUndefinedTokenRefs) and the CLI wiring: undefined names
// fail verification with a nearest-token hint; fallbacks and self-defined
// tokens pass.
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
