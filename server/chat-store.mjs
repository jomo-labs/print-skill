// The live channel between the pages this server serves and the model editing
// them. There is no chat: the user talks to their model in the model's own
// session. Two things cross this boundary, and they are shaped differently on
// purpose.
//
//   SELECTION — state, not an event. The page reports which element the user
//   has selected; the server holds the latest one per page; the model READS it
//   when it needs it, which is the moment the user actually asks for a change.
//   Nobody subscribes and nobody is woken. That is deliberate: a push channel
//   here bought an instant acknowledgment and cost a background listener per
//   session, a notification per click, and an agent that could — and did —
//   grow six watchers re-arming each other. The page tells the user what is
//   selected; the model finds out when it matters.
//
//   STATUS — a short-lived signal from the model to one open tab: `working`
//   while a file is half-written, `done` when it is final. The tab polls for
//   it on its own 1.5s cadence. This one stays a message log because the tab
//   needs to see each transition, and it is bounded, one-directional, and
//   invisible to the user except as a toolbar state.
//
// Everything is in-memory by design: none of it is document state (the page
// file remains the single source of truth for content). `epoch` is the restart
// contract — a client that sees the epoch change resets its cursor to 0
// instead of silently deadlocking on a stale `after` id that the new process
// will never reach, and re-posts what it has selected, since a fresh server
// has never been told.
import crypto from "node:crypto";

const MAX_MESSAGES = 200;

/**
 * One log per server instance — never a module-level singleton. Two servers in
 * one process (the test suite runs several; render-cli starts an ephemeral
 * one) would otherwise share state, and a restarted server would inherit the
 * dead one's entries and `epoch` — which is precisely what the epoch is
 * supposed to tell a client apart from.
 */
export function createLiveLog() {
  return {
    epoch: crypto.randomBytes(8).toString("hex"),
    nextId: 1,
    // Status messages only, and only ever read by the page they belong to.
    messages: [],
    // The current selection per page: page -> { selector, label, text, edited,
    // snapshot, ts }, or absent once cleared. Latest wins; there is no history,
    // because nothing downstream wants one.
    selections: new Map(),
    // The same shape for the other thing a page knows about itself and the
    // model does not: that its content no longer fits the sheets it lays out.
    // Absent means it fits, which is why a page that comes back into fit
    // clears its entry rather than filing a second report.
    fits: new Map(),
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

// ── Selection state ─────────────────────────────────────────────────────────

/** Record what a page has selected. `selector: null` clears it. */
export function setSelection(log, page, data) {
  if (!data || data.selector == null) {
    log.selections.delete(page);
    return null;
  }
  const entry = { ...data, page, ts: Date.now() };
  log.selections.set(page, entry);
  return entry;
}

/**
 * What is selected right now, newest first. With no page, every page that has
 * something selected — a model asks the server, not a document, so it does not
 * have to know which page the user is looking at.
 */
export function getSelections(log, page) {
  return newestFirst(log.selections, page);
}

/** Record that a page does not fit. `null` means it fits again. */
export function setFit(log, page, data) {
  if (!data) {
    log.fits.delete(page);
    return null;
  }
  const entry = { ...data, page, ts: Date.now() };
  log.fits.set(page, entry);
  return entry;
}

/** Which pages do not currently fit their sheets, newest first. */
export function getFits(log, page) {
  return newestFirst(log.fits, page);
}

function newestFirst(map, page) {
  const all = page === undefined
    ? [...map.values()]
    : (map.has(page) ? [map.get(page)] : []);
  return all.sort((a, b) => b.ts - a.ts);
}

// ── Status messages ─────────────────────────────────────────────────────────

function pending(log, after, page) {
  return log.messages.filter((m) => m.id > after && (page === undefined || m.page === page));
}

export function postMessage(log, { page, kind, text, data }) {
  const msg = { id: log.nextId++, ts: Date.now(), page, from: "model", kind, text };
  if (data !== undefined) msg.data = data;
  log.messages.push(msg);
  if (log.messages.length > MAX_MESSAGES) log.messages.shift();
  for (const w of [...log.waiters]) {
    if (page === undefined || w.page === undefined || w.page === page) {
      w.settle(pending(log, w.after, w.page));
    }
  }
  return msg;
}

/**
 * Resolve with status messages after `after` — immediately if any exist,
 * otherwise when one arrives or waitMs elapses (then possibly []). onAbort
 * registration lets the caller drop the waiter when the client socket closes
 * mid-poll.
 */
export function awaitMessages(log, { after = 0, page, waitMs, onAbort }) {
  const ready = pending(log, after, page);
  if (ready.length || !waitMs) return Promise.resolve(ready);

  return new Promise((resolve) => {
    const waiter = { after, page };
    let timer = null;
    const finish = (msgs) => {
      log.waiters.delete(waiter);
      clearTimeout(timer);
      resolve(msgs);
    };
    waiter.settle = finish;
    log.waiters.add(waiter);
    timer = setTimeout(() => finish([]), waitMs);
    if (onAbort) onAbort(() => finish([]));
  });
}
