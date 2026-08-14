// Deterministic HTML -> PDF rendering via headless Chromium (Playwright).
//
// The PDF is rendered by the same engine everywhere, so the artifact does not
// depend on the user's browser. The sequence mirrors the page shell's own
// print path: page.pdf() never fires beforeprint, so computePrintFit() must be
// invoked explicitly before printing — it writes the print zoom factor into
// <style id="mp-print-fit-css"> as static CSS the PDF renderer then consumes.
import { chromium } from "playwright";

let browserPromise = null;

function launchOptions() {
  const opts = { headless: true };
  // Explicit executable override for environments with a system-managed
  // Chromium (CI sandboxes, nix, etc.). Playwright's own browser cache
  // (PLAYWRIGHT_BROWSERS_PATH) is honored automatically without this.
  if (process.env.PRINT_SKILL_CHROMIUM) {
    opts.executablePath = process.env.PRINT_SKILL_CHROMIUM;
  }
  return opts;
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch(launchOptions()).then((browser) => {
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
 * renders — computePrintFit is invoked only when the shell defines it.
 */
export async function renderPdf(url) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
  });
  try {
    const page = await context.newPage();
    // networkidle so web fonts are loaded before measurement — a fit factor
    // computed against fallback-font metrics under-reports the real height.
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    await page.evaluate(() => {
      if (typeof computePrintFit === "function") computePrintFit();
    });
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
