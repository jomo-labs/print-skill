// The fit check prints each sheet's fill on every passing run, and warns
// (never fails) below the underfill floors. Overflow already fails loudly, so
// without this number the tooling's gradient only pushes pages shorter; the
// fill line is the counter-signal (principles.md VII) and replaces the fill
// measurements authors otherwise hand-roll.
//
// Two numbers, because height alone cannot see underfill: a page whose blocks
// are spread apart with loose leading runs to the bottom margin and scores
// 90%+ while carrying almost no ink, and every unit of spacing added to it
// raises the score. Ink is the counter-measure, and the case that matters
// most here is the stretched page — high on one number, low on the other.
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

const fill = (stdout) => {
  const m = stdout.match(/fill: (\d+)% height, (\d+)% ink/);
  assert.ok(m, "fill line present: " + stdout);
  return { height: parseInt(m[1], 10), ink: parseInt(m[2], 10) };
};

// A block of prose long enough to fill a column, reused below.
const PARA =
  "The valley road climbs for four miles before it levels out, and the last " +
  "of the orchards give way to scrub oak and then to nothing much at all. " +
  "Drivers who take it for the view usually stop at the second pullout, " +
  "where the whole basin opens up below and the reservoir sits like a coin " +
  "dropped in grass. The county has talked about widening the road since " +
  "the nineteen-seventies, and every few years a survey crew appears with " +
  "orange stakes and then does not come back.";

test("a short sheet reports both numbers and warns on height", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "fill-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = await assemble(dir,
    `<div data-mp-section="hero"><h1>Sparse</h1><p>One short paragraph.</p></div>`,
    "Sparse Page");
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /fits: 1 sheet, as authored/);
  const f = fill(r.stdout);
  assert.ok(f.height < 70, "expected a short page, got height " + f.height);
  assert.match(r.stdout, /uses only \d+% of its height — underfill/);
});

// The regression this pair exists for: same content, once packed and once
// stretched to the same extent with spacing alone. Height cannot tell them
// apart — it prefers the emptier one — and ink can.
test("a stretched sheet reaches the bottom and is still caught", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "fill-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const stories = [
    "Neighborhood Park Gets New Slide", "Library Summer Reading Ends",
    "Weather Turns Cooler This Week", "Soccer Season Opens Saturday",
    "Bakery on Third Adds a Shift",
  ].map((h) =>
    `<hr>\n<div data-mp-section="story" style="margin: var(--space-10) 0">` +
    `<h2>${h}</h2>` +
    `<p class="kicker" style="margin: var(--space-3) 0">CITY DESK · SEPT 1</p>` +
    `<p style="line-height: 1.9">Two short sentences of lede. ` +
    `Nothing more than that.</p></div>`).join("\n");
  const masthead =
    `<div data-mp-section="masthead" style="margin-bottom: var(--space-10)">` +
    `<p class="kicker">MORNING BRIEFING</p><h1>The Daily Sprout</h1>` +
    `<p class="dateline">Tuesday, September 2</p></div>`;
  const r = await assemble(dir, masthead + "\n" + stories, "Stretched Page");
  assert.equal(r.code, 0, r.stderr);
  const f = fill(r.stdout);
  assert.ok(f.height >= 70,
    "the stretched page should reach the bottom, got height " + f.height);
  assert.ok(f.ink < 30, "expected a thinly covered page, got ink " + f.ink);
  assert.doesNotMatch(r.stdout, /uses only \d+% of its height/);
  assert.match(r.stdout, /covers only \d+% of it — underfill/);
  assert.match(r.stdout, /Spacing is already carrying the height/);
});

test("a genuinely full sheet gets both numbers and no warning", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "fill-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = await assemble(dir,
    `<div data-mp-section="hero"><h1>Full</h1></div>\n` +
    `<div data-mp-section="body">${`<p>${PARA}</p>`.repeat(8)}</div>`,
    "Full Page");
  assert.equal(r.code, 0, r.stderr);
  const f = fill(r.stdout);
  assert.ok(f.height >= 70, "expected a tall page, got height " + f.height);
  assert.ok(f.ink >= 30, "expected a covered page, got ink " + f.ink);
  assert.ok(!/underfill/.test(r.stdout), "no underfill warning expected: " + r.stdout);
});

// The other side of that rule: a box holding the page's content is a wrapper,
// not a blank to write in. Counting its whole rect would let one hairline div
// report any page, however empty, as completely covered.
test("a bordered wrapper around thin content does not read as full", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "fill-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = await assemble(dir,
    `<div data-mp-section="frame" style="border: 1px solid var(--color-rule); ` +
    `height: 8.5in; padding: var(--space-4)"><h1>Framed But Empty</h1>` +
    `<p>One short paragraph inside a box that reaches the bottom.</p></div>`,
    "Wrapped Page");
  assert.equal(r.code, 0, r.stderr);
  const f = fill(r.stdout);
  assert.ok(f.height >= 70, "the wrapper reaches the bottom, got height " + f.height);
  assert.ok(f.ink < 30, "the wrapper is not coverage, got ink " + f.ink);
  assert.match(r.stdout, /covers only \d+% of it — underfill/);
});

// Functional blank areas are content, not emptiness: a week grid is full even
// though almost nothing is printed inside its cells. Ink counts a bordered
// box as covered precisely so this page is not told to add more.
test("a grid of empty bordered cells counts as filled", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "fill-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const rows = ["Make bed", "Feed the cat", "Dishes", "Homework", "Tidy room", "&nbsp;"];
  const table = (name) =>
    `<div data-mp-section="${name}" style="margin-bottom: var(--space-6)"><h3>${name}</h3>` +
    `<table style="width:100%"><thead><tr><th style="text-align:left">Chore</th>` +
    days.map((d) => `<th>${d}</th>`).join("") + `</tr></thead><tbody>` +
    rows.map((c) => `<tr><td>${c}</td>` +
      days.map(() => `<td style="height:22px"></td>`).join("") + `</tr>`).join("") +
    `</tbody></table></div>`;
  const r = await assemble(dir,
    `<div data-mp-section="head"><h1>Chore Chart</h1></div>\n` +
    ["Ada", "Bo", "Cy"].map(table).join("\n"), "Chore Chart");
  assert.equal(r.code, 0, r.stderr);
  const f = fill(r.stdout);
  assert.ok(f.ink >= 30, "an empty week grid is still full, got ink " + f.ink);
  assert.ok(!/underfill/.test(r.stdout), "no underfill warning expected: " + r.stdout);
});
