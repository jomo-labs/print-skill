// references/principles.md rides every run's Step 3 batch, so its size is a
// per-turn cost. This is a judgment-rationale cut (KTD4 class 3): every
// principle's instruction survives, its case for that instruction does not.
// These tests pin the byte budget, the seven headings SKILL.md and
// design-rules.md cite by number, and Principle II's imperative, which the
// plan calls out by name as required to survive whole.
//
// Shape follows skill-doc.test.mjs: read the files, assert on what is there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const SKILL = path.join(ROOT, "SKILL.md");
const DESIGN_RULES = path.join(ROOT, "references", "design-rules.md");
const PRINCIPLES = path.join(ROOT, "references", "principles.md");

const PRINCIPLES_MAX_BYTES = 3000;

// The seven numerals observed as headings in principles.md before this cut.
const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"];

const readPrinciples = () => fs.readFile(PRINCIPLES, "utf-8");

function headingNumerals(md) {
  return [...md.matchAll(/^##\s+([IVX]+)\s+—/gm)].map((m) => m[1]);
}

test(`references/principles.md is at most ${PRINCIPLES_MAX_BYTES} bytes`, async () => {
  const { size } = await fs.stat(PRINCIPLES);
  assert.ok(size <= PRINCIPLES_MAX_BYTES,
    `principles.md is ${size} bytes; the budget is ${PRINCIPLES_MAX_BYTES}`);
});

test("every principle heading from before the cut is still present with the same numeral", async () => {
  const present = headingNumerals(await readPrinciples());
  for (const numeral of NUMERALS) {
    assert.ok(present.includes(numeral),
      `Principle ${numeral} heading is missing from principles.md`);
  }
  assert.equal(present.length, NUMERALS.length,
    `expected exactly ${NUMERALS.length} principle headings, found ${present.length}`);
});

test("every `Principle <numeral>` citation in SKILL.md and design-rules.md resolves", async () => {
  const principlesNumerals = new Set(headingNumerals(await readPrinciples()));
  const citing = [
    { name: "SKILL.md", text: await fs.readFile(SKILL, "utf-8") },
    { name: "references/design-rules.md", text: await fs.readFile(DESIGN_RULES, "utf-8") },
  ];
  let citationsFound = 0;
  for (const { name, text } of citing) {
    for (const m of text.matchAll(/Principle\s+([IVX]+)\b/g)) {
      citationsFound++;
      assert.ok(principlesNumerals.has(m[1]),
        `${name} cites Principle ${m[1]}, which has no heading in principles.md`);
    }
  }
  assert.ok(citationsFound > 0, "no `Principle <numeral>` citations found at all — the regex is broken");
});

test("Principle II keeps its instruction: named typographic roles, never a per-element font", async () => {
  // Source markdown soft-wraps at ~80 chars, so flatten whitespace before
  // matching the sentence as a run-on line.
  const flat = (await readPrinciples()).replace(/\s+/g, " ");
  assert.ok(flat.includes(
    "Fill named typographic roles (display / body / label) — never freelance a font choice per element."
  ), "Principle II's imperative sentence changed or was cut");
});

test("principles.md keeps the required survival phrases", async () => {
  const md = await readPrinciples();
  assert.ok(md.includes("lead"), "Principle III's \"lead\" item language is missing");
  assert.ok(md.includes("empty state"), "Principle IV's \"empty state\" phrase is missing");
  assert.ok(/[“”‘’]/.test(md), "Principle V's curly-quote characters are missing");
  assert.ok(md.includes("Count"), "Principle VII's \"count\" instruction is missing");
  assert.ok(md.includes("typographic roles"), "Principle II's \"typographic roles\" phrase is missing");
});
