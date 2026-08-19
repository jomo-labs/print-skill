#!/usr/bin/env node
// Model-side CLI for the page's live channel. Zero dependencies, Node 18+.
//
// There is no chat panel and no chat: the user asks for changes in YOUR
// session, not in the page. This CLI carries only what the page knows and you
// don't (which element they have selected, and that it has stopped fitting
// its sheets) and what you know and it doesn't (that you are mid-edit).
// Everything you want to SAY, say in your session.
//
// Every command is one-shot and bounded so a listener can be re-armed after
// every wake without losing anything: a server-held cursor delivers each
// message exactly once across invocations, so the gap between one `wait`
// exiting and the next starting is not a hole. Live mode runs on harnesses
// that can stream or background a command; a foreground-only harness is not
// supported (see references/harness-support.md).
//
// <page>, where a command takes one, is the server path of the page —
// "<page>.html" under the default flat out/ layout ("<dir>/<page>.html" for
// custom one-level layouts). `wait` is the one command that does not need it.
//
//   wait [<page>] [--timeout N] [--after ID] [--peek]
//       Bounded poll for what the user does in the browser, and for what the
//       page finds wrong with itself:
//         kind:"selection"  which element they just double-clicked
//                           (data.selector null = they cleared it). What they
//                           want done with it they tell you directly, in your
//                           session.
//         kind:"fit"        the page no longer fits the sheets it lays out —
//                           data carries {authored, rendered, overflowing,
//                           paper, orientation}. This one IS a request: the
//                           layout is yours, the page is showing the user a
//                           red "… fixing", go and fix it (SKILL.md, "A fit
//                           problem arrives").
//
//       WITH NO <page> THIS WATCHES EVERY PAGE THE SERVER SERVES, and that is
//       how you should normally run it — you are connecting to the server, not
//       to a document. Every entry carries the `page` it came from, so you
//       always know which one the user is on, including pages made after you
//       started listening. Name a page only to deliberately ignore the others.
//       Prints exactly one of:
//         {"epoch":"…","messages":[…]}    >=1 new message   (exit 0)
//         NO_MESSAGE                       poll expired empty (exit 0)
//       Exit 2 only for hard errors (server unreachable, unknown page).
//       A server-held cursor means each run delivers only undelivered
//       messages — safe to re-run forever. --after replays; --peek never
//       advances the cursor.
//   wait [<page>] --follow
//       Never exits; prints one NDJSON line per batch. Only for
//       harnesses that can stream or read a background command's output —
//       never run this as a plain foreground command.
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
const follow = takeFlag("--follow");
const peek = takeFlag("--peek");
// The 20s default is a safe floor for any listener; background one-shot
// listeners (the harness wakes the model when the command exits) pass up to
// 300 for long quiet holds between wakes.
const timeout = Math.min(Math.max(Number(takeValue("--timeout", 20)) || 20, 5), 300);
const after = takeValue("--after", undefined);
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

async function pollOnce(p) {
  const params = new URLSearchParams({ consumer: "model", from: "user", wait: String(timeout) });
  if (after !== undefined) params.set("after", String(Math.max(0, Number(after) || 0)));
  if (peek) params.set("peek", "1");
  // No page named: the server-wide address, which is the normal case.
  const path = p ? `/chat/${pagePath(p)}/messages` : "/chat/messages";
  return api(`${path}?${params}`);
}

switch (command) {
  case "wait": {
    if (follow) {
      // Streaming mode for background/push harnesses: one NDJSON line per
      // batch, forever. Hard errors still exit 2 (via die in api()).
      for (;;) {
        const body = await pollOnce(page);
        if (body.messages.length) {
          process.stdout.write(JSON.stringify({ epoch: body.epoch, messages: body.messages }) + "\n");
        }
      }
    }
    const body = await pollOnce(page);
    if (body.messages.length) {
      console.log(JSON.stringify({ epoch: body.epoch, messages: body.messages }));
    } else {
      console.log("NO_MESSAGE");
    }
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
    die("usage: chat-cli.mjs <wait [<page>.html]|status <page>.html|edits <page>.html> …  (see file header)");
}
