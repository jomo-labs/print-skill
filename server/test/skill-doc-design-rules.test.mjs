// U12 cuts references/design-rules.md to one statement per rule (KTD4 class
// 3, judgment-rationale): every rule, item, and lettered sub-rule survives —
// cited by number from SKILL.md, references/principles.md,
// references/marks.md, references/harness-support.md,
// references/print-fundamentals.md, the theme specs, the type specs, and
// server/lint-cli.mjs (Part B, by item number) — but the case argued for
// each rule mostly does not. These tests pin the byte budget, the rule/item
// inventory observed before the cut, every citation found by grepping the
// repo for `rule N`, `item N`, `1a`, and `Part [AB]`, and the handful of
// phrases the traces show the model executing (data-mp-section, the fill
// invariant, --display-overhang, the character-reference rule, and item 9's
// display-scale wording).
//
// Shape follows skill-doc.test.mjs: read the files, assert on what is there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const DESIGN_RULES = path.join(ROOT, "references", "design-rules.md");

const DESIGN_RULES_MAX_BYTES = 10000;

const readRules = () => fs.readFile(DESIGN_RULES, "utf-8");

// Headings and bolded lead-ins are the two things another file can cite by
// name: "## Part B — Enforced at assembly, by machine" and
// "**Empty, overflow, and underfill.**" both count.
function anchors(md) {
  const headings = [...md.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => m[1]);
  const leadIns = [...md.matchAll(/\*\*([^*\n]+?)\*\*/g)].map((m) => m[1]);
  return [...headings, ...leadIns];
}

// Every rule/item marker design-rules.md defines, read directly from the
// numbered list items ("1.", "1a.", "2.", ... in Part A) rather than
// hardcoded, so the test still catches a rule silently dropped.
function ruleMarkers(md) {
  return [...md.matchAll(/^(\d+a?)\.\s+\*\*/gm)].map((m) => m[1]);
}

// Part B's item numbers, as either a standalone "(N)" or a merged range
// "(A)-(B)" (this cut merges 3-6 into one clause, per the plan's note that
// items with a Part A counterpart need no separate enumeration).
function partBItemNumbers(md) {
  const start = md.indexOf("## Part B");
  const end = md.indexOf("## Part C");
  const partB = md.slice(start, end === -1 ? undefined : end);
  const nums = new Set();
  for (const m of partB.matchAll(/\((\d+)\)(?:-\((\d+)\))?/g)) {
    const lo = Number(m[1]);
    const hi = m[2] ? Number(m[2]) : lo;
    for (let n = lo; n <= hi; n++) nums.add(n);
  }
  return nums;
}

// Every markdown or server source file in the repo, excluding node_modules,
// .git, and design-rules.md itself — citations of design-rules.md's rules
// and items live in SKILL.md, references/*.md (including themes/ and
// types/), and server/*.mjs (lint-cli.mjs's own item numbering, and
// comments/tests that cite "design-rules.md item N").
async function repoFiles() {
  const out = [];
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (/\.(md|mjs)$/.test(entry.name) && full !== DESIGN_RULES) {
        out.push(full);
      }
    }
  }
  await walk(ROOT);
  return Promise.all(out.map(async (p) => ({
    name: path.relative(ROOT, p),
    text: await fs.readFile(p, "utf-8"),
  })));
}

// The rule/item inventory observed in design-rules.md before this cut
// (15,551 bytes, at commit b7d20bf). Every one of these must still resolve
// to something in the cut file — R4's proof that nothing was renumbered or
// dropped.
const RULE_MARKERS_BEFORE_CUT = ["1", "1a", "2", "3", "3a", "4", "5"];
const PART_B_ITEMS_BEFORE_CUT = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const HEADINGS_BEFORE_CUT = [
  "Platform invariants",
  "Part A",
  "Part B",
  "Part C",
  "Section marking",
];
// Bold lead-ins observed before the cut — each is a name another file (or a
// human) can point at. "Fix pass" and "Degrade" are Part C's; the rest are
// the platform invariants.
const LEAD_INS_BEFORE_CUT = [
  "Sheet and margin",
  "The footer eats the last ~41px",
  "Empty, overflow, and underfill",
  "Containers clip, they never overlap",
  "Contrast and type floors",
  "Tabular figures",
  "Fix pass:",
  "Degrade:",
];

test(`design-rules.md is at most ${DESIGN_RULES_MAX_BYTES} bytes`, async () => {
  const { size } = await fs.stat(DESIGN_RULES);
  assert.ok(size <= DESIGN_RULES_MAX_BYTES,
    `design-rules.md is ${size} bytes; the budget is ${DESIGN_RULES_MAX_BYTES}`);
});

test("every rule/item heading present before the cut is still present", async () => {
  const md = await readRules();
  const present = anchors(md);
  for (const heading of HEADINGS_BEFORE_CUT) {
    assert.ok(present.some((a) => a.includes(heading)),
      `heading "${heading}" is missing from design-rules.md`);
  }
  for (const leadIn of LEAD_INS_BEFORE_CUT) {
    assert.ok(present.some((a) => a.includes(leadIn)),
      `bold lead-in "${leadIn}" is missing from design-rules.md`);
  }
});

test("every Part A rule/lettered sub-rule present before the cut still resolves", async () => {
  const present = new Set(ruleMarkers(await readRules()));
  for (const marker of RULE_MARKERS_BEFORE_CUT) {
    assert.ok(present.has(marker), `Part A rule "${marker}" is missing from design-rules.md`);
  }
  assert.equal(present.size, RULE_MARKERS_BEFORE_CUT.length,
    `expected exactly ${RULE_MARKERS_BEFORE_CUT.length} Part A rules, found ${present.size}: ${[...present]}`);
});

test("every Part B item present before the cut still resolves", async () => {
  const present = partBItemNumbers(await readRules());
  for (const n of PART_B_ITEMS_BEFORE_CUT) {
    assert.ok(present.has(n), `Part B item ${n} is missing from design-rules.md`);
  }
});

test("every `rule N`/`1a` citation found across the repo resolves in design-rules.md", async () => {
  const rules = new Set(ruleMarkers(await readRules()));
  let citationsChecked = 0;
  for (const { name, text } of await repoFiles()) {
    for (const m of text.matchAll(/\brule\s+(\d+a?)\b/gi)) {
      citationsChecked++;
      assert.ok(rules.has(m[1].toLowerCase()),
        `${name} cites "rule ${m[1]}", which design-rules.md does not define`);
    }
  }
  assert.ok(citationsChecked > 0, "no `rule N` citations found at all — the regex is broken");
});

test("every `item N` citation of design-rules.md's Part B found across the repo resolves", async () => {
  const md = await readRules();
  const items = partBItemNumbers(md);
  let citationsChecked = 0;
  for (const { name, text } of await repoFiles()) {
    // Scope to files that cite item numbers as a design-rules.md/Part B
    // concept (lint-cli.mjs defines the numbering; other files cite it by
    // name), not unrelated uses of the word "item".
    if (!/design-rules\.md|Part B|lint-cli/.test(text)) continue;
    for (const m of text.matchAll(/\bitem\s+(\d+)\b/gi)) {
      citationsChecked++;
      assert.ok(items.has(Number(m[1])),
        `${name} cites "item ${m[1]}", which design-rules.md's Part B does not enumerate`);
    }
  }
  assert.ok(citationsChecked > 0, "no `item N` citations found at all — the regex is broken");
});

test("every `Part A`/`Part B`/`Part C` citation found across the repo resolves", async () => {
  const present = anchors(await readRules());
  let citationsChecked = 0;
  for (const { name, text } of await repoFiles()) {
    for (const m of text.matchAll(/\bPart\s+([ABC])\b/g)) {
      citationsChecked++;
      assert.ok(present.some((a) => a.includes(`Part ${m[1]}`)),
        `${name} cites "Part ${m[1]}", which design-rules.md has no heading for`);
    }
  }
  assert.ok(citationsChecked > 0, "no `Part [ABC]` citations found at all — the regex is broken");
});

test("rule 1a points at references/marks.md, not themes/README.md, for the mark tutorial", async () => {
  const md = await readRules();
  assert.ok(md.includes("marks.md"), "rule 1a no longer names marks.md");
  assert.ok(!md.includes("themes/README"),
    'design-rules.md still names "themes/README.md" as home to the mark tutorial');
});

test("R4/R5 phrases survive: data-mp-section, --display-overhang, the fill invariant, " +
  "the character-reference rule, and item 9's display-scale wording", async () => {
  const md = await readRules();
  // Source markdown soft-wraps at ~80 chars, so flatten whitespace before
  // matching a sentence that may cross a line break.
  const flat = md.replace(/\s+/g, " ");
  assert.ok(md.includes("data-mp-section"), "the data-mp-section rule is gone");
  assert.ok(md.includes("--display-overhang"), "the --display-overhang token is gone");
  assert.ok(md.includes("Empty, overflow, and underfill"),
    "the fill invariant's heading name changed — SKILL.md quotes it verbatim");
  assert.ok(flat.includes("the browser decodes a reference before CSS sees the value"),
    "the character-reference rule's distinctive phrase is gone");
  assert.ok(flat.includes("display-scale type") && flat.includes("var(--text-xl|2xl|3xl|4xl)"),
    "item 9's display-scale wording is gone");
  assert.ok(md.includes("padding-block"), "the padding-block clearance mechanism is gone");
  assert.ok(md.includes("overflow-clip-margin"), "the overflow-clip-margin rule is gone");
  assert.ok(md.includes(".invert"), "the .invert class rule is gone");
  assert.ok(md.includes("--color-paper"), "the --color-paper invariant is gone");
  assert.ok(md.includes("font_import"), "the font_import rule is gone");
  assert.ok(/\\\s*\(backslash\)|no `\\`/.test(md), "the backslash rule (item 2) is gone");
});

test("Part B still points at server/lint-cli.mjs", async () => {
  const md = await readRules();
  assert.ok(md.includes("lint-cli.mjs"), "Part B no longer names server/lint-cli.mjs");
});
