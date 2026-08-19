#!/usr/bin/env node
// print-skill local server.
//
// Serves a directory of generated pages plus the shared shell assets, and
// renders deterministic PDFs via headless Chromium:
//
//   GET  /<page>.html      a generated page, wrapped with the skill's chrome
//                          (chrome-host.css + chrome.css + shell.js injected
//                          at serve time — the file on disk is a pure
//                          document)
//   GET  /shell/*          shell assets (served dir first, skill assets as fallback)
//   GET  /                 index of served pages
//   GET  /healthz          liveness + identity probe
//   GET  /pdf/<page>.html  render a served page -> application/pdf (headless use)
//   POST /render-pdf       { html, title } -> application/pdf
//   PUT  /<page>.html      raw html body -> saved to the page's file
//   POST /chat/<page>.html/messages   append a selection notice (the element
//                          the user just double-clicked, or its deselect), a
//                          fit report (the page no longer fits its sheets), or
//                          a model status (working/done)
//   GET  /chat/<page>.html/messages   read/long-poll one page's events + presence
//   GET  /chat/messages    read/long-poll EVERY served page's events. This is
//                          what a model watches: it connects to the server,
//                          not to a page, so it sees whichever page the user
//                          opens without being told about it.
//
// The /chat/ path is historical: there is no chat. The page has no panel and
// the user talks to their model in the model's own session — what crosses
// this endpoint is the page telling the model what is selected and when it has
// stopped fitting its sheets, the model telling the page when it is mid-edit,
// and presence for the toolbar's indicator.
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
// --dir: the project's out/ — an absolute path is safest, since a shell that
// ran `npm install` in <skill-dir>/server is still sitting there. Omitted or
// pointed at a project root, the out/ inside it is used; pointed anywhere
// inside the skill's own install, the server refuses to start rather than
// serve a tree with none of the project's pages in it (see resolveServeDir).
// --auto-port: if the port is taken (e.g. another project's print-skill
// server), walk upward to the next free one instead of failing.
import http from "node:http";
import { promises as fs, realpathSync, statSync, readdirSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderPdf, closeBrowser } from "./render.mjs";
import { createLiveLog, postMessage, awaitMessages, listening, closeAll } from "./chat-store.mjs";

const DEFAULT_PORT = 4949;
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SERVER_DIR, "..");
const SKILL_ASSETS = path.join(SKILL_DIR, "assets");
const SHELL_DIR = path.join(SKILL_ASSETS, "shell");

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

// A served page is its file PLUS the chrome injected into it, so its freshness
// signature has to cover both: edit chrome.css or shell.js and every open tab
// polling its own URL sees a new ETag and reloads itself. Without this, chrome
// changes only appeared on a manual refresh — indistinguishable from the
// server having gone stale, which it doesn't (assets are re-read from disk;
// only changes to server.mjs itself need a restart).
async function pageEtagFor(stat) {
  const chrome = await chromeSignature();
  return `"${stat.mtimeMs}-${stat.size}-${chrome}"`;
}

// The file half of a page ETag. PUT's If-Match is about one thing — did the
// FILE change under this tab — so a chrome update must not turn a save into a
// 412 (which costs the user the edit they were saving). The full signature is
// still what the response carries, keeping the tab's poll baseline aligned
// with what HEAD returns.
function fileEtagPart(etag) {
  const [mtime, size] = String(etag || "").replace(/"/g, "").split("-");
  return `${mtime}-${size}`;
}

// Serve-time chrome wrap. Generated pages are pure documents (plain
// printable HTML, no chrome references at all); serving one through this
// server injects the chrome stylesheets and scripts so the toolbar/edit
// functionality appears — always the skill's CURRENT chrome, since nothing
// in the file can go stale. Legacy pages that still link shell.js themselves
// are left alone (double-loading the shell would double the chrome).
// serializeForSave strips [data-mp-chrome] tags, so PUT round-trips stay pure.
//
// Two stylesheets, injected at two different points, because they play two
// different roles — the split is what keeps a page's own CSS off the chrome:
//
//   chrome-host.css  the handful of rules the chrome needs the DOCUMENT to
//                    honor (room under the toolbar). Injected
//                    as the page's FIRST stylesheet, right after <head>, so
//                    its `mp-chrome` cascade layer is the first layer declared
//                    — important declarations in the first layer outrank
//                    important declarations anywhere later, which is what
//                    makes those reservations un-overridable by a themed page.
//
//   chrome.css       everything the chrome DRAWS. Injected inert, inside a
//                    <template>: it never applies to the document at all.
//                    shell.js clones it into the chrome's shadow root, where
//                    page CSS cannot reach it (see injectChrome()). Inlining
//                    it rather than linking it keeps that adoption synchronous,
//                    so the chrome never paints unstyled.
const CHROME_BODY = `<script src="/shell/shell.js" data-mp-chrome></script>`;

// Shell CSS read straight from the skill's assets, re-read whenever the file
// changes on disk (editing chrome.css and reloading the page is enough).
const cssCache = new Map();
async function shellCss(name) {
  const file = path.join(SHELL_DIR, name);
  const stat = await fs.stat(file);
  const signature = `${stat.mtimeMs}-${stat.size}`;
  const hit = cssCache.get(name);
  if (hit && hit.signature === signature) return hit.text;
  const text = await fs.readFile(file, "utf-8");
  cssCache.set(name, { signature, text });
  return text;
}

async function chromeAssets() {
  const [host, chrome] = await Promise.all([shellCss("chrome-host.css"), shellCss("chrome.css")]);
  return { host, chrome };
}

// mtime+size of every asset a served page carries — the two inlined
// stylesheets and the two scripts it links. Cheap enough to stat on each
// request (four stats, no reads); a missing file just drops out of the
// signature rather than failing the response.
const CHROME_ASSET_FILES = ["chrome-host.css", "chrome.css", "shell.js"];
async function chromeSignature() {
  const parts = await Promise.all(CHROME_ASSET_FILES.map(async (name) => {
    try {
      const stat = await fs.stat(path.join(SHELL_DIR, name));
      return `${stat.mtimeMs}-${stat.size}`;
    } catch {
      return "-";
    }
  }));
  return crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);
}

function injectChromeTags(html, assets) {
  if (html.includes("shell/shell.js")) return html; // legacy page: own links
  let out = html;
  const headOpen = out.match(/<head(?:\s[^>]*)?>/i);
  const hostTag = `<style id="mp-chrome-host-css" data-mp-chrome>\n${assets.host}\n</style>`;
  // First stylesheet in the document — see the layer note above. Without a
  // <head> tag to anchor on, the fallback position still precedes the page's
  // own trailing styles.
  if (headOpen) out = out.replace(headOpen[0], `${headOpen[0]}\n${hostTag}`);
  else if (out.includes("</head>")) out = out.replace("</head>", `${hostTag}\n</head>`);
  const chromeTag =
    `<template id="mp-chrome-css" data-mp-chrome><style>\n${assets.chrome}\n</style></template>`;
  if (out.includes("</head>")) out = out.replace("</head>", `${chromeTag}\n</head>`);
  if (out.includes("</body>")) out = out.replace("</body>", `${CHROME_BODY}\n</body>`);
  return out;
}

async function serveFile(req, res, filePath, stat, { wrapChrome = false } = {}) {
  const wrapping = wrapChrome && /\.html?$/i.test(filePath);
  const headers = {
    "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "ETag": wrapping ? await pageEtagFor(stat) : etagFor(stat),
    "Last-Modified": stat.mtime.toUTCString(),
    // Always revalidate (cheap with ETags): heuristic browser caching would
    // otherwise keep serving stale shell js/css after a skill update.
    "Cache-Control": "no-cache",
  };
  if (req.method === "HEAD") {
    res.writeHead(200, headers);
    return res.end();
  }
  let body = await fs.readFile(filePath);
  if (wrapping) {
    body = Buffer.from(injectChromeTags(body.toString("utf-8"), await chromeAssets()));
  }
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

function isDirectory(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function hasPages(dir) {
  try {
    return readdirSync(dir).some((entry) => entry.endsWith(".html"));
  } catch {
    return false;
  }
}

function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// Node realpaths import.meta.url, so SKILL_DIR is the real install path — but
// a skill is commonly reached through a symlink (.claude/skills/print -> the
// repo), and a --dir typed against that path would compare as somewhere else
// entirely. Compare real paths so the symlinked route is the same place.
function realOrSelf(p) {
  try {
    return realpathSync(p);
  } catch {
    return p; // doesn't exist yet — the caller's own existence check reports it
  }
}

/**
 * Work out which directory the CLI should serve.
 *
 * The pages live in the PROJECT's out/ — never anywhere under the skill's own
 * install, which only holds the shell assets and this server. But the shell a
 * model drives the skill from carries its cwd across commands, so the process
 * that starts the server often inherits a cwd left behind by an earlier step
 * (`npm install` in <skill-dir>/server, most of all). A bare `node
 * server.mjs`, or a relative `--dir out`, then resolved against the skill
 * instead of the project: the server came up healthy, serving the wrong tree,
 * and every page 404'd for a reason nothing on screen explained.
 *
 * So the root is resolved, not assumed:
 *  - a directory holding an out/ and no pages of its own means out/ (the
 *    project root was named, or inherited as cwd, where out/ was meant),
 *  - a root inside the skill is refused outright — the skill is never a
 *    project, and there is nothing on disk that says which project was,
 *  - a root that doesn't exist is refused too, rather than served as an empty
 *    tree that answers /healthz.
 *
 * Refusals throw with the fix in the message; the CLI prints it and exits.
 */
export function resolveServeDir(dirArg, cwd = process.cwd()) {
  const named = dirArg ? path.resolve(cwd, dirArg) : path.resolve(cwd);
  const notes = [];

  // "--dir <cwd>" (or no flag at all) from the project root: out/ is right
  // there, and the project root itself holds no pages. Serve what was meant.
  let root = named;
  const nested = path.join(root, "out");
  if (!hasPages(root) && isDirectory(nested)) {
    root = nested;
    notes.push(`serving ${root} (the out/ inside ${named})`);
  }

  // The one root inside the skill that is a real project's: the skill's own
  // out/, generated when the skill is used on itself. Everything else under
  // the install — the skill root, server/, assets/ — is the skill, not output.
  const skillOwnOut = path.join(SKILL_DIR, "out");
  const realRoot = realOrSelf(root);
  if (isInside(SKILL_DIR, realRoot) && realRoot !== realOrSelf(skillOwnOut)) {
    throw new Error(
      `refusing to serve ${root}: that is inside the print skill itself (${SKILL_DIR}), not a project's out/.\n` +
      `This is what an inherited cwd looks like — the shell was left in the skill directory by an earlier step.\n` +
      `Start the server with an absolute root instead: node ${path.join(SERVER_DIR, "server.mjs")} --dir <project>/out`
    );
  }

  if (!isDirectory(root)) {
    throw new Error(
      `refusing to serve ${root}: no such directory.\n` +
      `Generate the pages first, then start the server with an absolute root:\n` +
      `  node ${path.join(SERVER_DIR, "server.mjs")} --dir <project>/out`
    );
  }

  return { root, notes };
}

/**
 * Start the pages server. Returns { server, port, url, close } once listening.
 * port 0 picks an ephemeral port (used by render-cli.mjs for one-shot renders).
 * autoPort: on EADDRINUSE, walk up from `port` (up to +10) instead of failing —
 * lets a second project run its own server while another project's holds 4949.
 */
export function startServer({ dir = process.cwd(), port = DEFAULT_PORT, host = "127.0.0.1", autoPort = false } = {}) {
  const ROOT = path.resolve(dir);
  // This server's own live-channel log — one for every page it serves, not
  // one per page: see createLiveLog() for why.
  const live = createLiveLog();
  // Bound after listen; handlers only run once requests arrive, so reads are safe.
  let baseUrl = null;

  async function serveStatic(req, res, urlPath) {
    // Pages and their assets from the served directory. Shell assets (top
    // level or one project dir deep) are served from the SKILL's own copy
    // FIRST: the skill is the source of truth for chrome, so served pages
    // always run the current shell even when the local copy next to the
    // pages is stale (it exists only for file:// use). Local copy remains
    // the fallback for files the skill doesn't ship.
    const candidates = [];
    const shellMatch = urlPath.match(/^(?:\/[^/.][^/]*)?(\/shell\/[^/]+)$/);
    if (shellMatch) {
      const inAssets = safeJoin(SKILL_ASSETS, shellMatch[1]);
      if (inAssets) candidates.push(inAssets);
    }
    const inRoot = safeJoin(ROOT, urlPath);
    if (inRoot) candidates.push(inRoot);
    for (const candidate of candidates) {
      try {
        const stat = await fs.stat(candidate);
        if (stat.isFile()) return await serveFile(req, res, candidate, stat, { wrapChrome: true });
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
    // subdirectory deep (pages live flat in out/; one dir level is accepted for custom layouts). No deeper nesting, no
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
    if (ifMatch && fileEtagPart(ifMatch) !== fileEtagPart(etagFor(stat))) {
      return fail(412, "file changed on disk", { "ETag": await pageEtagFor(stat) });
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
    res.writeHead(200, { "Content-Type": "application/json", "ETag": await pageEtagFor(saved) });
    res.end(JSON.stringify({ ok: true }));
  }

  // The live channel (see chat-store.mjs), at two addresses:
  //
  //   /chat/messages              every page this server serves — what a model
  //                               watches, so it never has to name a page or
  //                               be told when the user opens another
  //   /chat/<page>.html/messages  one page — what that page's own poll uses,
  //                               and where POSTs about it go
  //
  // A page-scoped address exists only for pages PUT could reach: same path
  // rule (top-level or one project dir deep), and the file must exist — an
  // event stream never outlives (or predates) its page. The server-wide
  // address has no such check; there is no page to check.
  async function handleChat(req, res, urlPath, query) {
    const fail = (status, error) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error }));
    };
    let pagePath;  // undefined = every page
    if (urlPath !== "/chat/messages") {
      const m = urlPath.match(/^\/chat(\/(?:[^/.][^/]*\/)?[^/.][^/]*\.html)\/messages$/);
      if (!m) return fail(404, "not a live-channel endpoint");
      pagePath = m[1];
      const filePath = safeJoin(ROOT, pagePath);
      if (!filePath) return fail(404, "no such page");
      try {
        if (!(await fs.stat(filePath)).isFile()) return fail(404, "no such page");
      } catch {
        return fail(404, "no such page");
      }
    }

    if (req.method === "POST") {
      let payload;
      try {
        payload = JSON.parse(await readBody(req, 64 * 1024));
      } catch (e) {
        return fail(400, String(e.message || e));
      }
      const { from, kind, text, data } = payload || {};
      if (from !== "user" && from !== "model") return fail(400, "from must be user|model");
      // No "message" kind: the page has no chat to send one from, and the
      // model has its own session to answer in. What the page CAN send is
      // what it alone observes: what the user pointed at ("selection"), and
      // that it no longer fits its sheets ("fit") — a real defect in the
      // model's own layout, which the user hands back for fixing by pressing
      // FIX on the page's own notice.
      if (!["status", "selection", "fit"].includes(kind)) {
        return fail(400, "kind must be status|selection|fit");
      }
      if (typeof text !== "string") return fail(400, "missing text");
      if (data !== undefined && (typeof data !== "object" || data === null)) {
        return fail(400, "data must be an object");
      }
      // A selection is entirely its data — including the deselect, which is
      // data.selector === null. Without data there is nothing to report.
      if (kind === "selection" && (!data || !("selector" in data))) {
        return fail(400, "selection needs data.selector (null when deselected)");
      }
      // A fit report is a measurement — without the numbers there is nothing
      // for the model to act on, and no way to tell one problem from another.
      if (kind === "fit" && (!data || typeof data.rendered !== "number" || typeof data.authored !== "number")) {
        return fail(400, "fit needs data.authored and data.rendered");
      }
      // A POST is always about one page — there is no such thing as a
      // selection on "every page".
      if (!pagePath) return fail(404, "post to /chat/<page>.html/messages");
      const msg = postMessage(live, { page: pagePath, from, kind, text, data });
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, id: msg.id, epoch: live.epoch, listening: listening(live) }));
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
      const messages = await awaitMessages(live, {
        after,
        from,
        page: pagePath,   // undefined at /chat/messages = every page
        waitMs,
        consumer,
        peek,
        onAbort: (drop) => req.on("close", drop),
      });
      if (res.writableEnded) return; // client went away mid-poll
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, epoch: live.epoch, listening: listening(live), messages }));
    }

    return fail(405, "method not allowed");
  }

  async function serveIndex(res) {
    // Pages at the root plus one project-directory level deep (the
    // flat out/ layout plus one optional dir level); shell/ and dot-entries are assets, not pages.
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
    // pages one directory deep too; root when absent or invalid. The
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
            closeAll(live);
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
  let root, notes;
  try {
    ({ root, notes } = resolveServeDir(argValue("--dir", null)));
  } catch (err) {
    console.error(`print-skill server: ${err.message}`);
    process.exit(1);
  }
  for (const note of notes) console.log(`print-skill server: ${note}`);
  const { url, close } = await startServer({
    dir: root,
    port: Number(argValue("--port", DEFAULT_PORT)),
    autoPort: args.includes("--auto-port"),
  });
  console.log(`print-skill server: ${url}  (serving ${root})`);
  // Addressed to the agent that just started this process. A served page is
  // live-editable, but only if something is actually listening on it — and
  // the moment that is most often missed is exactly this one, a restart in a
  // turn that was about something else. So the next command is printed where
  // the agent is already looking, not left to a doc it may not re-read.
  console.log(
    `live edit: nothing is listening yet. Before you end this turn, connect:\n` +
    `  node ${path.join(SERVER_DIR, "chat-cli.mjs")} wait --timeout 240 --url ${url}\n` +
    `  (No page argument — this watches every page this server serves, including\n` +
    `  ones made later. Run it in the background and end your turn; its completion\n` +
    `  wakes you, then arm the next one. This applies even if all you were asked to\n` +
    `  do was start the server. Skip only in a headless/pipeline run, where nobody\n` +
    `  is at a browser.)`
  );
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, async () => {
      await close();
      await closeBrowser();
      process.exit(0);
    });
  }
}
