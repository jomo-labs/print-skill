// The themed page frame must print. A frame drawn too close to the paper edge
// sits inside the ~0.25in strip no desktop printer can reach — it looks
// correct on screen and in every screenshot and clips only on paper, so
// nothing but a check catches it. Pinned here: the sanctioned frame
// (--page-border, painted inset by .page::before) can never be pulled into
// that strip by a theme retuning its margins or setting the inset outright.
//
//   node --test server/test/          (needs `npm install` in server/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { launchBrowser, guardFonts } from "../browser.mjs";
import { startServer } from "../server.mjs";
import { loadPageParts, fillTemplate } from "./helpers.mjs";

const CONTENT = `<div data-mp-section="hero"><h1>Framed</h1><p>Body text.</p></div>`;
// The unprintable strip, at the 96dpi the sheet is laid out in.
const STRIP_PX = 24;

/** Write a page carrying `css` in its overrides channel; return its path. */
async function writePage(dir, css) {
  const { template, documentCss } = await loadPageParts();
  const out = path.join(dir, "frame-test.html");
  await fs.writeFile(out, fillTemplate(template, documentCss, CONTENT, { customCss: css }));
  return out;
}

// Both routes that walk the frame toward the paper edge, measured on a
// rendered page: the inset derives from --page-margin-top, so a theme that
// tightens its margins drags the frame down with it, and a theme can also set
// the inset outright.
const frameOf = async (t, out) => {
  const { url, close } = await startServer({ dir: path.dirname(out), port: 0 });
  const browser = await launchBrowser();
  t.after(async () => { await browser.close(); await close(); });
  const page = await browser.newPage();
  await guardFonts(page);
  await page.goto(`${url}/${path.basename(out)}`, { waitUntil: "networkidle" });
  return page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector(".page"), "::before");
    return {
      inset: parseFloat(cs.insetBlockStart || cs.top),
      borderWidth: parseFloat(cs.borderTopWidth),
    };
  });
};

test("a theme tightening its margins cannot pull the frame into the strip", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "frame-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // 16px margins put the derived inset at 12px — inside the strip.
  const out = await writePage(dir,
    ":root { --page-margin-top: 16px; --page-border: 3px solid var(--color-ink); }");
  const frame = await frameOf(t, out);
  assert.ok(frame.borderWidth > 0, "the themed frame is drawn: " + JSON.stringify(frame));
  assert.ok(frame.inset >= STRIP_PX,
    `frame inset ${frame.inset}px must clear the ${STRIP_PX}px unprintable strip`);
});

test("a theme setting the inset outright cannot either", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "frame-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = await writePage(dir,
    ":root { --page-frame-inset: 22px; --page-border: 3px solid var(--color-ink); }");
  const frame = await frameOf(t, out);
  assert.ok(frame.inset >= STRIP_PX,
    `an explicit 22px inset must still be floored, got ${frame.inset}px`);
});
