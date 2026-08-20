#!/usr/bin/env node
// Model-side CLI for the page's live channel. Zero dependencies, Node 18+.
//
// There is no chat panel and no chat: the user asks for changes in YOUR
// session, not in the page. This CLI carries only what the page knows and you
// don't (which element they have selected, and that it has stopped fitting
// its sheets) and what you know and it doesn't (that you are mid-edit).
// Everything you want to SAY, say in your session.
//
// Every command is one-shot: it asks, prints, and exits. Nothing here runs in
// the background, watches, or has to be kept alive — which is why live editing
// works on every harness that can run a shell command at all, with no
// listener to arm and nothing to leak between turns.
//
// <page>, where a command takes one, is the server path of the page —
// "<page>.html" under the default flat out/ layout ("<dir>/<page>.html" for
// custom one-level layouts). `selection` takes one only to narrow its answer;
// without it you get every page, which is normally what you want.
//
//   selection [<page>]          What the user has selected in the browser
//                               RIGHT NOW, one line per page that has
//                               something selected, newest first:
//                                 List item #3 was selected.  [/menu.html #page > ul > li:nth-of-type(3) "Divide beef into portions"]
//                                 NO_SELECTION
//                               The bracket is what you act on: page, then
//                               selector. Read it when a request needs a
//                               target and does not name one ("make this
//                               bigger"). There is nothing to subscribe to and
//                               nothing to keep running — ask when you need to
//                               know, which is the moment you are about to
//                               edit.
//   fit [<page>]                Which served pages no longer fit the sheets
//                               they lay out, newest first:
//                                 /menu.html content runs onto 3 sheets  [authored 1, rendered 3, overflowing 0, letter portrait]
//                                 EVERYTHING_FITS
//                               An entry here means the user pressed FIX on
//                               that page's red notice — the layout is yours,
//                               and they have handed it over, so this IS a
//                               request (SKILL.md, "A page that stops
//                               fitting"). Read it after your own edits land.
//                               A page that comes back into fit drops off the
//                               list by itself.
//                               `clipped N` in the detail means content is
//                               cut off inside N containers (it does not
//                               print); each cut's address follows on its own
//                               line — a selector into the file's authored
//                               flow:
//                                 /menu.html content is cut off in 1 place  [authored 1, rendered 1, overflowing 0, clipped 1, letter portrait]
//                                     clipped: #page > div:nth-of-type(2)

//   status <page> <working|done|idle> [text]
//                               Tell the open tab where you are. `working`
//                               holds its auto-reload while the file is
//                               half-written and lights the toolbar's
//                               indicator; `done` releases the hold and
//                               refreshes it at once; `idle` just clears.
//                               The optional text becomes the indicator's
//                               tooltip. There is no way to send the user a
//                               message here, and no need for one — you are
//                               already talking to them in your own session.
//   edits <page> [--full]       List elements carrying data-mp-edited in the
//                               served file (the markers the shell stamps on
//                               user-edited elements); --full prints the
//                               whole served file. The authoritative read is
//                               always the file on disk.
//
// --url <base> (or PRINT_SKILL_URL) overrides http://127.0.0.1:4949.

const argv = process.argv.slice(2);

function takeFlag(name) {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  argv.splice(i, 1);
  return true;
}
function takeValue(name, fallback) {
  const i = argv.indexOf(name);
  if (i === -1 || i === argv.length - 1) return fallback;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
}

const BASE = (takeValue("--url", process.env.PRINT_SKILL_URL || "http://127.0.0.1:4949")).replace(/\/+$/, "");
const full = takeFlag("--full");

const [command, page, ...rest] = argv;

function die(msg) {
  process.stderr.write(msg + "\n");
  process.exit(2);
}

function pagePath(p) {
  if (!p || !/\.html?$/i.test(p)) die(`usage: chat-cli.mjs ${command} <page>.html …`);
  // Per-segment encoding: pages may live one project directory deep
  // (custom layouts → "<dir>/<page>.html"; the default out/ layout is flat).
  return p.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
}

async function api(path, init) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    die(`server unreachable at ${BASE} — is server.mjs running?`);
  }
  let body;
  try {
    body = await res.json();
  } catch {
    die(`unexpected non-JSON response (${res.status}) from ${BASE}${path}`);
  }
  if (!res.ok || !body.ok) die(body.error || `server returned ${res.status}`);
  return body;
}

function post(p, payload) {
  return api(`/chat/${pagePath(p)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/**
 * One selection, one line, written for a human first — the same sentence the
 * page shows the user, so the two never disagree about what is selected.
 * The machine half rides in the trailing bracket: the page, then the selector.
 * Everything else about the element is in the file on disk, which is the
 * authoritative read anyway.
 */
function forPage(entries, page) {
  const all = entries || [];
  return page ? all.filter((e) => e.page === `/${pagePath(page)}`) : all;
}

/**
 * The measurement, in the words the page is showing the user, with the numbers
 * behind it — enough to tell "one paragraph spills" from "the whole thing is
 * twice as long as it should be" without opening the page.
 */
function formatFit(f) {
  const detail = `authored ${f.authored}, rendered ${f.rendered}, overflowing ${f.overflowing}` +
    (f.clipped ? `, clipped ${f.clipped}` : "");
  const paper = [f.paper, f.orientation].filter(Boolean).join(" ");
  const line = `${f.page} ${f.text || "does not fit"}  [${detail}${paper ? `, ${paper}` : ""}]`;
  // Where the cuts are, one address per line — selectors into the file's
  // authored flow, measured by the page itself, so there is nothing to
  // re-derive before editing.
  const clipped = (f.clippedAt || []).map((sel) => `\n    clipped: ${sel}`).join("");
  return line + clipped;
}

function formatSelection(sel) {
  // Named exactly as the page named it to the user — same label, same "#2"
  // among repeats — so the two never describe one element two ways.
  const label = sel.label || "Element";
  const index = sel.index ? ` #${sel.index}` : "";
  const text = sel.text ? ` ${JSON.stringify(sel.text)}` : "";
  return `${label}${index} was selected.  [${sel.page} ${sel.selector}${text}]`;
}

switch (command) {
  case "selection": {
    const body = await api("/chat/selection");
    const scoped = forPage(body.selections, page);
    if (!scoped.length) {
      console.log("NO_SELECTION");
      break;
    }
    for (const sel of scoped) console.log(formatSelection(sel));
    break;
  }

  case "fit": {
    const body = await api("/chat/fit");
    const scoped = forPage(body.fits, page);
    if (!scoped.length) {
      console.log("EVERYTHING_FITS");
      break;
    }
    for (const f of scoped) console.log(formatFit(f));
    break;
  }

  case "status": {
    const state = rest[0];
    if (!["working", "done", "idle"].includes(state)) die("status: state must be working|done|idle");
    const text = rest.slice(1).join(" ");
    const body = await post(page, { from: "model", kind: "status", text, data: { state } });
    console.log(JSON.stringify({ ok: true, id: body.id }));
    break;
  }

  case "edits": {
    let res;
    try {
      res = await fetch(`${BASE}/${pagePath(page)}`);
    } catch {
      die(`server unreachable at ${BASE} — is server.mjs running?`);
    }
    if (!res.ok) die(`no served page at /${page} (${res.status})`);
    const html = await res.text();
    if (full) {
      process.stdout.write(html);
      break;
    }
    const hits = [];
    html.split("\n").forEach((line, i) => {
      if (line.includes("data-mp-edited")) {
        hits.push({ line: i + 1, snippet: line.trim().slice(0, 300) });
      }
    });
    console.log(JSON.stringify(hits, null, 2));
    process.stderr.write("note: the file on disk is the authoritative copy — Read it before editing.\n");
    break;
  }

  default:
    die("usage: chat-cli.mjs <selection|fit [<page>.html]|status <page>.html|edits <page>.html> …  (see file header)");
}
