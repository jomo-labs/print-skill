// Paper is a fixed physical size, so the one thing a page must never do with
// content that outgrows a sheet is lose it. It used to: the sheet was a fixed
// 1056px box, the overflow spilled outside it, and paged output simply
// discarded everything past the paper edge — one PDF page, the rest gone.
//
// paginate() in shell.js makes the overflow into real sheets instead. The
// properties that matter are the ones asserted here, in order: nothing is
// lost, each sheet is exactly one printed page, the split is a runtime VIEW
// that never reaches the saved file, and it survives being re-applied to a
// DOM that already carries it — which is not a hypothetical, because the
// print pipeline re-renders the LIVE DOM.
//
//   node --test server/test/          (needs `npm install` in server/)
import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startServer } from "../server.mjs";

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "assets");

// Chromium writes the page count into the PDF's page-tree node. Cheaper and
// steadier here than pulling in a PDF parser for one integer.
function pdfPageCount(buf) {
  const m = buf.toString("latin1").match(/\/Type\s*\/Pages[\s\S]{0,200}?\/Count\s+(\d+)/);
  assert.ok(m, "PDF has no page-tree /Count");
  return Number(m[1]);
}

const PARAS = 120;

// Three shapes of overflow, because they take three different paths through
// the fitting: a flat run of blocks (nothing to descend into), one wrapper
// taller than any sheet (the recursive descent), and a single run of text
// taller than any sheet (the word-boundary cut).
const BODIES = {
  flat: Array.from({ length: PARAS }, (_, i) =>
    `<p data-i="${i}">Paragraph ${String(i).padStart(3, "0")} — lorem ipsum dolor sit amet.</p>`).join("\n"),
  wrapped: "<main>" + Array.from({ length: PARAS }, (_, i) =>
    `<div data-mp-section="notes"><p data-i="${i}">Section ${String(i).padStart(3, "0")} — lorem ipsum dolor sit amet.</p></div>`).join("\n") + "</main>",
  paragraph: `<p id="mega">${Array.from({ length: 1400 }, (_, i) => "w" + i).join(" ")}</p>`,
};

test("content that outgrows a sheet continues onto more sheets", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "print-skill-pagination-"));
  const [template, documentCss] = await Promise.all([
    fs.readFile(path.join(ASSETS, "page_template.html"), "utf-8"),
    fs.readFile(path.join(ASSETS, "shell", "document.css"), "utf-8"),
  ]);
  const assemble = (body) => template
    .replace("/* @@DOCUMENT_CSS@@ */", documentCss)
    .replace("<!-- CONTENT -->", body);

  const files = {};
  for (const [name, body] of Object.entries(BODIES)) {
    files[name] = assemble(body);
    await fs.writeFile(path.join(dir, `${name}.html`), files[name]);
  }

  const server = await startServer({ dir, port: 0 });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PRINT_SKILL_CHROMIUM ? { executablePath: process.env.PRINT_SKILL_CHROMIUM } : {}),
  });
  t.after(async () => {
    await browser.close();
    await server.close();
  });

  // One tab per shape, opened once and handed to every assertion below.
  const withPage = async (name, fn) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route("**://fonts.g*/**", (route) => route.abort());
    try {
      await page.goto(`${server.url}/${name}.html`, { waitUntil: "networkidle" });
      await fn(page);
    } finally {
      await page.close();
    }
  };

  const sheetsOf = (page) => page.evaluate(() => {
    const sheets = [...document.querySelectorAll(".page-surround > .page")];
    return {
      count: sheets.length,
      continuations: document.querySelectorAll("[data-mp-continuation]").length,
      heights: sheets.map((s) => Math.round(s.getBoundingClientRect().height)),
      overflowing: sheets.filter((s) => s.scrollHeight > s.getBoundingClientRect().height + 1).length,
    };
  });

  await t.test("the sheets are real sheets, and there is more than one", async () => {
    for (const name of Object.keys(BODIES)) {
      await withPage(name, async (page) => {
        const s = await sheetsOf(page);
        assert.ok(s.count > 1, `${name}: expected a continuation, got ${s.count} sheet(s)`);
        assert.equal(s.continuations, s.count - 1, `${name}: continuation count`);
        // Every sheet is the same fixed paper, not a box grown to fit.
        assert.deepEqual(s.heights, new Array(s.count).fill(1056), `${name}: sheet heights`);
        assert.equal(s.overflowing, 0, `${name}: a sheet still overflows`);
      });
    }
  });

  await t.test("every sheet prints as one page, and no content is dropped", async () => {
    for (const name of ["flat", "wrapped"]) {
      await withPage(name, async (page) => {
        const { count } = await sheetsOf(page);
        const pdf = await page.pdf({ format: "Letter", preferCSSPageSize: true, printBackground: true });
        assert.equal(pdfPageCount(pdf), count, `${name}: PDF pages vs sheets`);
        // The DOM is the thing under test; the PDF above proves the sheets
        // reach paper, this proves nothing fell out on the way to them.
        const placed = await page.evaluate(() => document.querySelectorAll("[data-i]").length);
        assert.equal(placed, PARAS, `${name}: blocks still in the document`);
      });
    }
  });

  await t.test("a text run too tall for any sheet is cut on a word boundary", async () => {
    await withPage("paragraph", async (page) => {
      const text = await page.evaluate(() =>
        [...document.querySelectorAll(".page-surround > .page p")].map((p) => p.textContent).join(" "));
      assert.equal(text.trim().split(/\s+/).join(" "),
        Array.from({ length: 1400 }, (_, i) => "w" + i).join(" "),
        "the words, in order, across the sheets");
    });
  });

  await t.test("a block too tall for any sheet overflows in plain sight", async () => {
    // It can be neither placed nor cut, so it gets a sheet of its own and
    // hangs off the bottom of it. Nothing is drawn to say so — a block
    // visibly crossing the paper edge is the whole message.
    await fs.writeFile(path.join(dir, "tall.html"),
      assemble(`<h1>Tall</h1><div style="height:1400px">block</div>`));
    await withPage("tall", async (page) => {
      const s = await sheetsOf(page);
      assert.equal(s.count, 2, "the tall block should still get its own sheet");
      assert.equal(s.overflowing, 1, "and should still overflow it");
    });
  });

  await t.test("the split never reaches the saved file", async () => {
    for (const name of Object.keys(BODIES)) {
      await withPage(name, async (page) => {
        const saved = await page.evaluate(() => serializeForSave());
        assert.equal(saved.match(/data-mp-continuation|data-mp-split/g), null,
          `${name}: pagination markers in the saved file`);
        // The real contract: saving a split page writes what saving the same
        // page unsplit would write, character for character.
        const unsplit = await page.evaluate(() => {
          document.body.dataset.mpPaginate = "off";
          applySize(currentPaper, currentOrientation);
          const html = serializeForSave();
          delete document.body.dataset.mpPaginate;
          applySize(currentPaper, currentOrientation);
          return html;
        });
        // data-mp-overflow is the one thing the split is ALLOWED to leave in
        // the file: the diagnostic reportFit() writes, which by definition
        // cannot be known with pagination switched off. Everything else — all
        // of the content — must match character for character.
        const strip = (s) => s.replace(/ data-mp-(paginate="off"|overflow="\d+")/g, "");
        assert.equal(strip(saved), strip(unsplit), `${name}: saved DOM differs from the unsplit one`);
      });
    }
  });

  await t.test("re-splitting an already-split DOM is a no-op", async () => {
    // What the print pipeline does: POST /render-pdf sends the LIVE DOM, so
    // the renderer loads a page that already carries continuation sheets.
    for (const name of Object.keys(BODIES)) {
      await withPage(name, async (page) => {
        const before = await sheetsOf(page);
        const live = await page.evaluate(() => "<!DOCTYPE html>\n" + document.documentElement.outerHTML);
        await fs.writeFile(path.join(dir, `${name}-live.html`), live);
        await withPage(`${name}-live`, async (again) => {
          assert.deepEqual(await sheetsOf(again), before, `${name}: re-render changed the sheets`);
        });
      });
    }
  });

  await t.test("the shell reports sheets it had to add, and stays quiet when it didn't", async () => {
    // The design half of the contract: content is never lost, but a break the
    // shell chose is a decision the generation still owes, so it has to be
    // visible rather than silently absorbed.
    for (const name of Object.keys(BODIES)) {
      await withPage(name, async (page) => {
        const { fit, attr, badge } = await page.evaluate(() => ({
          fit: window.mpFit,
          attr: document.body.dataset.mpOverflow,
          badge: (() => {
            const el = document.getElementById("mp-chrome-root").shadowRoot.getElementById("mp-live-status");
            return { shown: el.classList.contains("mp-live-error"), text: el.textContent };
          })(),
        }));
        assert.equal(fit.authored, 1, `${name}: authored sheets`);
        assert.ok(fit.rendered > 1, `${name}: rendered sheets`);
        assert.equal(attr, String(fit.rendered), `${name}: data-mp-overflow`);
        assert.ok(badge.shown, `${name}: the toolbar should say so`);
        assert.match(badge.text, /runs onto \d+ sheets/, `${name}: badge text`);
        // And it survives into the file, which is where the model reads it.
        assert.match(await page.evaluate(() => serializeForSave()),
          new RegExp(`data-mp-overflow="${fit.rendered}"`), `${name}: diagnostic not saved`);
      });
    }

    // A page that fits carries nothing and says nothing.
    await fs.writeFile(path.join(dir, "fits.html"),
      assemble(`<h1>Short</h1><p>Comfortably inside one sheet.</p>`));
    await withPage("fits", async (page) => {
      const state = await page.evaluate(() => ({
        fit: window.mpFit,
        attr: document.body.dataset.mpOverflow,
        shown: document.getElementById("mp-chrome-root")
          .shadowRoot.getElementById("mp-live-status").classList.contains("mp-live-error"),
        saved: serializeForSave(),
      }));
      assert.deepEqual(state.fit, { authored: 1, rendered: 1, overflowing: 0, clipped: 0 });
      assert.equal(state.attr, undefined, "a page that fits should carry no diagnostic");
      assert.equal(state.shown, false, "a page that fits should show no notice");
      assert.ok(!state.saved.includes("data-mp-overflow"), "diagnostic leaked into a clean file");
    });

    // Sheets the author DID lay out are not an overflow.
    const sheet = (title, n) => `<div class="page"><h1>${title}</h1>` +
      Array.from({ length: n }, (_, i) => `<p>Line ${i}</p>`).join("") + `</div>`;
    await fs.writeFile(path.join(dir, "authored.html"), assemble(sheet("One", 28) + sheet("Two", 28)));
    await withPage("authored", async (page) => {
      const state = await page.evaluate(() => ({
        fit: window.mpFit,
        attr: document.body.dataset.mpOverflow,
      }));
      assert.deepEqual(state.fit, { authored: 2, rendered: 2, overflowing: 0, clipped: 0 },
        "an authored two-sheet page should report as fitting");
      assert.equal(state.attr, undefined, "an authored two-sheet page is not an overflow");
    });
  });

  await t.test("changing paper re-splits from the authored flow", async () => {
    await withPage("flat", async (page) => {
      const counts = await page.evaluate(() => {
        const seen = [];
        for (const paper of ["letter", "half", "letter"]) {
          applySize(paper);
          seen.push(document.querySelectorAll(".page-surround > .page").length);
        }
        return seen;
      });
      // Half-letter is smaller, so it needs more sheets — and coming back to
      // letter must land on the original count, not on a split of a split.
      assert.ok(counts[1] > counts[0], `half-letter should need more sheets: ${counts.join(",")}`);
      assert.equal(counts[2], counts[0], `back to letter: ${counts.join(",")}`);
    });
  });
});
