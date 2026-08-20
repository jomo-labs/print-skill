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
// Usage: node fit-cli.mjs <page.html> [--json] [--sections]
//   --sections  per-sheet breakdown: what each marked section costs, what the
//               shell footer reserves, and how much headroom is left. Answers
//               "where did the height go?", which the pass/fail line cannot.
// Exit:  0  the content fits the sheets the page lays out
//        1  it does not (or the page could not be loaded)
//        2  bad usage
import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { startServer } from "./server.mjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const wantSections = args.includes("--sections");
const pageArg = args.find((a) => !a.startsWith("--"));
if (!pageArg) {
  console.error("usage: node fit-cli.mjs <page.html> [--json] [--sections]");
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

  // Per-sheet breakdown: what each section costs, and what the footer reserves.
  // "Does not fit" on its own says nothing about WHERE the height went; this does.
  const sheets = !wantSections ? null : await page.evaluate(() => {
    return [...document.querySelectorAll(".page")].map((sheet, i) => {
      const cs = getComputedStyle(sheet);
      const avail = sheet.clientHeight
        - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const box = (el) => {
        const m = getComputedStyle(el);
        return el.getBoundingClientRect().height
          + parseFloat(m.marginTop) + parseFloat(m.marginBottom);
      };
      let content = 0, footer = 0;
      const sections = [];
      for (const el of sheet.children) {
        const h = box(el);
        if (el.tagName === "FOOTER") { footer += h; continue; }
        content += h;
        sections.push({
          section: el.dataset.mpSection || "(unmarked)",
          cls: (el.className || "").split(" ")[0] || "-",
          height: Math.round(h),
        });
      }
      return {
        sheet: i, avail: Math.round(avail),
        content: Math.round(content), footer: Math.round(footer),
        headroom: Math.round(avail - content - footer), sections,
      };
    });
  });

  const spilled = fit.rendered - fit.authored;
  const ok = spilled <= 0 && fit.overflowing === 0;
  if (asJson) {
    console.log(JSON.stringify({ ...fit, ok, ...(sheets ? { sheets } : {}) }));
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
  if (sheets && !asJson) {
    // With pagination already applied these are per-sheet; when the content was
    // meant for one sheet, the number that matters is the combined shortfall.
    if (sheets.length > fit.authored) {
      const avail = sheets[0].avail;
      const content = sheets.reduce((n, s) => n + s.content, 0);
      const footer = Math.max(...sheets.map((s) => s.footer));
      console.log(`\nas ${fit.authored} sheet${fit.authored === 1 ? "" : "s"}: ` +
        `${content}px content + ${footer}px footer = ${content + footer}px ` +
        `vs ${avail * fit.authored}px available — cut ${content + footer - avail * fit.authored}px`);
    }
    for (const s of sheets) {
      const sign = s.headroom < 0 ? "OVER by " + -s.headroom : s.headroom + " spare";
      console.log(`\nsheet ${s.sheet}: ${s.avail}px available -> ${s.content}px content ` +
                  `+ ${s.footer}px footer (${sign})`);
      for (const sec of s.sections) {
        console.log(`  ${String(sec.height).padStart(5)}px  ${sec.section}` +
                    (sec.cls !== "-" ? `  .${sec.cls}` : ""));
      }
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
