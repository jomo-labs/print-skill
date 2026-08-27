// Deterministic HTML -> PDF rendering via headless Chromium (Playwright).
//
// The PDF is rendered by the same engine everywhere, so the artifact does not
// depend on the user's browser. Pages are WYSIWYG by construction — the .page
// element is the sheet, printed 1:1 into a zero-margin page box — so nothing
// needs to run before printing.
import { launchBrowser, guardFonts } from "./browser.mjs";

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = launchBrowser().then((browser) => {
      browser.on("disconnected", () => {
        browserPromise = null;
      });
      return browser;
    });
    browserPromise.catch(() => {
      browserPromise = null;
    });
  }
  return browserPromise;
}

/**
 * Render the page at `url` to a PDF buffer.
 * The page is expected to be a print-skill page (shell present), but any HTML
 * renders.
 */
export async function renderPdf(url) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
  });
  try {
    const page = await context.newPage();
    // networkidle so web fonts are loaded before printing — fallback-font
    // metrics wrap lines differently than the fonts the screen view shows.
    // guardFonts bounds the font fetches, so an unreachable font host means
    // fallback fonts in seconds, not a stalled render.
    await guardFonts(page);
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    // preferCSSPageSize: the page's @page rule (letter / A4 / legal /
    // landscape / 5.5in 8.5in) decides the sheet; Letter is only the
    // fallback for pages that declare nothing.
    return await page.pdf({
      format: "Letter",
      preferCSSPageSize: true,
      printBackground: true,
    });
  } finally {
    await context.close();
  }
}

export async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise.catch(() => null);
    browserPromise = null;
    if (browser) await browser.close();
  }
}
