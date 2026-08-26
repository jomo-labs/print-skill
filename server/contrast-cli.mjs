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
import { launchBrowser, guardFonts } from "./browser.mjs";
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
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  // networkidle like fit-cli: the real font has to be in place, since weight
  // and size decide which threshold applies. guardFonts bounds the font
  // fetches so an unreachable host cannot stall the load.
  await guardFonts(page);
  await page.goto(`${url}/${encodeURIComponent(path.basename(pagePath))}`,
    { waitUntil: "networkidle", timeout: 30_000 });

  const found = await page.evaluate(() => {
    const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const lum = ([r, g, b]) =>
      0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);

    // Chromium reports computed colors in whatever space the author wrote —
    // this skill's themes are all oklch() — so string-parsing rgb() misses
    // nearly everything. Let the browser's own color engine resolve it.
    // An invalid value leaves fillStyle untouched, which would silently read
    // as the previous color, so probe with two different sentinels: only a
    // value the engine actually understood lands on the same result twice.
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    const parse = (css) => {
      ctx.fillStyle = "#000000"; ctx.fillStyle = css; const a = ctx.fillStyle;
      ctx.fillStyle = "#ffffff"; ctx.fillStyle = css; const b = ctx.fillStyle;
      if (a !== b) return null;                      // not a color the engine knows
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return { rgb: [d[0], d[1], d[2]], a: d[3] / 255 };
    };
    const over = (fg, bg, a) => bg.map((c, i) => fg[i] * a + c * (1 - a));

    // Composite every translucent layer down onto paper rather than skipping
    // to the first opaque one — a 0.92-alpha ink panel is nearly black, not
    // white, and treating it as white invents failures on inverted bands.
    const backdrop = (el) => {
      const layers = [];
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const p = parse(getComputedStyle(n).backgroundColor);
        if (!p || p.a === 0) continue;
        layers.push(p);
        if (p.a >= 0.999) break;
      }
      let out = [255, 255, 255];                     // the sheet is white paper
      for (let i = layers.length - 1; i >= 0; i--) out = over(layers[i].rgb, out, layers[i].a);
      return out;
    };
    // opacity multiplies down the ancestor chain, and dims text just as surely
    // as a low-alpha color does.
    const effOpacity = (el) => {
      let o = 1;
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const v = parseFloat(getComputedStyle(n).opacity);
        if (!Number.isNaN(v)) o *= v;
      }
      return o;
    };
    const ratio = (fg, bg) => {
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      return (a + 0.05) / (b + 0.05);
    };

    // Leaf sheets only. #page is itself the sheet on a single-sheet page but a
    // container on a nested assembly, and the shell appends continuation
    // sheets as siblings — all of which carry real text that must be checked.
    const sheets = [...document.querySelectorAll(".page")]
      .filter((el) => !el.querySelector(".page"));
    if (!sheets.length) return null;

    const seen = new Map();
    for (const [sheetIndex, sheet] of sheets.entries()) {
      const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent.trim();
        if (!text) continue;
        const el = n.parentElement;
        if (!el || !el.getClientRects().length) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden") continue;
        const raw = parse(cs.color);
        const alpha = (raw ? raw.a : 1) * effOpacity(el);
        if (alpha === 0) continue;                   // invisible, not low-contrast
        const bg = backdrop(el);
        // SVG elements expose className as SVGAnimatedString, which has no
        // .split — and this skill tells the model to draw artwork inline in SVG.
        const cls = (el.getAttribute("class") || "").split(" ")[0] || "";
        const size = parseFloat(cs.fontSize);
        const weight = parseInt(cs.fontWeight, 10) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const floor = large ? 3 : 4.5;
        const r = raw ? ratio(over(raw.rgb, bg, alpha), bg) : null;
        // Key on the backdrop too: the same color passes on paper and fails on
        // an ink panel, and collapsing those hides the failure.
        const key = `${cs.color}|${alpha}|${size}|${weight}|${el.tagName}|${bg.join()}`;
        if (!seen.has(key)) {
          seen.set(key, {
            sample: text.slice(0, 42), tag: el.tagName.toLowerCase(), cls,
            color: cs.color, size, weight, large, sheet: sheetIndex,
            ratio: r === null ? null : Math.round(r * 100) / 100,
            floor, pass: r !== null && r >= floor, unparsed: r === null, count: 1,
          });
        } else seen.get(key).count++;
      }
    }
    return [...seen.values()].sort((a, b) => (a.ratio ?? -1) - (b.ratio ?? -1));
  });

  if (!found) throw new Error("no .page element — is this a generated page?");
  // An unparseable color is a finding, not a pass — it must not exit 0.
  const fails = found.filter((f) => !f.pass);

  if (asJson) {
    console.log(JSON.stringify({ ok: fails.length === 0, styles: found, failures: fails }));
  } else {
    const rows = showAll ? found : fails;
    const multi = new Set(found.map((f) => f.sheet)).size > 1;
    for (const f of rows) {
      const mark = f.unparsed ? "????" : f.pass ? "ok  " : "FAIL";
      const where = f.cls ? `${f.tag}.${f.cls}` : f.tag;
      const score = f.unparsed ? "  ????" : String(f.ratio).padStart(6);
      console.log(
        `${mark} ${score}:1  need ${f.floor}  ` +
        `${String(Math.round(f.size)).padStart(3)}px/${String(f.weight).padStart(3)}  ` +
        (multi ? `s${f.sheet} ` : "") +
        `${where.padEnd(16)} ${JSON.stringify(f.sample)}`);
    }
    if (fails.length === 0) {
      console.log(`contrast ok: ${found.length} text style${found.length === 1 ? "" : "s"} ` +
        `all clear their floor`);
    } else {
      const bad = fails.filter((f) => f.unparsed).length;
      console.error(`\n${fails.length} of ${found.length} text styles fail the ` +
        `WCAG AA floor (4.5:1 body, 3:1 large/bold)` +
        (bad ? `; ${bad} had a color this engine could not resolve (????)` : "") + ".");
      console.error("  Darken the token, or raise the size/weight so the 3:1 floor applies.");
    }
  }
  process.exitCode = fails.length === 0 ? 0 : 1;
} catch (e) {
  console.error("contrast-cli:", e.message || e);
  process.exitCode = 1;
} finally {
  // Close the server even if the browser teardown throws — startServer holds
  // an open listener, and leaking it hangs the process instead of exiting.
  try { await browser.close(); } catch { /* fall through to close the server */ }
  await close();
}
