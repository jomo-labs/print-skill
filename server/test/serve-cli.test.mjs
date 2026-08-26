// serve-cli.mjs collapses Step 7's probe / reuse / start sequence into one
// command. The contract: it serves <cwd>/out by default (never the cwd's own
// stray html files), reuses an existing server for the same directory instead
// of starting a duplicate, and the server it starts outlives the command.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "serve-cli.mjs");
const run = promisify(execFile);

test("serves out/ by default, reuses on the second call, survives exit", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "serve-"));
  await fs.mkdir(path.join(dir, "out"));
  // a stray channel file in cwd must NOT become the served root
  await fs.writeFile(path.join(dir, "content.html"), "<p>channel scratch</p>");
  await fs.writeFile(path.join(dir, "out", "page.html"),
    "<!DOCTYPE html><html><head></head><body><div class='page' id='page'></div></body></html>");

  const first = await run(process.execPath, [CLI], { cwd: dir });
  const url = first.stdout.split("\n")[0].trim();
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.ok(first.stdout.includes(path.join(dir, "out")), "served root is out/");
  t.after(async () => {
    // stop the detached server this test started
    const port = Number(url.split(":")[2]);
    try {
      const h = await fetch(`${url}/healthz`).then((r) => r.json());
      if (h.name === "print-skill-server") {
        const { execSync } = await import("node:child_process");
        execSync(`pkill -f "server.mjs --dir ${dir}" || true`);
      }
    } catch { /* already gone */ }
    rmSync(dir, { recursive: true, force: true });
  });

  // the server outlives the CLI process
  const health = await fetch(`${url}/healthz`).then((r) => r.json());
  assert.equal(health.name, "print-skill-server");
  assert.ok((await fetch(`${url}/page.html`)).ok, "page served");

  // second invocation reuses rather than starting a second server
  const second = await run(process.execPath, [CLI], { cwd: dir });
  assert.equal(second.stdout.split("\n")[0].trim(), url, "same URL on reuse");
});

test("refuses a root inside the skill install", async () => {
  await assert.rejects(
    run(process.execPath, [CLI, "--dir", path.join(HERE, "..")]),
    (e) => /refusing to serve/.test(e.stderr),
  );
});
