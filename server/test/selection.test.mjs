// Selecting an element is how the page tells the model what the user means.
//
// It is the ONLY thing the page sends. There is no chat panel: the user asks
// for changes in the model's own session, and the one thing that session
// cannot know is which part of the sheet they are pointing at. So the
// double-click has to carry it — at once, debounced and deduped, with the
// deselect reported too, and surviving both the reload the model's own edit
// causes and a restart of the server underneath it.
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

// Drain repeatedly until a selection turns up or the deadline passes. Used
// where the wait is for the page to NOTICE something (a restarted server)
// rather than for its own debounce — a fixed sleep there is a flake waiting
// to happen, since it has to cover a failed poll, a reconnect and a retry.
async function waitForSelection(serverUrl, ms = 15000) {
  const deadline = Date.now() + ms;
  const seen = [];
  while (Date.now() < deadline) {
    seen.push(...selections(await drain(serverUrl)));
    if (seen.length) return seen;
    await new Promise((r) => setTimeout(r, 250));
  }
  return seen;
}

async function openPage(page, url) {
  await page.goto(url);
  await page.waitForFunction(`!!${CHROME}.getElementById("mp-btn-edit")`);
  await page.evaluate(`${CHROME}.getElementById("mp-btn-edit").click()`);
  await page.waitForFunction(`!!${CHROME}.querySelector("#mp-page-setup")`);
}

// The selection's only on-screen trace, now that the chip is gone.
const outlined = (page) =>
  page.evaluate(`document.querySelector(".mp-selected")?.id ?? null`);

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

  // Without this the model keeps steering later requests at an element the
  // user has visibly let go of.
  await t.test("leaving edit mode reports the deselect", async () => {
    await withPage(async (page) => {
      await page.dblclick("#probe");
      await page.waitForTimeout(SETTLE_MS);
      await drain(server.url);

      await page.evaluate(`${CHROME}.getElementById("mp-btn-edit").click()`); // Done
      await page.waitForTimeout(SETTLE_MS);

      const picked = selections(await drain(server.url));
      assert.equal(picked.length, 1, "the deselect is reported");
      assert.equal(picked[0].data.selector, null, "as an explicit null");
      assert.equal(await outlined(page), null, "and the outline is gone");
    });
  });

  // What makes a selection a running context rather than a one-shot tag: it
  // simply stands. Nothing on the page consumes it, so every request the user
  // makes in their session — one, then another — is still about this element.
  await t.test("a selection stands until it is changed", async () => {
    await withPage(async (page) => {
      await page.dblclick("#probe");
      await page.waitForTimeout(SETTLE_MS);
      assert.equal(selections(await drain(server.url)).length, 1);

      // Time passes, the user reads, types in their session, comes back.
      await page.waitForTimeout(SETTLE_MS * 2);
      assert.equal(await outlined(page), "probe", "still selected on the page");
      assert.equal(
        selections(await drain(server.url)).length,
        0,
        "and nothing was said again — the model's context still holds"
      );
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
      await page.waitForFunction(`!!document.querySelector(".mp-selected")`, null, {
        timeout: 15000,
      });

      assert.equal(await outlined(page), "probe", "the element is outlined again");
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

// The restart case, which is its own test because it needs a server it can
// kill: the model restarts the server (after a crash, or in a later turn) and
// the tab is still open with something selected in it. The new process has an
// empty log and has never heard of that element — so the page has to say it
// again, or the reconnecting model is blind to what the user is pointing at.
test("a restarted server is told the selection again", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "print-skill-restart-"));
  const [template, documentCss] = await Promise.all([
    fs.readFile(path.join(ASSETS, "page_template.html"), "utf-8"),
    fs.readFile(path.join(ASSETS, "shell", "document.css"), "utf-8"),
  ]);
  await fs.writeFile(path.join(dir, "page.html"), assemble(template, documentCss, "BEFORE"));

  let server = await startServer({ dir, port: 0 });
  const port = Number(new URL(server.url).port);
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PRINT_SKILL_CHROMIUM ? { executablePath: process.env.PRINT_SKILL_CHROMIUM } : {}),
  });
  t.after(async () => {
    await browser.close();
    await server.close().catch(() => {});
    await fs.rm(dir, { recursive: true, force: true });
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route("**://fonts.g*/**", (route) => route.abort());
  await openPage(page, `${server.url}/page.html`);
  await page.dblclick("#probe");
  await page.waitForTimeout(SETTLE_MS);
  assert.equal(
    selections(await drain(server.url)).length,
    1,
    "the first server was told — the premise of this case"
  );

  await server.close();
  server = await startServer({ dir, port }); // same port: the tab keeps its URL

  // The tab has to fail a poll, reconnect, meet the new epoch and debounce
  // its notice — so wait for the thing itself, not for a guess at how long.
  const picked = await waitForSelection(server.url);
  assert.equal(picked.length, 1, "the new server is told what is selected");
  assert.equal(picked[0].data.selector, "#probe");
  assert.equal(await outlined(page), "probe", "and the page never lost it");
  await page.close();
});
