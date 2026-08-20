// The step-1 assembly command lives in references/assembly.md, not in code, so
// nothing executed it until an agent followed the doc on a real machine. It was
// written with a GNU-sed-only block close (`-e 'd}'`), which BSD sed — the only
// sed on a stock macOS box — rejects at parse time. The shell truncates the
// redirect target before exec'ing sed, so the failure produced a 0-byte page and
// destroyed any existing page of the same name.
//
// This test extracts the documented command verbatim and runs it, so the doc is
// pinned to actually executing on whatever platform CI or a contributor uses.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Pull the fenced bash block that carries the document-CSS inlining command. */
function documentedAssemblyCommand() {
  const md = readFileSync(join(skillDir, "references", "assembly.md"), "utf8");
  const blocks = [...md.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]);
  const block = blocks.find((b) => b.includes("@@DOCUMENT_CSS@@"));
  assert.ok(block, "assembly.md must document the @@DOCUMENT_CSS@@ inlining command");
  return block;
}

test("the documented step-1 assembly command runs on this platform", () => {
  const outdir = mkdtempSync(join(tmpdir(), "print-skill-assembly-"));
  try {
    const script = documentedAssemblyCommand()
      .replaceAll("<skill-dir>", skillDir)
      .replaceAll("<outdir>", outdir)
      .replaceAll("<output>", "page");

    // Fails loudly on a non-zero exit rather than leaving a truncated file behind.
    execFileSync("sh", ["-e", "-c", script], { stdio: "pipe" });

    const page = join(outdir, "page.html");
    const html = readFileSync(page, "utf8");

    assert.ok(statSync(page).size > 0, "assembled page must not be empty");
    assert.ok(
      !html.includes("@@DOCUMENT_CSS@@"),
      "the @@DOCUMENT_CSS@@ marker must be consumed, not left in the page",
    );
    assert.ok(
      html.includes("--color-ink"),
      "document.css must actually be inlined into the page",
    );
    assert.ok(
      html.includes("<!-- CONTENT -->"),
      "the content anchor must survive step 1 for later insertion steps",
    );
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
});

test("the assembled page matches a direct marker substitution", () => {
  const outdir = mkdtempSync(join(tmpdir(), "print-skill-assembly-"));
  try {
    const script = documentedAssemblyCommand()
      .replaceAll("<skill-dir>", skillDir)
      .replaceAll("<outdir>", outdir)
      .replaceAll("<output>", "page");
    execFileSync("sh", ["-e", "-c", script], { stdio: "pipe" });

    const template = readFileSync(join(skillDir, "assets", "page_template.html"), "utf8");
    const css = readFileSync(join(skillDir, "assets", "shell", "document.css"), "utf8");
    const expected = template.replace("/* @@DOCUMENT_CSS@@ */\n", css);

    assert.equal(
      readFileSync(join(outdir, "page.html"), "utf8"),
      expected,
      "the documented command must replace the marker line with document.css exactly",
    );
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
});
