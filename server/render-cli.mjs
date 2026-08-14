#!/usr/bin/env node
// One-shot page -> PDF for automated pipelines: no running server, no browser,
// no user. Serves the page's own directory on an ephemeral loopback port (so
// relative shell/ and image references resolve, with the skill's assets as
// fallback), renders with the same headless Chromium as the server's print
// path, writes the PDF, and exits. The output path is printed on stdout —
// pipeline-friendly: `pdf=$(node render-cli.mjs page.html)`.
//
// Usage: node render-cli.mjs <page.html> [output.pdf]
//   output defaults to the page path with .pdf substituted for .html
import { promises as fs } from "node:fs";
import path from "node:path";
import { startServer } from "./server.mjs";
import { renderPdf, closeBrowser } from "./render.mjs";

const [pageArg, outArg] = process.argv.slice(2);
if (!pageArg) {
  console.error("usage: node render-cli.mjs <page.html> [output.pdf]");
  process.exit(2);
}

const pagePath = path.resolve(pageArg);
try {
  await fs.access(pagePath);
} catch {
  console.error(`render-cli: no such file: ${pagePath}`);
  process.exit(2);
}
const outPath = outArg
  ? path.resolve(outArg)
  : pagePath.replace(/\.html?$/i, "") + ".pdf";

const { url, close } = await startServer({ dir: path.dirname(pagePath), port: 0 });
try {
  const pdf = await renderPdf(`${url}/${encodeURIComponent(path.basename(pagePath))}`);
  await fs.writeFile(outPath, pdf);
  console.log(outPath);
} catch (e) {
  console.error("render-cli:", e.message || e);
  process.exitCode = 1;
} finally {
  await closeBrowser();
  await close();
}
