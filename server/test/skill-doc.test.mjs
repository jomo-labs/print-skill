// SKILL.md is loaded into the model's context on every run, so its size is a
// per-turn cost and its contents are what the model executes. These tests pin
// the prose facts the eval traces showed the model acting on — the squeeze
// floors, the sizing ledger, the Step 8 reminder sentences — and the pointers
// that let the cut file reach everything that moved out of it. A pointer that
// does not resolve is the worst outcome of a cut: the model follows it to
// nothing and improvises.
//
// Shape follows cli-help.test.mjs: read the files, assert on what is there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const SKILL = path.join(ROOT, "SKILL.md");
const REFS = path.join(ROOT, "references");
const FOLLOW_UP = path.join(REFS, "follow-up.md");

const SKILL_MAX_BYTES = 15500;

const readSkill = () => fs.readFile(SKILL, "utf-8");

// Every *.md directly under references/ (not the themes/ and types/ subtrees,
// whose pointers are the domain of their own units).
async function referenceFiles() {
  const names = (await fs.readdir(REFS)).filter((n) => n.endsWith(".md"));
  return Promise.all(names.map(async (n) => ({
    name: `references/${n}`,
    text: await fs.readFile(path.join(REFS, n), "utf-8"),
  })));
}

const exists = (p) => fs.stat(p).then(() => true, () => false);

// Headings and bolded lead-ins are the two things another file can point at
// by name: "### Step 3 — Author" and "**Fill the sheet.**" both count.
function anchors(md) {
  const headings = [...md.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => m[1]);
  const leadIns = [...md.matchAll(/\*\*([^*\n]+?)\*\*/g)].map((m) => m[1]);
  return [...headings, ...leadIns];
}

const count = (haystack, needle) => haystack.split(needle).length - 1;

test(`SKILL.md is at most ${SKILL_MAX_BYTES} bytes`, async () => {
  const { size } = await fs.stat(SKILL);
  assert.ok(size <= SKILL_MAX_BYTES,
    `SKILL.md is ${size} bytes; the budget is ${SKILL_MAX_BYTES}`);
});

test("every concrete <skill-dir> path in SKILL.md and references/*.md exists", async () => {
  // Paths with a further placeholder (`<type-slug>`, `<file>`) are templates
  // and cannot be resolved; .html outputs are generated. What can be checked
  // is every literal .md or .mjs the model is told to read or run.
  const files = [{ name: "SKILL.md", text: await readSkill() }, ...(await referenceFiles())];
  const seen = new Set();
  for (const { name, text } of files) {
    for (const m of text.matchAll(/<skill-dir>\/([^\s`)"'|]+)/g)) {
      const rel = m[1].replace(/[.,;:]+$/, "");
      if (/<[^>]*>/.test(rel)) continue;
      if (!/\.(md|mjs)$/.test(rel)) continue;
      seen.add(rel);
      assert.ok(await exists(path.join(ROOT, rel)),
        `${name} points at <skill-dir>/${rel}, which does not exist`);
    }
  }
  assert.ok(seen.size > 0, "no <skill-dir> paths found at all — the regex is broken");
});

test("SKILL.md tells the model what `/print fix` means", async () => {
  assert.ok((await readSkill()).includes("/print fix"),
    "the FIX button's paste has no trigger in SKILL.md");
});

test("follow-up.md carries the three moved sections", async () => {
  const md = await fs.readFile(FOLLOW_UP, "utf-8");
  for (const heading of [/^## Live mode$/m, /^## Editing an existing page$/m, /^## Headless/m]) {
    assert.match(md, heading, `references/follow-up.md lost the heading ${heading}`);
  }
});

test("SKILL.md names each moved section exactly once", async () => {
  // Once is a trigger; twice is the section growing back.
  const md = await readSkill();
  for (const name of ["Live mode", "Editing an existing page", "Headless"]) {
    assert.equal(count(md, name), 1, `"${name}" appears ${count(md, name)} times in SKILL.md`);
  }
});

test("SKILL.md keeps the squeeze floors and drops the squeeze mechanism", async () => {
  // fit-cli prints the applied percentage, never the floors; the floors are
  // how the model decided accept-vs-cut in 6 of 14 eval runs. The <style>
  // block's id is mechanism — and naming it led two runs to write their own
  // probes that stripped it to re-measure fit.
  const md = await readSkill();
  assert.ok(md.includes("75%"), "spacing floor (75%) missing");
  assert.ok(md.includes("92%"), "type floor (92%) missing");
  assert.ok(!md.includes("mp-fit-squeeze"), "squeeze mechanism (mp-fit-squeeze) crept back in");
});

test("SKILL.md keeps the Step 8 reminder sentences verbatim", async () => {
  // Reproduced word-for-word in 12 of 12 completed eval runs.
  const md = await readSkill();
  assert.ok(md.includes("double-click any text to edit it"), "first reminder changed");
  assert.ok(md.includes("Press **Edit**"), "second reminder changed");
});

test("SKILL.md no longer sends the model into theme-spec-template.md", async () => {
  assert.ok(!(await readSkill()).includes("theme-spec-template.md"),
    "the custom_css row still names the 6.5KB template as the token set");
});

test("every reference into SKILL.md lands on something still there", async () => {
  const skill = await readSkill();
  const skillAnchors = anchors(skill);
  const hasAnchor = (needle) => skillAnchors.some((a) => a.includes(needle));
  for (const { name, text } of await referenceFiles()) {
    const flat = text.replace(/\s+/g, " ");
    // "(SKILL.md Step 3)", "SKILL.md Step 0.5"
    for (const m of flat.matchAll(/SKILL\.md`?\)?\s+Step\s+(\d+(?:\.\d+)?)/g)) {
      assert.ok(hasAnchor(`Step ${m[1]} —`),
        `${name} points at SKILL.md Step ${m[1]}, which has no heading`);
    }
    // SKILL.md's "Live mode"
    for (const m of flat.matchAll(/SKILL\.md`?(?:'s)?\s+"([^"]+)"/g)) {
      assert.ok(hasAnchor(m[1]),
        `${name} quotes SKILL.md heading "${m[1]}", which is gone`);
    }
    // "the Gather step in `SKILL.md`"
    for (const m of flat.matchAll(/the (\w+) step in `?SKILL\.md`?/gi)) {
      assert.ok(skillAnchors.some((a) => /^Step \d/.test(a) && a.includes(m[1])),
        `${name} names a "${m[1]}" step in SKILL.md, which has no such heading`);
    }
  }
});
