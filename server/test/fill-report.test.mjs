// The fit check prints each sheet's fill percentage on every passing run,
// and warns (never fails) below the underfill floor. Overflow already fails
// loudly, so without this number the tooling's gradient only pushes pages
// shorter; the fill line is the counter-signal (principles.md VII) and
// replaces the fill measurements authors otherwise hand-roll.
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

const run = (args) => new Promise((resolve) => {
  execFile(process.execPath, args, { maxBuffer: 8 * 1024 * 1024 },
    (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, stdout, stderr }));
});

async function assemble(dir, content, title) {
  const contentFile = path.join(dir, "content.html");
  await fs.writeFile(contentFile, content);
  return run([CLI, "--content", contentFile, "--title", title,
              "--out-dir", path.join(dir, "out")]);
}

test("a sparse sheet passes with a fill line and an underfill warning", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "fill-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = await assemble(dir,
    `<div data-mp-section="hero"><h1>Sparse</h1><p>One short paragraph.</p></div>`,
    "Sparse Page");
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /fits: 1 sheet, as authored/);
  assert.match(r.stdout, /fill: \d+%/);
  assert.match(r.stdout, /is only \d+% filled — underfill/);
});

test("a well-filled sheet gets the fill line and no warning", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "fill-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = await assemble(dir,
    `<div data-mp-section="hero"><h1>Full</h1></div>\n` +
    `<div data-mp-section="body" style="height: 7.5in"><p>Tall content block.</p></div>`,
    "Full Page");
  assert.equal(r.code, 0, r.stderr);
  const fill = r.stdout.match(/fill: (\d+)%/);
  assert.ok(fill, "fill line present: " + r.stdout);
  assert.ok(parseInt(fill[1], 10) >= 70, "expected >=70% fill, got " + fill[1]);
  assert.ok(!/underfill/.test(r.stdout), "no underfill warning expected: " + r.stdout);
});
