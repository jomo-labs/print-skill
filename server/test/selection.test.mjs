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

// Drain the way `chat-cli.mjs wait` does: as the model, from the server-held
// cursor, without blocking — and server-wide, naming no page, which is how a
// model actually listens.
async function drain(serverUrl) {
  const res = await fetch(`${serverUrl}/chat/messages?consumer=model&from=user&wait=0`);
  assert.equal(res.ok, true, "draining the live log");
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

// Selecting is a hunt that runs INWARD as often as sideways: the quote, then
// the paragraph inside it. Its own test because it needs nested content — and
// because the browser is what breaks it. Focus moving INTO an editing host
// never blurs that host, so the ancestor's edit session is one nothing ends:
// it stays contentEditable, wearing the browser's focus ring, right beside the
// child the user just picked. Two marked elements, and no way to tell which
// one the model is looking at.
test("selecting a nested child releases its ancestor", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "print-skill-nested-"));
  const [template, documentCss] = await Promise.all([
    fs.readFile(path.join(ASSETS, "page_template.html"), "utf-8"),
    fs.readFile(path.join(ASSETS, "shell", "document.css"), "utf-8"),
  ]);
  await fs.writeFile(
    path.join(dir, "page.html"),
    template.replace("/* @@DOCUMENT_CSS@@ */", documentCss).replace(
      "<!-- CONTENT -->",
      // The padding is what makes the ancestor clickable in its own right —
      // the same reason a real quote or callout is: it has room around the
      // child that belongs to it and not to the child.
      `<blockquote id="outer" style="padding:40px"><p id="inner">Nested text.</p></blockquote>`
    )
  );

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

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route("**://fonts.g*/**", (route) => route.abort());
  await openPage(page, `${server.url}/page.html`);
  await drain(server.url);

  // Double-click the ancestor's own padding, where the child is not.
  const box = await page.locator("#outer").boundingBox();
  await page.mouse.dblclick(box.x + 8, box.y + 8);
  await page.waitForTimeout(SETTLE_MS);
  assert.equal(await outlined(page), "outer", "the ancestor is the subject first");
  assert.equal(selections(await drain(server.url)).length, 1, "and the model was told so");

  await page.dblclick("#inner");
  await page.waitForTimeout(SETTLE_MS);

  const marked = await page.evaluate(
    `[...document.querySelectorAll(".mp-selected")].map((e) => e.id)`
  );
  assert.deepEqual(marked, ["inner"], "one outline, on the child — the ancestor let go");
  const editable = await page.evaluate(
    `[...document.querySelectorAll('[contenteditable="true"]')].map((e) => e.id)`
  );
  assert.deepEqual(editable, ["inner"], "and one editable element, so no stray focus ring");
  assert.equal(
    await page.evaluate(`document.activeElement?.id`),
    "inner",
    "typing goes to the child the user picked"
  );

  const picked = selections(await drain(server.url));
  assert.equal(picked.length, 1, "the move inward is its own notice");
  assert.equal(picked[0].data.selector, "#inner", "naming the child, not the quote");
  await page.close();
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

// A model connects to the SERVER, not to a page. This is what lets "start the
// server" and "be reachable on it" be one act: there is no page to name, so a
// turn whose only job was to start the server has no excuse to end unwatched.
test("one listener sees every page, including ones made later", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "print-skill-allpages-"));
  const [template, documentCss] = await Promise.all([
    fs.readFile(path.join(ASSETS, "page_template.html"), "utf-8"),
    fs.readFile(path.join(ASSETS, "shell", "document.css"), "utf-8"),
  ]);
  const write = (name, heading) =>
    fs.writeFile(path.join(dir, `${name}.html`), assemble(template, documentCss, heading));
  await Promise.all([write("alpha", "Alpha"), write("beta", "Beta")]);

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

  const selectIn = async (name) => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.route("**://fonts.g*/**", (route) => route.abort());
    await openPage(page, `${server.url}/${name}.html`);
    await page.dblclick("#probe");
    await page.waitForTimeout(SETTLE_MS);
    return page;
  };

  const a = await selectIn("alpha");
  const b = await selectIn("beta");
  const first = selections(await drain(server.url));
  assert.deepEqual(
    first.map((m) => m.page).sort(),
    ["/alpha.html", "/beta.html"],
    "one drain, both pages — and each says which it came from"
  );
  await a.close();
  await b.close();

  // The listener was already running when this page came into existence. A
  // per-page subscription would need to be told about it; this one does not.
  await write("gamma", "Gamma");
  const c = await selectIn("gamma");
  const late = selections(await drain(server.url));
  assert.equal(late.length, 1, "the new page is seen without re-subscribing");
  assert.equal(late[0].page, "/gamma.html");
  await c.close();

  // And presence is server-wide with it: a model watching the server shows as
  // connected on every page, not just the one it happened to name.
  const state = await (await fetch(`${server.url}/chat/alpha.html/messages?wait=0`)).json();
  assert.equal(state.listening, true, "alpha's toolbar sees the model that was never told about alpha");
});

// Paper is finite, so any document worth printing eventually runs onto a
// second sheet — and edit mode used to stop at the first one. A continuation
// sheet is a SIBLING of the sheet it continues (makeContinuation), so the
// containment test edit mode asked ("is this inside the page?") was false for
// everything standing on it: no hover, no double-click, no selection, on every
// sheet past one. Where the double-click did land — a nested assembly, whose
// sheets sit inside the container — the selector it sent named the RUNTIME
// SPLIT: `#page > div:nth-of-type(3)` for a sheet the shell had just invented,
// which in the file is either nothing at all or, worse, a different authored
// sheet at the same index. Silently the wrong address is worse than none.
//
// So: the sheets the overflow ran onto are the same document, and what the
// model is told about them is where the FILE has them.
const NESTED_SHEET_CSS = `<style id="mp-nested-sheets">
#page { padding: 0 !important; border: none !important; background: transparent !important; }
#page > footer { display: none; }
#page > .page {
  width: 100%; height: 1056px; margin: 0 0 40px; padding: 64px;
  background: #fff !important; display: flex; flex-direction: column;
}
</style>`;

test("edit mode reaches every sheet, not just the first", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "print-skill-sheets-"));
  const [template, documentCss] = await Promise.all([
    fs.readFile(path.join(ASSETS, "page_template.html"), "utf-8"),
    fs.readFile(path.join(ASSETS, "shell", "document.css"), "utf-8"),
  ]);
  const build = (body, extraHead = "") =>
    template
      .replace("/* @@DOCUMENT_CSS@@ */", documentCss)
      .replace('<style id="content-overrides"></style>', extraHead + '<style id="content-overrides"></style>')
      .replace("<!-- CONTENT -->", body);

  // Long enough to need several sheets; each paragraph says which one it is,
  // so an assertion can name the element it means without an id (an id would
  // let buildSelector short-circuit past everything under test).
  const para = (i) => `<p data-i="${i}">Paragraph ${String(i).padStart(3, "0")} — lorem ipsum dolor sit amet.</p>`;
  const long = Array.from({ length: 120 }, (_, i) => para(i)).join("\n");
  // One paragraph taller than any sheet: the only content the fitting CUTS,
  // leaving a shell on the next sheet that is not an element in the file.
  const mega = `<p data-i="mega">${Array.from({ length: 1400 }, (_, i) => "w" + i).join(" ")}</p>`;
  const nestedSheet = (tag, n) =>
    `<div class="page"><h2>Sheet ${tag}</h2>` +
    Array.from({ length: n }, (_, i) => para(`${tag}-${i}`)).join("\n") +
    `<footer><span></span><span></span></footer></div>`;

  const files = {
    long: build(long),
    mega: build(mega),
    nested: build(nestedSheet("A", 5) + nestedSheet("B", 60), NESTED_SHEET_CSS),
  };
  for (const [name, html] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, `${name}.html`), html);
  }

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

  const withPage = async (name, fn) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route("**://fonts.g*/**", (route) => route.abort());
    try {
      await openPage(page, `${server.url}/${name}.html`);
      await drain(server.url);
      await fn(page);
    } finally {
      await page.close();
    }
  };

  // What the MODEL would find: the file as it sits on disk, which is the
  // authored flow — no continuation sheets, no shells. A selector that means
  // anything has to resolve here.
  const inFile = async (name, selector) => {
    const page = await browser.newPage();
    await page.route("**://fonts.g*/**", (route) => route.abort());
    try {
      await page.setContent(await fs.readFile(path.join(dir, `${name}.html`), "utf-8"));
      return await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el && { i: el.dataset.i ?? null, edited: el.hasAttribute("data-mp-edited"), text: el.textContent };
      }, selector);
    } finally {
      await page.close();
    }
  };

  // The first data-i on the first sheet the overflow ran onto.
  const onSecondSheet = (page) => page.evaluate(() =>
    document.querySelector("[data-mp-continuation] p")?.dataset.i ?? null);

  // Scrolling to reach a later sheet clears the hover box (it is pinned to
  // viewport coordinates and the canvas has its own scroll region), so the
  // gesture under test is the move that follows — the same order a hand does
  // it in.
  const hover = async (page, selector) => {
    await page.hover(selector);
    const box = await page.locator(selector).boundingBox();
    await page.mouse.move(box.x + 6, box.y + 6);
    await page.waitForTimeout(50);
  };

  await t.test("a sheet the overflow ran onto answers the hover", async () => {
    await withPage("long", async (page) => {
      const i = await onSecondSheet(page);
      assert.ok(i, "the fixture has to overflow, or this proves nothing");
      // The premise of the bug: this paragraph is NOT inside the page element.
      assert.equal(
        await page.evaluate((sel) => document.getElementById("page").contains(document.querySelector(sel)),
          `p[data-i="${i}"]`),
        false,
        "a continuation sheet is a sibling of the sheet it continues"
      );

      await hover(page, `p[data-i="${i}"]`);
      assert.equal(
        await page.evaluate(`${CHROME}.querySelector(".mp-hover-box .mp-hover-label")?.textContent ?? null`),
        "Paragraph — double-click to edit",
        "the element offers itself for editing, same as on sheet one"
      );
    });
  });

  await t.test("a double-click on a later sheet selects, and names the file's element", async () => {
    await withPage("long", async (page) => {
      const i = await onSecondSheet(page);
      await page.dblclick(`p[data-i="${i}"]`);
      await page.waitForTimeout(SETTLE_MS);

      assert.equal(
        await page.evaluate(`document.querySelector(".mp-selected")?.dataset.i ?? null`),
        i,
        "the paragraph is outlined"
      );
      const picked = selections(await drain(server.url));
      assert.equal(picked.length, 1, "and the model is told, unprompted");
      assert.deepEqual(
        (await inFile("long", picked[0].data.selector))?.i,
        i,
        `the selector ${picked[0].data.selector} finds that same paragraph in the file`
      );
      assert.match(picked[0].data.snapshot, new RegExp(`data-i="${i}"`), "the snapshot is of the element itself");
    });
  });

  await t.test("a nested assembly's continuation does not address the wrong sheet", async () => {
    await withPage("nested", async (page) => {
      const i = await onSecondSheet(page);
      assert.ok(i?.startsWith("B-"), "the long nested sheet is the one that overflows");
      await page.dblclick(`p[data-i="${i}"]`);
      await page.waitForTimeout(SETTLE_MS);

      const picked = selections(await drain(server.url));
      assert.equal(picked.length, 1);
      const found = await inFile("nested", picked[0].data.selector);
      // The old selector resolved to nothing here — or, on a document with a
      // third authored sheet, to an element on it.
      assert.deepEqual(found?.i, i, `${picked[0].data.selector} names the authored sheet, not the invented one`);
    });
  });

  await t.test("an edit typed on a later sheet is saved, and marked as theirs", async () => {
    await withPage("long", async (page) => {
      const i = await onSecondSheet(page);
      await page.dblclick(`p[data-i="${i}"]`);
      await page.keyboard.type("TYPED-LATE ");
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        (sel) => document.querySelector(sel)?.hasAttribute("data-mp-edited"),
        `p[data-i="${i}"]`,
        { timeout: 15000 }
      );
      await page.waitForTimeout(SETTLE_MS);

      const saved = await inFile("long", `p[data-i="${i}"]`);
      assert.match(saved.text, /TYPED-LATE/, "the words reached the file");
      assert.equal(saved.edited, true, "and the marker the model looks for came with them");
    });
  });

  // The one element that is not simply moved onto the next sheet but CUT in
  // two. The half the user typed into is a shell the file does not have, so
  // both the address and the marker have to land on the element it came from.
  await t.test("an edit typed into the tail of a cut element lands on the element", async () => {
    await withPage("mega", async (page) => {
      const shell = '[data-mp-split]';
      assert.equal(await page.evaluate(`document.querySelectorAll("${shell}").length`), 1,
        "the fixture has to be cut, or this proves nothing");
      await page.dblclick(`${shell}`);
      await page.keyboard.type("TYPED-IN-THE-TAIL ");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(SETTLE_MS * 2);

      const picked = selections(await drain(server.url));
      assert.equal(picked.length, 1, "the shell is selectable like anything else");
      assert.deepEqual((await inFile("mega", picked[0].data.selector))?.i, "mega",
        "and it is reported as the paragraph it is part of");

      const saved = await inFile("mega", 'p[data-i="mega"]');
      assert.match(saved.text, /TYPED-IN-THE-TAIL/, "the words reached the file");
      assert.equal(saved.edited, true, "on the element the file has, not the shell that is gone");
    });
  });
});
