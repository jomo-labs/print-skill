// U18 gives the on-demand references (assembly.md, harness-support.md,
// print-fundamentals.md, and follow-up.md — created by U11) the same
// essay-vs-rule pass SKILL.md already got. None of these four sit on the
// batched path, so there is no byte ceiling here — what has to hold is what
// R4 asks of every cut: a pointer into one of these files still resolves,
// and the rules the file owns still survive as statements.
//
// Shape follows skill-doc.test.mjs: read the files, assert on what is there.
// Two other agents are concurrently cutting references/themes/README.md and
// references/types/*.md with their own test files — this file is scoped to
// the four files U18 owns and never reads those trees for cuts of its own,
// only (incidentally, via allMarkdownFiles) to find pointers those files make
// into the four files this unit owns.
import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const SKILL = path.join(ROOT, "SKILL.md");
const REFS = path.join(ROOT, "references");

const ASSEMBLY = path.join(REFS, "assembly.md");
const HARNESS = path.join(REFS, "harness-support.md");
const FUNDAMENTALS = path.join(REFS, "print-fundamentals.md");
const FOLLOW_UP = path.join(REFS, "follow-up.md");

const readText = (p) => fs.readFile(p, "utf-8");

// SKILL.md plus every *.md under references/, recursively — a pointer at one
// of our four files can live in themes/ or types/ just as easily as at the
// top level (references/types/worksheet.md -> assembly.md is a real case).
async function allMarkdownFiles() {
  const out = [{ name: "SKILL.md", path: SKILL }];
  async function walk(dir, relPrefix) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = `${relPrefix}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(full, rel);
      } else if (entry.name.endsWith(".md")) {
        out.push({ name: rel, path: full });
      }
    }
  }
  await walk(REFS, "references");
  return Promise.all(out.map(async (f) => ({ name: f.name, text: await readText(f.path) })));
}

// Headings and bolded lead-ins are the two things another file can cite by
// name: "### Step 3 — Author" and "**Fill the sheet.**" both count.
function anchors(md) {
  const headings = [...md.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => m[1]);
  const leadIns = [...md.matchAll(/\*\*([^*\n]+?)\*\*/g)].map((m) => m[1]);
  return [...headings, ...leadIns];
}

const TARGET_FILES = [
  { file: "assembly.md", path: ASSEMBLY },
  { file: "harness-support.md", path: HARNESS },
  { file: "print-fundamentals.md", path: FUNDAMENTALS },
  { file: "follow-up.md", path: FOLLOW_UP },
];

test("every quoted-heading pointer at the four U18 files still resolves", async () => {
  const files = await allMarkdownFiles();
  const targetAnchors = {};
  for (const { file, path: p } of TARGET_FILES) {
    targetAnchors[file] = anchors(await readText(p));
  }

  let citationsChecked = 0;
  for (const { name, text } of files) {
    const flat = text.replace(/\s+/g, " ");
    for (const { file } of TARGET_FILES) {
      const escaped = file.replace(/\./g, "\\.");
      // Every place the filename is written (with or without a
      // `references/` prefix, with or without surrounding backticks).
      const mentionRe = new RegExp("`?(?:references/)?" + escaped + "`?", "g");
      for (const mention of flat.matchAll(mentionRe)) {
        // A quoted heading can sit right after the filename ("file.md",
        // "Heading" — and, for a two-heading sentence, a second quote a
        // little further along) or right before it (read "Heading" in
        // `file.md`). A 100-char window either side catches both shapes
        // without reaching into an unrelated sentence.
        const start = Math.max(0, mention.index - 100);
        const end = Math.min(flat.length, mention.index + mention[0].length + 100);
        const window = flat.slice(start, end);
        for (const q of window.matchAll(/"([^"]+)"/g)) {
          citationsChecked++;
          const heading = q[1];
          const found = targetAnchors[file].some((a) => a.includes(heading));
          assert.ok(found,
            `${name} points at ${file} heading "${heading}", which does not exist there`);
        }
      }
    }
  }
  assert.ok(citationsChecked > 0, "no quoted-heading citations found at all — the regex is broken");
});

test("harness-support.md's three Parts are still named Part 1/2/3, matching every pointer at them", async () => {
  const files = await allMarkdownFiles();
  const harnessAnchors = anchors(await readText(HARNESS));
  let citationsChecked = 0;
  for (const { name, text } of files) {
    const flat = text.replace(/\s+/g, " ");
    for (const m of flat.matchAll(/harness-support\.md`?\s+Part\s+(\d)/g)) {
      citationsChecked++;
      assert.ok(harnessAnchors.some((a) => a.includes(`Part ${m[1]} —`)),
        `${name} points at harness-support.md Part ${m[1]}, which has no such heading`);
    }
  }
  assert.ok(citationsChecked > 0, "no Part-N citations of harness-support.md found — the regex is broken");
});

test("assembly.md keeps the anchors an in-place edit needs", async () => {
  const md = await readText(ASSEMBLY);
  assert.ok(md.includes('id="content-overrides"'), "the content-overrides anchor is gone");
  assert.ok(md.includes('class="page"'), 'the <div class="page"> anchor is gone');
  assert.ok(md.includes("@page"), "the @page rule shape is gone");
  assert.ok(md.includes("data-mp-"), "the <body> data-mp- attributes are gone");
});

test("harness-support.md keeps the loopback rule and the image-backend rule", async () => {
  const md = await readText(HARNESS);
  assert.ok(/127\.0\.0\.1|loopback/.test(md), "the loopback-reachability rule is gone");
  assert.ok(/backend/.test(md), "the image-backend rule is gone");
});

test('follow-up.md has no dangling pointer to "A fit problem arrives" or "Handling a message"', async () => {
  const md = await readText(FOLLOW_UP);
  for (const phrase of ["A fit problem arrives", "Handling a message"]) {
    if (md.includes(phrase)) {
      // Acceptable only if the phrase is itself a current heading here —
      // not a leftover pointer at a heading that was renamed or moved away.
      const isRealHeading = new RegExp(`^#{1,6}\\s+${phrase}\\s*$`, "m").test(md);
      assert.ok(isRealHeading,
        `follow-up.md still references "${phrase}", which is not a heading in this file`);
    }
  }
});

test("follow-up.md still carries the three headings U11 moved into it", async () => {
  const md = await readText(FOLLOW_UP);
  for (const heading of [/^## Live mode$/m, /^## Editing an existing page$/m, /^## Headless/m]) {
    assert.match(md, heading, `references/follow-up.md lost the heading ${heading}`);
  }
});
