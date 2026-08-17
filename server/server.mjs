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
//   PUT  /<page>.html      raw html body -> saved to the page's file
//   POST /chat/<page>.html/messages   append a chat message (shell or model)
//   GET  /chat/<page>.html/messages   read/long-poll chat messages + presence
//
// Static files also answer HEAD and carry an ETag derived from mtime+size —
// the shell's auto-reload poll (see shell.js) HEADs its own URL and reloads
// the page when that signature changes, so edits the model makes to a served
// file show up in the user's open tab without a manual refresh.
//
// PUT is the reverse direction: the shell saves the user's in-browser text
// edits back into the page's file (sanitized serialized DOM). If-Match makes
// the write conditional on the ETag the shell last saw, so a file the model
// rewrote mid-edit is never clobbered — the stale save gets 412 and the shell
// reloads instead. PUT edits existing top-level pages only; it never creates
// files and never reaches shell assets or the temp render staging files.
//
// The POST render endpoint accepts the page's *serialized DOM* (the shell
// posts document.documentElement.outerHTML), so PDFs include the user's
// in-browser text edits. The HTML is staged as a temp file in the served
// directory so its relative shell/ and font references resolve, then rendered
// by render.mjs. The GET /pdf/ endpoint renders a served page as-is — no
// browser involved — for automated pipelines (see render-cli.mjs for the
// one-shot variant that needs no running server).
//
// Usage: node server.mjs [--dir <pages-dir>] [--port <port>] [--auto-port]
// --auto-port: if the port is taken (e.g. another project's print-skill
// server), walk upward to the next free one instead of failing.
import http from "node:http";
import { promises as fs, realpathSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderPdf, closeBrowser } from "./render.mjs";
import { getStore, postMessage, awaitMessages, listening, closeAll as closeChat } from "./chat-store.mjs";

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

// Freshness signature for the shell's auto-reload poll and PUT's If-Match.
// mtimeMs keeps sub-second resolution — a Last-Modified-only signature (whole
// seconds) would miss two writes landing within the same second.
function etagFor(stat) {
  return `"${stat.mtimeMs}-${stat.size}"`;
}

async function serveFile(req, res, filePath, stat) {
  const headers = {
    "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "ETag": etagFor(stat),
    "Last-Modified": stat.mtime.toUTCString(),
  };
  if (req.method === "HEAD") {
    res.writeHead(200, headers);
    return res.end();
  }
  const body = await fs.readFile(filePath);
  res.writeHead(200, headers);
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
 * autoPort: on EADDRINUSE, walk up from `port` (up to +10) instead of failing —
 * lets a second project run its own server while another project's holds 4949.
 */
export function startServer({ dir = process.cwd(), port = DEFAULT_PORT, host = "127.0.0.1", autoPort = false } = {}) {
  const ROOT = path.resolve(dir);
  // Bound after listen; handlers only run once requests arrive, so reads are safe.
  let baseUrl = null;

  async function serveStatic(req, res, urlPath) {
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
        if (stat.isFile()) return await serveFile(req, res, candidate, stat);
      } catch {
        /* try next */
      }
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  }

  async function handleSavePage(req, res, urlPath) {
    const fail = (status, error, headers = {}) => {
      res.writeHead(status, { "Content-Type": "application/json", ...headers });
      res.end(JSON.stringify({ ok: false, error }));
    };
    // Writable surface: existing .html pages, top-level or one project
    // subdirectory deep (the build/<project>/ layout). No deeper nesting, no
    // dot-segments (the temp .render-* staging files stay unreachable), and
    // no creation — a page must have been generated first. shell/ assets are
    // .css/.js, so the .html requirement keeps them read-only.
    if (!/^\/(?:[^/.][^/]*\/)?[^/.][^/]*\.html$/.test(urlPath)) return fail(404, "not a saveable page");
    const filePath = safeJoin(ROOT, urlPath);
    if (!filePath) return fail(404, "not a saveable page");
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      return fail(404, "no such page");
    }
    // Conditional write: a mismatch means the file changed after the client
    // last loaded/saved it (the model edited it mid-browser-edit). Reject so
    // the newer version is never clobbered; the shell reloads on 412.
    const ifMatch = req.headers["if-match"];
    if (ifMatch && ifMatch !== etagFor(stat)) {
      return fail(412, "file changed on disk", { "ETag": etagFor(stat) });
    }
    let html;
    try {
      html = await readBody(req);
    } catch (e) {
      return fail(400, String(e.message || e));
    }
    // Sanity floor, not validation: reject obviously truncated payloads rather
    // than half a document replacing a page.
    if (!html.trim() || !/<\/html>\s*$/i.test(html)) return fail(400, "not a complete html document");
    await fs.writeFile(filePath, html);
    const saved = await fs.stat(filePath);
    // The new ETag becomes the saving tab's poll baseline so it doesn't
    // reload on its own write (other open tabs of this page do — that's sync).
    res.writeHead(200, { "Content-Type": "application/json", "ETag": etagFor(saved) });
    res.end(JSON.stringify({ ok: true }));
  }

  // /chat/<page>.html/messages — the Chat panel's transport (see chat-store.mjs).
  // The shell POSTs user messages and polls with wait=0; the model's chat-cli
  // POSTs replies/status and long-polls as consumer=model. Chat exists only
  // for pages PUT could reach: same path rule (top-level or one project dir
  // deep), and the page file must exist — a chat thread never outlives (or
  // predates) its page.
  async function handleChat(req, res, urlPath, query) {
    const fail = (status, error) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error }));
    };
    const m = urlPath.match(/^\/chat(\/(?:[^/.][^/]*\/)?[^/.][^/]*\.html)\/messages$/);
    if (!m) return fail(404, "not a chat endpoint");
    const pagePath = m[1];
    const filePath = safeJoin(ROOT, pagePath);
    if (!filePath) return fail(404, "no such page");
    try {
      if (!(await fs.stat(filePath)).isFile()) return fail(404, "no such page");
    } catch {
      return fail(404, "no such page");
    }
    const store = getStore(pagePath);

    if (req.method === "POST") {
      let payload;
      try {
        payload = JSON.parse(await readBody(req, 64 * 1024));
      } catch (e) {
        return fail(400, String(e.message || e));
      }
      const { from, kind, text, data } = payload || {};
      if (from !== "user" && from !== "model") return fail(400, "from must be user|model");
      if (kind !== "message" && kind !== "status") return fail(400, "kind must be message|status");
      // Status carries state in data and may have empty text; messages must say something.
      if (typeof text !== "string" || (kind === "message" && !text.trim())) {
        return fail(400, "missing text");
      }
      if (data !== undefined && (typeof data !== "object" || data === null)) {
        return fail(400, "data must be an object");
      }
      const msg = postMessage(store, { from, kind, text, data });
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, id: msg.id, epoch: store.epoch, listening: listening(store) }));
    }

    if (req.method === "GET") {
      const after = query.has("after") ? Math.max(0, Number(query.get("after")) || 0) : undefined;
      // Bounded long-poll by contract. 300s ceiling: background/one-shot
      // listeners (harness wakes the model when the command exits) want long
      // quiet holds; the FOREGROUND bound that keeps strict harnesses happy
      // is the CLI's default (20s), not this ceiling.
      const waitMs = Math.min(Math.max(Number(query.get("wait")) || 0, 0), 300) * 1000;
      const from = ["user", "model", "any"].includes(query.get("from")) ? query.get("from") : "any";
      const consumer = query.get("consumer") || "";
      const peek = query.get("peek") === "1";
      const messages = await awaitMessages(store, {
        after,
        from,
        waitMs,
        consumer,
        peek,
        onAbort: (drop) => req.on("close", drop),
      });
      if (res.writableEnded) return; // client went away mid-poll
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, epoch: store.epoch, listening: listening(store), messages }));
    }

    return fail(405, "method not allowed");
  }

  async function serveIndex(res) {
    // Pages at the root plus one project-directory level deep (the
    // build/<project>/ layout); shell/ and dot-entries are assets, not pages.
    const entries = [];
    for (const e of await fs.readdir(ROOT, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "shell") continue;
      if (e.isFile() && e.name.endsWith(".html")) entries.push(e.name);
      else if (e.isDirectory()) {
        try {
          for (const f of await fs.readdir(path.join(ROOT, e.name))) {
            if (f.endsWith(".html") && !f.startsWith(".")) entries.push(`${e.name}/${f}`);
          }
        } catch { /* unreadable dir — skip */ }
      }
    }
    const items = entries
      .sort()
      .map((f) => {
        const href = "/" + f.split("/").map(encodeURIComponent).join("/");
        return `<li><a href="${href}">${f}</a></li>`;
      })
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
    // Stage next to the page the DOM came from (the shell sends its own
    // location.pathname) so relative shell/ and image references resolve for
    // nested build/<project>/ pages too; root when absent or invalid. The
    // dot-prefixed name keeps the staging file out of PUT/chat/index reach.
    let stageDirUrl = "";
    if (typeof payload.path === "string" && /^\/(?:[^/.][^/]*\/)?[^/.][^/]*\.html$/.test(payload.path)) {
      const slash = payload.path.lastIndexOf("/");
      if (slash > 0 && safeJoin(ROOT, payload.path)) {
        stageDirUrl = payload.path.slice(1, slash + 1); // "project/"
      }
    }
    const temp = `.render-${crypto.randomBytes(6).toString("hex")}.html`;
    const tempPath = path.join(ROOT, stageDirUrl, temp);
    try {
      await fs.writeFile(tempPath, payload.html);
      const encodedDir = stageDirUrl.split("/").filter(Boolean).map(encodeURIComponent).join("/");
      const pdf = await renderPdf(`${baseUrl}/${encodedDir ? encodedDir + "/" : ""}${temp}`);
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
      if (url.pathname.startsWith("/chat/")) {
        return await handleChat(req, res, decodeURIComponent(url.pathname), url.searchParams);
      }
      if (req.method === "PUT") {
        return await handleSavePage(req, res, decodeURIComponent(url.pathname));
      }
      if (req.method === "GET" && url.pathname.startsWith("/pdf/")) {
        return await handlePagePdf(res, decodeURIComponent(url.pathname.slice("/pdf".length)));
      }
      if (req.method === "GET" && url.pathname === "/") {
        return await serveIndex(res);
      }
      if (req.method === "GET" || req.method === "HEAD") {
        return await serveStatic(req, res, decodeURIComponent(url.pathname));
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
    let attempt = port;
    const tryListen = () => {
      server.once("error", (e) => {
        if (autoPort && e.code === "EADDRINUSE" && attempt - port < 10) {
          attempt++;
          tryListen();
        } else {
          reject(e);
        }
      });
      // Local tool: bind loopback only, never an external interface.
      server.listen(attempt, host, () => {
        const bound = server.address().port;
        baseUrl = `http://${host}:${bound}`;
        resolve({
          server,
          port: bound,
          url: baseUrl,
          // Settle open chat long-polls first or close() waits out the longest
          // poll (render-cli's one-shot server and SIGINT both come through here).
          close: () => {
            closeChat();
            return new Promise((r) => server.close(r));
          },
        });
      });
    };
    tryListen();
  });
}

// Direct invocation: parse flags, run until signaled.
// Node realpaths import.meta.url, so argv[1] must be realpathed too — or a
// symlinked install path (e.g. .claude/skills/print -> the repo) never
// matches and the server silently loads as a module instead of starting.
const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(path.resolve(process.argv[1]))).href;
  } catch {
    return false; // argv[1] doesn't exist on disk — certainly not this file
  }
})();
if (isMain) {
  const args = process.argv.slice(2);
  const argValue = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
  };
  const { url, close } = await startServer({
    dir: argValue("--dir", process.cwd()),
    port: Number(argValue("--port", DEFAULT_PORT)),
    autoPort: args.includes("--auto-port"),
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
