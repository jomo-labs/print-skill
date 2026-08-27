// Live edit's other half: the model writes the page file, and the tab the
// user is looking at has to show it. The shell polls the served ETag for
// exactly this (shell.js "Auto-reload"), and the rule it enforces is blunt on
// purpose — a changed file reloads the tab immediately, whatever the USER is
// in the middle of. Every previous attempt to be polite about that froze the
// preview on a file that had already changed, and left the user staring at a
// stale page with no reason to press reload.
//
// So the first cases here are the states that used to buy a delay: an idle
// tab, and an uncommitted double-click text edit. The second looks like data
// loss and is worth being precise about, so it's asserted: that edit is
// ALREADY unsaveable once the file changes underneath it — the commit PUTs a
// stale ETag, gets 412, and reloads it away regardless.
//
// The exception is the MODEL, the one party that knows the file is mid-change
// rather than final. It brackets an edit with `status working` / `status
// done`, and the last cases cover that window: held while it works, refreshed
// the instant it reports done, and — the part that decides whether this is an
// improvement or a reinvention of the original bug — released on its own if
// done never comes.
//
//   node --test server/test/          (needs `npm install` in server/)
import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer } from "../server.mjs";
import {
  CHROME, loadPageParts, fillTemplate, launchTestBrowser, openTab, openEditMode,
} from "./helpers.mjs";

const POLL_MS = 1500; // shell.js's auto-reload cadence
const SETTLE_MS = 4 * POLL_MS; // long enough that a reload would have happened

function assemble(template, documentCss, heading) {
  return fillTemplate(template, documentCss, `<h1 id="probe">${heading}</h1>`);
}

const headingOf = (page) => page.evaluate(() => document.getElementById("probe")?.textContent);

async function expectHeading(page, text) {
  await page.waitForFunction(
    (want) => document.getElementById("probe")?.textContent === want,
    text,
    { timeout: 15000 }
  );
}

// What `chat-cli.mjs status <page> <state>` posts, straight to the endpoint.
async function postStatus(serverUrl, state, text = "") {
  const res = await fetch(`${serverUrl}/chat/page.html/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: "model", kind: "status", text, data: { state } }),
  });
  assert.equal(res.ok, true, `posting status ${state}`);
}

test("a page edited on disk reaches the open tab", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "print-skill-live-reload-"));
  const { template, documentCss } = await loadPageParts();
  const file = path.join(dir, "page.html");
  // What the model does when it applies a chat request: rewrite the file.
  const writePage = (heading) => fs.writeFile(file, assemble(template, documentCss, heading));

  const server = await startServer({ dir, port: 0 });
  const browser = await launchTestBrowser();
  t.after(async () => {
    await browser.close();
    await server.close();
  });

  const withPage = async (fn) => {
    await writePage("BEFORE");
    const page = await openTab(browser);
    try {
      await openEditMode(page, `${server.url}/page.html`);
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

  // The model's edit is not one write. Between `working` and `done` the file
  // can hold a heading fixed but its spacing not yet — versions the user was
  // never meant to see, and the reason this window exists at all.
  await t.test("the model's work window holds, and done shows the finished page", async () => {
    await withPage(async (page) => {
      let reloads = 0;
      page.on("framenavigated", () => reloads++);
      await postStatus(server.url, "working", "Rewriting the header");
      await page.waitForFunction(`!!${CHROME}.querySelector("#mp-live-status.mp-live-busy")`); // window open
      await writePage("HALF-DONE");
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      assert.equal(await headingOf(page), "BEFORE", "intermediate writes stay off screen");
      await writePage("AFTER");
      await postStatus(server.url, "done");
      await expectHeading(page, "AFTER");
      assert.equal(reloads, 1, "one reload for the whole edit, not one per write");
    });
  });

  // The failure that would make this a reinvention of the original bug: a
  // model that announces work and never comes back. The window is measured
  // from the status message's own timestamp, so it expires by itself.
  await t.test("a work window nobody closes expires on its own", async () => {
    await withPage(async (page) => {
      await postStatus(server.url, "working", "Rewriting the header");
      await page.waitForFunction(`!!${CHROME}.querySelector("#mp-live-status.mp-live-busy")`);
      await writePage("AFTER");
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      assert.equal(await headingOf(page), "BEFORE", "held while the window is open");
      // The model dies here — no done, ever. Move the tab's clock past the cap.
      await page.clock.setSystemTime(new Date(Date.now() + 60_000));
      await expectHeading(page, "AFTER");
      // Close it for the cases after this one: the log is server-side and
      // shared by every tab of this page, so an abandoned window holds the
      // next tab that loads too (for the rest of the cap). That is the real
      // behavior, not a test artifact — it just isn't this file's only case.
      await postStatus(server.url, "done");
    });
  });
});
