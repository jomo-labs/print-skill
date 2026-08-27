// Pressing Delete with an element selected takes it off the page — the other
// half of pointing at things. Selecting already tells the model "this one";
// Delete is the one edit small enough to finish in the browser: the element
// goes, the file follows (same save path as a text edit), and the record lets
// the selection go so the model is never steered at something gone.
//
// The keypress alone is not enough: a confirmation stands between the gesture
// and the removal, naming the element the way the toolbar does. And the keys
// keep their other job — inside a text-editing session Delete and Backspace
// take out words, never the element they are typed in.
//
//   node --test server/test/          (needs `npm install` in server/)
import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer } from "../server.mjs";
import {
  CHROME, loadPageParts, fillTemplate, launchTestBrowser, openTab,
  openEditMode as openPage, cliSelection as selection, selectionBecomes, fileBecomes,
} from "./helpers.mjs";

const NOTICE_MS = 400; // shell.js SELECT_NOTICE_MS
const SETTLE_MS = 3 * NOTICE_MS;

function assemble(template, documentCss) {
  return fillTemplate(template, documentCss,
    `<h1 id="probe">Chore Chart</h1><p id="other">Sweep the floor.</p>`);
}

test("Delete removes the selected element, with the user's say-so", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "print-skill-delete-"));
  const { template, documentCss } = await loadPageParts();
  const file = path.join(dir, "page.html");

  const server = await startServer({ dir, port: 0 });
  const browser = await launchTestBrowser();
  t.after(async () => {
    await browser.close();
    await server.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  // Every subtest starts from a fresh page and collects the dialogs it saw —
  // what was asked matters as much as what happened.
  const withPage = async (answer, fn) => {
    await fs.writeFile(file, assemble(template, documentCss));
    const page = await openTab(browser);
    const asked = [];
    page.on("dialog", async (d) => {
      asked.push(d.message());
      await (answer === "accept" ? d.accept() : d.dismiss());
    });
    try {
      await openPage(page, `${server.url}/page.html`);
      await fn(page, asked);
    } finally {
      await page.close();
    }
  };

  // Double-click selects AND opens a text-editing session; Escape ends the
  // session and leaves the element selected — the state Delete acts in.
  const selectOnly = async (page, sel) => {
    await page.dblclick(sel);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(SETTLE_MS);
  };

  await t.test("confirming removes it from the sheet, the file, and the record", async () => {
    await withPage("accept", async (page, asked) => {
      await selectOnly(page, "#other");
      assert.match(await selection(server.url), /#other/, "on record — the premise");

      await page.keyboard.press("Delete");
      await page.waitForFunction(() => !document.getElementById("other"), null, { timeout: 15000 });

      assert.deepEqual(
        asked,
        ['Delete Paragraph ("Sweep the floor.") from the page?'],
        "asked once, naming the element the way the toolbar names it"
      );
      assert.match(
        await fileBecomes(file, (text) => !text.includes('id="other"')),
        /id="probe"/,
        "the file lost the element and kept the rest"
      );
      assert.equal(
        await selectionBecomes(server.url, "NO_SELECTION"),
        "NO_SELECTION",
        "and the record let go, so the model is not steered at a ghost"
      );
      assert.equal(
        await page.evaluate(`document.body.classList.contains("edit-active")`),
        true,
        "deleting an element is not leaving edit mode"
      );
    });
  });

  await t.test("declining leaves everything as it was", async () => {
    await withPage("dismiss", async (page, asked) => {
      await selectOnly(page, "#other");

      await page.keyboard.press("Delete");
      await page.waitForTimeout(SETTLE_MS);

      assert.equal(asked.length, 1, "the question was asked");
      assert.equal(
        await page.evaluate(`!!document.getElementById("other")`),
        true,
        "and no did mean no"
      );
      assert.match(await selection(server.url), /#other/, "still selected, still on record");
      assert.match(await fs.readFile(file, "utf-8"), /id="other"/, "the file never moved");
    });
  });

  // Backspace is the key a Mac labels Delete — same gesture, same result.
  await t.test("Backspace deletes too", async () => {
    await withPage("accept", async (page, asked) => {
      await selectOnly(page, "#other");
      await page.keyboard.press("Backspace");
      await page.waitForFunction(() => !document.getElementById("other"), null, { timeout: 15000 });
      assert.equal(asked.length, 1, "with the same question first");
    });
  });

  // Inside a text-editing session the same keys are how words come out. An
  // element being typed in is a text field first — it becomes deletable only
  // after Escape ends the session.
  await t.test("inside a text edit, Delete edits text, never the element", async () => {
    await withPage("accept", async (page, asked) => {
      await page.dblclick("#other");        // selected AND editing
      await page.keyboard.press("Delete");
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(SETTLE_MS);

      assert.equal(asked.length, 0, "no question — the keys belonged to the text");
      assert.equal(
        await page.evaluate(`!!document.getElementById("other")`),
        true,
        "and the element is still there to keep typing in"
      );
    });
  });

  // Escape is layered, innermost first: inside a text session it ends the
  // session and edit mode stays (the state Delete acts in — selectOnly above
  // depends on it); with nothing open it leaves edit mode itself.
  await t.test("Escape ends the session first, then edit mode", async () => {
    await withPage("accept", async (page) => {
      await page.dblclick("#other");         // selected AND editing
      await page.keyboard.press("Escape");   // ends the session…
      await page.waitForTimeout(SETTLE_MS);
      assert.equal(
        await page.evaluate(`document.body.classList.contains("edit-active")`),
        true,
        "…and edit mode survives it"
      );
      await page.keyboard.press("Escape");   // nothing left open
      await page.waitForFunction(`!document.body.classList.contains("edit-active")`);
    });
  });

  // The sheet is the paper everything stands on. It is selectable (it is how
  // "the whole page" gets pointed at), but Delete does not offer to remove it.
  await t.test("the sheet itself is not deletable", async () => {
    await withPage("accept", async (page, asked) => {
      const box = await page.locator("#page").boundingBox();
      await page.mouse.dblclick(box.x + 8, box.y + 8);   // the sheet's own margin
      await page.keyboard.press("Escape");
      await page.waitForTimeout(SETTLE_MS);
      assert.equal(
        await page.evaluate(`document.querySelector(".mp-selected")?.id ?? null`),
        "page",
        "the sheet is what is selected — the premise"
      );

      await page.keyboard.press("Delete");
      await page.waitForTimeout(SETTLE_MS);

      assert.equal(asked.length, 0, "no question is asked");
      assert.equal(
        await page.evaluate(`!!document.getElementById("page")`),
        true,
        "and the sheet stands"
      );
    });
  });
});
