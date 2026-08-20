#!/usr/bin/env node
// Does every piece of text on the page clear its contrast floor?
//
// The platform invariant is "WCAG AA: 4.5:1 body, 3:1 large or bold accent"
// (references/design-rules.md), and until now nothing verified it. A theme
// spec's Contrast evidence section is prose the theme author wrote about
// itself; the Part B self-check greps for banned constructs and never
// computes a ratio. So an accent that reads fine on screen at 19px can ship
// at 9px in the label font and no check objects.
//
// This walks the RENDERED text — not the token list, which would flag rule
// and hairline colors that never carry text and drown the real findings —
// and applies the threshold that actually governs each run of text, from its
// own computed size and weight.
//
// Usage: node contrast-cli.mjs <page.html> [--json] [--all]
//   --all   list every distinct text style, not just the failures
// Exit:  0  every text run clears its floor
//        1  at least one does not (or the page could not be loaded)
//        2  bad usage
import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { startServer } from "./server.mjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const showAll = args.includes("--all");
const pageArg = args.find((a) => !a.startsWith("--"));
if (!pageArg) {
  console.error("usage: node contrast-cli.mjs <page.html> [--json] [--all]");
  process.exit(2);
}
const pagePath = path.resolve(pageArg);
try {
  await fs.access(pagePath);
} catch {
  console.error(`contrast-cli: no such file: ${pagePath}`);
  process.exit(2);
}

const { url, close } = await startServer({ dir: path.dirname(pagePath), port: 0 });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PRINT_SKILL_CHROMIUM ? { executablePath: process.env.PRINT_SKILL_CHROMIUM } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  // networkidle like fit-cli: the real font has to be in place, since weight
  // and size decide which threshold applies.
  await page.goto(`${url}/${encodeURIComponent(path.basename(pagePath))}`,
    { waitUntil: "networkidle", timeout: 30_000 });

  const found = await page.evaluate(() => {
    const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const lum = ([r, g, b]) =>
      0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);
    // Chromium reports computed colors in whatever space the author wrote —
    // this skill's themes are all oklch() — so string-parsing rgb() misses
    // nearly everything. Let the browser's own color engine resolve it.
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    const parse = (css) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = css;           // invalid values leave the previous style
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return { rgb: [d[0], d[1], d[2]], a: d[3] / 255 };
    };
    // Composite over ancestors until something opaque is found; the sheet is
    // white, so an all-transparent chain resolves to paper.
    const backdrop = (el) => {
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const p = parse(getComputedStyle(n).backgroundColor);
        if (p && p.a >= 0.999) return p.rgb;
      }
      return [255, 255, 255];
    };
    const ratio = (fg, bg) => {
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      return (a + 0.05) / (b + 0.05);
    };

    const sheet = document.querySelector(".page");
    if (!sheet) return null;
    const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
    const seen = new Map();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent.trim();
      if (!text) continue;
      const el = n.parentElement;
      if (!el || !el.getClientRects().length) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.opacity === "0") continue;
      const fg = parse(cs.color);
      if (!fg) continue;
      const size = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      // WCAG "large": >=24px, or >=18.66px when bold.
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const floor = large ? 3 : 4.5;
      const r = ratio(fg.rgb, backdrop(el));
      // One row per distinct style, not per text node — the same label style
      // repeated twelve times is one finding, not twelve.
      const key = `${cs.color}|${size}|${weight}|${el.tagName}`;
      if (!seen.has(key)) {
        seen.set(key, {
          sample: text.slice(0, 42), tag: el.tagName.toLowerCase(),
          cls: (el.className || "").split(" ")[0] || "",
          color: cs.color, size, weight, large,
          ratio: Math.round(r * 100) / 100, floor, pass: r >= floor, count: 1,
        });
      } else seen.get(key).count++;
    }
    return [...seen.values()].sort((a, b) => a.ratio - b.ratio);
  });

  if (!found) throw new Error("no .page element — is this a generated page?");
  const fails = found.filter((f) => !f.pass);

  if (asJson) {
    console.log(JSON.stringify({ ok: fails.length === 0, styles: found, failures: fails }));
  } else {
    const rows = showAll ? found : fails;
    for (const f of rows) {
      const mark = f.pass ? "ok  " : "FAIL";
      const where = f.cls ? `${f.tag}.${f.cls}` : f.tag;
      console.log(
        `${mark} ${String(f.ratio).padStart(6)}:1  need ${f.floor}  ` +
        `${String(Math.round(f.size)).padStart(3)}px/${String(f.weight).padStart(3)}  ` +
        `${where.padEnd(16)} ${JSON.stringify(f.sample)}`);
    }
    if (fails.length === 0) {
      console.log(`contrast ok: ${found.length} text style${found.length === 1 ? "" : "s"} ` +
        `all clear their floor`);
    } else {
      console.error(`\n${fails.length} of ${found.length} text styles fall below the ` +
        `WCAG AA floor (4.5:1 body, 3:1 large/bold).`);
      console.error("  Darken the token, or raise the size/weight so the 3:1 floor applies.");
    }
  }
  process.exitCode = fails.length === 0 ? 0 : 1;
} catch (e) {
  console.error("contrast-cli:", e.message || e);
  process.exitCode = 1;
} finally {
  await browser.close();
  await close();
}
