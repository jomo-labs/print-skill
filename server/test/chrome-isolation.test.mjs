// The chrome is server-managed UI: nothing a generated page's CSS does may
// change how it looks. This test proves it against a deliberately hostile
// page — a theme that redefines every design token (including the chrome's
// own --mp-* names), blanket element rules, !important rules aimed straight
// at the chrome's ids and classes, and an @font-face that renames the fonts
// the chrome could have relied on.
//
// Method: assemble the SAME page twice, once plain and once with that CSS in
// <style id="content-overrides">, serve both, and compare the computed style
// and geometry of every chrome element. They must be identical.
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

// Everything a generated page could throw at the chrome, in one stylesheet.
const HOSTILE_CSS = `
/* A theme's token block — the documented way to restyle a page. */
:root {
  --color-paper: #101014;
  --color-ink: #ff00ff;
  --color-mid: #00ffff;
  --color-dim: #ffff00;
  --color-bg: #003300;
  --color-rule-light: #ff0000;
  --color-pull-bg: #00ff00;
  --font-label: 'Wingdings', cursive;
  --font-body: 'Wingdings', cursive;
  /* ...and the chrome's own token names, for good measure. */
  --mp-ink: #ff0000;
  --mp-paper: #000000;
  --mp-rule: #ff0000;
  --mp-mid: #ff0000;
  --mp-font-ui: 'Wingdings', cursive;
}
* { box-sizing: content-box !important; margin: 3px !important; padding: 4px !important; }
body {
  padding-top: 0 !important;
  background: #101014 !important;
  font-family: 'Wingdings', cursive !important;
  color: #ff00ff !important;
  letter-spacing: 3px !important;
  line-height: 4 !important;
}
button, input, textarea, select, option, code, pre, i, svg, span, div, aside, form, p {
  background: #ff0000 !important;
  color: #00ff00 !important;
  font-size: 40px !important;
  font-family: 'Wingdings', cursive !important;
  border: 6px dotted blue !important;
  border-radius: 20px !important;
  text-transform: lowercase !important;
  letter-spacing: 9px !important;
  opacity: 0.3 !important;
}
/* Aimed at the chrome by name. */
#mp-chrome-root, #mp-toolbar, #mp-overlay, #mp-chat-panel, #mp-page-setup,
#mp-btn-edit, #mp-btn-print, #mp-chat-input, #mp-chat-log, #mp-chat-presence,
#mp-paper-select, #mp-orient-select, .mp-combo, .mp-chat-send, .mp-msg,
.mp-copy-row, .mp-starter, [data-mp-chrome] {
  display: none !important;
  visibility: hidden !important;
  position: static !important;
  background: #ff0000 !important;
  height: 0 !important;
  width: 0 !important;
  z-index: -1 !important;
}
html > div { display: none !important; }
/* Rename the families the chrome might have leaned on. */
@font-face { font-family: 'Inter'; src: local('Times New Roman'); }
@font-face { font-family: 'system-ui'; src: local('Times New Roman'); }
/* Reclaim what the chrome reserves in the document. */
body.mp-chat-open .page-surround { margin-left: 0 !important; }
body.edit-active { cursor: crosshair !important; }
.mp-selected { outline: none !important; outline-offset: 0 !important; }
`;

// Chrome elements and the properties that would move if page CSS got through.
const PROBES = [
  "#mp-toolbar", "#mp-btn-edit", "#mp-btn-edit-label", "#mp-btn-print", "#mp-toolbar .mp-sep",
  "#mp-page-setup", "#mp-paper-select", "#mp-orient-select", ".mp-combo",
  "#mp-overlay", "#mp-chat-panel", "#mp-chat-log", "#mp-chat-presence", "#mp-chat-form",
  "#mp-chat-input", ".mp-chat-send", ".mp-msg-model", ".mp-starter", ".mp-copy-row",
  ".mp-copy-row code", ".mp-copy-btn", "#mp-chat-attach", ".mp-attach-chip",
  ".mp-attach-label", ".mp-attach-clear",
];
// The hover box traces whatever page element it is over, and the hostile page
// lays its content out differently — so these two are compared on appearance
// alone, with position and size left out.
const APPEARANCE_ONLY = [".mp-hover-box", ".mp-hover-label"];
const GEOMETRY = ["width", "height", "top", "left", "right", "bottom"];
const PROPS = [
  "display", "position", "visibility", "opacity", "z-index", "box-sizing",
  "width", "height", "top", "left", "right", "bottom",
  "background-color", "color", "border-top-width", "border-bottom-color", "border-radius",
  "font-family", "font-size", "font-weight", "letter-spacing", "line-height",
  "text-transform", "padding-top", "padding-left", "margin-top", "margin-left",
];

function assemble(documentCss, template, customCss) {
  return template
    .replace("/* @@DOCUMENT_CSS@@ */", documentCss)
    .replace('<style id="content-overrides"></style>', `<style id="content-overrides">${customCss}</style>`)
    .replace("<!-- CONTENT -->", '<h1>Chore chart</h1><p id="probe">Sweep the floor.</p>');
}

// Computed style + on-screen box of every chrome element, read from inside
// the shadow root.
async function chromeSnapshot(page, probes) {
  return page.evaluate(
    ([probes, props, noGeometry, geometry]) => {
      const root = document.getElementById("mp-chrome-root").shadowRoot;
      const out = {};
      for (const sel of probes) {
        const el = root.querySelector(sel);
        if (!el) { out[sel] = "MISSING"; continue; }
        const cs = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        const appearanceOnly = noGeometry.includes(sel);
        out[sel] = {
          style: Object.fromEntries(
            props.filter((p) => !(appearanceOnly && geometry.includes(p)))
                 .map((p) => [p, cs.getPropertyValue(p)])
          ),
        };
        if (!appearanceOnly) {
          out[sel].box = [box.x, box.y, box.width, box.height].map((n) => Math.round(n * 100) / 100);
        }
      }
      return out;
    },
    [probes, PROPS, APPEARANCE_ONLY, GEOMETRY]
  );
}

// Load a page, open edit mode (which builds the chat panel), snapshot.
async function inspect(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.getElementById("mp-chrome-root").shadowRoot
    .getElementById("mp-btn-edit").click());
  await page.waitForFunction(() => document.getElementById("mp-chrome-root").shadowRoot
    .querySelector("#mp-chat-panel .mp-starter"));
  // Drive the two edit-mode gestures so their chrome exists to be compared:
  // double-click selects (chip + outline), hover draws the element box.
  await page.dblclick("#probe");
  await page.hover("h1");
  await page.waitForFunction(() => document.getElementById("mp-chrome-root").shadowRoot
    .querySelector(".mp-hover-box"));
  const chrome = await chromeSnapshot(page, [...PROBES, ...APPEARANCE_ONLY]);
  const document_ = await page.evaluate(() => {
    const cs = getComputedStyle(window.document.body);
    const surround = getComputedStyle(window.document.querySelector(".page-surround"));
    return {
      bodyPaddingTop: cs.paddingTop,
      cursor: cs.cursor,
      surroundMarginLeft: surround.marginLeft,
      selectedOutline: getComputedStyle(window.document.getElementById("probe")).outlineWidth,
    };
  });
  const printed = await (async () => {
    await page.emulateMedia({ media: "print" });
    const hidden = await page.evaluate(() => {
      const root = document.getElementById("mp-chrome-root").shadowRoot;
      return ["#mp-toolbar", "#mp-chat-panel", "#mp-overlay"]
        .every((s) => getComputedStyle(root.querySelector(s)).display === "none");
    });
    await page.emulateMedia({ media: "screen" });
    return hidden;
  })();
  await page.close();
  return { chrome, document_, printed };
}

test("page CSS cannot reach the server-managed chrome", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "print-skill-isolation-"));
  const [template, documentCss] = await Promise.all([
    fs.readFile(path.join(ASSETS, "page_template.html"), "utf-8"),
    fs.readFile(path.join(ASSETS, "shell", "document.css"), "utf-8"),
  ]);
  await fs.writeFile(path.join(dir, "plain.html"), assemble(documentCss, template, ""));
  await fs.writeFile(path.join(dir, "hostile.html"), assemble(documentCss, template, HOSTILE_CSS));

  const server = await startServer({ dir, port: 0 });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PRINT_SKILL_CHROMIUM ? { executablePath: process.env.PRINT_SKILL_CHROMIUM } : {}),
  });
  t.after(async () => {
    await browser.close();
    await server.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  const plain = await inspect(browser, `${server.url}/plain.html`);
  const hostile = await inspect(browser, `${server.url}/hostile.html`);

  // No probe may have gone missing — a MISSING everywhere would make the
  // comparison below vacuously true.
  for (const sel of PROBES) {
    assert.notEqual(plain.chrome[sel], "MISSING", `probe ${sel} did not render on the plain page`);
  }
  // The guarantee itself.
  assert.deepEqual(hostile.chrome, plain.chrome, "chrome styling moved with the page's CSS");

  // The document-side reservations hold too (chrome-host.css).
  assert.equal(hostile.document_.bodyPaddingTop, "56px", "the page reclaimed the toolbar's space");
  assert.equal(hostile.document_.cursor, "text", "edit-mode cursor overridden by the page");
  assert.equal(hostile.document_.surroundMarginLeft, "336px", "the page closed the chat gutter");
  assert.equal(hostile.document_.selectedOutline, "2px", "the page erased the selection outline");
  assert.equal(plain.document_.selectedOutline, "2px");

  // And the chrome still prints as nothing, on both pages.
  assert.equal(plain.printed, true);
  assert.equal(hostile.printed, true);
});
