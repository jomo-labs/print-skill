// In-memory event log for the live channel between the pages this server
// serves and the model editing them. There is no chat: the user talks to their
// model in the model's own session. What passes through here is a page
// reporting which element the user selected, the model reporting that it is
// mid-edit, and the presence a page's toolbar shows.
//
// ONE LOG PER SERVER, not one per page. A model connects to the server and
// sees every page it serves — it does not have to know which page the user
// will open, or be told again when they open another. Each entry carries the
// `page` it came from, and a reader can narrow to one page if it wants to; the
// default is everything. This is what lets "start the server" and "be
// reachable on it" be the same act, with no page named in between.
//
// Two consumers:
//   - each open page polls with wait=0 on its usual 1.5s cadence, narrowed to
//     itself (it only cares about its own status messages);
//   - the model's chat-cli polls with a bounded long-poll (20s default, up to
//     300s for background one-shot listeners) as consumer=model, which drives
//     both a server-held delivery cursor (so the stateless one-shot CLI never
//     re-reads events) and the presence signal every page's toolbar shows.
//
// Everything is in-memory by design: none of it is document state (the page
// file remains the single source of truth for content). `epoch` is the restart
// contract — a client that sees the epoch change resets its cursor to 0
// instead of silently deadlocking on a stale `after` id that the new process
// will never reach, and re-announces what it has selected, since a fresh
// server has never been told.
import crypto from "node:crypto";

const MAX_MESSAGES = 500;

// The scope key for a reader watching everything. Page paths always contain a
// ".html", so this can never collide with one.
const ALL = "*";

/**
 * One log per server instance — never a module-level singleton. Two servers in
 * one process (the test suite runs several; render-cli starts an ephemeral
 * one) would otherwise share state, and a restarted server would inherit the
 * dead one's entries, cursor and `epoch` — which is precisely what the epoch
 * is supposed to tell a client apart from.
 */
export function createLiveLog() {
  return {
    epoch: crypto.randomBytes(8).toString("hex"),
    nextId: 1,
    messages: [],
    // Delivery cursors for consumer=model, keyed by what the reader is
    // watching ("*" or one page path). Keyed rather than single because the
    // ids are server-wide: a model watching one page would otherwise drag the
    // cursor past entries from other pages that it never saw.
    modelCursors: new Map(),
    // Presence: an open model long-poll, or one that ended recently. Server-
    // wide, because a model watching the server IS watching every page on it.
    // The grace window is sized so a loop of bounded waits with gaps between
    // harness turns still reads as "listening".
    openModelWaits: 0,
    lastModelWaitEnd: 0,
    lastModelWaitMs: 0,
    waiters: new Set(),
  };
}

/**
 * Resolve every pending long-poll (empty) so open sockets never hold the
 * server up — called from startServer's close() ahead of server.close(),
 * without which render-cli's one-shot server and SIGINT shutdown would hang
 * until the longest poll times out.
 */
export function closeAll(log) {
  for (const w of [...log.waiters]) w.settle([]);
}

export function listening(log) {
  if (log.openModelWaits > 0) return true;
  // Sized so a loop of bounded waits with harness-turn gaps reads as
  // listening, but capped: a long background wait (e.g. 240s) that ends and
  // never re-arms must not pin "model is listening" for many minutes —
  // re-arming after a wake takes seconds, not another full wait window.
  const grace = Math.max(45_000, Math.min(2.5 * log.lastModelWaitMs, 120_000));
  return Date.now() - log.lastModelWaitEnd < grace;
}

function matches(msg, from, page) {
  if (from !== "any" && msg.from !== from) return false;
  return page === undefined || msg.page === page;
}

function pending(log, after, from, page) {
  return log.messages.filter((m) => m.id > after && matches(m, from, page));
}

export function postMessage(log, { page, from, kind, text, data }) {
  const msg = { id: log.nextId++, ts: Date.now(), page, from, kind, text };
  if (data !== undefined) msg.data = data;
  log.messages.push(msg);
  if (log.messages.length > MAX_MESSAGES) log.messages.shift();
  // Wake long-polls whose filter this entry satisfies.
  for (const w of [...log.waiters]) {
    if (matches(msg, w.from, w.page)) w.settle(pending(log, w.after, w.from, w.page));
  }
  return msg;
}

/**
 * Resolve with entries matching {after, from, page} — immediately if any
 * exist, otherwise after one arrives or waitMs elapses (then possibly []).
 * `page` undefined means every page this server serves.
 *
 * consumer === "model" drives presence bookkeeping and defaults/advances the
 * server-held cursor for this scope (unless peek). onAbort registration lets
 * the caller drop the waiter when the client socket closes mid-poll.
 */
export function awaitMessages(log, { after, from, page, waitMs, consumer, peek, onAbort }) {
  const isModel = consumer === "model";
  const scope = page === undefined ? ALL : page;
  const effectiveAfter = after ?? (isModel ? log.modelCursors.get(scope) ?? 0 : 0);

  const deliver = (msgs) => {
    if (isModel && !peek && msgs.length) {
      const last = msgs[msgs.length - 1].id;
      log.modelCursors.set(scope, Math.max(log.modelCursors.get(scope) ?? 0, last));
    }
    return msgs;
  };

  const ready = pending(log, effectiveAfter, from, page);
  if (ready.length || !waitMs) {
    if (isModel) {
      log.lastModelWaitEnd = Date.now();
      log.lastModelWaitMs = waitMs || 0;
    }
    return Promise.resolve(deliver(ready));
  }

  return new Promise((resolve) => {
    const waiter = { after: effectiveAfter, from, page };
    let timer = null;
    const finish = (msgs) => {
      log.waiters.delete(waiter);
      clearTimeout(timer);
      if (isModel) {
        log.openModelWaits--;
        log.lastModelWaitEnd = Date.now();
        log.lastModelWaitMs = waitMs;
      }
      resolve(deliver(msgs));
    };
    waiter.settle = finish;
    log.waiters.add(waiter);
    if (isModel) log.openModelWaits++;
    timer = setTimeout(() => finish([]), waitMs);
    if (onAbort) onAbort(() => finish([]));
  });
}
