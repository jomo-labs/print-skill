#!/usr/bin/env node
// Does the page fit the sheets it was written for? If it nearly does, make it.
//
// Where a document breaks is a design decision — which page each thing lands
// on, whether a page feels complete (references/principles.md VII). The shell
// will not let content be LOST when it outgrows its sheet (paginate() in
// shell.js continues it onto further sheets), but it chooses those breaks by
// what happened to fit, which is exactly the accident the design is meant to
// prevent. This is the check that catches that at generation time.
//
// Three outcomes, one code path:
//   - fits as authored            -> report, exit 0
//   - small miss, nothing clipped -> SQUEEZE: tighten the page's own spacing
//     tokens (and, past a point, its type tokens) until it fits, persist the
//     result into the file, re-verify, exit 0 with a one-line account
//   - big miss, or content cut off inside a container -> exit 1, with the
//     per-sheet section table (what each block costs and the px to cut), so
//     the fix needs no second measuring run
//
// The squeeze is a bounded hail mary, not a layout engine: spacing may drop
// to 75% and type to 92% of authored size — floors chosen so the worst case
// is a visibly tighter page, never an illegible one. Content that still
// doesn't fit at the floors is genuinely overfull and goes back to the
// author; content cut off inside a fixed container (clipped) is structural —
// uniform tightening preserves the container/content ratio — so it is never
// squeezed, always reported. A squeeze writes a `<style id="mp-fit-squeeze">`
// block at the end of the document (after content-overrides, so it wins the
// token cascade); re-running this check strips any previous squeeze first and
// re-derives from the authored state, so squeezes never compound.
//
// Usage: node fit-cli.mjs <page.html>
// Exit:  0  the content fits (as authored, or after a persisted squeeze)
//        1  it does not (or the page could not be loaded)
//        2  bad usage
import { promises as fs } from "node:fs";
import path from "node:path";
import { launchBrowser, guardFonts } from "./browser.mjs";
import { startServer } from "./server.mjs";

const SQUEEZE_ID = "mp-fit-squeeze";
// (spacing multiplier, type multiplier) — least aggressive first; the last
// entries are the floors.
const LADDER = [[0.9, 1], [0.8, 1], [0.75, 1], [0.75, 0.96], [0.75, 0.92]];
const UNDERFILL_FLOOR = 70; // percent — below this, reportFill warns

const pageArg = process.argv[2];
if (!pageArg || pageArg.startsWith("--") || process.argv[3]) {
  console.error("usage: node fit-cli.mjs <page.html>");
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

  // Strip any persisted squeeze and re-measure: the baseline is always the
  // authored state, so a squeeze reflects today's content, not yesterday's.
  const hadSqueeze = await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return false;
    el.remove();
    // applySize is the shell's own re-split + re-measure entry point (a
    // deliberate global — legacy pages call it from injected script lines).
    applySize(document.body.dataset.mpPaper || "letter",
              document.body.dataset.mpOrientation);
    return true;
  }, SQUEEZE_ID);

  const fit = await page.evaluate(() => window.mpFit);
  if (!fit) throw new Error("the page did not report a fit — is the shell loading?");
  const broken = (f) => f.rendered > f.authored || f.overflowing > 0 || f.clipped > 0;

  // The tokens the squeeze may scale: the document stylesheet's spacing and
  // type scales, plus the page margins. Their *computed* values (theme
  // overrides included) are read in the page; scaled copies land in the
  // squeeze block, which sits after content-overrides and wins the cascade.
  const squeeze = async (spaceK, typeK) => page.evaluate(([id, spaceK, typeK]) => {
    const docCss = document.getElementById("mp-document-css")?.textContent || "";
    const names = [...new Set(
      (docCss.match(/--(?:space-[a-z0-9]+|text-[a-z0-9]+|page-margin-[a-z]+)\s*:/g) || [])
        .map((m) => m.replace(/\s*:$/, "")))];
    const cs = getComputedStyle(document.documentElement);
    const rules = names.map((n) => {
      const v = parseFloat(cs.getPropertyValue(n));
      if (Number.isNaN(v)) return null;
      const k = n.startsWith("--text-") ? typeK : spaceK;
      return `  ${n}: ${(v * k).toFixed(2)}px;`;
    }).filter(Boolean);
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.body.appendChild(el);
    }
    el.textContent = `/* fit squeeze: spacing x${spaceK}, type x${typeK} — written by fit-cli */\n` +
      `:root {\n${rules.join("\n")}\n}`;
    applySize(document.body.dataset.mpPaper || "letter",
              document.body.dataset.mpOrientation);
    return { css: el.outerHTML, fit: window.mpFit };
  }, [SQUEEZE_ID, spaceK, typeK]);

  const persist = async (squeezeHtml) => {
    // hadSqueeze or not, rewrite from the on-disk text: strip any previous
    // block, then (when squeezing) insert the new one after the content,
    // before dynamic-page-css — later in the document than content-overrides,
    // so its :root tokens win.
    let text = await fs.readFile(pagePath, "utf-8");
    text = text.replace(new RegExp(`<style id="${SQUEEZE_ID}">[\\s\\S]*?</style>\\n?`), "");
    if (squeezeHtml) {
      text = text.replace('<style id="dynamic-page-css">', `${squeezeHtml}\n<style id="dynamic-page-css">`);
    }
    await fs.writeFile(pagePath, text);
  };

  if (!broken(fit)) {
    // Fits without help. If a stale squeeze block was in the file, the content
    // has been edited down since — remove it so the page returns to its
    // authored sizes.
    if (hadSqueeze) {
      await persist(null);
      console.log("fits without the previous squeeze — removed it; " +
        `${fit.authored} sheet${fit.authored === 1 ? "" : "s"}, as authored`);
    } else {
      console.log(`fits: ${fit.authored} sheet${fit.authored === 1 ? "" : "s"}, as authored`);
    }
    await reportFill(page);
    process.exitCode = 0;
  } else if (fit.clipped === 0) {
    let applied = null;
    for (const [spaceK, typeK] of LADDER) {
      const r = await squeeze(spaceK, typeK);
      if (!broken(r.fit)) { applied = { spaceK, typeK, ...r }; break; }
    }
    if (applied) {
      await persist(applied.css);
      const pct = (k) => `${Math.round((1 - k) * 100)}%`;
      console.log(
        `did not fit as authored (${fit.rendered > fit.authored
          ? `content ran onto ${fit.rendered} sheets`
          : "content past the paper edge"}); ` +
        `squeezed to fit: spacing −${pct(applied.spaceK)}` +
        (applied.typeK < 1 ? `, type −${pct(applied.typeK)}` : "") +
        " — persisted into the page.");
      console.log(`fits: ${applied.fit.authored} sheet${applied.fit.authored === 1 ? "" : "s"}, squeezed`);
      await reportFill(page);
      process.exitCode = 0;
    } else {
      await page.evaluate((id) => {
        document.getElementById(id)?.remove();
        applySize(document.body.dataset.mpPaper || "letter",
                  document.body.dataset.mpOrientation);
      }, SQUEEZE_ID);
      if (hadSqueeze) await persist(null);
      await reportFailure(page, fit, true);
      process.exitCode = 1;
    }
  } else {
    if (hadSqueeze) await persist(null);
    await reportFailure(page, fit, false);
    process.exitCode = 1;
  }
} catch (e) {
  console.error("fit-cli:", e.message || e);
  process.exitCode = 1;
} finally {
  await browser.close();
  await close();
}

/** Per-sheet fill, printed on every passing run. Overflow already fails
 *  loudly; without this line the tooling's whole gradient points toward
 *  "shorter", and underfill (principles.md VII) stays a judgment call the
 *  author never gets a number for — so authors hand-roll this exact
 *  measurement with their own browser scripts, or skip it and ship a
 *  half-empty sheet. Measured on the page's current state (squeeze
 *  included): content span over the space the sheet offers its content
 *  (box minus padding minus footer). A warning, never a failure — a page
 *  can be sparse on purpose, but that must survive seeing the number. */
async function reportFill(page) {
  const fills = await page.evaluate(() => {
    const leaves = [...document.querySelectorAll(".page")]
      .filter((el) => !el.querySelector(".page"));
    return leaves.map((sheet) => {
      const cs = getComputedStyle(sheet);
      const avail = sheet.clientHeight
        - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const kids = [...sheet.children];
      const span = (els) => {
        if (!els.length) return 0;
        const top = Math.min(...els.map((e) => e.getBoundingClientRect().top));
        const bot = Math.max(...els.map((e) => e.getBoundingClientRect().bottom));
        return bot - top;
      };
      const usable = avail - span(kids.filter((el) => el.tagName === "FOOTER"));
      const content = span(kids.filter((el) => el.tagName !== "FOOTER"));
      return usable > 0 ? Math.min(100, Math.round((content / usable) * 100)) : 100;
    });
  });
  console.log("fill: " + fills.map((p, i) =>
    fills.length === 1 ? `${p}%` : `sheet ${i + 1} ${p}%`).join(" · "));
  for (const [i, p] of fills.entries()) {
    if (p < UNDERFILL_FLOOR) {
      console.log(
        `sheet ${i + 1} is only ${p}% filled — underfill: scale type, spacing, or the ` +
        "functional blank areas (writing lines, boxes) up so the page feels complete " +
        "(principles.md VII), or leave it sparse as a deliberate choice.");
    }
  }
}

/** The failure report: what went wrong, then the per-sheet section table —
 *  what each marked section costs, what the footer reserves, and the px to
 *  cut — so the fix needs no second measuring run. */
async function reportFailure(page, fit, squeezeTried) {
  const spilled = fit.rendered - fit.authored;
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
      "  addresses in the file's authored flow. (Tightening cannot fix a clip: it");
    console.error(
      "  shrinks the container and its content together.)");
  }
  if (squeezeTried) {
    console.error(
      "  The squeeze floors (spacing 75%, type 92%) were not enough — this is more");
    console.error(
      "  content than the sheet holds. Cut it, or author the further sheets.");
  }

  // Per-sheet breakdown, measured at authored sizes.
  const sheets = await page.evaluate(() => {
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
      // each child's box double-counts every gap. Measure the actual span.
      const span = (els) => {
        if (!els.length) return 0;
        const top = Math.min(...els.map((e) => e.getBoundingClientRect().top));
        const bot = Math.max(...els.map((e) => e.getBoundingClientRect().bottom));
        const first = getComputedStyle(els[0]);
        const last = getComputedStyle(els[els.length - 1]);
        return (bot - top) + parseFloat(first.marginTop) + parseFloat(last.marginBottom);
      };
      const content = span(body);
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
  if (sheets.length > fit.authored) {
    const avail = sheets[0].avail;
    const content = sheets.reduce((n, s) => n + s.content, 0);
    // Each authored sheet carries its OWN footer, so capacity is
    // (avail - footer) per sheet — not one footer against N sheets.
    const footer = Math.max(...sheets.map((s) => s.footer));
    const capacity = (avail - footer) * fit.authored;
    const cut = content - capacity;
    if (cut > 0) {
      console.error(`\nas ${fit.authored} sheet${fit.authored === 1 ? "" : "s"}: ` +
        `${content}px content vs ${capacity}px usable ` +
        `(${avail}px box less ${footer}px footer, x${fit.authored}) — cut ${cut}px`);
    }
  }
  for (const s of sheets) {
    const sign = s.headroom < 0 ? "OVER by " + -s.headroom : s.headroom + " spare";
    console.error(`\nsheet ${s.sheet}: ${s.avail}px available -> ${s.content}px content ` +
                  `+ ${s.footer}px footer (${sign})`);
    for (const sec of s.sections) {
      console.error(`  ${String(sec.height).padStart(5)}px  ${sec.section}` +
                    (sec.cls !== "-" ? `  .${sec.cls}` : ""));
    }
  }
}
