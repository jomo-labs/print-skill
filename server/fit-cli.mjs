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
import { launchBrowser, guardFonts } from "./browser.mjs";
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
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  // networkidle, like the PDF path: fallback-font metrics wrap lines
  // differently, and line wrapping is precisely what decides the answer here.
  // guardFonts bounds the font fetches, so an unreachable font host degrades
  // to fallback metrics in seconds instead of stalling the whole load.
  await guardFonts(page);
  await page.goto(`${url}/${encodeURIComponent(path.basename(pagePath))}`,
    { waitUntil: "networkidle", timeout: 30_000 });
  // Published by reportFit() on every layout pass.
  const fit = await page.evaluate(() => window.mpFit);
  if (!fit) throw new Error("the page did not report a fit — is the shell loading?");

  // Per-sheet breakdown: what each section costs, and what the footer reserves.
  // "Does not fit" on its own says nothing about WHERE the height went; this does.
  const sheets = !wantSections ? null : await page.evaluate(() => {
    // Leaf sheets only. #page carries class="page" and IS the sheet on a
    // single-sheet page, but on a nested assembly it is the container and the
    // real sheets are inside it — counting both reports a phantom sheet whose
    // "sections" are the other sheets.
    const leaves = [...document.querySelectorAll(".page")]
      .filter((el) => !el.querySelector(".page"));
    return leaves.map((sheet, i) => {
      const cs = getComputedStyle(sheet);
      const avail = sheet.clientHeight
        - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const kids = [...sheet.children];
      const body = kids.filter((el) => el.tagName !== "FOOTER");
      const foot = kids.filter((el) => el.tagName === "FOOTER");
      const box = (el) => {
        const m = getComputedStyle(el);
        return el.getBoundingClientRect().height
          + parseFloat(m.marginTop) + parseFloat(m.marginBottom);
      };
      // Adjacent block siblings collapse their margins to max(), so summing
      // each child's box double-counts every gap. Measure the actual span
      // instead, and keep per-child boxes only as the breakdown.
      const span = (els) => {
        if (!els.length) return 0;
        const top = Math.min(...els.map((e) => e.getBoundingClientRect().top));
        const bot = Math.max(...els.map((e) => e.getBoundingClientRect().bottom));
        const first = getComputedStyle(els[0]);
        const last = getComputedStyle(els[els.length - 1]);
        return (bot - top) + parseFloat(first.marginTop) + parseFloat(last.marginBottom);
      };
      const content = span(body);
      // span() already counts the footer's own margin-top, which IS the gap
      // above it — adding the gap again double-counts it.
      const footer = foot.length ? span(foot) : 0;
      return {
        sheet: i, avail: Math.round(avail),
        content: Math.round(content), footer: Math.round(footer),
        headroom: Math.round(avail - content - footer),
        sections: body.map((el) => ({
          section: el.dataset.mpSection || "(unmarked)",
          cls: (el.getAttribute("class") || "").split(" ")[0] || "-",
          height: Math.round(box(el)),
        })),
      };
    });
  });

  const spilled = fit.rendered - fit.authored;
  const ok = spilled <= 0 && fit.overflowing === 0 && !(fit.clipped > 0);
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
    if (fit.clipped > 0) {
      console.error(
        `content is cut off inside ${fit.clipped} container${fit.clipped === 1 ? "" : "s"}; ` +
        "whatever is past the clip edge DOES NOT PRINT:");
      for (const sel of fit.clippedAt || []) console.error(`    ${sel}`);
      console.error(
        "  Shorten the content, or size the container for it — the selectors above are");
      console.error(
        "  addresses in the file's authored flow.");
    }
  }
  if (sheets && !asJson) {
    // With pagination already applied these are per-sheet; when the content was
    // meant for one sheet, the number that matters is the combined shortfall.
    if (sheets.length > fit.authored) {
      const avail = sheets[0].avail;
      const content = sheets.reduce((n, s) => n + s.content, 0);
      // Each authored sheet carries its OWN footer, so capacity is
      // (avail - footer) per sheet — not one footer against N sheets.
      const footer = Math.max(...sheets.map((s) => s.footer));
      const capacity = (avail - footer) * fit.authored;
      const cut = content - capacity;
      if (cut > 0) {
        console.log(`\nas ${fit.authored} sheet${fit.authored === 1 ? "" : "s"}: ` +
          `${content}px content vs ${capacity}px usable ` +
          `(${avail}px box less ${footer}px footer, x${fit.authored}) — cut ${cut}px`);
      }
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
