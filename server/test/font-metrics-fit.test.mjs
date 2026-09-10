// Web fonts arrive after the first layout, and they change line wrapping —
// which is what decides how many sheets the content needs. The shell used to
// answer that question once, during boot, and never again: a page whose font
// files were still in flight was measured in FALLBACK metrics (the wrong ones,
// usually the taller ones) and split onto a sheet it did not need. Nothing
// took that sheet back, so it was still in the DOM when the PDF renderer
// printed it — a spurious, near-blank final page.
//
// Asserted here: the shell re-splits when the fonts land, and the re-split
// reaches the printed artifact rather than only the in-page fit report.
//
//   node --test server/test/          (needs `npm install` in server/)
import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer } from "../server.mjs";
import { loadPageParts, fillTemplate, launchTestBrowser, openTab } from "./helpers.mjs";

function pdfPageCount(buf) {
  const m = buf.toString("latin1").match(/\/Type\s*\/Pages[\s\S]{0,200}?\/Count\s+(\d+)/);
  assert.ok(m, "PDF has no page-tree /Count");
  return Number(m[1]);
}

// A page that fits its sheet only in its real metrics. The file itself carries
// the TALL block height, so the boot fit pass measures it without any ordering
// trick, standing in for the fallback face a page gets while its font files
// are in flight. The shorter height is layered on at the moment the fonts
// resolve — the transition a real webfont makes when it replaces a taller
// fallback, and the reason the sheet count can change after boot.
const BODY = Array.from({ length: 12 }, (_, i) =>
  `<div data-mp-section="notes" class="blk"><p>Block ${i}</p></div>`).join("\n");
const CSS_FALLBACK = `.blk { height: 120px; }`;
const CSS_LOADED = `.blk { height: 60px; }`;

// document.fonts.ready, but resolved on our cue rather than the network's, so
// the ordering under test (boot pass, then fonts, then re-split) is exact
// instead of raced. Everything else about the FontFaceSet the shell touches is
// kept: it only ever reads `.ready`.
const STUB_FONTS = () => {
  let release;
  const ready = new Promise((r) => { release = r; });
  window.__releaseFonts = () => release();
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready, status: "loading", size: 0, load: () => Promise.resolve([]) },
  });
};

test("the shell takes back a sheet it needed only in fallback metrics", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "print-skill-fontfit-"));
  const { template, documentCss } = await loadPageParts();
  await fs.writeFile(path.join(dir, "p.html"),
    fillTemplate(template, documentCss, BODY, { customCss: CSS_FALLBACK }));

  const { url, close } = await startServer({ dir, port: 0 });
  const browser = await launchTestBrowser();
  t.after(async () => {
    await browser.close();
    await close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  const page = await openTab(browser);
  await page.addInitScript(STUB_FONTS);
  await page.goto(`${url}/p.html`);
  await page.waitForFunction("!!window.mpFit");

  // Boot measured the tall (fallback) metrics and split.
  assert.equal(await page.evaluate(() => window.mpFit.rendered), 2,
    "precondition: the tall metrics should need two sheets");

  // The fonts land, and with them the real metrics. The metrics have to change
  // before the promise resolves, since resolving it is what triggers the pass.
  await page.evaluate((css) => {
    const el = document.createElement("style");
    el.textContent = css;
    document.body.appendChild(el);
    window.__releaseFonts();
  }, CSS_LOADED);
  await page.waitForFunction("window.mpFit.rendered === 1", null, { timeout: 5000 });

  assert.equal(await page.evaluate(() => document.querySelectorAll(".page-surround > .page").length), 1,
    "the extra sheet should be gone from the DOM, not just from the report");

  // The sheet count the renderer would print, from the same live DOM.
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  assert.equal(pdfPageCount(pdf), 1,
    "the re-split must reach the printed artifact, not only window.mpFit");
});
