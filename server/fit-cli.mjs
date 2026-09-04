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
// Underfill floors, both in percent, both warn-only (see reportFill).
// HEIGHT is how far down the sheet the content reaches; INK is how much of
// that space it covers. The ink floor is calibrated against measured pages
// rather than chosen: a packed single-column article and a week-grid chore
// chart both land near 60, a two-column news page near 40, and the loosely
// set pages this check exists to catch cluster in the low 20s — so 30
// separates them with room on both sides. (Ink is measured on em boxes, so
// the document stylesheet's body leading does not move it.)
//
// Below a floor the report adds ONE short line naming the condition and
// nothing else: the remedies live in design-rules.md, along with the rule
// that bounds how many times a page is reworked for fill. A check that
// coaches on every pass is a check that gets a rewrite on every pass.
const HEIGHT_FLOOR = 70;
const INK_FLOOR = 30;

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
  // Web-font metrics decide line wrapping and so decide the sheet count; the
  // shell runs its own fit pass when they settle. Wait for that here too, or
  // a page that needs no squeeze at all gets its verdict read off the
  // fallback-metrics pass.
  await page.evaluate(() => document.fonts?.ready?.then(() => {}));

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
  // type scales, plus the page margins. Read ONCE, here, while the page is in
  // its authored state (the strip above has already removed any persisted
  // squeeze) — theme overrides in #content-overrides included, since these are
  // computed values. Reading them inside the ladder instead would read the
  // PREVIOUS rung's squeeze block, so the factors would multiply rather than
  // replace: [0.9, 0.8, 0.75] would land on 0.54, a −46% squeeze reported as
  // −25%. Every rung must scale this fixed baseline.
  const baseline = await page.evaluate(() => {
    const docCss = document.getElementById("mp-document-css")?.textContent || "";
    const names = [...new Set(
      (docCss.match(/--(?:space-[a-z0-9]+|text-[a-z0-9]+|page-margin-[a-z]+)\s*:/g) || [])
        .map((m) => m.replace(/\s*:$/, "")))];
    const cs = getComputedStyle(document.documentElement);
    return names
      .map((n) => [n, parseFloat(cs.getPropertyValue(n))])
      .filter(([, v]) => !Number.isNaN(v));
  });

  // Scaled copies land in the squeeze block, which sits after
  // content-overrides and wins the cascade.
  const squeeze = async (spaceK, typeK) => page.evaluate(([id, spaceK, typeK, baseline]) => {
    const rules = baseline.map(([n, v]) => {
      const k = n.startsWith("--text-") ? typeK : spaceK;
      return `  ${n}: ${(v * k).toFixed(2)}px;`;
    });
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
  }, [SQUEEZE_ID, spaceK, typeK, baseline]);

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

  // The verdict this tool reports is a promise about the FILE, so take the
  // deciding measurement on the file: reload it and let it paginate from
  // scratch, the way the PDF renderer and the user's tab will. Everything
  // above is measured on a DOM that has been re-split in place, and an
  // in-place re-split can disagree with a fresh load — that gap is exactly
  // how a load-time pagination race reaches a PDF as a spurious extra sheet
  // while the check still says "fits". Fonts are awaited because they move
  // the answer (see shell.js's fit pass on document.fonts.ready).
  const verifyOnDisk = async () => {
    await page.reload({ waitUntil: "networkidle", timeout: 30_000 });
    await page.evaluate(() => document.fonts?.ready?.then(() => {}));
    return page.evaluate(() => window.mpFit);
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
      const onDisk = await verifyOnDisk();
      if (broken(onDisk)) {
        // The squeeze measured as enough in the DOM but the persisted file
        // does not agree. Take the squeeze back out rather than leave the
        // author a page that is both tightened and still broken, and fail.
        await persist(null);
        console.error(
          "the squeeze measured as enough in place, but the persisted page " +
          "does not fit on a fresh load — squeeze removed.");
        await reportFailure(page, await verifyOnDisk(), true);
        process.exitCode = 1;
      } else {
        const pct = (k) => `${Math.round((1 - k) * 100)}%`;
        console.log(
          `did not fit as authored (${fit.rendered > fit.authored
            ? `content ran onto ${fit.rendered} sheets`
            : "content past the paper edge"}); ` +
          `squeezed to fit: spacing −${pct(applied.spaceK)}` +
          (applied.typeK < 1 ? `, type −${pct(applied.typeK)}` : "") +
          " — persisted into the page.");
        console.log(`fits: ${onDisk.authored} sheet${onDisk.authored === 1 ? "" : "s"}, squeezed`);
        await reportFill(page);
        process.exitCode = 0;
      }
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
 *  half-empty sheet.
 *
 *  Two numbers, because one of them is a lie on its own. HEIGHT is the
 *  content's vertical span over the space the sheet offers it (box minus
 *  padding minus footer): does the content reach the bottom. INK is the
 *  share of that space something actually covers: is it there when it
 *  arrives. Height alone cannot tell a dense page from a sparse one
 *  stretched to the same extent, and it points the wrong way while it does
 *  — adding vertical spacing raises it, so an author reading only that
 *  number is told to spread the page out further, which is the underfill
 *  this check exists to catch. Ink is invariant to whitespace: it moves only
 *  when content does.
 *
 *  Ink is measured DOM-side, not rasterised — glyph bands (each text line's
 *  rects reduced to the em box, so loose leading cannot inflate the number)
 *  plus what the boxes paint: a fill or an image covers its rect, a rule its
 *  stroke, and an empty bordered box its whole area — a chore chart's cells
 *  are functional blank areas (principles.md VII), so a page of them is full
 *  even though almost no toner lands inside them. A bordered box that holds
 *  other elements is a wrapper rather than a blank, and contributes only the
 *  strokes it prints.
 *
 *  Measured on the page's current state, squeeze included. Warnings, never
 *  failures — a page can be sparse on purpose, but that must survive seeing
 *  the number. The warning names the condition and points at the rule; it
 *  does not prescribe the fix (see the floors above for why). */
async function reportFill(page) {
  const fills = await page.evaluate(() => {
    // Coverage is accumulated into a coarse grid rather than a rect union:
    // overlapping boxes (a bordered table over its own text) must count once,
    // and 4px cells over a letter content box is ~37k of them — exact enough
    // at percent resolution, and cheap.
    const CELL = 4;
    const leaves = [...document.querySelectorAll(".page")]
      .filter((el) => !el.querySelector(".page"));
    return leaves.map((sheet) => {
      const cs = getComputedStyle(sheet);
      const box = sheet.getBoundingClientRect();
      const padT = parseFloat(cs.paddingTop), padB = parseFloat(cs.paddingBottom);
      const padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight);
      const kids = [...sheet.children];
      const span = (els) => {
        if (!els.length) return 0;
        const top = Math.min(...els.map((e) => e.getBoundingClientRect().top));
        const bot = Math.max(...els.map((e) => e.getBoundingClientRect().bottom));
        return bot - top;
      };
      const footers = kids.filter((el) => el.tagName === "FOOTER");
      const usableH = sheet.clientHeight - padT - padB - span(footers);
      const usableW = sheet.clientWidth - padL - padR;
      const content = span(kids.filter((el) => el.tagName !== "FOOTER"));
      const height = usableH > 0
        ? Math.min(100, Math.round((content / usableH) * 100)) : 100;
      if (usableH <= 0 || usableW <= 0) return { height, ink: 100 };

      const area = { x: box.left + padL, y: box.top + padT, w: usableW, h: usableH };
      const cols = Math.ceil(area.w / CELL), rows = Math.ceil(area.h / CELL);
      const grid = new Uint8Array(cols * rows);
      const mark = (left, top, right, bottom) => {
        const x0 = Math.max(0, Math.floor((left - area.x) / CELL));
        const x1 = Math.min(cols - 1, Math.floor((right - area.x) / CELL));
        const y0 = Math.max(0, Math.floor((top - area.y) / CELL));
        const y1 = Math.min(rows - 1, Math.floor((bottom - area.y) / CELL));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y * cols + x] = 1;
      };
      // The sheet's own background is paper, not ink; a child repeating it
      // (a white band over white) is not coverage either.
      const paper = cs.backgroundColor;
      const opaque = (c) => c && c !== "transparent" && !/,\s*0\s*\)$/.test(c);
      const fills = (el, s) =>
        /^(IMG|SVG|CANVAS)$/.test(el.tagName) ||
        s.backgroundImage !== "none" ||
        (opaque(s.backgroundColor) && s.backgroundColor !== paper);
      const edges = (el, s) => {
        const sides = [];
        for (const side of ["Top", "Right", "Bottom", "Left"]) {
          const w = parseFloat(s[`border${side}Width`]);
          if (w > 0 && s[`border${side}Style`] !== "none" &&
              opaque(s[`border${side}Color`])) sides.push([side.toLowerCase(), w]);
        }
        return sides;
      };
      // A bordered box counts as covered when it is a box you write IN — a
      // chore chart's empty cells are functional blank areas (principles.md
      // VII) and the page of them is full. A bordered box with element
      // children is a wrapper, not a blank: its own contribution is the four
      // strokes it prints, and what it holds is counted on its own terms.
      // Without that split, one hairline div around the content would report
      // any page, however empty, as completely covered.
      const markBox = (el, s) => {
        const r = el.getBoundingClientRect();
        if (fills(el, s) || el.tagName === "HR") {
          mark(r.left, r.top, r.right, r.bottom);
          return;
        }
        const sides = edges(el, s);
        if (!sides.length) return;
        if (!el.firstElementChild) {
          mark(r.left, r.top, r.right, r.bottom);
          return;
        }
        for (const [side, w] of sides) {
          if (side === "top") mark(r.left, r.top, r.right, r.top + w);
          else if (side === "bottom") mark(r.left, r.bottom - w, r.right, r.bottom);
          else if (side === "left") mark(r.left, r.top, r.left + w, r.bottom);
          else mark(r.right - w, r.top, r.right, r.bottom);
        }
      };
      const walk = (node) => {
        for (const child of node.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) {
            if (!child.data.trim()) continue;
            // Line rects are line boxes — leading included. Reduced to the em
            // box around each line's centre so leading changes the page's
            // extent (height, above) without moving its ink.
            const em = parseFloat(getComputedStyle(child.parentElement).fontSize);
            const range = document.createRange();
            range.selectNodeContents(child);
            for (const r of range.getClientRects()) {
              const mid = (r.top + r.bottom) / 2;
              mark(r.left, mid - em / 2, r.right, mid + em / 2);
            }
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            if (child.tagName === "FOOTER" && child.parentElement === sheet) continue;
            const s = getComputedStyle(child);
            if (s.display === "none" || s.visibility === "hidden") continue;
            markBox(child, s);
            walk(child);
          }
        }
      };
      walk(sheet);
      let covered = 0;
      for (const v of grid) covered += v;
      return { height, ink: Math.min(100, Math.round((covered / grid.length) * 100)) };
    });
  });
  console.log("fill: " + fills.map((f, i) =>
    (fills.length === 1 ? "" : `sheet ${i + 1} `) + `${f.height}% height, ${f.ink}% ink`)
    .join(" · "));
  for (const [i, f] of fills.entries()) {
    const sheet = fills.length === 1 ? "the sheet" : `sheet ${i + 1}`;
    if (f.height < HEIGHT_FLOOR) {
      console.log(`underfill: ${sheet} stops short, at ${f.height}% of its height ` +
        "(design-rules.md — one fill pass at most)");
    } else if (f.ink < INK_FLOOR) {
      console.log(`underfill: ${sheet} is stretched — ${f.height}% height on ${f.ink}% ink ` +
        "(design-rules.md — one fill pass at most)");
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
