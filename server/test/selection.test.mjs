// Selecting an element is how the page tells the model what the user means.
//
// It is the ONLY thing the page sends, and it is STATE, not an event: the
// server holds the latest selection per page, the page shows the user it is on
// record, and the model reads it at the moment a request needs a target. There
// is nothing to subscribe to, which is the point — the push version of this
// bought an instant acknowledgment and cost a background listener, a
// notification per click, and agents that grew six watchers re-arming each
// other.
//
// So what is asserted here is that the record is always right: it survives a
// hunt through several elements, the reload the model's own edit causes, and a
// restart of the server underneath it — and it clears when the user lets go.
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
  openEditMode as openPage, cliSelection as selection, selectionBecomes,
} from "./helpers.mjs";

const NOTICE_MS = 400; // shell.js SELECT_NOTICE_MS
const SETTLE_MS = 3 * NOTICE_MS; // long enough that the post would have gone out

function assemble(template, documentCss, heading) {
  return fillTemplate(template, documentCss,
    `<h1 id="probe">${heading}</h1><p id="other">Sweep the floor.</p>`);
}

// The record itself, rather than the sentence built from it — for the
// assertions that have to check the selector the model would act on.
async function record(serverUrl, page) {
  const body = await (await fetch(`${serverUrl}/chat/selection`)).json();
  return body.selections.filter((s) => page === undefined || s.page === page);
}

// The selection's traces on screen: the outline, and the line the toolbar
// shows the user so they know they need only ask.
const outlined = (page) =>
  page.evaluate(`document.querySelector(".mp-selected")?.id ?? null`);
const toolbarLine = (page) =>
  page.evaluate(`${CHROME}.querySelector("#mp-live-status .mp-live-label")?.textContent ?? ""`);

test("what the user selects is on record, and the page says so", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "print-skill-selection-"));
  const { template, documentCss } = await loadPageParts();
  const file = path.join(dir, "page.html");
  const writePage = (heading) => fs.writeFile(file, assemble(template, documentCss, heading));

  const server = await startServer({ dir, port: 0 });
  const browser = await launchTestBrowser();
  t.after(async () => {
    await browser.close();
    await server.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  const withPage = async (fn) => {
    await writePage("BEFORE");
    const page = await openTab(browser);
    try {
      await openPage(page, `${server.url}/page.html`);
      await fn(page);
    } finally {
      await page.close();
    }
  };

  // The whole contract in one case: click, and the model can find out what you
  // meant without you describing it.
  await t.test("double-clicking puts the element on record", async () => {
    await withPage(async (page) => {
      assert.equal(await selection(server.url), "NO_SELECTION", "nothing yet");

      await page.dblclick("#probe");
      await page.waitForTimeout(SETTLE_MS);

      assert.equal(
        await selection(server.url),
        'Title was selected.  [/page.html #probe "BEFORE"]',
        "the model reads a sentence, with page and selector to act on"
      );
    });
  });

  // The user's half of the deal: they can see that pointing worked, so nobody
  // has to tell them.
  await t.test("and the page tells the user they need only ask", async () => {
    await withPage(async (page) => {
      assert.equal(await toolbarLine(page), "Ask your model for any changes, or select a specific element here to edit.",
        "at rest, the standing invitation — not a claim about this element");

      await page.dblclick("#probe");
      await page.waitForTimeout(SETTLE_MS);

      assert.equal(
        await toolbarLine(page),
        'Title ("BEFORE") selected & sent to model',
        "named the way the user saw it on hover, with enough text to recognise"
      );
      assert.equal(await outlined(page), "probe");
    });
  });

  // A read is not a queue: asking twice gives the same answer, because it is
  // state. This is what lets the model look it up whenever it happens to need
  // it, rather than catching it as it goes past.
  await t.test("reading it does not consume it", async () => {
    await withPage(async (page) => {
      await page.dblclick("#probe");
      await page.waitForTimeout(SETTLE_MS);
      const first = await selection(server.url);
      assert.match(first, /#probe/);
      assert.equal(await selection(server.url), first, "still there, unchanged");
      assert.equal(await selection(server.url), first);
    });
  });

  // Selecting is a hunt. Only where they landed is on record.
  await t.test("only the element they settled on is on record", async () => {
    await withPage(async (page) => {
      await page.dblclick("#probe");
      await page.dblclick("#other");
      await page.dblclick("#probe");
      await page.waitForTimeout(SETTLE_MS);
      assert.match(await selection(server.url), /#probe/);

      // ...and a deliberate switch, well after the debounce, replaces it.
      await page.dblclick("#other");
      await page.waitForTimeout(SETTLE_MS);
      assert.match(await selection(server.url), /#other "Sweep the floor."/);
    });
  });

  // Without this the model keeps steering later requests at an element the
  // user has visibly let go of.
  await t.test("leaving edit mode clears the record", async () => {
    await withPage(async (page) => {
      await page.dblclick("#probe");
      await page.waitForTimeout(SETTLE_MS);
      assert.match(await selection(server.url), /#probe/);

      await page.evaluate(`${CHROME}.getElementById("mp-btn-edit").click()`); // Done
      await page.waitForTimeout(SETTLE_MS);

      assert.equal(await selection(server.url), "NO_SELECTION");
      assert.equal(await outlined(page), null, "and the outline is gone");
      assert.equal(await toolbarLine(page), "Ask your model for any changes, or select a specific element here to edit.",
        "and the page stops claiming it");
    });
  });

  // Pointing ends when the hand moves away: a click anywhere off the element
  // releases it — outline, toolbar line and record together. Without this the
  // selection outlives the user's interest and sits on top of newer news,
  // like the fit error their own edit just caused.
  await t.test("clicking elsewhere lets the element go", async () => {
    await withPage(async (page) => {
      await page.dblclick("#probe");
      await page.waitForTimeout(SETTLE_MS);
      assert.match(await selection(server.url), /#probe/);

      await page.click("#other");   // a single click — moving on, not selecting
      await page.waitForTimeout(SETTLE_MS);

      assert.equal(await selection(server.url), "NO_SELECTION");
      assert.equal(await outlined(page), null, "the outline went with it");
      assert.equal(await toolbarLine(page), "Ask your model for any changes, or select a specific element here to edit.",
        "and the line is free for whatever is next");
      assert.equal(
        await page.evaluate(`document.body.classList.contains("edit-active")`),
        true,
        "letting go of the element is not leaving edit mode"
      );
    });
  });

  // The reload the model's own edit causes lands mid-conversation about one
  // element. The user did not ask for it and should barely notice it: losing
  // the record loses the context exactly when they are iterating, and losing
  // EDIT MODE throws them out of the thing they were doing — cursor, controls
  // and selection gone at once, for an edit they requested.
  await t.test("edit mode and the record survive the model's edit", async () => {
    await withPage(async (page) => {
      await page.dblclick("#probe");
      await page.waitForTimeout(SETTLE_MS);

      await writePage("AFTER");
      await page.waitForFunction(
        () => document.getElementById("probe")?.textContent === "AFTER",
        null,
        { timeout: 15000 }
      );
      await page.waitForFunction(`!!document.querySelector(".mp-selected")`, null, { timeout: 15000 });

      assert.equal(
        await page.evaluate(`document.body.classList.contains("edit-active")`),
        true,
        "still in edit mode — the reload was the model's doing, not the user's"
      );
      assert.equal(
        await page.evaluate(`${CHROME}.querySelector("#mp-btn-edit-label")?.textContent`),
        "Stop Editing",
        "and the toolbar agrees, so the button still does what it says"
      );
      assert.equal(await outlined(page), "probe", "the element is outlined again");
      assert.match(await selection(server.url), /#probe/, "and still on record");
      assert.match(
        await toolbarLine(page),
        /^Title \("AFTER"\) selected & sent to model$/,
        "and the page still says so, with the element's new text"
      );
    });
  });

  // A tab the user was NOT editing in must not be dragged into edit mode by
  // an edit landing in it.
  await t.test("a tab that was not editing stays that way", async () => {
    await withPage(async (page) => {
      await page.evaluate(`${CHROME}.getElementById("mp-btn-edit").click()`); // Done
      await writePage("AFTER");
      await page.waitForFunction(
        () => document.getElementById("probe")?.textContent === "AFTER",
        null,
        { timeout: 15000 }
      );
      assert.equal(
        await page.evaluate(`document.body.classList.contains("edit-active")`),
        false
      );
    });
  });

  // ...but if that edit took the element away, the record is a lie.
  await t.test("an element the edit removed drops off the record", async () => {
    await withPage(async (page) => {
      await page.dblclick("#other");
      await page.waitForTimeout(SETTLE_MS);
      assert.match(await selection(server.url), /#other/);

      await fs.writeFile(
        file,
        assemble(template, documentCss, "AFTER").replace('<p id="other">Sweep the floor.</p>', "")
      );
      await page.waitForFunction(() => !document.getElementById("other"), null, { timeout: 15000 });

      assert.equal(await selectionBecomes(server.url, "NO_SELECTION"), "NO_SELECTION");
      assert.equal(await outlined(page), null, "nothing is left outlined");
      assert.equal(
        await page.evaluate(`document.body.classList.contains("edit-active")`),
        true,
        "but they are still editing — only the selection was lost, not the mode"
      );
    });
  });

  // A selector like `#page > p:nth-of-type(2)` can still match after a rewrite
  // while pointing at something else. Holding the wrong element is worse than
  // holding none: the next "make it bigger" would land on a stranger.
  await t.test("a selector that now matches a different kind of element lets go", async () => {
    await withPage(async (page) => {
      await page.dblclick("#other");            // the <p>
      await page.waitForTimeout(SETTLE_MS);
      assert.match(await selection(server.url), /#other/);

      // Same id and position, different kind of element.
      await fs.writeFile(
        file,
        assemble(template, documentCss, "AFTER")
          .replace('<p id="other">Sweep the floor.</p>', '<h2 id="other">Sweep the floor.</h2>')
      );
      await page.waitForFunction(
        () => document.getElementById("other")?.tagName === "H2",
        null,
        { timeout: 15000 }
      );

      assert.equal(await selectionBecomes(server.url, "NO_SELECTION"), "NO_SELECTION");
      assert.equal(await outlined(page), null, "and it is not silently re-marked");
    });
  });
});

// Selecting is a hunt that runs INWARD as often as sideways: the quote, then
// the paragraph inside it. Its own test because it needs nested content — and
// because the browser is what breaks it. Focus moving INTO an editing host
// never blurs that host, so the ancestor's edit session is one nothing ends:
// it stays contentEditable, wearing the browser's focus ring, right beside the
// child the user just picked. Two marked elements, and no way to tell which
// one the model would find on record.
test("selecting a nested child releases its ancestor", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "print-skill-nested-"));
  const { template, documentCss } = await loadPageParts();
  await fs.writeFile(
    path.join(dir, "page.html"),
    fillTemplate(template, documentCss,
      // The padding is what makes the ancestor clickable in its own right —
      // the same reason a real quote or callout is: it has room around the
      // child that belongs to it and not to the child.
      `<blockquote id="outer" style="padding:40px"><p id="inner">Nested text.</p></blockquote>`
    )
  );

  const server = await startServer({ dir, port: 0 });
  const browser = await launchTestBrowser();
  t.after(async () => {
    await browser.close();
    await server.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  const page = await openTab(browser);
  await openPage(page,`${server.url}/page.html`);

  // Double-click the ancestor's own padding, where the child is not.
  const box = await page.locator("#outer").boundingBox();
  await page.mouse.dblclick(box.x + 8, box.y + 8);
  await page.waitForTimeout(SETTLE_MS);
  assert.equal(await outlined(page), "outer", "the ancestor is the subject first");
  assert.match(await selection(server.url), /#outer/, "and it is what the model would read");

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

  // One record, naming the child — not the quote, and not both.
  const record = await selection(server.url);
  assert.equal(record.split("\n").length, 1, "the move inward replaces, it does not add");
  assert.match(record, /#inner/, "naming the child, not the quote");
  await page.close();
});

// The restart case, which needs a server it can kill: the model restarts the
// server and the tab is still open with something selected in it. The new
// process holds no selection, so the page has to put it back on record — or
// the next request that says "make this bigger" has nothing to aim at.
test("a restarted server gets the selection back", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "print-skill-restart-"));
  const { template, documentCss } = await loadPageParts();
  await fs.writeFile(path.join(dir, "page.html"), assemble(template, documentCss, "BEFORE"));

  let server = await startServer({ dir, port: 0 });
  const port = Number(new URL(server.url).port);
  const browser = await launchTestBrowser();
  t.after(async () => {
    await browser.close();
    await server.close().catch(() => {});
    await fs.rm(dir, { recursive: true, force: true });
  });

  const page = await openTab(browser);
  await openPage(page,`${server.url}/page.html`);
  await page.dblclick("#probe");
  await page.waitForTimeout(SETTLE_MS);
  assert.match(await selection(server.url), /#probe/, "the first server knew — the premise");

  await server.close();
  server = await startServer({ dir, port }); // same port: the tab keeps its URL
  assert.equal(await selection(server.url), "NO_SELECTION", "the new one starts blank");

  assert.match(
    await selectionBecomes(server.url, 'Title was selected.  [/page.html #probe "BEFORE"]'),
    /#probe/,
    "and the page puts it back without anyone asking"
  );
  assert.equal(await outlined(page), "probe", "the page never lost it");
  await page.close();
});

// A model asks the SERVER, not a document: it does not have to know which page
// the user is looking at, or be told when they open another.
test("the read covers every page, including ones made later", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "print-skill-allpages-"));
  const { template, documentCss } = await loadPageParts();
  const write = (name, heading) =>
    fs.writeFile(path.join(dir, `${name}.html`), assemble(template, documentCss, heading));
  await Promise.all([write("alpha", "Alpha"), write("beta", "Beta")]);

  const server = await startServer({ dir, port: 0 });
  const browser = await launchTestBrowser();
  t.after(async () => {
    await browser.close();
    await server.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  const selectIn = async (name) => {
    const page = await openTab(browser, { viewport: { width: 1200, height: 800 } });
    await openPage(page, `${server.url}/${name}.html`);
    await page.dblclick("#probe");
    await page.waitForTimeout(SETTLE_MS);
    return page;
  };

  const a = await selectIn("alpha");
  const b = await selectIn("beta");
  assert.deepEqual(
    (await selection(server.url)).split("\n").sort(),
    [
      'Title was selected.  [/alpha.html #probe "Alpha"]',
      'Title was selected.  [/beta.html #probe "Beta"]',
    ],
    "one read, both pages, each saying which it came from"
  );
  // Newest first, so a model taking the top line takes the one they touched last.
  assert.match((await selection(server.url)).split("\n")[0], /beta/);
  // And it can narrow, for a request that clearly means one page.
  assert.equal(
    await selection(server.url, "alpha.html"),
    'Title was selected.  [/alpha.html #probe "Alpha"]'
  );
  await a.close();
  await b.close();

  // This page did not exist when the first two were selected in. Nothing had
  // to be re-subscribed, because nothing was subscribed.
  await write("gamma", "Gamma");
  const c = await selectIn("gamma");
  assert.match((await selection(server.url)).split("\n")[0], /gamma/);
  await c.close();
});

// One of a kind is named by its kind; one of many needs to say which one. The
// index counts the same siblings the selector's nth-of-type does, so the words
// the user reads and the selector the model acts on can never disagree about
// which item is meant.
test("an element among repeats says which one it is", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "print-skill-index-"));
  const { template, documentCss } = await loadPageParts();
  await fs.writeFile(
    path.join(dir, "page.html"),
    fillTemplate(template, documentCss,
      `<h1 id="only">Beef Bulgogi</h1>
       <ul><li>Divide beef into portions and season generously.</li>
           <li>Toast the buns until golden at the edges.</li>
           <li>Rest before serving.</li></ul>`
    )
  );

  const server = await startServer({ dir, port: 0 });
  const browser = await launchTestBrowser();
  t.after(async () => {
    await browser.close();
    await server.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  const page = await openTab(browser);
  await openPage(page,`${server.url}/page.html`);

  await page.dblclick("li >> nth=1");
  await page.waitForTimeout(SETTLE_MS);
  assert.equal(
    await toolbarLine(page),
    'List item #2 ("Toast the buns until…") selected & sent to model',
    "which item, and enough of it to recognise — cut at a word, not mid-syllable"
  );
  // The model is told the same thing in the same words, and the selector it
  // acts on points at that same item.
  const record = await selection(server.url);
  assert.match(record, /^List item #2 was selected\./);
  assert.match(record, /li:nth-of-type\(2\)/);

  // The line belongs to the outlined element, so it wears the element's own
  // colour rather than a status colour of its own — and the name carries the
  // weight, since that is the part worth finding at a glance.
  const dressing = await page.evaluate(`(() => {
    const root = document.getElementById("mp-chrome-root").shadowRoot;
    const status = root.querySelector("#mp-live-status");
    const outline = getComputedStyle(document.querySelector(".mp-selected")).outlineColor;
    return {
      lineInk: getComputedStyle(status).color,
      outline,
      lineWeight: getComputedStyle(status).fontWeight,
      nameWeight: getComputedStyle(root.querySelector(".mp-live-name")).fontWeight,
    };
  })()`);
  assert.equal(dressing.lineInk, dressing.outline, "the same blue as the outline on the page");
  assert.ok(Number(dressing.nameWeight) >= 700, "the name is bold");
  assert.ok(
    Number(dressing.lineWeight) < Number(dressing.nameWeight),
    "and the rest of the sentence is not"
  );

  // The only heading on the page is just "Title" — "#1" would be noise.
  await page.dblclick("#only");
  await page.waitForTimeout(SETTLE_MS);
  assert.equal(
    await toolbarLine(page),
    'Title ("Beef Bulgogi") selected & sent to model',
    "no index when there is nothing to disambiguate"
  );
  await page.close();
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
  const { template, documentCss } = await loadPageParts();
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
  const browser = await launchTestBrowser();
  t.after(async () => {
    await browser.close();
    await server.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  const withPage = async (name, fn) => {
    const page = await openTab(browser);
    try {
      await openPage(page, `${server.url}/${name}.html`);
      await fn(page);
    } finally {
      await page.close();
    }
  };

  // What the MODEL would find: the file as it sits on disk, which is the
  // authored flow — no continuation sheets, no shells. A selector that means
  // anything has to resolve here.
  const inFile = async (name, selector) => {
    const page = await openTab(browser);
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
      const picked = await record(server.url, "/long.html");
      assert.equal(picked.length, 1, "and the model can find out what they meant");
      assert.deepEqual(
        (await inFile("long", picked[0].selector))?.i,
        i,
        `the selector ${picked[0].selector} finds that same paragraph in the file`
      );
    });
  });

  await t.test("a nested assembly's continuation does not address the wrong sheet", async () => {
    await withPage("nested", async (page) => {
      const i = await onSecondSheet(page);
      assert.ok(i?.startsWith("B-"), "the long nested sheet is the one that overflows");
      await page.dblclick(`p[data-i="${i}"]`);
      await page.waitForTimeout(SETTLE_MS);

      const picked = await record(server.url, "/nested.html");
      assert.equal(picked.length, 1);
      const found = await inFile("nested", picked[0].selector);
      // The old selector resolved to nothing here — or, on a document with a
      // third authored sheet, to an element on it.
      assert.deepEqual(found?.i, i, `${picked[0].selector} names the authored sheet, not the invented one`);
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

      const picked = await record(server.url, "/mega.html");
      assert.equal(picked.length, 1, "the shell is selectable like anything else");
      assert.deepEqual((await inFile("mega", picked[0].selector))?.i, "mega",
        "and it is reported as the paragraph it is part of");

      const saved = await inFile("mega", 'p[data-i="mega"]');
      assert.match(saved.text, /TYPED-IN-THE-TAIL/, "the words reached the file");
      assert.equal(saved.edited, true, "on the element the file has, not the shell that is gone");
    });
  });
});
