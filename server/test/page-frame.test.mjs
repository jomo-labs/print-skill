// The themed page frame must print. A border on the sheet element itself sits
// on the paper edge, inside the ~0.25in strip no desktop printer can reach —
// it looks correct on screen and in every screenshot and clips only on paper,
// so nothing but a check catches it. Two guards, pinned here: the sanctioned
// frame (--page-border, painted inset by .page::before) can never be pulled
// into the strip by a theme retuning its margins, and the direct border that
// goes around that mechanism fails assembly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findSheetEdgeBorders } from "../lib.mjs";
import { launchBrowser, guardFonts } from "../browser.mjs";
import { startServer } from "../server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "assemble-cli.mjs");
const CONTENT = `<div data-mp-section="hero"><h1>Framed</h1><p>Body text.</p></div>`;
// The unprintable strip, at the 96dpi the sheet is laid out in.
const STRIP_PX = 24;

const run = (args) => new Promise((resolve) => {
  execFile(process.execPath, args, { maxBuffer: 8 * 1024 * 1024 },
    (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, stdout, stderr }));
});

async function assemble(dir, css) {
  const contentFile = path.join(dir, "content.html");
  await fs.writeFile(contentFile, CONTENT);
  const args = [CLI, "--content", contentFile, "--title", "Frame Test",
                "--out-dir", path.join(dir, "out")];
  if (css !== undefined) {
    const cssFile = path.join(dir, "overrides.css");
    await fs.writeFile(cssFile, css);
    args.push("--css", cssFile);
  }
  return { r: await run(args), out: path.join(dir, "out", "frame-test.html") };
}

test("findSheetEdgeBorders: only the sheet's own edge, only visible edges", () => {
  const hits = (css) => findSheetEdgeBorders(css).length;
  // The sheet itself, however it is reached.
  assert.equal(hits(".page { border: 6px solid var(--color-accent) }"), 1);
  assert.equal(hits("#page { outline: 2px solid black; }"), 1);
  assert.equal(hits("@media print { .page { border-top: 5px solid red } }"), 1);
  assert.equal(hits(".page:first-of-type { border: 3px dashed navy }"), 1);
  assert.equal(hits("h1, .page { border: 1px solid red }"), 1);
  // Something inside the sheet, or around it — not the paper edge.
  assert.equal(hits(".page h1 { border-bottom: 2px solid red }"), 0);
  assert.equal(hits(".page > .card { border: 1px solid }"), 0);
  assert.equal(hits(".page-surround { border: 1px solid red }"), 0);
  // Declarations that paint no edge, and the two ways to say "no frame".
  assert.equal(hits(".page { border-radius: 4px; border-collapse: collapse }"), 0);
  assert.equal(hits(".page { border: none } #page { outline: 0 }"), 0);
  assert.equal(hits(".page { --page-border: 5px solid var(--color-ink) }"), 0);
  assert.equal(hits("/* .page { border: 1px solid red } */ .card { border: 1px }"), 0);
  const [hit] = findSheetEdgeBorders(".page { border: 6px solid red }");
  assert.equal(hit.selector, ".page");
  assert.equal(hit.declaration, "border: 6px solid red");
});

test("a border on the sheet fails assembly, and names --page-border", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "frame-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { r } = await assemble(dir, ".page { border: 6px solid var(--color-accent); }");
  assert.equal(r.code, 1, r.stdout);
  assert.match(r.stderr, /structural verification FAILED/);
  assert.match(r.stderr, /draws on the sheet's own edge/);
  assert.match(r.stderr, /--page-border/);
});

// The three routes that walk the frame toward the paper edge, all measured on
// a rendered page. The third is the one that actually fired in the eval: the
// fit squeeze rewrites --page-margin-top, the default inset derives from it,
// so the page that needed the squeeze most was the one that lost its frame.
const frameOf = async (t, out) => {
  const { url, close } = await startServer({ dir: path.dirname(out), port: 0 });
  const browser = await launchBrowser();
  t.after(async () => { await browser.close(); await close(); });
  const page = await browser.newPage();
  await guardFonts(page);
  await page.goto(`${url}/${path.basename(out)}`, { waitUntil: "networkidle" });
  return page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector(".page"), "::before");
    return {
      inset: parseFloat(cs.insetBlockStart || cs.top),
      borderWidth: parseFloat(cs.borderTopWidth),
    };
  });
};

test("a theme tightening its margins cannot pull the frame into the strip", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "frame-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // 16px margins put the derived inset at 12px — inside the strip.
  const { r, out } = await assemble(dir,
    ":root { --page-margin-top: 16px; --page-border: 3px solid var(--color-ink); }");
  assert.equal(r.code, 0, r.stderr);
  const frame = await frameOf(t, out);
  assert.ok(frame.borderWidth > 0, "the themed frame is drawn: " + JSON.stringify(frame));
  assert.ok(frame.inset >= STRIP_PX,
    `frame inset ${frame.inset}px must clear the ${STRIP_PX}px unprintable strip`);
});

test("a theme setting the inset outright cannot either", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "frame-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { r, out } = await assemble(dir,
    ":root { --page-frame-inset: 22px; --page-border: 3px solid var(--color-ink); }");
  assert.equal(r.code, 0, r.stderr);
  const frame = await frameOf(t, out);
  assert.ok(frame.inset >= STRIP_PX,
    `an explicit 22px inset must still be floored, got ${frame.inset}px`);
});

test("nor does the squeeze, which shrinks the margin the inset derives from", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "frame-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // Enough content to overflow: the fit check squeezes spacing to its floor,
  // --page-margin-top with it, and the derived inset follows it down.
  const para = "The valley road climbs for four miles before it levels out, " +
    "and the last of the orchards give way to scrub oak and then to nothing " +
    "much at all. Drivers who take it for the view stop at the second pullout.";
  const contentFile = path.join(dir, "content.html");
  await fs.writeFile(contentFile,
    `<div data-mp-section="body">${`<p>${para}</p>`.repeat(19)}</div>`);
  const cssFile = path.join(dir, "overrides.css");
  await fs.writeFile(cssFile,
    ":root { --page-margin-top: 32px; --page-border: 3px solid var(--color-ink); }");
  const r = await run([CLI, "--content", contentFile, "--title", "Frame Test",
                       "--css", cssFile, "--out-dir", path.join(dir, "out")]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /squeezed to fit/, "the page must actually squeeze: " + r.stdout);
  const frame = await frameOf(t, path.join(dir, "out", "frame-test.html"));
  assert.ok(frame.borderWidth > 0, "the frame survives the squeeze");
  assert.ok(frame.inset >= STRIP_PX,
    `a squeezed page's frame must still clear the strip, got ${frame.inset}px`);
});
