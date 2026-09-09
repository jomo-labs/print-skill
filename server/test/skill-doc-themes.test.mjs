// references/themes/README.md is loaded into the model's context on every
// themed run, so its size is a per-turn cost. U14 moved the drawing tutorial
// ("Getting a mark that reads") out to references/marks.md and repointed the
// ad-hoc checklist's token-map pointer away from theme-spec-template.md (which
// otherwise pulls a 6.5KB file into context on every ad-hoc themed run). These
// tests pin the byte ceiling and the pointers so neither regresses.
//
// Shape follows skill-doc.test.mjs: read the files, assert on what is there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const THEMES_README = path.join(ROOT, "references", "themes", "README.md");
const MARKS = path.join(ROOT, "references", "marks.md");

const README_MAX_BYTES = 4000;

const readReadme = () => fs.readFile(THEMES_README, "utf-8");

test(`themes/README.md is at most ${README_MAX_BYTES} bytes`, async () => {
  const { size } = await fs.stat(THEMES_README);
  assert.ok(size <= README_MAX_BYTES,
    `themes/README.md is ${size} bytes; the budget is ${README_MAX_BYTES}`);
});

test("marks.md carries the moved drawing tutorial", async () => {
  const md = await fs.readFile(MARKS, "utf-8");
  assert.ok(md.includes("Diagnostic features first"),
    "references/marks.md lost the diagnostic-features guidance");
  assert.ok(md.includes("Judge every candidate at printed size"),
    "references/marks.md lost the printed-size judgment guidance");
});

test("themes/README.md names theme-spec-template.md only under \"Adding a new theme\"", async () => {
  const md = await readReadme();
  // Split on H2 headings and inspect each section's body independently, so a
  // mention anywhere outside "Adding a new theme" fails loudly.
  const sections = md.split(/^## /m).slice(1); // drop the preamble before the first H2
  for (const section of sections) {
    const heading = section.split("\n", 1)[0].trim();
    if (heading.startsWith("Adding a new theme")) continue;
    assert.ok(!section.includes("theme-spec-template.md"),
      `"## ${heading}" names theme-spec-template.md, which should load only for humans adding a theme`);
  }
  assert.ok(md.includes("theme-spec-template.md"),
    "theme-spec-template.md should still be named once, under \"Adding a new theme\"");
});

test("themes/README.md names references/marks.md at least once", async () => {
  const md = await readReadme();
  assert.ok(/(references\/)?marks\.md/.test(md),
    "themes/README.md no longer points at marks.md for drawing a mark");
});

test("the ad-hoc checklist still has six numbered items", async () => {
  const md = await readReadme();
  const section = md.split(/^## Ad-hoc theme/m)[1]?.split(/^## /m)[0] ?? "";
  const items = [...section.matchAll(/^\d+\.\s/gm)];
  assert.equal(items.length, 6,
    `the ad-hoc checklist has ${items.length} numbered items, expected 6`);
});
