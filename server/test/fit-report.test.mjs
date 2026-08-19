// A page that does not fit its sheets is the one error the shell can find on
// its own — and the one the user cannot do anything about, because the layout
// is the model's. So the shell says so in red, and puts a FIX button next to
// the message: pressing it hands the problem to the model over the live
// channel, and the line reads "… fixing" until the model's edit lands and the
// page re-measures itself clean.
//
// The press is the whole contract. Nothing about the page's problem reaches
// the model unasked — an edit to the user's document is not something the page
// starts behind their back.
//
// Asserted here, in the order the user would meet it: the toolbar says it and
// nothing goes out, the button hands it over on a press, the message clears
// when the fix arrives, the button comes back for a problem that survived, a
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
const SETTLE_MS = 3000;   // several shell live-channel ticks (1.5s each)

const LONG = Array.from({ length: 120 }, (_, i) =>
  `<p data-i="${i}">Paragraph ${String(i).padStart(3, "0")} — lorem ipsum dolor sit amet.</p>`).join("\n");
const SHORT = `<h1 id="probe">Short</h1><p id="body">Comfortably inside one sheet.</p>`;

// Read the log without being anyone: no consumer=model, so this neither
// registers a listener nor moves the model's cursor. It is how the tests that
// assert SILENCE look, without the looking itself making the page think a
// model has turned up.
async function peek(serverUrl, after = 0) {
  const res = await fetch(`${serverUrl}/chat/messages?from=user&after=${after}&wait=0`);
  assert.equal(res.ok, true, "peeking at the live log");
  return (await res.json()).messages;
}

// The id everything said so far ends at, so a later peek can ask only about
// what happened since — the log keeps every entry, drained or not.
const logMark = async (serverUrl) =>
  (await peek(serverUrl)).reduce((max, m) => Math.max(max, m.id), 0);

// Drain the way `chat-cli.mjs wait` does: as the model, server-wide, from the
// server-held cursor, without blocking. Doing this is also what makes the page
// see a model listening — which is what enables the FIX button.
async function drain(serverUrl) {
  const res = await fetch(`${serverUrl}/chat/messages?consumer=model&from=user&wait=0`);
  assert.equal(res.ok, true, "draining the live log");
  return (await res.json()).messages;
}

const fits = (msgs) => msgs.filter((m) => m.kind === "fit");

// Poll the log until a fit report turns up. There is a 1.5s channel tick
// between the page and the server, so a fixed sleep here is a flake waiting to
// happen.
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
  const btn = ${CHROME}.getElementById("mp-fit-fix");
  const cs = getComputedStyle(el);
  const bcs = getComputedStyle(btn);
  return {
    shown: cs.display !== "none",
    color: cs.color,
    text: el.querySelector(".mp-fit-label").textContent,
    title: el.title,
    fixing: el.hasAttribute("data-mp-fixing"),
    dots: el.querySelectorAll(".mp-fit-dot").length,
    fix: {
      shown: bcs.display !== "none",
      disabled: btn.disabled,
      label: btn.textContent,
      bg: bcs.backgroundColor,
      ink: bcs.color,
    },
  };
})()`);

// Wait for the toolbar to reach a state, rather than for a duration — the
// button's enabled state waits on the channel tick that notices the model.
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

// The message is up and the button on it is live. `shown` on the badge is
// load-bearing: a child of a display:none element still computes its own
// display, so the button alone says nothing about whether either is visible.
const offered = (b) => b.shown && b.fix.shown && !b.fix.disabled;
const pressFix = (page) => page.evaluate(`${CHROME}.getElementById("mp-fit-fix").click()`);

test("a page that stops fitting offers itself to the model", async (t) => {
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

  // FIRST, before anything in this file has read the log as the model: with
  // nobody listening the problem still shows, and the button that would hand
  // it over stands there disabled rather than vanishing.
  await t.test("with nobody listening, the problem shows and the button waits", async () => {
    await withPage("overflow", async (page) => {
      const badge = await waitForBadge(page, (b) => b.shown);
      assert.equal(badge.shown, true, "the notice is up");
      assert.equal(badge.fix.shown, true, "and so is the button");
      assert.equal(badge.fix.disabled, true, "but there is nobody to hand it to");
      assert.match(badge.title, /No model is listening/, badge.title);
      await page.waitForTimeout(SETTLE_MS);
      assert.equal(fits(await peek(server.url)).length, 0, "and nothing went out");
    });
  });

  await t.test("the toolbar says it in red, with a FIX button beside it", async () => {
    await withPage("overflow", async (page) => {
      await drain(server.url);               // a model turns up
      const badge = await waitForBadge(page, offered);
      assert.equal(badge.dots, 1, "an indicator to flash");
      assert.equal(badge.fixing, false, "nothing is fixing it yet");
      assert.match(badge.text, /^content runs onto \d+ sheets$/, badge.text);
      assert.match(badge.fix.label, /^fix$/i, badge.fix.label);
      assert.equal(offered(badge), true, "and the button is live");
      // Red, not the amber notice colour it used to wear: this is an error.
      // Chromium reports the token back in its authored oklch form.
      const [, chroma, hue] = badge.color.match(/oklch\([\d.]+ ([\d.]+) ([\d.]+)/) || [];
      assert.ok(chroma && Number(chroma) > 0.1 && Number(hue) > 5 && Number(hue) < 45,
        `expected a saturated red status, got ${badge.color}`);
      // Prominent, not another quiet outline: the button is filled with the
      // same red the message is written in.
      assert.equal(badge.fix.bg, badge.color, "the button is solid in the error colour");
      assert.notEqual(badge.fix.ink, badge.color, "with its label knocked out of it");
    });
  });

  // The point of the change: the hand-off happens because someone asked for
  // it, and only then.
  await t.test("pressing FIX hands the problem to the model", async () => {
    await withPage("overflow", async (page) => {
      await drain(server.url);
      await waitForBadge(page, offered);
      await pressFix(page);

      const reported = await waitForFit(server.url);
      assert.equal(reported.length, 1, "exactly one fit report");
      assert.equal(reported[0].from, "user");
      assert.equal(reported[0].page, "/overflow.html", "and it names the page it came from");
      assert.match(reported[0].text, /content runs onto \d+ sheets/);
      assert.equal(reported[0].data.authored, 1);
      assert.ok(reported[0].data.rendered > 1, `rendered: ${reported[0].data.rendered}`);
      assert.equal(reported[0].data.paper, "letter", "the paper it did not fit");

      // And the toolbar switches from asking to reporting.
      const badge = await waitForBadge(page, (b) => b.fixing);
      assert.equal(badge.fixing, true, "marked as being fixed");
      assert.match(badge.text, /content runs onto \d+ sheets …fixing/, badge.text);
      assert.equal(badge.fix.shown, false, "the button steps aside while the model has it");
      assert.match(badge.title, /is fixing it/, badge.title);
    });
  });

  // The model's edit is what ends it — the shell never clears the message on
  // its own, it re-measures a page that fits and there is nothing left to say.
  await t.test("the model's fix reloads the page and takes the message with it", async () => {
    await withPage("overflow", async (page) => {
      await drain(server.url);
      await waitForBadge(page, offered);
      await pressFix(page);
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

  // A problem the model could not fix is not swallowed and not looped: the
  // line stands as a plain statement, and the button comes back to press
  // again — which is the user's call, not the page's.
  await t.test("a problem that survives puts the button back, and it sends again", async () => {
    await withPage("overflow", async (page) => {
      await drain(server.url);
      await waitForBadge(page, offered);
      await pressFix(page);
      assert.equal((await waitForFit(server.url)).length, 1);
      await waitForBadge(page, (b) => b.fixing);

      // The model's reply arrives with the page no better than before.
      await fetch(`${server.url}/chat/overflow.html/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: "model", kind: "status", text: "", data: { state: "done" } }),
      });

      const back = await waitForBadge(page, (b) => offered(b) && !b.fixing);
      assert.equal(back.shown, true, "the problem is still stated");
      assert.equal(back.fixing, false, "and no longer pretends to be in progress");
      assert.ok(!/fixing/.test(back.text), back.text);
      assert.equal(offered(back), true, "with the button back to press again");

      await pressFix(page);
      assert.equal((await waitForFit(server.url)).length, 1, "a second press is a second report");
    });
  });

  await t.test("a page that fits reports nothing and shows nothing", async () => {
    await withPage("fits", async (page) => {
      await drain(server.url);
      await page.waitForTimeout(SETTLE_MS);
      assert.equal(fits(await drain(server.url)).length, 0);
      assert.equal((await badgeState(page)).shown, false);
    });
  });

  // The other way a page stops fitting: the user types into it. Their text is
  // as capable of outgrowing a sheet as the model's was, and they can no more
  // fix the layout than before — so it takes the same path, button and all.
  await t.test("a user's own edit that outgrows the sheet gets the same button", async () => {
    await withPage("fits", async (page) => {
      await drain(server.url);
      await page.waitForTimeout(SETTLE_MS);
      await drain(server.url);   // start from a quiet log

      const mark = await logMark(server.url);
      await page.evaluate(`${CHROME}.getElementById("mp-btn-edit").click()`);
      await page.dblclick("#body");
      // Enough to outgrow the sheet several times over — the point is the
      // path it takes, not where exactly the first break lands.
      await page.keyboard.insertText(
        Array.from({ length: 300 }, (_, i) => `Sentence ${i} that the user typed into the page.`).join(" "));
      await page.keyboard.press("Escape");   // commits the edit

      const badge = await waitForBadge(page, offered);
      assert.equal(badge.shown, true, "they see it straight away");
      assert.match(badge.text, /content runs onto \d+ sheets/, badge.text);
      assert.equal(fits(await peek(server.url, mark)).length, 0, "and nothing went out on its own");

      await pressFix(page);
      const reported = await waitForFit(server.url);
      assert.equal(reported.length, 1, "the press reports it once");
      assert.ok(reported[0].data.rendered > 1, `rendered: ${reported[0].data.rendered}`);

      // The typing reached the file too — the model is being sent to read a
      // page that already contains what they typed.
      const saved = await fs.readFile(path.join(dir, "fits.html"), "utf-8");
      assert.match(saved, /Sentence 299/, "the edit was saved before the report went out");
      assert.match(saved, /data-mp-edited/, "and is marked as theirs");
      await write("fits", SHORT);
    });
  });
});
