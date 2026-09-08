// references/types/*.md is the page-type catalog: a run loads exactly the one
// spec that matches the routed type, so its per-byte cost lands in every
// generation. 30 of the 31 files used to open with an identical ~383-byte
// paragraph pointing at routing.md and page-types.md — context the model has
// already read by the time it opens a spec (Step 1 and the Step 3 batch).
// U15 Phase A deletes that paragraph; these tests guard the strip.
//
// Shape follows skill-doc.test.mjs: read the files, assert on what is there.
// Kept in its own file (not skill-doc.test.mjs) because that file is the
// domain of a concurrent unit touching references/themes/README.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const TYPES_DIR = path.join(ROOT, "references", "types");
const ROUTING = path.join(ROOT, "references", "routing.md");

const TYPE_SPEC_MEDIAN_MAX_BYTES = 700;

async function typeSpecFiles() {
  const names = (await fs.readdir(TYPES_DIR)).filter((n) => n.endsWith(".md"));
  return Promise.all(names.map(async (name) => {
    const filePath = path.join(TYPES_DIR, name);
    const [text, stat] = await Promise.all([
      fs.readFile(filePath, "utf-8"),
      fs.stat(filePath),
    ]);
    return { name, text, size: stat.size };
  }));
}

function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

test("no type spec still carries the shared routing/page-types header", async () => {
  for (const { name, text } of await typeSpecFiles()) {
    assert.ok(!text.includes("holds the routing table"),
      `references/types/${name} still has the shared header paragraph`);
  }
});

test("every type spec except image-block.md opens with an H1 and names Functional requirements", async () => {
  // worksheet.md's marker is "*Functional requirements (survive theming):*"
  // — a pre-existing variant (present in HEAD before this strip, unrelated
  // to the header removal), not the plain "*Functional requirements:*" the
  // other 28 specs use. The prefix match still catches the regression this
  // guards against: the header-removal regex eating the marker itself.
  for (const { name, text } of await typeSpecFiles()) {
    if (name === "image-block.md") continue;
    const firstLine = text.split("\n", 1)[0];
    assert.match(firstLine, /^#\s/, `references/types/${name} does not open with an H1`);
    assert.ok(text.includes("*Functional requirements"),
      `references/types/${name} is missing the *Functional requirements* marker`);
  }
});

test(`median type spec is at most ${TYPE_SPEC_MEDIAN_MAX_BYTES} bytes`, async () => {
  const sizes = (await typeSpecFiles()).map((f) => f.size);
  const m = median(sizes);
  assert.ok(m <= TYPE_SPEC_MEDIAN_MAX_BYTES,
    `median type spec is ${m} bytes; the budget is ${TYPE_SPEC_MEDIAN_MAX_BYTES}`);
});

test("every slug in routing.md's type index resolves to a file in references/types/", async () => {
  const routing = await fs.readFile(ROUTING, "utf-8");
  const slugs = [...routing.matchAll(/`types\/([a-z0-9-]+\.md)`/g)].map((m) => m[1]);
  assert.ok(slugs.length > 0, "no `types/<slug>.md` references found in routing.md — the regex is broken");
  for (const slug of slugs) {
    assert.ok(await fs.stat(path.join(TYPES_DIR, slug)).then(() => true, () => false),
      `routing.md's type index names types/${slug}, which does not exist`);
  }
});
