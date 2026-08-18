// Live edit's other half: the model writes the page file, and the tab the
// user is looking at has to show it. The shell polls the served ETag for
// exactly this (shell.js "Auto-reload"), but the poll also has to stand down
// while the user is mid-input — and the interesting failures live in that
// second rule, not the first. A guard that is too eager freezes the preview
// on a file that has already changed, and the user is left staring at a stale
// page with no reason to press reload.
//
// So the cases here are the guard's edges: the chat input still focused after
// a message was sent (the live-edit flow itself — the model's answer arrives
// while the caret is exactly there), an uncommitted double-click text edit
// (unsaved DOM, genuinely worth deferring for — and worth resuming the moment
// it commits), and a half-written chat draft (deferred only while the keys
// are actually moving, and carried across the reload).
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

  // The one deferral that must hold: a contentEditable edit lives only in the
  // DOM until it commits, so a reload would destroy it. It must not hold
  // forever, though — committing releases it.
  await t.test("uncommitted text edit defers the reload, committing releases it", async () => {
    await withPage(async (page) => {
      await page.dblclick("#probe");
      await writePage("AFTER");
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      assert.equal(await headingOf(page), "BEFORE", "reload must wait for the edit to commit");
      await page.keyboard.press("Escape"); // commits (blurs) the edit
      await expectHeading(page, "AFTER");
    });
  });

  // A draft is recoverable state (sessionStorage), so it buys a short quiet
  // period, not an indefinite hold — and the reload puts it back untouched.
  await t.test("a half-written chat draft survives the reload", async () => {
    await withPage(async (page) => {
      await page.evaluate(`${CHROME}.querySelector("#mp-chat-input").focus()`);
      await page.keyboard.type("half written mess");
      await writePage("AFTER");
      assert.equal(await headingOf(page), "BEFORE", "no reload lands on a live keystroke");
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
});
