// A page that does not fit its sheets is the one error the shell can find on
// its own — and the one the user cannot do anything about, because the layout
// is the model's. So the shell does not just label it: it says so in red, and
// hands the problem to the model over the live channel, then shows "… fixing"
// until the model's edit lands and the page re-measures itself clean.
//
// Asserted here, in the order the user would meet it: the report goes out, it
// goes out once (a page the model could not fix must not loop back at it), the
// toolbar says what is happening, the message clears when the fix arrives, a
// page that fits says nothing at all — and a user's own browser edit that
// outgrows a sheet takes exactly the same path.
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
const NOTICE_MS = 500;            // shell.js FIT_NOTICE_MS
const SETTLE_MS = 3 * NOTICE_MS;  // long enough that a report would have gone out

const LONG = Array.from({ length: 120 }, (_, i) =>
  `<p data-i="${i}">Paragraph ${String(i).padStart(3, "0")} — lorem ipsum dolor sit amet.</p>`).join("\n");
const SHORT = `<h1 id="probe">Short</h1><p id="body">Comfortably inside one sheet.</p>`;

// Drain the way `chat-cli.mjs wait` does: as the model, server-wide, from the
// server-held cursor, without blocking. Doing this is also what makes the page
// see a model listening, which is what "… fixing" claims.
async function drain(serverUrl) {
  const res = await fetch(`${serverUrl}/chat/messages?consumer=model&from=user&wait=0`);
  assert.equal(res.ok, true, "draining the live log");
  return (await res.json()).messages;
}

const fits = (msgs) => msgs.filter((m) => m.kind === "fit");

// Poll the log until a fit report turns up. The page has a debounce and a
// 1.5s channel tick between it and the server, so a fixed sleep here is a
// flake waiting to happen.
async function waitForFit(serverUrl, ms = 15000) {
  const deadline = Date.now() + ms;
  const seen = [];
  while (Date.now() < deadline) {
    seen.push(...fits(await drain(serverUrl)));
    if (seen.length) return seen;
    await new Promise((r) => setTimeout(r, 250));
  }
  return seen;
}

const badgeState = (page) => page.evaluate(`(() => {
  const el = ${CHROME}.getElementById("mp-fit-badge");
  const cs = getComputedStyle(el);
  return {
    shown: cs.display !== "none",
    color: cs.color,
    text: el.textContent,
    fixing: el.hasAttribute("data-mp-fixing"),
    dots: el.querySelectorAll(".mp-fit-dot").length,
  };
})()`);

// Wait for the toolbar to reach a state, rather than for a duration — the
// "… fixing" suffix waits on the channel tick that notices the model.
async function waitForBadge(page, pred, ms = 15000) {
  const deadline = Date.now() + ms;
  let last = await badgeState(page);
  while (Date.now() < deadline) {
    if (pred(last)) return last;
    await new Promise((r) => setTimeout(r, 200));
    last = await badgeState(page);
  }
  return last;
}

test("a page that stops fitting reports itself to the model", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "print-skill-fit-"));
  const [template, documentCss] = await Promise.all([
    fs.readFile(path.join(ASSETS, "page_template.html"), "utf-8"),
    fs.readFile(path.join(ASSETS, "shell", "document.css"), "utf-8"),
  ]);
  const assemble = (body) => template
    .replace("/* @@DOCUMENT_CSS@@ */", documentCss)
    .replace("<!-- CONTENT -->", body);
  const write = (name, body) => fs.writeFile(path.join(dir, `${name}.html`), assemble(body));

  await write("overflow", LONG);
  await write("fits", SHORT);

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
      await page.goto(`${server.url}/${name}.html`);
      await page.waitForFunction(`!!${CHROME}.getElementById("mp-btn-edit")`);
      await fn(page);
    } finally {
      await page.close();
    }
  };

  // The point of the change: nobody has to notice and nobody has to ask.
  await t.test("the problem reaches the model unprompted", async () => {
    await withPage("overflow", async () => {
      const reported = await waitForFit(server.url);
      assert.equal(reported.length, 1, "exactly one fit report");
      assert.equal(reported[0].from, "user");
      assert.equal(reported[0].page, "/overflow.html", "and it names the page it came from");
      assert.match(reported[0].text, /content runs onto \d+ sheets/);
      assert.equal(reported[0].data.authored, 1);
      assert.ok(reported[0].data.rendered > 1, `rendered: ${reported[0].data.rendered}`);
      assert.equal(reported[0].data.paper, "letter", "the paper it did not fit");
    });
  });

  await t.test("the toolbar says it, in red, as work in progress", async () => {
    await withPage("overflow", async (page) => {
      await waitForFit(server.url);          // also makes the page see a listener
      const badge = await waitForBadge(page, (b) => b.fixing);
      assert.equal(badge.shown, true, "the notice is up");
      assert.equal(badge.dots, 1, "with an indicator to flash");
      assert.equal(badge.fixing, true, "and it is marked as being fixed");
      assert.match(badge.text, /content runs onto \d+ sheets …fixing/, badge.text);
      // Red, not the amber notice colour it used to wear: this is an error.
      // Chromium reports the token back in its authored oklch form.
      const [, chroma, hue] = badge.color.match(/oklch\([\d.]+ ([\d.]+) ([\d.]+)/) || [];
      assert.ok(chroma && Number(chroma) > 0.1 && Number(hue) > 5 && Number(hue) < 45,
        `expected a saturated red status, got ${badge.color}`);
    });
  });

  // The model's edit is what ends it — the shell never clears the message on
  // its own, it re-measures a page that fits and there is nothing left to say.
  await t.test("the model's fix reloads the page and takes the message with it", async () => {
    await withPage("overflow", async (page) => {
      await waitForFit(server.url);
      await waitForBadge(page, (b) => b.fixing);

      await write("overflow", SHORT);
      await fetch(`${server.url}/chat/overflow.html/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: "model", kind: "status", text: "", data: { state: "done" } }),
      });

      const badge = await waitForBadge(page, (b) => !b.shown);
      assert.equal(badge.shown, false, "a page that fits says nothing");
      assert.deepEqual(await page.evaluate(() => window.mpFit), { authored: 1, rendered: 1, overflowing: 0 });
      await write("overflow", LONG);
    });
  });

  // A problem the model could not fix must not be handed back to it forever:
  // the reload its own edit causes would otherwise re-report on every pass.
  await t.test("the same problem is reported once, not once per reload", async () => {
    await withPage("overflow", async (page) => {
      assert.equal((await waitForFit(server.url)).length, 1);

      await page.reload();
      await page.waitForFunction(`!!${CHROME}.getElementById("mp-btn-edit")`);
      await page.waitForTimeout(SETTLE_MS);
      assert.equal(fits(await drain(server.url)).length, 0, "the model already has it");

      // And with nothing in flight any more, the line stands as a plain
      // statement of what is wrong rather than pretending to be in progress.
      const badge = await badgeState(page);
      assert.equal(badge.shown, true);
      assert.equal(badge.fixing, false, "nothing is fixing it now");
      assert.ok(!/fixing/.test(badge.text), badge.text);
    });
  });

  await t.test("a page that fits reports nothing and shows nothing", async () => {
    await withPage("fits", async (page) => {
      await page.waitForTimeout(SETTLE_MS);
      assert.equal(fits(await drain(server.url)).length, 0);
      assert.equal((await badgeState(page)).shown, false);
    });
  });

  // The other way a page stops fitting: the user types into it. Their text is
  // as capable of outgrowing a sheet as the model's was, and they can no more
  // fix the layout than before — so it takes the same path.
  await t.test("a user's own edit that outgrows the sheet takes the same path", async () => {
    await withPage("fits", async (page) => {
      await page.waitForTimeout(SETTLE_MS);
      await drain(server.url);   // start from a quiet log

      await page.evaluate(`${CHROME}.getElementById("mp-btn-edit").click()`);
      await page.dblclick("#body");
      // Enough to outgrow the sheet several times over — the point is the
      // path it takes, not where exactly the first break lands.
      await page.keyboard.insertText(
        Array.from({ length: 300 }, (_, i) => `Sentence ${i} that the user typed into the page.`).join(" "));
      await page.keyboard.press("Escape");   // commits the edit

      const reported = await waitForFit(server.url);
      assert.equal(reported.length, 1, "the edit is reported once");
      assert.match(reported[0].text, /content runs onto \d+ sheets/);
      assert.ok(reported[0].data.rendered > 1, `rendered: ${reported[0].data.rendered}`);

      const badge = await waitForBadge(page, (b) => b.fixing);
      assert.equal(badge.shown, true, "and the user sees it straight away");
      assert.match(badge.text, /…fixing/, badge.text);

      // The typing reached the file too — the model is being sent to read a
      // page that already contains what they typed.
      const saved = await fs.readFile(path.join(dir, "fits.html"), "utf-8");
      assert.match(saved, /Sentence 299/, "the edit was saved before the report went out");
      assert.match(saved, /data-mp-edited/, "and is marked as theirs");
      await write("fits", SHORT);
    });
  });
});
