// A page that does not fit its sheets is the one error the shell can find on
// its own — and the one the user cannot do anything about, because the layout
// is the model's. So the shell says so in red, in the toolbar's one status
// line, and puts a FIX button next to it: pressing it hands the problem to the
// model over the live channel.
//
// The press is the whole contract. Nothing about the page's problem reaches
// the model unasked — an edit to the user's document is not something the page
// starts behind their back.
//
// The press does two things: the problem goes on the record, and `/print fix`
// goes on the clipboard — the ping itself, carried by the user's own next
// message, which is the only channel there is. The toolbar's line then says
// exactly that. The indicator is the MODEL's alone: it pulses on `status
// working` and rests on done, and nothing this page does can move it — so a
// pulse never claims work that has not started.
//
// Asserted here, in the order the user would meet it: the toolbar says it and
// nothing goes out, the button hands it over on a press, the message clears
// when the fix arrives, the button comes back for a problem that survived, a
// page that fits says nothing at all, a selection takes the line back — and a
// user's own browser edit that outgrows a sheet takes exactly the same path.
//
//   node --test server/test/          (needs `npm install` in server/)
import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer } from "../server.mjs";
import { CHROME, loadPageParts, fillTemplate, launchTestBrowser, openTab } from "./helpers.mjs";

const SETTLE_MS = 3000;   // several shell live-channel ticks (1.5s each)

const LONG = Array.from({ length: 120 }, (_, i) =>
  `<p data-i="${i}">Paragraph ${String(i).padStart(3, "0")} — lorem ipsum dolor sit amet.</p>`).join("\n");
const SHORT = `<h1 id="probe">Short</h1><p id="body">Comfortably inside one sheet.</p>`;

// What is on the record right now. A read, not a drain: the entry stands
// until the page takes it back, so asking twice gives the same answer and
// asking at all changes nothing.
async function fitReport(serverUrl) {
  const res = await fetch(`${serverUrl}/chat/fit`);
  assert.equal(res.ok, true, "reading the fit record");
  return (await res.json()).fits;
}

// Poll the record until a problem turns up. The page has a debounce between
// the press and the server, so a fixed sleep here is a flake waiting to happen.
async function waitForFit(serverUrl, ms = 15000) {
  const deadline = Date.now() + ms;
  let seen = [];
  while (Date.now() < deadline) {
    seen = await fitReport(serverUrl);
    if (seen.length) return seen;
    await new Promise((r) => setTimeout(r, 250));
  }
  return seen;
}

// ...and until it empties again: a page that comes back into fit takes its own
// report back, which state needs and a stream did not.
async function waitForFits(serverUrl, ms = 15000) {
  const deadline = Date.now() + ms;
  let seen = await fitReport(serverUrl);
  while (Date.now() < deadline && seen.length) {
    await new Promise((r) => setTimeout(r, 250));
    seen = await fitReport(serverUrl);
  }
  return seen;
}

// The model announcing its own work. Nothing can see a listener any more, so
// this is the only way a test can put the page in that state.
const saysWorking = (serverUrl, name, state = "working") =>
  fetch(`${serverUrl}/chat/${name}.html/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: "model", kind: "status", text: "", data: { state } }),
  });

// One reading of the toolbar, or null. Null is a real answer here and not a
// failure: the state this file is about is reached BY A RELOAD (the model's
// fix), so any poll can land on a document that is half-gone or not yet
// injected. Throwing there would fail the test for the very transition it is
// waiting on.
const badgeState = async (page) => {
  try {
    return await page.evaluate(`(() => {
      const root = document.getElementById("mp-chrome-root")?.shadowRoot;
      const el = root?.getElementById("mp-live-status");
      const btn = root?.getElementById("mp-fit-fix");
      const dot = root?.querySelector("#mp-live-status .mp-live-dot");
      if (!el || !btn || !dot) return null;
      const cs = getComputedStyle(el);
      const bcs = getComputedStyle(btn);
      const dcs = getComputedStyle(dot);
      return {
        shown: el.classList.contains("mp-live-error"),
        selected: el.classList.contains("mp-live-selected"),
        color: cs.color,
        // No box any more: red words on the toolbar's own paper.
        border: cs.borderTopWidth,
        background: cs.backgroundColor,
        text: el.querySelector(".mp-live-label").textContent,
        cmd: el.querySelector(".mp-live-cmd")?.textContent ?? null,
        title: el.title,
        // The indicator is one element, always in the DOM, and its pulse is
        // the only thing that says work is happening.
        dots: el.querySelectorAll(".mp-live-dot").length,
        dotShown: dcs.display !== "none",
        pulsing: dcs.animationName !== "none",
        fix: {
          shown: bcs.display !== "none",
          disabled: btn.disabled,
          label: btn.textContent,
          bg: bcs.backgroundColor,
          ink: bcs.color,
        },
      };
    })()`);
  } catch {
    return null;   // navigating: ask again in a moment
  }
};

// Wait for the toolbar to reach a state, rather than for a duration — the
// button's enabled state waits on the channel tick that notices the model.
// Readings taken mid-reload are skipped rather than tested, so the answer is
// always the last thing the toolbar actually said.
async function waitForBadge(page, pred, ms = 15000) {
  const deadline = Date.now() + ms;
  let last = null;
  while (Date.now() < deadline) {
    const now = await badgeState(page);
    if (now) {
      last = now;
      if (pred(now)) return now;
    }
    await new Promise((r) => setTimeout(r, 200));
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
  const { template, documentCss } = await loadPageParts();
  const assemble = (body) => fillTemplate(template, documentCss, body);
  const write = (name, body) => fs.writeFile(path.join(dir, `${name}.html`), assemble(body));

  await write("overflow", LONG);
  await write("fits", SHORT);

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
      await page.goto(`${server.url}/${name}.html`);
      await page.waitForFunction(`!!${CHROME}.getElementById("mp-btn-edit")`);
      await fn(page);
    } finally {
      await page.close();
      // Two of these cases rewrite a fixture to stage the model's answer.
      // They are put back here rather than at the end of the test body, so a
      // failure mid-case cannot hand the next one someone else's document —
      // which turns one failure into three and hides which was the real one.
      await write("overflow", LONG);
      await write("fits", SHORT);
    }
  };

  // The decision is the user's, and the page waits for it: a problem it found
  // entirely by itself still sits there until a hand presses the button.
  await t.test("nothing goes out until the button is pressed", async () => {
    await withPage("overflow", async (page) => {
      const badge = await waitForBadge(page, (b) => b.shown);
      assert.equal(badge.shown, true, "the notice is up");
      assert.equal(badge.fix.shown, true, "and so is the button");
      assert.equal(badge.fix.disabled, false, "ready to press — a served page has somewhere to hand it");
      assert.match(badge.title, /Press Fix/, badge.title);
      await page.waitForTimeout(SETTLE_MS);
      assert.deepEqual(await fitReport(server.url), [], "and nothing went out on its own");
    });
  });

  await t.test("the toolbar says it in red, with a FIX button beside it", async () => {
    await withPage("overflow", async (page) => {
      const badge = await waitForBadge(page, offered);
      assert.equal(badge.dots, 1, "one indicator, and it is the same one as ever");
      assert.equal(badge.dotShown, true, "always present, whatever is being said");
      assert.equal(badge.pulsing, false, "resting — nothing is being done about it yet");
      assert.match(badge.text, /^content runs onto \d+ sheets$/, badge.text);
      assert.match(badge.fix.label, /^fix$/i, badge.fix.label);
      assert.equal(offered(badge), true, "and the button is live");
      // Red text on the toolbar's paper, not a bordered box floated on top of
      // it: the problem is a sentence in the same line everything else uses.
      assert.equal(badge.border, "0px", "no outer box");
      assert.match(badge.background, /rgba\(0, 0, 0, 0\)|transparent/, badge.background);
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
      await waitForBadge(page, offered);
      await pressFix(page);

      const reported = await waitForFit(server.url);
      assert.equal(reported.length, 1, "exactly one fit report");
      assert.equal(reported[0].page, "/overflow.html", "and it names the page it came from");
      assert.match(reported[0].text, /content runs onto \d+ sheets/);
      assert.equal(reported[0].authored, 1);
      assert.ok(reported[0].rendered > 1, `rendered: ${reported[0].rendered}`);
      assert.equal(reported[0].paper, "letter", "the paper it did not fit");
      // A read, not a queue: the model can ask again and still find it.
      assert.deepEqual(await fitReport(server.url), reported, "and it stays on the record");

      // What the user sees the instant they press: the button steps aside and
      // the line tells them what just happened and what to do with it — the
      // command is on their clipboard, and they carry it. The indicator does
      // NOT move: nothing is working yet, and the dot never says otherwise.
      const handed = await waitForBadge(page, (b) => !b.fix.shown);
      assert.equal(handed.pulsing, false, "no pulse for work that has not started");
      assert.match(handed.text, /\/print fix command copied\. Paste and send to your model\./, handed.text);
      assert.equal(handed.cmd, "/print fix", "the command is right there, restyled as one");
      assert.match(handed.title, /\/print fix/, handed.title);

      // ...and the paste landing is what starts the dot: the model says
      // working, the dot pulses, and the slot follows it — mid-edit outranks
      // everything, including the instruction the press left behind.
      await saysWorking(server.url, "overflow");
      const badge = await waitForBadge(page, (b) => b.pulsing);
      assert.equal(badge.pulsing, true, "the model's own word moves the dot");
      assert.equal(badge.text, "Working…", badge.text);
      assert.equal(badge.fix.shown, false, "the button stays aside while the model has it");
    });
  });

  // The model's edit is what ends it — the shell never clears the message on
  // its own, it re-measures a page that fits and there is nothing left to say.
  await t.test("the model's fix reloads the page and takes the message with it", async () => {
    await withPage("overflow", async (page) => {
      await waitForBadge(page, offered);
      await pressFix(page);
      await waitForBadge(page, (b) => !b.fix.shown);
      await saysWorking(server.url, "overflow");
      await waitForBadge(page, (b) => b.pulsing);

      await write("overflow", SHORT);
      await fetch(`${server.url}/chat/overflow.html/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: "model", kind: "status", text: "", data: { state: "done" } }),
      });

      const badge = await waitForBadge(page, (b) => /^Ask your model/.test(b.text));
      assert.equal(badge.shown, false, "a page that fits has no problem to state");
      assert.equal(badge.cmd, null, "and no command to hawk");
      assert.equal(badge.pulsing, false, "done rested the dot");
      assert.deepEqual(await page.evaluate(() => window.mpFit), { authored: 1, rendered: 1, overflowing: 0, clipped: 0 });
    });
  });

  // A problem the model could not fix is not swallowed and not looped: the
  // line stands as a plain statement, and the button comes back to press
  // again — which is the user's call, not the page's.
  await t.test("a problem that survives puts the button back, and it sends again", async () => {
    await withPage("overflow", async (page) => {
      await waitForBadge(page, offered);
      await pressFix(page);
      assert.equal((await waitForFit(server.url)).length, 1);
      await waitForBadge(page, (b) => !b.fix.shown);
      await saysWorking(server.url, "overflow");
      await waitForBadge(page, (b) => b.pulsing);

      // The model's reply arrives with the page no better than before.
      await fetch(`${server.url}/chat/overflow.html/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: "model", kind: "status", text: "", data: { state: "done" } }),
      });

      const back = await waitForBadge(page, (b) => offered(b) && !b.pulsing);
      assert.equal(back.shown, true, "the problem is still stated");
      assert.equal(back.pulsing, false, "and the indicator stops pulsing for nobody");
      assert.match(back.text, /^content runs onto \d+ sheets$/, back.text);
      assert.equal(offered(back), true, "with the button back to press again");

      await pressFix(page);
      assert.equal((await waitForFit(server.url)).length, 1, "a second press is a second report");
    });
  });

  await t.test("a page that fits reports nothing and shows nothing", async () => {
    await withPage("fits", async (page) => {
      await page.waitForTimeout(SETTLE_MS);
      assert.deepEqual(
        (await fitReport(server.url)).filter((f) => f.page === "/fits.html"),
        []
      );
      assert.equal((await badgeState(page)).shown, false);
    });
  });

  // One message slot, and the selection owns it. Both notices are true at once
  // on this page, and showing them together asks the user to work out which of
  // the two their double-click just produced — so the thing they did wins, and
  // the fit problem is waiting again the moment they let go.
  await t.test("selecting an element takes the line, and gives it back", async () => {
    await withPage("overflow", async (page) => {
      await waitForBadge(page, offered);
      await page.evaluate(`${CHROME}.getElementById("mp-btn-edit").click()`);
      await page.dblclick(`p[data-i="0"]`);

      const picked = await waitForBadge(page, (b) => b.selected);
      assert.equal(picked.selected, true, "the line is the selection's");
      assert.equal(picked.shown, false, "and not the fit problem's as well");
      assert.match(picked.text, /^Paragraph .*selected & sent to model$/s, picked.text);
      assert.equal(picked.fix.shown, false, "no FIX beside a selection to mistake it for");
      assert.equal(picked.dots, 1, "the same one indicator, wherever it is");

      // Done: the selection is gone, and the page's own problem is still the
      // page's own problem.
      await page.evaluate(`${CHROME}.getElementById("mp-btn-edit").click()`);
      const back = await waitForBadge(page, offered);
      assert.equal(back.selected, false);
      assert.match(back.text, /^content runs onto \d+ sheets$/, back.text);
    });
  });

  // The other way a page stops fitting: the user types into it. Their text is
  // as capable of outgrowing a sheet as the model's was, and they can no more
  // fix the layout than before — so it takes the same path, button and all.
  await t.test("a user's own edit that outgrows the sheet gets the same button", async () => {
    await withPage("fits", async (page) => {
      await page.waitForTimeout(SETTLE_MS);
      await page.evaluate(`${CHROME}.getElementById("mp-btn-edit").click()`);
      await page.dblclick("#body");
      // Enough to outgrow the sheet several times over — the point is the
      // path it takes, not where exactly the first break lands.
      await page.keyboard.insertText(
        Array.from({ length: 300 }, (_, i) => `Sentence ${i} that the user typed into the page.`).join(" "));
      await page.keyboard.press("Escape");   // commits the edit

      // ...and it takes the line back off their own selection. A selection
      // normally outranks the fit message, but a page that BREAKS while they
      // have something selected is the newer news of the two, and the one
      // they cannot see for themselves.
      const badge = await waitForBadge(page, offered);
      assert.equal(badge.shown, true, "they see it straight away");
      assert.equal(badge.selected, false, "even with the element still outlined");
      assert.match(badge.text, /content runs onto \d+ sheets/, badge.text);
      assert.deepEqual(
        (await fitReport(server.url)).filter((f) => f.page === "/fits.html"),
        [],
        "and nothing went out on its own"
      );

      await pressFix(page);
      const reported = await waitForFit(server.url);
      assert.equal(reported.length, 1, "the press reports it once");
      assert.ok(reported[0].rendered > 1, `rendered: ${reported[0].rendered}`);

      // The press visibly lands, selection or no selection: the line now
      // carries the hand-off instruction. It used to bounce back to the
      // "selected" message the moment fitFixing was set — which read as the
      // press doing nothing at all.
      const handed = await waitForBadge(page, (b) => b.cmd === "/print fix");
      assert.equal(handed.cmd, "/print fix", "the instruction the press leaves behind");
      assert.equal(handed.selected, false, "not the old selection message");
      assert.match(handed.text, /command copied\. Paste and send to your model\./, handed.text);

      // The typing reached the file too — the model is being sent to read a
      // page that already contains what they typed.
      const saved = await fs.readFile(path.join(dir, "fits.html"), "utf-8");
      assert.match(saved, /Sentence 299/, "the edit was saved before the report went out");
      assert.match(saved, /data-mp-edited/, "and is marked as theirs");
    });
  });
});
