// Live edit's other half: the model writes the page file, and the tab the
// user is looking at has to show it. The shell polls the served ETag for
// exactly this (shell.js "Auto-reload"), and the rule it enforces is blunt on
// purpose — a changed file reloads the tab immediately, whatever the user is
// in the middle of. Every previous attempt to be polite about that froze the
// preview on a file that had already changed, and left the user staring at a
// stale page with no reason to press reload.
//
// So these cases are the states that used to buy a delay: the chat input
// still focused after a message was sent (the live-edit flow itself — the
// model's answer arrives while the caret is exactly there), a half-written
// chat draft, and an uncommitted double-click text edit. The last one looks
// like data loss and is worth being precise about, so it's asserted here:
// that edit is ALREADY unsaveable once the file changes underneath it — the
// commit PUTs a stale ETag, gets 412, and reloads it away regardless.
// Reloading at once costs nothing extra and says so immediately.
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
const POLL_MS = 1500; // shell.js's auto-reload cadence
const SETTLE_MS = 4 * POLL_MS; // long enough that a reload would have happened

// Reach into the chrome's shadow root the way a user's click does.
const CHROME = `document.getElementById("mp-chrome-root").shadowRoot`;

function assemble(template, documentCss, heading) {
  return template
    .replace("/* @@DOCUMENT_CSS@@ */", documentCss)
    .replace("<!-- CONTENT -->", `<h1 id="probe">${heading}</h1>`)
    .replace("<body>", '<body data-mp-live-edit="1">');
}

const headingOf = (page) => page.evaluate(() => document.getElementById("probe")?.textContent);

async function expectHeading(page, text) {
  await page.waitForFunction(
    (want) => document.getElementById("probe")?.textContent === want,
    text,
    { timeout: 15000 }
  );
}

// Open the page, then open edit mode (which is also what builds the chat panel).
async function openPage(page, url) {
  await page.goto(url);
  await page.waitForFunction(`!!${CHROME}.getElementById("mp-btn-edit")`);
  await page.evaluate(`${CHROME}.getElementById("mp-btn-edit").click()`);
  await page.waitForFunction(`!!${CHROME}.querySelector("#mp-chat-input")`);
}

test("a page edited on disk reaches the open tab", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "print-skill-live-reload-"));
  const [template, documentCss] = await Promise.all([
    fs.readFile(path.join(ASSETS, "page_template.html"), "utf-8"),
    fs.readFile(path.join(ASSETS, "shell", "document.css"), "utf-8"),
  ]);
  const file = path.join(dir, "page.html");
  // What the model does when it applies a chat request: rewrite the file.
  const writePage = (heading) => fs.writeFile(file, assemble(template, documentCss, heading));

  const server = await startServer({ dir, port: 0 });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PRINT_SKILL_CHROMIUM ? { executablePath: process.env.PRINT_SKILL_CHROMIUM } : {}),
  });
  t.after(async () => {
    await browser.close();
    await server.close();
  });

  const withPage = async (fn) => {
    await writePage("BEFORE");
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    // The template preloads Google Fonts; the test must not depend on them.
    await page.route("**://fonts.g*/**", (route) => route.abort());
    try {
      await openPage(page, `${server.url}/page.html`);
      await fn(page);
    } finally {
      await page.close();
    }
  };

  await t.test("idle tab", async () => {
    await withPage(async (page) => {
      await writePage("AFTER");
      await expectHeading(page, "AFTER");
    });
  });

  // The regression this file exists for: asking for a change leaves the caret
  // in the chat input, and the model's edit lands seconds later. Deferring on
  // focus alone made the preview stale for the whole flow live edit is for.
  await t.test("chat input still focused after sending a message", async () => {
    await withPage(async (page) => {
      await page.evaluate(`${CHROME}.querySelector("#mp-chat-input").focus()`);
      await page.keyboard.type("make the heading say AFTER");
      await page.keyboard.press("Enter");
      assert.equal(
        await page.evaluate(`${CHROME}.activeElement === ${CHROME}.querySelector("#mp-chat-input")`),
        true,
        "sending leaves focus in the input — the premise of this case"
      );
      await writePage("AFTER");
      await expectHeading(page, "AFTER");
    });
  });

  // The state that looks like it deserves a delay, and doesn't: the second
  // half asserts why — the edit the reload discarded could not have been
  // saved anyway.
  await t.test("uncommitted text edit does not hold the reload back", async () => {
    await withPage(async (page) => {
      await page.dblclick("#probe");
      await page.keyboard.type(" HAND EDIT");
      await writePage("AFTER");
      await expectHeading(page, "AFTER");
    });
  });

  await t.test("that edit was unsaveable from the moment the file changed", async () => {
    await withPage(async (page) => {
      // Same situation, but let the user commit it the way they normally
      // would, with the poll held off (offline) so nothing reloads first.
      await page.route("**/page.html", (route) =>
        route.request().method() === "HEAD" ? route.abort() : route.continue());
      await page.dblclick("#probe");
      await page.keyboard.type(" HAND EDIT");
      await writePage("AFTER");
      const put = page.waitForResponse((r) => r.request().method() === "PUT");
      await page.keyboard.press("Escape"); // commits — PUTs with the stale ETag
      assert.equal((await put).status(), 412, "the server refuses the stale write");
      await expectHeading(page, "AFTER"); // savePage() reloads on 412
      assert.equal(
        (await fs.readFile(file, "utf-8")).includes("HAND EDIT"),
        false,
        "the hand edit never reaches disk — holding the reload would only have delayed this"
      );
    });
  });

  // Nothing is lost to a reload landing on a live draft: it is mirrored to
  // sessionStorage on every keystroke and comes back with caret and focus.
  await t.test("a half-written chat draft survives the reload", async () => {
    await withPage(async (page) => {
      await page.evaluate(`${CHROME}.querySelector("#mp-chat-input").focus()`);
      await page.keyboard.type("half written mess");
      await writePage("AFTER");
      await expectHeading(page, "AFTER");
      await page.waitForFunction(`!!${CHROME}.querySelector("#mp-chat-input")`);
      const restored = await page.evaluate(`(() => {
        const input = ${CHROME}.querySelector("#mp-chat-input");
        return {
          draft: input.value,
          focused: ${CHROME}.activeElement === input,
          caret: input.selectionStart,
          panelOpen: !!${CHROME}.querySelector("#mp-chat-panel"),
          editMode: document.body.classList.contains("edit-active"),
        };
      })()`);
      assert.deepEqual(restored, {
        draft: "half written mess",
        focused: true,
        caret: "half written mess".length,
        panelOpen: true,
        editMode: true,
      });
    });
  });

  // The one exception, and it cannot outlast the composition: characters
  // being composed by an IME are in neither the input's value nor the draft,
  // so there is nothing for the reload to restore.
  await t.test("an open IME composition waits, and only until it ends", async () => {
    await withPage(async (page) => {
      const input = `${CHROME}.querySelector("#mp-chat-input")`;
      await page.evaluate(`${input}.focus()`);
      await page.evaluate(`${input}.dispatchEvent(new CompositionEvent("compositionstart"))`);
      await writePage("AFTER");
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      assert.equal(await headingOf(page), "BEFORE", "no reload mid-composition");
      await page.evaluate(`${input}.dispatchEvent(new CompositionEvent("compositionend"))`);
      await expectHeading(page, "AFTER");
    });
  });
});
