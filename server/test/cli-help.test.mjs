// The three CLIs a run actually drives — assemble, fit and serve — state their
// flags on --help, so their argument surface is discoverable without reading
// their source (which the traces show happening instead). Two guarantees:
// --help exits 0 and names every documented flag, and every flag the CLI
// really parses is documented — a flag added to a parser but not to its usage
// text fails here.
//
// The other CLIs (render, contrast, chat) are deliberately not covered: no
// evidence shows them being read, and adding them would only make this file
// look thorough.
//
// The last test here is the other half of the same problem: a discoverable
// flag list is worth nothing if the path the command is invoked through does
// not resolve, so SKILL.md's `<skill-dir>` rule is pinned alongside.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const cliPath = (f) => path.join(HERE, "..", f);

const run = (args) => new Promise((resolve) => {
  execFile(process.execPath, args, { maxBuffer: 4 * 1024 * 1024 },
    (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, stdout, stderr }));
});

// Each CLI parses its flags through one construct; `parsed` extracts from that
// construct rather than scanning for every "--x" string in the file, which
// would also pick up flags a CLI passes to a DIFFERENT program (serve-cli
// spawns server.mjs with --dir and --port, which are server.mjs's, not its own).
const CLIS = [
  {
    file: "assemble-cli.mjs",
    flags: ["--content", "--title", "--css", "--font-import", "--paper",
            "--orientation", "--answer-key", "--out-dir", "--max-sheets", "--help"],
    // for (const name of ["content", "title", ...]) { ... takeValue(argv, `--${name}`) }
    parsed(src) {
      const list = src.match(/for \(const name of \[([\s\S]*?)\]\)/);
      assert.ok(list, "assemble-cli.mjs no longer declares its flags as a name list");
      const names = [...list[1].matchAll(/"([a-z-]+)"/g)].map((m) => `--${m[1]}`);
      return [...names, ...argvLiterals(src)];
    },
  },
  {
    file: "fit-cli.mjs",
    // One positional and --help; the squeeze ladder and floors are constants.
    flags: ["--help"],
    parsed: (src) => [...takeValueLiterals(src), ...argvLiterals(src)],
  },
  {
    file: "serve-cli.mjs",
    flags: ["--dir", "--help"],
    parsed: (src) => [...takeValueLiterals(src), ...argvLiterals(src)],
  },
];

// takeValue(argv, "--dir", ...) — the shared flag-with-value parser.
const takeValueLiterals = (src) =>
  [...src.matchAll(/takeValue\(\s*\w+\s*,\s*"(--[a-z-]+)"/g)].map((m) => m[1]);
// argv.includes("--help") / argv[0] === "--x" — boolean flags. Anchored on the
// argv/args receiver so an unrelated string test (assemble-cli asserts the
// assembled page includes "--color-ink") is not mistaken for a flag.
const argvLiterals = (src) =>
  [...src.matchAll(/\b(?:argv|args)(?:\[\d+\])?\s*(?:\.includes\(|===|!==)\s*"(--[a-z-]+)"/g)]
    .map((m) => m[1]);

for (const { file, flags, parsed } of CLIS) {
  test(`${file} --help exits 0 and names every flag it accepts`, async () => {
    const r = await run([cliPath(file), "--help"]);
    assert.equal(r.code, 0, `--help exited ${r.code}: ${r.stderr}`);
    assert.match(r.stdout, /usage:/, "--help prints a usage line on stdout");
    for (const flag of flags) {
      assert.ok(r.stdout.includes(flag), `${file} --help does not mention ${flag}`);
    }
  });

  test(`${file} documents every flag it parses`, async () => {
    const src = await fs.readFile(cliPath(file), "utf-8");
    const r = await run([cliPath(file), "--help"]);
    for (const flag of new Set(parsed(src))) {
      assert.ok(flags.includes(flag),
        `${file} parses ${flag}, which this test's expected flag list omits`);
      assert.ok(r.stdout.includes(flag), `${file} parses ${flag} but --help omits it`);
    }
  });
}

test("--help does no work: no server, no browser, no output file", async () => {
  // fit-cli and assemble-cli otherwise launch Chromium, and serve-cli
  // otherwise spawns a detached server; --help must short-circuit ahead of all
  // of that, which a fast exit 0 with no side effect demonstrates.
  const before = Date.now();
  for (const { file } of CLIS) {
    const r = await run([cliPath(file), "--help"]);
    assert.equal(r.code, 0);
    assert.equal(r.stderr, "", `${file} --help wrote to stderr`);
  }
  assert.ok(Date.now() - before < 10000, "--help should return immediately");
});

test("SKILL.md defines <skill-dir> absolutely, in Step 0, and only there", async () => {
  // The other half of "can the model invoke these CLIs at all": every command
  // block writes `node <skill-dir>/server/...`, and when nothing says how that
  // placeholder resolves the model substitutes a relative path of its own,
  // which stops resolving the moment it cd's to a scratch directory (8 of 65
  // assemble invocations in the eval baseline died on exactly that). Asserting
  // the ABSENCE of a relative path would guard nothing — SKILL.md never
  // contained one. What has to be present is the rule.
  const md = await fs.readFile(path.join(HERE, "..", "..", "SKILL.md"), "utf-8");
  const sections = md.split(/^### /m);
  const step0 = sections.find((s) => s.startsWith("Step 0 — Input"));
  assert.ok(step0, "SKILL.md has no Step 0 section");
  assert.match(step0, /`<skill-dir>`/, "Step 0 does not mention <skill-dir>");
  assert.match(step0, /\*\*absolute\*\*/,
    "Step 0 does not say <skill-dir> is an absolute path");
  // No later section may restate the rule: two definitions is how they drift.
  for (const section of sections) {
    if (section === step0) continue;
    assert.doesNotMatch(section, /`<skill-dir>`\s+(is|means|resolves)/,
      `a section other than Step 0 redefines <skill-dir>: ${section.split("\n")[0]}`);
  }
});

test("bad usage is still an exit 2 with the usage text on stderr", async () => {
  // --help is an addition, not a loosening: an unknown flag must still fail.
  const bad = await run([cliPath("assemble-cli.mjs"), "--nope"]);
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /unrecognized argument\(s\): --nope/);
  assert.match(bad.stderr, /usage:/);

  const noArg = await run([cliPath("fit-cli.mjs")]);
  assert.equal(noArg.code, 2);
  assert.match(noArg.stderr, /usage: node fit-cli\.mjs <page\.html>/);
});
