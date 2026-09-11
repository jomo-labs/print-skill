// Shared plumbing for the browser-driven tests. Each of these existed as a
// near-identical copy in every test file; this is the single home, so the
// Chromium launch policy, the template fill, and the edit-mode handshake are
// defined once.
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "../browser.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ASSETS = path.join(HERE, "..", "..", "assets");
export const CHAT_CLI = path.join(HERE, "..", "chat-cli.mjs");

// Reach into the chrome's shadow root the way a user's click does.
export const CHROME = `document.getElementById("mp-chrome-root").shadowRoot`;

// The same launcher the render/check CLIs use: headless, honoring the
// PRINT_SKILL_CHROMIUM executable override and the environment's proxy
// (bypassed for loopback, which is all these tests talk to).
export const launchTestBrowser = () => launchBrowser();

/** The two files every assembled test page is built from. */
export async function loadPageParts() {
  const [template, documentCss] = await Promise.all([
    fs.readFile(path.join(ASSETS, "page_template.html"), "utf-8"),
    fs.readFile(path.join(ASSETS, "shell", "document.css"), "utf-8"),
  ]);
  return { template, documentCss };
}

/** What assemble-cli does, minimally: fill the template's markers. */
export function fillTemplate(template, documentCss, body, { customCss } = {}) {
  let html = template.replace("/* @@DOCUMENT_CSS@@ */", documentCss);
  if (customCss !== undefined) {
    html = html.replace(
      '<style id="content-overrides"></style>',
      `<style id="content-overrides">${customCss}</style>`
    );
  }
  return html.replace("<!-- CONTENT -->", body);
}

/**
 * A tab the tests can trust: fixed viewport, and the template's Google Fonts
 * preload aborted so no test depends on an external host.
 */
export async function openTab(browser, { viewport = { width: 1440, height: 1000 } } = {}) {
  const page = await browser.newPage({ viewport });
  await page.route("**://fonts.g*/**", (route) => route.abort());
  return page;
}

/** Open the page, then open edit mode, and wait until it is really on. */
export async function openEditMode(page, url) {
  await page.goto(url);
  await page.waitForFunction(`!!${CHROME}.getElementById("mp-btn-edit")`);
  await page.evaluate(`${CHROME}.getElementById("mp-btn-edit").click()`);
  await page.waitForFunction(`document.body.classList.contains("edit-active")`);
}

/**
 * The save is async and queued — poll the file until it says what the DOM
 * already does. Returns the last text read either way, so a failed wait
 * still hands the assertion something concrete to print.
 */
export async function fileBecomes(file, predicate, ms = 15000) {
  const deadline = Date.now() + ms;
  let text = "";
  while (Date.now() < deadline) {
    text = await fs.readFile(file, "utf-8");
    if (predicate(text)) return text;
    await new Promise((r) => setTimeout(r, 250));
  }
  return text;
}

const run = promisify(execFile);

/** What the model does when a request needs a target: ask chat-cli, once. */
export async function cliSelection(serverUrl, page) {
  const args = [CHAT_CLI, "selection", ...(page ? [page] : []), "--url", serverUrl];
  return (await run("node", args)).stdout.trim();
}

/**
 * Poll the selection read until it says what we are waiting for — used where
 * the wait is for the PAGE to notice something (a restarted server), not for
 * its own debounce, since that has to cover a failed poll, a reconnect and a
 * retry.
 */
export async function selectionBecomes(serverUrl, want, ms = 15000) {
  const deadline = Date.now() + ms;
  let last = "";
  while (Date.now() < deadline) {
    last = await cliSelection(serverUrl);
    if (last === want) return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  return last;
}
