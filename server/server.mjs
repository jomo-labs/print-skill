#!/usr/bin/env node
// print-skill local server.
//
// Serves a directory of generated pages plus the shared shell assets, and
// renders deterministic PDFs via headless Chromium:
//
//   GET  /<page>.html      a generated page from the served directory
//   GET  /shell/*          shell assets (served dir first, skill assets as fallback)
//   GET  /                 index of served pages
//   GET  /healthz          liveness + identity probe
//   GET  /pdf/<page>.html  render a served page -> application/pdf (headless use)
//   POST /render-pdf       { html, title } -> application/pdf
//
// The POST render endpoint accepts the page's *serialized DOM* (the shell
// posts document.documentElement.outerHTML), so PDFs include the user's
// in-browser text edits. The HTML is staged as a temp file in the served
// directory so its relative shell/ and font references resolve, then rendered
// by render.mjs. The GET /pdf/ endpoint renders a served page as-is — no
// browser involved — for automated pipelines (see render-cli.mjs for the
// one-shot variant that needs no running server).
//
// Usage: node server.mjs [--dir <pages-dir>] [--port <port>]
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderPdf, closeBrowser } from "./render.mjs";

const DEFAULT_PORT = 4949;
const SKILL_ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

function safeJoin(root, urlPath) {
  const resolved = path.resolve(root, "." + path.posix.normalize("/" + urlPath));
  return resolved.startsWith(root + path.sep) || resolved === root ? resolved : null;
}

function slugify(title) {
  return (
    String(title || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "printable"
  );
}

async function serveFile(res, filePath) {
  const body = await fs.readFile(filePath);
  res.writeHead(200, { "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
  res.end(body);
}

async function readBody(req, limit = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * Start the pages server. Returns { server, port, url, close } once listening.
 * port 0 picks an ephemeral port (used by render-cli.mjs for one-shot renders).
 */
export function startServer({ dir = process.cwd(), port = DEFAULT_PORT, host = "127.0.0.1" } = {}) {
  const ROOT = path.resolve(dir);
  // Bound after listen; handlers only run once requests arrive, so reads are safe.
  let baseUrl = null;

  async function serveStatic(res, urlPath) {
    // Pages and their assets from the served directory; /shell/* falls back to
    // the skill's own assets so a directory without a local shell copy still works.
    const candidates = [];
    const inRoot = safeJoin(ROOT, urlPath);
    if (inRoot) candidates.push(inRoot);
    if (urlPath.startsWith("/shell/")) {
      const inAssets = safeJoin(SKILL_ASSETS, urlPath);
      if (inAssets) candidates.push(inAssets);
    }
    for (const candidate of candidates) {
      try {
        const stat = await fs.stat(candidate);
        if (stat.isFile()) return await serveFile(res, candidate);
      } catch {
        /* try next */
      }
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  }

  async function serveIndex(res) {
    const entries = (await fs.readdir(ROOT)).filter(
      (f) => f.endsWith(".html") && !f.startsWith(".")
    );
    const items = entries
      .sort()
      .map((f) => `<li><a href="/${encodeURIComponent(f)}">${f}</a></li>`)
      .join("\n");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<!DOCTYPE html><meta charset="utf-8"><title>print-skill pages</title>` +
        `<body style="font-family:system-ui;max-width:640px;margin:48px auto;">` +
        `<h1 style="font-size:20px;">Printable pages</h1><ul>${items || "<li>(none yet)</li>"}</ul>`
    );
  }

  async function handleRenderPdf(req, res) {
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
    }
    if (!payload || typeof payload.html !== "string" || !payload.html.trim()) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: "missing html" }));
    }
    // Stage in the served dir so relative shell/ and image references resolve.
    const temp = `.render-${crypto.randomBytes(6).toString("hex")}.html`;
    const tempPath = path.join(ROOT, temp);
    try {
      await fs.writeFile(tempPath, payload.html);
      const pdf = await renderPdf(`${baseUrl}/${temp}`);
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${slugify(payload.title)}.pdf"`,
      });
      res.end(pdf);
    } catch (e) {
      console.error("[render-pdf]", e);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
    } finally {
      fs.unlink(tempPath).catch(() => {});
    }
  }

  // GET /pdf/<page>.html — render a served page to PDF, no browser in the loop.
  async function handlePagePdf(res, pagePath) {
    const resolved = safeJoin(ROOT, pagePath);
    const isHtml = /\.html?$/i.test(pagePath);
    let exists = false;
    if (resolved && isHtml) {
      try {
        exists = (await fs.stat(resolved)).isFile();
      } catch {
        /* stays not found */
      }
    }
    if (!exists) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: `no served page at ${pagePath}` }));
    }
    try {
      const encoded = pagePath.split("/").map(encodeURIComponent).join("/");
      const pdf = await renderPdf(`${baseUrl}/${encoded}`);
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${slugify(path.basename(pagePath, path.extname(pagePath)))}.pdf"`,
      });
      res.end(pdf);
    } catch (e) {
      console.error("[pdf]", e);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
    }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, baseUrl);
    try {
      if (req.method === "GET" && url.pathname === "/healthz") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: true, name: "print-skill-server", dir: ROOT }));
      }
      if (req.method === "POST" && url.pathname === "/render-pdf") {
        return await handleRenderPdf(req, res);
      }
      if (req.method === "GET" && url.pathname.startsWith("/pdf/")) {
        return await handlePagePdf(res, decodeURIComponent(url.pathname.slice("/pdf".length)));
      }
      if (req.method === "GET" && url.pathname === "/") {
        return await serveIndex(res);
      }
      if (req.method === "GET") {
        return await serveStatic(res, decodeURIComponent(url.pathname));
      }
      res.writeHead(405, { "Content-Type": "text/plain" });
      res.end("method not allowed");
    } catch (e) {
      console.error("[server]", e);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("internal error");
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    // Local tool: bind loopback only, never an external interface.
    server.listen(port, host, () => {
      const bound = server.address().port;
      baseUrl = `http://${host}:${bound}`;
      resolve({
        server,
        port: bound,
        url: baseUrl,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

// Direct invocation: parse flags, run until signaled.
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const args = process.argv.slice(2);
  const argValue = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
  };
  const { url, close } = await startServer({
    dir: argValue("--dir", process.cwd()),
    port: Number(argValue("--port", DEFAULT_PORT)),
  });
  console.log(`print-skill server: ${url}  (serving ${path.resolve(argValue("--dir", process.cwd()))})`);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, async () => {
      await close();
      await closeBrowser();
      process.exit(0);
    });
  }
}
