// Display type paints outside its own line box. At --leading-display the line
// box is tighter than the face's content area, so a heading's descenders (and
// at tight leading its ascenders) hang past its border box — and every
// structural container around it clips at its edge. Something has to hold
// that ink clear, and for a while the something was the 6px
// overflow-clip-margin: a fixed length, spent in full by a themed 80px
// heading at tight leading, so the g of a masthead printed sheared while the
// fit check reported the page as fitting. It cannot see this: the detector
// measures border boxes, and the ink that gets cut is outside the box it
// measures.
//
// So the clearance comes from layout now — --display-overhang, carried as
// padding on h1/h2 — and that is what this file pins: ink inside the
// heading's own border box at every leading a theme can set, with the clip
// margin taken away entirely, which is the only honest way to prove layout is
// what is holding it. Ink is read from the resolved face's own metrics
// (canvas TextMetrics), so the assertions hold whether the real display face
// arrived or the page fell back — the measured calibration behind the token's
// constant lives in document.css.
//
//   node --test server/test/          (needs `npm install` in server/)
import test from "node:test";
import assert from "node:assert/strict";
import { launchBrowser, guardFonts } from "../browser.mjs";
import { loadPageParts, fillTemplate } from "./helpers.mjs";

// The shape that reported this: a masthead heading, styled by generated CSS
// that zeroes the margin to close up the composition. Nothing here is wrong —
// the padding is what has to survive it.
const BODY = `
<div data-mp-section="header" id="masthead">
  <h1 class="brief-title" id="title">Morning gjpqy</h1>
</div>`;

const generated = ({ size, leading, clipMargin }) => `
  :root { --leading-display: ${leading}; }
  .brief-title { font-family: var(--font-display); font-size: ${size}px;
    line-height: var(--leading-display); margin: 0; }
  ${clipMargin === undefined ? "" : `#masthead { overflow-clip-margin: ${clipMargin}; }`}`;

// Where the heading's ink falls, against two edges: its own border box (what
// the fix promises) and the container's clip edge (what actually cuts).
// Positive = past the edge.
const MEASURE = async () => {
  const h1 = document.getElementById("title");
  const box = document.getElementById("masthead");
  const cs = getComputedStyle(h1);
  const font = `${cs.fontWeight} ${parseFloat(cs.fontSize)}px ${cs.fontFamily}`;
  await document.fonts.load(font, h1.textContent);
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.font = font;
  const m = ctx.measureText(h1.textContent);
  // The content area the line box is centred on, and the half-leading that
  // falls outside it when the leading is tighter than the face.
  const half = (parseFloat(cs.lineHeight)
    - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2;
  const padTop = parseFloat(cs.paddingTop), padBottom = parseFloat(cs.paddingBottom);
  const r = h1.getBoundingClientRect();
  const inkBottom = r.bottom - padBottom + (m.actualBoundingBoxDescent - m.fontBoundingBoxDescent - half);
  const inkTop = r.top + padTop - (m.actualBoundingBoxAscent - m.fontBoundingBoxAscent - half);

  const bcs = getComputedStyle(box), br = box.getBoundingClientRect();
  const slack = bcs.overflowY === "clip" ? parseFloat(bcs.overflowClipMargin) || 0 : 0;
  return {
    padTop, padBottom,
    belowOwnBox: inkBottom - r.bottom,
    aboveOwnBox: r.top - inkTop,
    belowClipEdge: inkBottom - (br.bottom - parseFloat(bcs.borderBottomWidth) + slack),
    aboveClipEdge: (br.top + parseFloat(bcs.borderTopWidth) - slack) - inkTop,
  };
};

// A tenth of a px of tolerance: the metrics are read back through computed
// style and TextMetrics, both of which round, and a tenth of a px of ink is
// not a sheared glyph.
const EPS = 0.1;

// The page needs no shell: this is document.css's own contract, and the only
// remote thing on the page is the font trio (guarded, so an offline run
// measures the fallback face and the assertions still hold).
async function open(browser, parts, opts) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await guardFonts(page);
  await page.setContent(fillTemplate(parts.template, parts.documentCss, BODY,
    { customCss: generated(opts) }), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  return page;
}

// 1.1 is the default, 0.95 a theme setting display type tighter still, 1.4 a
// theme giving it air; 26/38/80 are the display steps of the type scale.
const LEADINGS = [1.4, 1.1, 0.95, 0.85];
const SIZES = [26, 38, 80];

test("display ink stays inside the heading's own box, at every leading", async (t) => {
  const parts = await loadPageParts();
  const browser = await launchBrowser();
  t.after(() => browser.close());
  for (const leading of LEADINGS) {
    for (const size of SIZES) {
      const page = await open(browser, parts, { size, leading });
      const m = await page.evaluate(MEASURE);
      await page.close();
      const where = `${size}px at leading ${leading}`;
      assert.ok(m.belowOwnBox <= EPS,
        `descender ink ${m.belowOwnBox.toFixed(2)}px below the heading's own box (${where})`);
      assert.ok(m.aboveOwnBox <= EPS,
        `ascender ink ${m.aboveOwnBox.toFixed(2)}px above the heading's own box (${where})`);
    }
  }
});

test("the clearance is layout — it survives the clip margin being taken away", async (t) => {
  const parts = await loadPageParts();
  const browser = await launchBrowser();
  t.after(() => browser.close());
  // The worst shape the platform sanctions: the top display step, a theme's
  // tighter leading, the heading's margin zeroed by generated CSS, and not one
  // px of slack at the container's edge.
  for (const leading of [1.1, 0.95, 0.85]) {
    const page = await open(browser, parts, { size: 80, leading, clipMargin: "0px" });
    const m = await page.evaluate(MEASURE);
    await page.close();
    assert.ok(m.belowClipEdge <= EPS,
      `descender ink ${m.belowClipEdge.toFixed(2)}px past a clip edge with no slack (leading ${leading})`);
    assert.ok(m.aboveClipEdge <= EPS,
      `ascender ink ${m.aboveClipEdge.toFixed(2)}px past a clip edge with no slack (leading ${leading})`);
  }
});

test("leading loose enough to hold its own ink pays no padding", async (t) => {
  const parts = await loadPageParts();
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const page = await open(browser, parts, { size: 38, leading: 1.4 });
  const m = await page.evaluate(MEASURE);
  await page.close();
  assert.equal(m.padTop, 0, "padding above a loosely-led heading");
  assert.equal(m.padBottom, 0, "padding below a loosely-led heading");
});
