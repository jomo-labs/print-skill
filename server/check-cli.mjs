#!/usr/bin/env node
// One verify command for Step 6: the fit check and the contrast check on the
// same page, run concurrently, one combined verdict.
//
// The two checks are independent measurements of the same file, so nothing
// orders them — running them as parallel child processes costs the wall time
// of the slower one instead of the sum, and keeps each CLI's own contract
// (flags, output, exit codes) exactly as it is for the deep-dive runs
// (`fit-cli --sections`, `contrast-cli --all`).
//
// Usage: node check-cli.mjs <page.html>
// Exit:  0  fits as authored AND every text style clears its contrast floor
//        1  at least one check failed (each check's own report says how)
//        2  bad usage
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const pageArg = process.argv[2];
if (!pageArg || pageArg.startsWith("--")) {
  console.error("usage: node check-cli.mjs <page.html>");
  process.exit(2);
}

const run = (cli) =>
  new Promise((resolve) => {
    execFile(
      process.execPath, [path.join(HERE, cli), pageArg],
      { maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, stdout, stderr }),
    );
  });

const [fit, contrast] = await Promise.all([run("fit-cli.mjs"), run("contrast-cli.mjs")]);
for (const [label, r] of [["fit", fit], ["contrast", contrast]]) {
  if (r.stdout.trim()) process.stdout.write(r.stdout);
  if (r.stderr.trim()) process.stderr.write(r.stderr);
  if (r.code !== 0 && !r.stdout.trim() && !r.stderr.trim()) {
    console.error(`${label} check failed (exit ${r.code}) with no output`);
  }
}
process.exitCode = fit.code === 0 && contrast.code === 0 ? 0 : 1;
