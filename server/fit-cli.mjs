#!/usr/bin/env node
// Does the page fit the sheets it was written for?
//
// Where a document breaks is a design decision — which page each thing lands
// on, whether a page feels complete (references/principles.md VII). The shell
// will not let content be LOST when it outgrows its sheet (paginate() in
// shell.js continues it onto further sheets), but it chooses those breaks by
// what happened to fit, which is exactly the accident the design is meant to
// prevent. This is the check that catches that at generation time, while the
// content is still yours to shorten or lay out.
//
// It loads the page the same way the browser and the PDF renderer do — same
// server, same headless Chromium, same shell — and reports what the shell had
// to do, without writing anything.
//
// Usage: node fit-cli.mjs <page.html> [--json]
// Exit:  0  the content fits the sheets the page lays out
//        1  it does not (or the page could not be loaded)
//        2  bad usage
import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { startServer } from "./server.mjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const pageArg = args.find((a) => !a.startsWith("--"));
if (!pageArg) {
  console.error("usage: node fit-cli.mjs <page.html> [--json]");
  process.exit(2);
}
const pagePath = path.resolve(pageArg);
try {
  await fs.access(pagePath);
} catch {
  console.error(`fit-cli: no such file: ${pagePath}`);
  process.exit(2);
}

const { url, close } = await startServer({ dir: path.dirname(pagePath), port: 0 });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PRINT_SKILL_CHROMIUM ? { executablePath: process.env.PRINT_SKILL_CHROMIUM } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  // networkidle, like the PDF path: fallback-font metrics wrap lines
  // differently, and line wrapping is precisely what decides the answer here.
  await page.goto(`${url}/${encodeURIComponent(path.basename(pagePath))}`,
    { waitUntil: "networkidle", timeout: 30_000 });
  // Published by reportFit() on every layout pass.
  const fit = await page.evaluate(() => window.mpFit);
  if (!fit) throw new Error("the page did not report a fit — is the shell loading?");

  const spilled = fit.rendered - fit.authored;
  const ok = spilled <= 0 && fit.overflowing === 0;
  if (asJson) {
    console.log(JSON.stringify({ ...fit, ok }));
  } else if (ok) {
    console.log(`fits: ${fit.authored} sheet${fit.authored === 1 ? "" : "s"}, as authored`);
  } else {
    if (spilled > 0) {
      console.error(
        `does not fit: authored ${fit.authored} sheet${fit.authored === 1 ? "" : "s"}, ` +
        `content needs ${fit.rendered}.`);
      console.error(
        "  Nothing is lost — the extra sheets print — but the breaks fall where the");
      console.error(
        "  content ran out of room. Shorten it to fit, or lay the further sheets out.");
    }
    if (fit.overflowing > 0) {
      console.error(
        `${fit.overflowing} sheet${fit.overflowing === 1 ? " has" : "s have"} content too tall ` +
        "to place on any sheet; it hangs past the paper edge and PRINTS CLIPPED.");
    }
  }
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  console.error("fit-cli:", e.message || e);
  process.exitCode = 1;
} finally {
  await browser.close();
  await close();
}
