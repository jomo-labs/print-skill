// Undo and redo in edit mode — a local history of the user's own committed
// changes. Each committed text edit or delete pushes the page's prior authored
// state; Undo restores it (and the file follows, through the same save path),
// Redo brings the change back, and a fresh change makes the undone future
// unreachable. The history lives in the tab and nowhere else: a reload — which
// is how the model's edits arrive — starts it empty, so undo never silently
// rewinds work the user asked their model for.
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

const CHROME = `document.getElementById("mp-chrome-root").shadowRoot`;

function assemble(template, documentCss) {
  return template
    .replace("/* @@DOCUMENT_CSS@@ */", documentCss)
    .replace(
      "<!-- CONTENT -->",
      `<h1 id="probe">Chore Chart</h1><p id="other">Sweep the floor.</p>`
    );
}

// The save is async and queued — poll the file until it says what the DOM
// already does.
async function fileBecomes(file, predicate, ms = 15000) {
  const deadline = Date.now() + ms;
  let text = "";
  while (Date.now() < deadline) {
    text = await fs.readFile(file, "utf-8");
    if (predicate(text)) return text;
    await new Promise((r) => setTimeout(r, 250));
  }
  return text;
}

async function openPage(page, url) {
  await page.goto(url);
  await page.waitForFunction(`!!${CHROME}.getElementById("mp-btn-edit")`);
  await page.evaluate(`${CHROME}.getElementById("mp-btn-edit").click()`);
  await page.waitForFunction(`document.body.classList.contains("edit-active")`);
}

const clickChrome = (page, id) =>
  page.evaluate(`${CHROME}.getElementById(${JSON.stringify(id)}).click()`);
const chromeDisabled = (page, id) =>
  page.evaluate(`${CHROME}.getElementById(${JSON.stringify(id)}).disabled`);
const historyDisplay = (page) =>
  page.evaluate(`getComputedStyle(${CHROME}.getElementById("mp-history")).display`);

// Double-click opens the word-selecting text session; End collapses the
// browser selection to the line's end so typing appends instead of replacing,
// and Escape commits.
async function typeInto(page, sel, text) {
  await page.dblclick(sel);
  await page.keyboard.press("End");
  await page.keyboard.type(text);
  await page.keyboard.press("Escape");
}

test("undo and redo walk the user's own committed changes", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "print-skill-undo-"));
  const [template, documentCss] = await Promise.all([
    fs.readFile(path.join(ASSETS, "page_template.html"), "utf-8"),
    fs.readFile(path.join(ASSETS, "shell", "document.css"), "utf-8"),
  ]);
  const file = path.join(dir, "page.html");

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

  // Every subtest starts from a fresh page (and so a fresh, empty history).
  const withPage = async (fn) => {
    await fs.writeFile(file, assemble(template, documentCss));
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route("**://fonts.g*/**", (route) => route.abort());
    page.on("dialog", (d) => d.accept());
    try {
      await openPage(page, `${server.url}/page.html`);
      await fn(page);
    } finally {
      await page.close();
    }
  };

  await t.test("a committed text edit can be undone, and redone", async () => {
    await withPage(async (page) => {
      assert.equal(await chromeDisabled(page, "mp-btn-undo"), true, "nothing to undo yet");

      await typeInto(page, "#other", " Then mop.");
      await fileBecomes(file, (text) => text.includes("Then mop."));
      assert.equal(await chromeDisabled(page, "mp-btn-undo"), false, "the commit armed Undo");

      await clickChrome(page, "mp-btn-undo");
      await page.waitForFunction(
        `document.getElementById("other").textContent === "Sweep the floor."`
      );
      assert.doesNotMatch(
        await fileBecomes(file, (text) => !text.includes("Then mop.")),
        /data-mp-edited/,
        "the file followed — the typing gone, and the edited marker with it"
      );
      assert.equal(await chromeDisabled(page, "mp-btn-undo"), true, "history spent");
      assert.equal(await chromeDisabled(page, "mp-btn-redo"), false, "and Redo armed");

      await clickChrome(page, "mp-btn-redo");
      await page.waitForFunction(
        `document.getElementById("other").textContent.includes("Then mop.")`
      );
      assert.match(
        await fileBecomes(file, (text) => text.includes("Then mop.")),
        /data-mp-edited/,
        "redo restored the edit exactly, marker included"
      );
      assert.equal(
        await page.evaluate(`document.body.classList.contains("edit-active")`),
        true,
        "undo and redo are edit-mode moves, not exits from it"
      );
    });
  });

  await t.test("a delete can be undone", async () => {
    await withPage(async (page) => {
      await page.dblclick("#other");
      await page.keyboard.press("Escape");   // end the text session; stay selected
      await page.keyboard.press("Delete");   // the dialog handler accepts
      await page.waitForFunction(() => !document.getElementById("other"));
      await fileBecomes(file, (text) => !text.includes('id="other"'));

      await clickChrome(page, "mp-btn-undo");
      await page.waitForFunction(`!!document.getElementById("other")`);
      assert.match(
        await fileBecomes(file, (text) => text.includes('id="other"')),
        /Sweep the floor\./,
        "the element is back on the page and in the file"
      );
    });
  });

  await t.test("a fresh change clears the redo future", async () => {
    await withPage(async (page) => {
      await typeInto(page, "#other", " Then mop.");
      await fileBecomes(file, (text) => text.includes("Then mop."));
      await clickChrome(page, "mp-btn-undo");
      await page.waitForFunction(`${CHROME}.getElementById("mp-btn-redo").disabled === false`);

      await typeInto(page, "#probe", " for Maya");
      await page.waitForFunction(`${CHROME}.getElementById("mp-btn-redo").disabled === true`);
      assert.equal(await chromeDisabled(page, "mp-btn-undo"), false, "the new change is undoable");
    });
  });

  await t.test("the controls belong to edit mode", async () => {
    await fs.writeFile(file, assemble(template, documentCss));
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route("**://fonts.g*/**", (route) => route.abort());
    try {
      await page.goto(`${server.url}/page.html`);
      await page.waitForFunction(`!!${CHROME}.getElementById("mp-history")`);
      assert.equal(await historyDisplay(page), "none", "hidden at rest");

      await page.evaluate(`${CHROME}.getElementById("mp-btn-edit").click()`);
      await page.waitForFunction(`document.body.classList.contains("edit-active")`);
      assert.equal(await historyDisplay(page), "flex", "shown while editing");

      await page.evaluate(`${CHROME}.getElementById("mp-btn-edit").click()`);
      await page.waitForFunction(`!document.body.classList.contains("edit-active")`);
      assert.equal(await historyDisplay(page), "none", "and gone with the mode");
    } finally {
      await page.close();
    }
  });
});
