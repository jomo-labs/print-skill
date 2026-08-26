// Shared headless-Chromium plumbing for the check/render CLIs.
//
// Two things live here, both about the same failure mode: every generated
// page links Google Fonts, and a machine that cannot reach the font hosts
// (offline, or a sandbox whose egress goes through a proxy Chromium doesn't
// know about) hangs the whole load. The font <link> sits in <head>, so an
// unreachable host doesn't just cost the fonts: it blocks the shell script's
// execution (pending stylesheets gate script execution), which blocks
// DOMContentLoaded, load, and networkidle alike — every check and every PDF
// render idles for the full TCP give-up (~13s) before proceeding with
// fallback fonts anyway.
//
//  - launchBrowser(): chromium with the pinned executable override, and the
//    environment's HTTPS proxy passed through. Chromium does not read
//    HTTPS_PROXY on its own; in proxied environments (CI, cloud sandboxes)
//    honoring it lets fonts actually load — correct wrap metrics — or fail
//    fast, instead of hanging on a blackholed direct connection.
//  - guardFonts(page): a per-request watchdog on the font hosts. The request
//    is made through Playwright's own fetch (same proxy) with a hard
//    timeout; past it the route aborts, the stylesheet settles as failed,
//    and the page proceeds with fallback metrics — exactly what it would
//    have done after the hang, minus the hang.
import { chromium } from "playwright";

const FONT_HOSTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

export function launchBrowser(options = {}) {
  const proxyServer =
    process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy;
  return chromium.launch({
    headless: true,
    ...(process.env.PRINT_SKILL_CHROMIUM
      ? { executablePath: process.env.PRINT_SKILL_CHROMIUM }
      : {}),
    // Loopback stays direct: the pages themselves come from 127.0.0.1.
    ...(proxyServer ? { proxy: { server: proxyServer, bypass: "127.0.0.1,localhost" } } : {}),
    ...options,
  });
}

export async function guardFonts(page, { timeout = 4000 } = {}) {
  await page.route(FONT_HOSTS, async (route) => {
    try {
      const response = await route.fetch({ timeout });
      await route.fulfill({ response });
    } catch {
      await route.abort().catch(() => {});
    }
  });
}
