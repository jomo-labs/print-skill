// lint-cli.mjs runs Part B of references/design-rules.md by machine. These
// tests pin two things: every item catches its violation and passes its
// documented legal edge, and — the one that matters most — the linter reads
// the AUTHORED channels and never the assembled page. assets/shell/document.css
// is inlined into every page and carries a 48px blurred shadow, a forced white
// background and a radial-gradient by right; a linter pointed at the output
// would fail every build, so "clean authored CSS still assembles" is the
// regression test for the input contract, not a smoke test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LINT = path.join(HERE, "..", "lint-cli.mjs");
const ASSEMBLE = path.join(HERE, "..", "assemble-cli.mjs");

const run = (args, opts = {}) => new Promise((resolve) => {
  execFile(process.execPath, args, { maxBuffer: 8 * 1024 * 1024, ...opts },
    (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, stdout, stderr }));
});

const tmp = (t, prefix = "lint-") => {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

/** Lint an authored css string (and optionally content / a font import). */
async function lint(t, { css, content, fontImport } = {}) {
  const dir = tmp(t);
  const args = [LINT];
  if (css !== undefined) {
    const f = path.join(dir, "overrides.css");
    await fs.writeFile(f, css);
    args.push("--css", f);
  }
  if (content !== undefined) {
    const f = path.join(dir, "content.html");
    await fs.writeFile(f, content);
    args.push("--content", f);
  }
  if (fontImport !== undefined) args.push("--font-import", fontImport);
  return run(args);
}

/** The violating css fails, and the failure names the Part B item. */
const catches = (item, css) => async (t) => {
  const r = await lint(t, { css });
  assert.equal(r.code, 1, `expected a violation, got exit 0:\n${r.stdout}`);
  assert.match(r.stderr, /css lint FAILED/);
  assert.match(r.stderr, new RegExp(`item ${item},`),
    `no item ${item} finding in:\n${r.stderr}`);
};
/** The legal edge passes. */
const passes = (css) => async (t) => {
  const r = await lint(t, { css });
  assert.equal(r.code, 0, `expected clean, got:\n${r.stderr}`);
  assert.match(r.stdout, /css lint: ok/);
};

// ── One case per item, and each item's documented legal edge ───────────────

test("item 1: markup breakout", catches(1, `.x { color: var(--color-ink) } </style><script>`));
test("item 1: @import", catches(1, `@import url("https://evil.example/x.css");`));
test("item 1: url()", catches(1, `.x { background-image: url(data:image/svg+xml,x) }`));
test("item 1: a plain stylesheet passes", passes(`.x { color: var(--color-accent); }`));

test("item 2: any backslash at all", catches(2, `.x { color: var(--color-ink); /* \\ */ }`));
test("item 2: an escape-sequence smuggling attempt is caught", async (t) => {
  // `@\69mport` IS `@import` to a CSS parser, and slips straight past a text
  // check for the literal string — which is the whole reason backslashes are
  // banned outright rather than parsed.
  const r = await lint(t, { css: `@\\69mport "https://evil.example/x.css";` });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /item 2, no backslashes/);
});

test("item 3: paper moved off white", catches(3, `:root { --color-paper: #f4efe6; }`));
test("item 3: paper left white passes", passes(`:root { --color-paper: #ffffff; }`));

test("item 4: a background off the allowlist", catches(4, `.card { background: var(--color-accent); }`));
test("item 4: !important disqualifies an allowlisted value",
  catches(4, `.card { background: transparent !important; }`));
test("item 4: a gradient background-image", catches(4, `.x { background-image: linear-gradient(to top, red, blue); }`));
test("item 4: filter outside :root", catches(4, `.photo { filter: grayscale(50%); }`));
test("item 4: mix-blend-mode", catches(4, `.x { mix-blend-mode: multiply; }`));
test("item 4: an inset shadow", catches(4, `.x { box-shadow: inset 0 0 0 2px var(--color-accent); }`));
test("item 4: --image-filter defined inside :root passes",
  passes(`:root { --image-filter: none; }`));
test("item 4: allowlisted backgrounds pass",
  passes(`.a { background: var(--color-pull-bg); } .b { background-color: transparent; } ` +
         `.c { background-image: none; }`));

test("item 5: a blurred box-shadow", catches(5, `.x { box-shadow: 0 4px 12px var(--color-ink); }`));
test("item 5: a blurred text-shadow", catches(5, `h3 { text-shadow: 1px 1px 3px var(--color-ink); }`));
test("item 5: a blur in the second of two layers",
  catches(5, `.x { box-shadow: 8px 8px 0 var(--color-ink), 0 2px 6px var(--color-accent); }`));
test("item 5: a print-flat shadow passes",
  passes(`.x { box-shadow: 8px 8px 0 var(--color-accent); text-shadow: 2px 2px var(--color-ink); }`));

test("item 6: a hex color outside :root", catches(6, `.x { color: #b23a2f; }`));
test("item 6: a color function outside :root", catches(6, `.x { border-color: oklch(35% 0.12 240); }`));
test("item 6: a named color outside :root", catches(6, `.x { color: crimson; }`));
test("item 6: even white goes through a token", catches(6, `.x { color: white; }`));
test("item 6: literals inside :root are how tokens get defined",
  passes(`:root { --color-accent: oklch(35% 0.12 240); --color-rule: #333; ` +
         `--font-display: 'Bangers', cursive; }`));
test("item 6: transparent and currentColor outside :root pass",
  passes(`.x { border-color: currentColor; background: transparent; }`));
test("item 6: a var() fallback is not a literal color",
  passes(`.x { padding-top: var(--space-99, 4px); color: var(--color-ink); }`));

test("item 9: display leading with no clearance",
  catches(9, `.masthead { line-height: var(--leading-display); margin: 0; }`));
test("item 9: leading below 1.2 counts as display leading",
  catches(9, `.tight { line-height: 1.05; }`));
test("item 9: zeroing an h1's padding", catches(9, `h1 { padding-block: 0; }`));
test("item 9: the clearance declared alongside passes",
  passes(`.masthead { line-height: var(--leading-display); ` +
         `padding-block: var(--display-overhang); margin: 0; }`));
test("item 9: zeroing an h1's MARGIN is fine", passes(`h1 { margin: 0; }`));

// ── Item 7: inline styles in the content are linted too ────────────────────

test("item 7: an inline style attribute is linted, not just the stylesheet", async (t) => {
  const r = await lint(t, {
    content: `<div data-mp-section="hero" style="background: #eee; color: red">x</div>`,
  });
  assert.equal(r.code, 1, r.stdout);
  assert.match(r.stderr, /item 4,/, "the inline background is not allowlisted");
  assert.match(r.stderr, /item 6,/, "the inline literal color is caught");
  assert.match(r.stderr, /content\.html:1/, "the finding cites the content file and line");
});

test("item 7: token-only inline styles pass", async (t) => {
  const r = await lint(t, {
    content: `<div style="margin-bottom: var(--space-4); color: var(--color-accent)">x</div>`,
  });
  assert.equal(r.code, 0, r.stderr);
});

// ── One pass, every violation ──────────────────────────────────────────────

test("multiple simultaneous violations all report in one pass", async (t) => {
  const r = await lint(t, {
    css: `:root { --color-paper: beige; }\n` +
         `.card { background: var(--color-accent); box-shadow: 0 4px 12px var(--color-ink); }\n` +
         `.note { color: #b23a2f; filter: blur(2px); }\n` +
         `h1 { padding-block: 0; }\n`,
    content: `<p style="color: red">x</p>`,
  });
  assert.equal(r.code, 1);
  for (const item of [3, 4, 5, 6, 9]) {
    assert.match(r.stderr, new RegExp(`item ${item},`), `item ${item} missing from one pass`);
  }
  // Line numbers, so a single edit round can find every one of them.
  assert.match(r.stderr, /overrides\.css:1 /);
  assert.match(r.stderr, /overrides\.css:4 /);
  assert.match(r.stderr, /content\.html:1 /);
  const count = Number(r.stderr.match(/css lint FAILED: (\d+) violations/)[1]);
  assert.ok(count >= 6, `expected every finding in one pass, got ${count}`);
});

// ── The input contract ─────────────────────────────────────────────────────

test("the shell's own document.css is NOT linted: clean authored css assembles", async (t) => {
  // document.css carries a 48px blurred shadow on the sheet, `background:
  // white !important` on .page, and a radial-gradient in .halftone — items 5,
  // 4 and 4. All three are inlined into the assembled page, and all three are
  // the shell's right. Pointed at the output this build would fail; pointed at
  // the authored channels it passes.
  const shell = await fs.readFile(
    path.join(HERE, "..", "..", "assets", "shell", "document.css"), "utf-8");
  assert.match(shell, /box-shadow: 0 6px 48px/, "document.css no longer has its blurred shadow");
  assert.match(shell, /background: white !important/, "document.css no longer forces the paper");
  assert.match(shell, /radial-gradient/, "document.css no longer has its halftone gradient");

  const dir = tmp(t, "lint-asm-");
  const contentFile = path.join(dir, "content.html");
  const cssFile = path.join(dir, "overrides.css");
  await fs.writeFile(contentFile,
    `<div data-mp-section="hero"><h1>Clean</h1><p>Body text.</p></div>`);
  await fs.writeFile(cssFile,
    `:root { --color-accent: oklch(35% 0.12 240); }\n` +
    `.card { box-shadow: 8px 8px 0 var(--color-accent); }\n`);
  const r = await run([ASSEMBLE, "--content", contentFile, "--title", "Lint Clean",
                       "--css", cssFile, "--out-dir", path.join(dir, "out")]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /css lint: ok/);

  // And the proof it is the same page: linting the ASSEMBLED file would fail.
  const assembled = path.join(dir, "out", "lint-clean.html");
  const onOutput = await run([LINT, "--css", assembled]);
  assert.equal(onOutput.code, 1,
    "the assembled page really does break Part B — which is why it is never the input");
});

test("a page with no custom_css lints clean rather than erroring", async (t) => {
  const r = await lint(t, { content: `<div data-mp-section="hero"><h1>Plain</h1></div>` });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /css lint: ok/);

  const dir = tmp(t, "lint-asm-");
  const contentFile = path.join(dir, "content.html");
  await fs.writeFile(contentFile, `<div data-mp-section="hero"><h1>Plain</h1></div>`);
  const asm = await run([ASSEMBLE, "--content", contentFile, "--title", "No Css",
                         "--out-dir", path.join(dir, "out")]);
  assert.equal(asm.code, 0, asm.stderr);
  assert.match(asm.stdout, /css lint: ok/);
});

// ── The deliberate item-8 decision ─────────────────────────────────────────

test("item 8 is a WARNING, not a violation — the lenient drop is preserved", async (t) => {
  // design-rules.md item 8's own remedy is "drop the font_import and pick a
  // font from the preloaded trio", and assemble-cli has always warned-and-
  // dropped rather than failing. Hard-failing here would cost a full re-author
  // for a page that assembles correctly without the import, so lint reports it
  // and exits 0. This assertion is the record of that choice.
  const bad = await lint(t, { css: `.x { color: var(--color-ink); }`,
                              fontImport: "https://evil.example/steal.css" });
  assert.equal(bad.code, 0, "item 8 must not fail the build");
  assert.match(bad.stderr, /warning: item 8/);

  const good = await lint(t, { css: `.x { color: var(--color-ink); }`,
                               fontImport: "https://fonts.googleapis.com/css2?family=Bangers&display=swap" });
  assert.equal(good.code, 0, good.stderr);
  assert.equal(good.stderr, "", "a valid Google Fonts URL warns about nothing");
});

test("assembly still drops a bad font_import and still exits 0", async (t) => {
  const dir = tmp(t, "lint-asm-");
  const contentFile = path.join(dir, "content.html");
  await fs.writeFile(contentFile, `<div data-mp-section="hero"><h1>Font</h1></div>`);
  const r = await run([ASSEMBLE, "--content", contentFile, "--title", "Bad Font",
                       "--out-dir", path.join(dir, "out"),
                       "--font-import", "https://evil.example/steal.css"]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /font-import dropped/);
  assert.match(r.stderr, /warning: item 8/);
  const html = await fs.readFile(path.join(dir, "out", "bad-font.html"), "utf-8");
  assert.ok(!html.includes("evil.example"));
});

// ── The short-circuit ──────────────────────────────────────────────────────

test("assembly with a lint violation exits 1 before a browser is launched", async (t) => {
  const dir = tmp(t, "lint-asm-");
  const contentFile = path.join(dir, "content.html");
  const cssFile = path.join(dir, "overrides.css");
  await fs.writeFile(contentFile, `<div data-mp-section="hero"><h1>Dirty</h1></div>`);
  await fs.writeFile(cssFile, `.card { background: var(--color-accent); }`);
  const started = Date.now();
  const r = await run([ASSEMBLE, "--content", contentFile, "--title", "Lint Fail",
                       "--css", cssFile, "--out-dir", path.join(dir, "out")]);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /structural verification: ok/, "lint runs after structure, not instead");
  assert.match(r.stderr, /css lint FAILED/);
  // The browser-backed checks print these; neither may have run.
  assert.doesNotMatch(r.stdout, /fits:|does not fit/, "the fit check ran anyway");
  assert.doesNotMatch(r.stdout, /contrast/, "the contrast check ran anyway");
  assert.ok(Date.now() - started < 15000, "a Chromium launch was paid for regardless");
});

// ── Usage ──────────────────────────────────────────────────────────────────

test("--help exits 0 and names every flag; a stray argument is exit 2", async () => {
  const help = await run([LINT, "--help"]);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /usage:/);
  for (const flag of ["--css", "--content", "--font-import", "--help"]) {
    assert.ok(help.stdout.includes(flag), `--help omits ${flag}`);
  }
  const bad = await run([LINT, "--nope"]);
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /unrecognized argument\(s\): --nope/);
  const nothing = await run([LINT]);
  assert.equal(nothing.code, 2);
});
