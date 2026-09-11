// Containers clip, they never overlap — and a clip is an error the shell
// finds, not a crop it ships. document.css gives structural containers
// `overflow: clip`, so content that outgrows a fixed-size box is cut at its
// edge instead of painted over its neighbours; the shell's fit pass then
// detects every container whose content exceeds its clip edge, outlines it in
// red on screen, and reports it through the same path as a page that outgrows
// its sheets: the toolbar's red line, the FIX button, and — after a press —
// the fit record, now carrying the authored-flow selector of each cut so the
// model knows exactly where to look.
//
// Asserted here: the CSS policy itself (containers clip, the sheet and text
// elements don't), vertical and horizontal detection, the runtime marker and
// its absence from the saved file, the toolbar + record round trip, a clean
// page staying silent (SVG icons and tilted motifs included), and fit-cli
// failing the build on a clipped container.
//
//   node --test server/test/          (needs `npm install` in server/)
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { startServer } from "../server.mjs";
import { CHROME, loadPageParts, fillTemplate, launchTestBrowser, openTab } from "./helpers.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIT_CLI = path.join(HERE, "..", "fit-cli.mjs");
const run = promisify(execFile);

// A fixed-height box with several times its height in copy: the classic
// dashboard-tile overflow. Everything past ~120px is past the clip edge.
const CLIPPED = `
  <div data-mp-section="custom" style="height: 120px;">
    <h3>Schedule</h3>
    ${`<p>A line of schedule copy that keeps going and going.</p>`.repeat(12)}
  </div>
  <p>The block after the box.</p>`;

// Horizontal, through a NON-clipping child: an unbreakable string paints past
// the paragraph's own border box, so only the child's scroll overflow knows —
// the branch that extends a measured box by it is what this exercises.
const WIDE = `
  <div data-mp-section="custom">
    <p>${"M".repeat(400)}</p>
  </div>`;

// Comfortably fitting, with the two things most likely to false-positive: an
// SVG viewport (clips by UA design) and a tilted motif box (paints slightly
// outside its rotated footprint, inside the clip slack).
const FITS = `
  <h1>Short</h1>
  <div data-mp-section="custom">
    <p>Comfortably inside one sheet.</p>
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
    </svg>
    <div class="tilt" style="border: 1.5px solid black; padding: 8px;"><p>Tilted box</p></div>
  </div>`;

// The same overflow with padding at the top, so the container itself is
// hittable where no child is — the fixture for the dress code: on a clipped
// element the hover box and the error box are ONE box, in the error's red,
// and a selection of it is that same red, solid.
const HOVERABLE = `
  <div data-mp-section="custom" style="height: 160px; padding: 24px 24px 0;">
    ${`<p>A line of schedule copy that keeps going and going.</p>`.repeat(12)}
  </div>`;

async function fitRecord(serverUrl) {
  const res = await fetch(`${serverUrl}/chat/fit`);
  assert.equal(res.ok, true, "reading the fit record");
  return (await res.json()).fits;
}

async function waitForFit(serverUrl, ms = 15000) {
  const deadline = Date.now() + ms;
  let seen = [];
  while (Date.now() < deadline) {
    seen = await fitRecord(serverUrl);
    if (seen.length) return seen;
    await new Promise((r) => setTimeout(r, 250));
  }
  return seen;
}

test("content cut off inside a container is detected and handed over", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "print-skill-clip-"));
  const { template, documentCss } = await loadPageParts();
  const assemble = (body) => fillTemplate(template, documentCss, body);
  const write = (name, body) => fs.writeFile(path.join(dir, `${name}.html`), assemble(body));

  await write("clipped", CLIPPED);
  await write("wide", WIDE);
  await write("fits", FITS);
  await write("hoverable", HOVERABLE);

  const server = await startServer({ dir, port: 0 });
  const browser = await launchTestBrowser();
  t.after(async () => {
    await browser.close();
    await server.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  const withPage = async (name, fn) => {
    const page = await openTab(browser);
    try {
      await page.goto(`${server.url}/${name}.html`);
      await page.waitForFunction(`!!${CHROME}.getElementById("mp-btn-edit")`);
      await fn(page);
    } finally {
      await page.close();
    }
  };

  // The policy itself: structural containers clip (with the ink slack), the
  // sheet does not — its visible spill is the too-tall error display — and
  // auto-sized text elements are left alone.
  await t.test("document.css clips containers, not the sheet or the text", async () => {
    await withPage("fits", async (page) => {
      const styles = await page.evaluate(() => {
        const pick = (sel) => {
          const cs = getComputedStyle(document.querySelector(sel));
          return { y: cs.overflowY, margin: cs.overflowClipMargin };
        };
        return {
          container: pick("#page > div"),
          sheet: pick("#page"),
          heading: pick("#page > h1"),
          paragraph: pick("#page > div > p"),
        };
      });
      assert.equal(styles.container.y, "clip", "containers clip");
      assert.equal(styles.container.margin, "6px", "with the ink-overhang slack");
      assert.equal(styles.sheet.y, "visible", "the sheet keeps its visible spill");
      assert.equal(styles.heading.y, "visible", "headings are never sheared");
      assert.equal(styles.paragraph.y, "visible", "nor paragraphs");
    });
  });

  await t.test("a fixed box with too much copy is found, marked, and said in red", async () => {
    await withPage("clipped", async (page) => {
      const state = await page.evaluate(`(() => {
        const root = ${CHROME};
        const el = root.getElementById("mp-live-status");
        const btn = root.getElementById("mp-fit-fix");
        return {
          fit: window.mpFit,
          marked: [...document.querySelectorAll("[data-mp-clipped]")].map((n) => n.dataset.mpSection || n.tagName),
          shown: el.classList.contains("mp-live-error"),
          text: el.querySelector(".mp-live-label").textContent,
          title: el.title,
          fixShown: getComputedStyle(btn).display !== "none",
          saved: serializeForSave(),
        };
      })()`);
      // A pure clip: one sheet, nothing spilled, nothing hanging past the
      // paper edge — the old verdict would have called this page fine.
      assert.equal(state.fit.authored, 1);
      assert.equal(state.fit.rendered, 1, "the fixed box holds its layout height");
      assert.equal(state.fit.overflowing, 0);
      assert.equal(state.fit.clipped, 1, "the box is counted");
      assert.deepEqual(state.fit.clippedAt, ["#page > div"], "with its authored-flow address");
      assert.deepEqual(state.marked, ["custom"], "and marked in the DOM where the outline draws");
      assert.equal(state.shown, true, "the toolbar treats it as the error it is");
      assert.match(state.text, /^content is cut off in 1 place$/, state.text);
      assert.match(state.title, /will not print/, state.title);
      assert.equal(state.fixShown, true, "same FIX button as any other fit problem");
      assert.ok(!state.saved.includes("data-mp-clipped"), "the marker is runtime-only, never saved");
    });
  });

  await t.test("an unbreakable string overflowing sideways is found through its child", async () => {
    await withPage("wide", async (page) => {
      const fit = await page.evaluate(() => window.mpFit);
      assert.equal(fit.clipped, 1, "the container clips what the paragraph painted past itself");
      assert.deepEqual(fit.clippedAt, ["#page > div"]);
    });
  });

  // Same contract as every fit problem: nothing reaches the record until the
  // user presses FIX — and the press carries the addresses with it.
  await t.test("pressing FIX puts the cuts on the record, addresses included", async () => {
    await withPage("clipped", async (page) => {
      await page.waitForFunction(`${CHROME}.getElementById("mp-fit-fix") &&
        getComputedStyle(${CHROME}.getElementById("mp-fit-fix")).display !== "none"`);
      assert.deepEqual(
        (await fitRecord(server.url)).filter((f) => f.page === "/clipped.html"),
        [], "nothing goes out on its own");
      await page.evaluate(`${CHROME}.getElementById("mp-fit-fix").click()`);

      const reported = await waitForFit(server.url);
      assert.equal(reported.length, 1);
      assert.equal(reported[0].page, "/clipped.html");
      assert.match(reported[0].text, /content is cut off in 1 place/);
      assert.equal(reported[0].clipped, 1);
      assert.deepEqual(reported[0].clippedAt, ["#page > div"],
        "the model reads where without re-measuring anything");
    });
  });

  // One element never wears two boxes, and an errored element is never dressed
  // in the selection's blue: hovering a clipped container draws the ONE box in
  // the error's red — dashed as every hover is, chip red to match, label
  // naming the problem instead of offering the edit — while the element's own
  // dashed outline steps aside. Selecting it keeps the selection's solid
  // shape in that same red.
  await t.test("hover and selection of a clipped element wear the error's red", async () => {
    await withPage("hoverable", async (page) => {
      await page.evaluate(`${CHROME}.getElementById("mp-btn-edit").click()`);
      // The container's own top padding, where no child is.
      const box = await page.locator("#page > div").boundingBox();
      await page.mouse.move(box.x + 8, box.y + 8);
      await page.waitForFunction(`!!${CHROME}.querySelector(".mp-hover-box")`);

      const hovered = await page.evaluate(`(() => {
        const hb = ${CHROME}.querySelector(".mp-hover-box");
        const el = document.querySelector("[data-mp-clipped]");
        return {
          label: hb.querySelector(".mp-hover-label").textContent,
          border: getComputedStyle(hb).borderTopColor,
          dashed: getComputedStyle(hb).borderTopStyle,
          chip: getComputedStyle(hb.querySelector(".mp-hover-label")).backgroundColor,
          ownOutline: getComputedStyle(el).outlineStyle,
        };
      })()`);
      assert.equal(hovered.label, "Block — overflowing",
        "the label says what is wrong, not how to edit");
      assert.equal(hovered.border, "rgba(220, 38, 38, 0.75)",
        "the hover box IS the red error box");
      assert.equal(hovered.dashed, "dashed", "dashed, as every hover box is");
      assert.equal(hovered.chip, "rgba(220, 38, 38, 0.9)", "the chip goes red with it");
      assert.equal(hovered.ownOutline, "none", "one box on one element, not a box on a box");

      // Selecting it: solid, as every selection is, in the error's red.
      await page.mouse.dblclick(box.x + 8, box.y + 8);
      const picked = await page.evaluate(`(() => {
        const el = document.querySelector("[data-mp-clipped]");
        const cs = getComputedStyle(el);
        return {
          selected: el.classList.contains("mp-selected"),
          style: cs.outlineStyle,
          color: cs.outlineColor,
        };
      })()`);
      assert.equal(picked.selected, true, "the double-click selected it as ever");
      assert.equal(picked.style, "solid", "solid — the selection's shape");
      assert.equal(picked.color, "rgba(220, 38, 38, 0.75)", "in the error's colour");

      // Selecting the red-boxed element is pointing at the problem, not at
      // competing news: the toolbar keeps stating the error, FIX button and
      // all, instead of swapping to the selection message.
      const line = await page.evaluate(`(() => {
        const root = ${CHROME};
        const el = root.getElementById("mp-live-status");
        return {
          error: el.classList.contains("mp-live-error"),
          selected: el.classList.contains("mp-live-selected"),
          text: el.querySelector(".mp-live-label").textContent,
          fixShown: getComputedStyle(root.getElementById("mp-fit-fix")).display !== "none",
        };
      })()`);
      assert.equal(line.error, true, "the slot states the problem");
      assert.equal(line.selected, false, "not a selection of the very thing it is about");
      assert.match(line.text, /^content is cut off in 1 place$/, line.text);
      assert.equal(line.fixShown, true, "with FIX still there to press");

      // ...and off the element, the hover box reverts to the offer, in blue.
      const other = await page.locator("#page > div > p >> nth=0").boundingBox();
      await page.mouse.move(other.x + 8, other.y + 8);
      await page.waitForFunction(
        `${CHROME}.querySelector(".mp-hover-label")?.textContent.includes("double-click to edit")`);
      const plain = await page.evaluate(`(() => {
        const hb = ${CHROME}.querySelector(".mp-hover-box");
        return {
          label: hb.querySelector(".mp-hover-label").textContent,
          border: getComputedStyle(hb).borderTopColor,
          clipOutline: getComputedStyle(document.querySelector("[data-mp-clipped]")).outlineStyle,
        };
      })()`);
      assert.equal(plain.label, "Paragraph — double-click to edit");
      assert.equal(plain.border, "rgba(59, 130, 246, 0.7)", "an unclipped element keeps the blue");
      assert.equal(plain.clipOutline, "solid",
        "and the clipped element gets its own outline back — still selected, so solid red");

      // Leaving edit mode takes every box off the sheet — selection and error
      // outlines together. The page at rest shows only the document; the
      // toolbar's red line still states the problem.
      await page.evaluate(`${CHROME}.getElementById("mp-btn-edit").click()`);
      const atRest = await page.evaluate(`(() => ({
        selected: document.querySelectorAll(".mp-selected").length,
        clipOutline: getComputedStyle(document.querySelector("[data-mp-clipped]")).outlineStyle,
        error: ${CHROME}.getElementById("mp-live-status").classList.contains("mp-live-error"),
      }))()`);
      assert.equal(atRest.selected, 0, "the selection did not survive leaving edit mode");
      assert.equal(atRest.clipOutline, "none", "and neither did the error's box");
      assert.equal(atRest.error, true, "the toolbar still states the problem in red");
    });
  });

  await t.test("a clean page — icons, tilts and all — stays silent", async () => {
    await withPage("fits", async (page) => {
      const state = await page.evaluate(`(() => ({
        fit: window.mpFit,
        marked: document.querySelectorAll("[data-mp-clipped]").length,
        shown: ${CHROME}.getElementById("mp-live-status").classList.contains("mp-live-error"),
      }))()`);
      assert.deepEqual(state.fit, { authored: 1, rendered: 1, overflowing: 0, clipped: 0 });
      assert.equal(state.marked, 0, "no outline on a page with nothing to outline");
      assert.equal(state.shown, false);
    });
  });

  // The generation-time gate: Step 6 must stop on a cut the same way it stops
  // on an accidental page break, or a pipeline ships a printable with content
  // silently missing.
  await t.test("fit-cli fails a clipped page and names the container", async () => {
    const env = { ...process.env };
    const fail = await run(process.execPath, [FIT_CLI, path.join(dir, "clipped.html")], { env })
      .then(() => null, (e) => e);
    assert.ok(fail, "exit 1 on a clipped page");
    assert.match(fail.stderr, /cut off inside 1 container/, fail.stderr);
    assert.match(fail.stderr, /DOES NOT PRINT/, fail.stderr);
    assert.match(fail.stderr, /#page > div/, "the address the model acts on");

    const pass = await run(process.execPath, [FIT_CLI, path.join(dir, "fits.html")], { env });
    assert.match(pass.stdout, /fits: 1 sheet, as authored/, pass.stdout);
  });
});
