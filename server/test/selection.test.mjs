// Selecting an element is a message to the model, not just a UI state.
//
// Double-clicking in edit mode has always marked the element and put a chip in
// the chat area — but the model heard nothing until the user typed and sent
// something, and the chip was consumed by that one send. So the model could
// not acknowledge what the user was looking at, and a second request about the
// same element arrived with no target at all.
//
// Both halves are asserted here: the selection reaches the server on its own
// (kind:"selection", debounced and deduped, with the deselect reported too),
// and it STICKS — every message while the chip stands carries the element,
// including across the reload the model's own edit causes.
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
const NOTICE_MS = 400; // chat.js SELECT_NOTICE_MS
const SETTLE_MS = 3 * NOTICE_MS; // long enough that a notice would have gone out

const CHROME = `document.getElementById("mp-chrome-root").shadowRoot`;

function assemble(template, documentCss, heading) {
  return template
    .replace("/* @@DOCUMENT_CSS@@ */", documentCss)
    .replace(
      "<!-- CONTENT -->",
      `<h1 id="probe">${heading}</h1><p id="other">Sweep the floor.</p>`
    );
}

// Drain the chat log the way `chat-cli.mjs wait` does: as the model, from the
// server-held cursor, without blocking.
async function drain(serverUrl) {
  const res = await fetch(
    `${serverUrl}/chat/page.html/messages?consumer=model&from=user&wait=0`
  );
  assert.equal(res.ok, true, "draining the chat log");
  return (await res.json()).messages;
}

const selections = (msgs) => msgs.filter((m) => m.kind === "selection");

async function openPage(page, url) {
  await page.goto(url);
  await page.waitForFunction(`!!${CHROME}.getElementById("mp-btn-edit")`);
  await page.evaluate(`${CHROME}.getElementById("mp-btn-edit").click()`);
  await page.waitForFunction(`!!${CHROME}.querySelector("#mp-chat-input")`);
}

const chipLabel = (page) =>
  page.evaluate(`${CHROME}.querySelector(".mp-attach-label")?.textContent ?? null`);

async function send(page, text) {
  await page.evaluate(`${CHROME}.querySelector("#mp-chat-input").focus()`);
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

test("a selected element reaches the model, and stays the subject", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "print-skill-selection-"));
  const [template, documentCss] = await Promise.all([
    fs.readFile(path.join(ASSETS, "page_template.html"), "utf-8"),
    fs.readFile(path.join(ASSETS, "shell", "document.css"), "utf-8"),
  ]);
  const file = path.join(dir, "page.html");
  const writePage = (heading) => fs.writeFile(file, assemble(template, documentCss, heading));

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

  const withPage = async (fn) => {
    await writePage("BEFORE");
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route("**://fonts.g*/**", (route) => route.abort());
    try {
      await openPage(page, `${server.url}/page.html`);
      await drain(server.url); // ignore anything the open itself posted
      await fn(page);
    } finally {
      await page.close();
    }
  };

  // The point of the whole change: the model knows before a word is typed.
  await t.test("double-clicking tells the model, unprompted", async () => {
    await withPage(async (page) => {
      await page.dblclick("#probe");
      await page.waitForTimeout(SETTLE_MS);

      const picked = selections(await drain(server.url));
      assert.equal(picked.length, 1, "exactly one selection notice");
      assert.equal(picked[0].from, "user");
      assert.equal(picked[0].data.selector, "#probe", "the selector points at the heading");
      assert.match(picked[0].data.snapshot, /BEFORE/, "the snapshot carries what it says");
      assert.equal(picked[0].data.edited, false);
      // A notice is not something the user said, so it must not be posted as
      // one — the model has to be able to tell them apart.
      assert.equal(picked[0].kind, "selection");
    });
  });

  // Selecting is a hunt: the model should wake at the element the user landed
  // on, not at every one they passed through.
  await t.test("a burst of selections collapses to the last one", async () => {
    await withPage(async (page) => {
      await page.dblclick("#probe");
      await page.dblclick("#other");
      await page.dblclick("#probe");
      await page.waitForTimeout(SETTLE_MS);

      const picked = selections(await drain(server.url));
      assert.equal(picked.length, 1, "the hunt is one notice, not three");
      assert.equal(picked[0].data.selector, "#probe", "and it is where they settled");
    });
  });

  await t.test("re-selecting the same element says nothing new", async () => {
    await withPage(async (page) => {
      await page.dblclick("#probe");
      await page.waitForTimeout(SETTLE_MS);
      assert.equal(selections(await drain(server.url)).length, 1);

      await page.dblclick("#probe");
      await page.waitForTimeout(SETTLE_MS);
      assert.equal(
        selections(await drain(server.url)).length,
        0,
        "the model already knew — nothing to report"
      );
    });
  });

  // Without this the model keeps steering later messages at an element the
  // user has visibly let go of.
  await t.test("clearing the chip reports the deselect", async () => {
    await withPage(async (page) => {
      await page.dblclick("#probe");
      await page.waitForTimeout(SETTLE_MS);
      await drain(server.url);

      await page.evaluate(`${CHROME}.querySelector(".mp-attach-clear").click()`);
      await page.waitForTimeout(SETTLE_MS);

      const picked = selections(await drain(server.url));
      assert.equal(picked.length, 1, "the deselect is reported");
      assert.equal(picked[0].data.selector, null, "as an explicit null");
      assert.equal(await chipLabel(page), null, "and the chip is gone");
    });
  });

  await t.test("leaving edit mode clears the selection too", async () => {
    await withPage(async (page) => {
      await page.dblclick("#probe");
      await page.waitForTimeout(SETTLE_MS);
      await drain(server.url);

      await page.evaluate(`${CHROME}.getElementById("mp-btn-edit").click()`); // Done
      await page.waitForTimeout(SETTLE_MS);

      const picked = selections(await drain(server.url));
      assert.equal(picked.length, 1, "ending edit mode is a deselect");
      assert.equal(picked[0].data.selector, null);
      // The deselect is a notice, and a notice must not drag the panel back
      // open after the user has closed it.
      assert.equal(
        await page.evaluate(`document.body.classList.contains("mp-chat-open")`),
        false,
        "the panel stayed closed"
      );
    });
  });

  // The half that makes a selection a running context rather than a one-shot
  // tag: the chip survives sending, so the SECOND request still has a target.
  await t.test("the selection stays attached across several messages", async () => {
    await withPage(async (page) => {
      await page.dblclick("#probe");
      await page.waitForTimeout(SETTLE_MS);
      // Double-click opens the element for editing; get out of it before typing.
      await page.evaluate(`${CHROME}.querySelector("#mp-chat-input").focus()`);

      await send(page, "make it bigger");
      await send(page, "and bold");
      await page.waitForTimeout(SETTLE_MS);

      const said = (await drain(server.url)).filter((m) => m.kind === "message");
      assert.deepEqual(
        said.map((m) => m.text),
        ["make it bigger", "and bold"],
        "both messages arrived"
      );
      for (const m of said) {
        assert.equal(
          m.data?.selector,
          "#probe",
          `"${m.text}" carries the selected element`
        );
      }
      assert.match(await chipLabel(page), /#probe/, "and the chip is still standing");
    });
  });

  // The reload the model's own edit causes lands mid-conversation about one
  // element. Losing the chip there loses the context exactly when the user is
  // iterating on it.
  await t.test("the selection survives the model's edit reloading the tab", async () => {
    await withPage(async (page) => {
      await page.dblclick("#probe");
      await page.waitForTimeout(SETTLE_MS);
      await drain(server.url);

      await writePage("AFTER");
      await page.waitForFunction(
        () => document.getElementById("probe")?.textContent === "AFTER",
        null,
        { timeout: 15000 }
      );
      await page.waitForFunction(`!!${CHROME}.querySelector(".mp-attach-label")`, null, {
        timeout: 15000,
      });

      assert.match(await chipLabel(page), /#probe/, "the chip came back");
      assert.equal(
        await page.evaluate(`!!document.querySelector("#probe.mp-selected")`),
        true,
        "and the element is still outlined on the page"
      );
      await page.waitForTimeout(SETTLE_MS);
      assert.equal(
        selections(await drain(server.url)).length,
        0,
        "restoring what the model already knows says nothing"
      );
    });
  });

  // ...but if its edit took the element away, the model's context IS stale.
  await t.test("an element the edit removed reports a deselect", async () => {
    await withPage(async (page) => {
      await page.dblclick("#other");
      await page.waitForTimeout(SETTLE_MS);
      await drain(server.url);

      await fs.writeFile(
        file,
        assemble(template, documentCss, "AFTER").replace(
          '<p id="other">Sweep the floor.</p>',
          ""
        )
      );
      await page.waitForFunction(() => !document.getElementById("other"), null, {
        timeout: 15000,
      });
      await page.waitForTimeout(SETTLE_MS);

      const picked = selections(await drain(server.url));
      assert.equal(picked.length, 1, "the model is told its target is gone");
      assert.equal(picked[0].data.selector, null);
    });
  });
});
