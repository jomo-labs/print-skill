// Each theme spec is loaded into the model's context on every themed run, so
// its size is a per-turn cost. U15 Phase B trims each spec's §1 ("Meta &
// Philosophy") to a two/three-sentence identity statement and tightens §7
// ("Contrast evidence") to one line per accent, dropping the mood essay and
// closing rationale while keeping every token value, every per-accent
// size-clearance constraint, and every instruction the model executes.
//
// These tests pin the byte ceilings and the protected constraints so neither
// regresses. Shape follows skill-doc.test.mjs and skill-doc-themes.test.mjs:
// read the files, assert on what is there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const THEMES_DIR = path.join(ROOT, "references", "themes");
const ROUTING = path.join(ROOT, "references", "routing.md");

// Every spec file except README.md (U14's) and theme-spec-template.md
// (human-facing, never loaded at runtime).
const SPEC_MAX_BYTES = 7500;
const COMIC_MAX_BYTES = 4500;

const SPECS = ["arcade.md", "comic.md", "field-guide.md", "newspaper.md", "sports.md"];

const readSpec = (name) => fs.readFile(path.join(THEMES_DIR, name), "utf-8");

// Collapse whitespace (including the hard line-wraps markdown prose carries)
// so a protected sentence can be asserted on as one contiguous substring
// regardless of where the source file wraps it.
const flatten = (text) => text.replace(/\s+/g, " ");

test("references/themes/ has exactly the five runtime specs plus README and the template", async () => {
  const names = (await fs.readdir(THEMES_DIR)).filter((n) => n.endsWith(".md"));
  const extras = names.filter((n) => !SPECS.includes(n) && n !== "README.md" && n !== "theme-spec-template.md");
  assert.deepEqual(extras, [], `unexpected file(s) in references/themes/: ${extras.join(", ")}`);
  for (const name of SPECS) {
    assert.ok(names.includes(name), `expected references/themes/${name} to exist`);
  }
});

for (const name of SPECS) {
  const max = name === "comic.md" ? COMIC_MAX_BYTES : SPEC_MAX_BYTES;
  test(`${name} is at most ${max} bytes`, async () => {
    const { size } = await fs.stat(path.join(THEMES_DIR, name));
    assert.ok(size <= max, `${name} is ${size} bytes; the budget is ${max}`);
  });
}

test("every theme spec still has an H1 on line 1", async () => {
  for (const name of SPECS) {
    const md = await readSpec(name);
    const firstLine = md.split("\n", 1)[0];
    assert.match(firstLine, /^# Theme: /, `${name}'s first line is not an H1 theme heading: "${firstLine}"`);
  }
});

test("every theme spec keeps all seven section headings", async () => {
  for (const name of SPECS) {
    const md = await readSpec(name);
    const headings = [...md.matchAll(/^## (\d)\./gm)].map((m) => m[1]);
    assert.deepEqual(headings, ["1", "2", "3", "4", "5", "6", "7"],
      `${name} has section headings [${headings.join(", ")}], expected 1-7`);
  }
});

test("every theme spec keeps its section-to-token map: --font-display and --page-border", async () => {
  // --color-accent is not universal: three of the five themes (Comic, Arcade,
  // Sports) introduce their own theme-specific accent tokens instead of
  // binding --color-accent, per the template's "any theme-specific accent
  // tokens it introduces (--color-blue, ...)" — this was true before this
  // cut too. The bolded "Accent(s)" lead-in is the map entry that is actually
  // universal, so that is what is asserted instead.
  for (const name of SPECS) {
    const md = await readSpec(name);
    assert.ok(md.includes("--font-display"), `${name} lost --font-display`);
    assert.ok(md.includes("--page-border"), `${name} lost --page-border`);
    assert.match(md, /\*\*Accents?:?\*\*/, `${name} lost its bolded Accent(s) lead-in`);
  }
});

// One or two per-accent size-clearance sentences per spec — the numeric
// phrases found by grepping each file for px/clear/minimum/at least/no
// smaller and confirmed to still govern a physical print outcome. Matched
// against whitespace-flattened text so a mid-sentence line wrap can't break
// the assertion.
const PROTECTED_PHRASES = {
  "comic.md": [
    "used at 32px+ only, never body text",
    "clears 3:1 large/bold; callout/SFX use only",
    "Body type floor: 16px+",
  ],
  "arcade.md": [
    "10px floor", // --color-magenta safe at the --text-2xs 10px floor
    "at least 32px tall", // any write-in cell
    "printed no smaller than 0.5in", // the icon system
  ],
  "field-guide.md": [
    "40px wide", // the caption bracket's hairline rule
    "32px pitch", // annotation rules
    "14.5px", // the retuned body type floor
  ],
  "newspaper.md": [
    "24px (0.25in)", // the shell's floor on --page-frame-inset
    "16px+ for kids' content",
    "the 3:1 large/bold floor",
  ],
  "sports.md": [
    "at least 28px tall", // roster / sign-up grid write-in cells
    "no wider than 460px", // recap paragraph
    "16px floor from `comic.md`", // kids' team override
  ],
};

for (const [name, phrases] of Object.entries(PROTECTED_PHRASES)) {
  test(`${name} keeps its per-accent size-clearance constraints`, async () => {
    const flat = flatten(await readSpec(name));
    for (const phrase of phrases) {
      assert.ok(flat.includes(phrase), `${name} lost the protected phrase "${phrase}"`);
    }
  });
}

test("every accent token a theme defines in §3 still appears in its §7 (where §7 gives ratios)", async () => {
  // Not every accent gets a measured ratio (comic.md's §7 has no numeric
  // ratios at all — a compact list of ratios would be empty there), so this
  // only checks the themes whose §7 does carry per-token ratios.
  const withRatios = ["arcade.md", "field-guide.md", "sports.md"];
  for (const name of withRatios) {
    const md = await readSpec(name);
    const section7 = md.split(/^## 7\./m)[1] ?? "";
    const accentTokens = [...md.matchAll(/`(--color-(?!ink|mid|dim|ghost|rule|rule-light|pull-bg|paper|accent)\w+)`/g)]
      .map((m) => m[1]);
    const uniqueTokens = [...new Set(accentTokens)];
    assert.ok(uniqueTokens.length > 0, `${name}: no theme-specific accent tokens found to check`);
    for (const token of uniqueTokens) {
      assert.ok(section7.includes(token), `${name}'s §7 no longer mentions ${token}`);
    }
  }
});

test("routing.md's theme table still resolves to a file whose H1 names the theme", async () => {
  const routing = await fs.readFile(ROUTING, "utf-8");
  const themeSection = routing.split(/^## Theme$/m)[1];
  assert.ok(themeSection, "routing.md lost its \"## Theme\" section");
  const rows = [...themeSection.matchAll(/^\|\s*([^|]+?)\s*\|\s*`([^`]+\.md)`\s*\|/gm)]
    .filter((m) => m[1] !== "Theme"); // drop the header row
  assert.ok(rows.length >= 5, `expected at least 5 theme rows in routing.md, found ${rows.length}`);
  for (const [, themeName, file] of rows) {
    const filePath = path.join(THEMES_DIR, file);
    const md = await fs.readFile(filePath, "utf-8").catch(() => {
      throw new Error(`routing.md points at themes/${file}, which does not exist`);
    });
    const firstLine = md.split("\n", 1)[0];
    // "Field guide" from the table, "Field guide" in the H1 — compare the
    // theme name's first word, since the table name and the H1 title match
    // that far even where wording otherwise diverges (H1 adds a parenthetical).
    const firstWord = themeName.split(/\s+/)[0];
    assert.ok(firstLine.includes(firstWord),
      `themes/${file}'s H1 ("${firstLine}") does not name routing.md's theme "${themeName}"`);
  }
});
