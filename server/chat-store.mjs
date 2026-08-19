// In-memory per-page event log for the live channel between a served page and
// the model editing it. There is no chat: the user talks to their model in the
// model's own session. What passes through here is the page reporting which
// element the user selected, the model reporting that it is mid-edit, and the
// presence the page's toolbar shows.
//
// One store per served page, holding a bounded log plus the bookkeeping that
// makes the two consumers work:
//   - the shell polls with wait=0 on its usual 1.5s cadence;
//   - the model's chat-cli polls with a bounded long-poll (20s default, up to
//     300s for background one-shot listeners) as consumer=model, which drives
//     both a server-held delivery cursor (so the stateless one-shot CLI never
//     re-reads events) and the presence signal the toolbar shows as connected.
//
// Everything is in-memory by design: none of it is document state (the page
// file remains the single source of truth for content). `epoch` is the restart
// contract — a client that sees the epoch change resets its cursor to 0
// instead of silently deadlocking on a stale `after` id that the new process
// will never reach, and re-announces what it has selected, since a fresh
// server has never been told.
import crypto from "node:crypto";

const MAX_MESSAGES = 500;

function newStore() {
  return {
    epoch: crypto.randomBytes(8).toString("hex"),
    nextId: 1,
    messages: [],
    // Delivery cursor for consumer=model: advanced when a model poll is
    // handed messages (unless peeking), so each CLI invocation gets only
    // what hasn't been delivered yet.
    modelCursor: 0,
    // Presence: an open model long-poll, or one that ended recently. The
    // grace window is sized so a loop of bounded 8–25s waits with gaps
    // between harness turns still reads as "listening".
    openModelWaits: 0,
    lastModelWaitEnd: 0,
    lastModelWaitMs: 0,
    waiters: new Set(),
  };
}

/**
 * One registry per server instance — never a module-level Map. Two servers in
 * one process (the test suite runs several; render-cli starts an ephemeral
 * one) would otherwise share a store for every page path that happened to
 * collide, and a restarted server would inherit the dead one's message log,
 * cursor and `epoch` — which is precisely what the epoch is supposed to tell
 * a client apart from.
 */
export function createStoreRegistry() {
  const stores = new Map();
  return {
    get(page) {
      let s = stores.get(page);
      if (!s) {
        s = newStore();
        stores.set(page, s);
      }
      return s;
    },
    /**
     * Resolve every pending long-poll (empty) so open sockets never hold the
     * server up — called from startServer's close() ahead of server.close(),
     * without which render-cli's one-shot server and SIGINT shutdown would
     * hang until the longest poll times out.
     */
    closeAll() {
      for (const store of stores.values()) {
        for (const w of [...store.waiters]) w.settle([]);
      }
    },
  };
}

export function listening(store) {
  if (store.openModelWaits > 0) return true;
  // Sized so a loop of bounded waits with harness-turn gaps reads as
  // listening, but capped: a long background wait (e.g. 240s) that ends and
  // never re-arms must not pin "model is listening" for many minutes —
  // re-arming after a wake takes seconds, not another full wait window.
  const grace = Math.max(45_000, Math.min(2.5 * store.lastModelWaitMs, 120_000));
  return Date.now() - store.lastModelWaitEnd < grace;
}

function matches(msg, from) {
  return from === "any" || msg.from === from;
}

function pending(store, after, from) {
  return store.messages.filter((m) => m.id > after && matches(m, from));
}

export function postMessage(store, { from, kind, text, data }) {
  const msg = { id: store.nextId++, ts: Date.now(), from, kind, text };
  if (data !== undefined) msg.data = data;
  store.messages.push(msg);
  if (store.messages.length > MAX_MESSAGES) store.messages.shift();
  // Wake long-polls whose filter this message satisfies.
  for (const w of [...store.waiters]) {
    if (matches(msg, w.from)) w.settle(pending(store, w.after, w.from));
  }
  return msg;
}

/**
 * Resolve with messages matching {after, from} — immediately if any exist,
 * otherwise after a message arrives or waitMs elapses (then possibly []).
 * consumer === "model" drives presence bookkeeping and defaults/advances the
 * server-held modelCursor (unless peek). onAbort registration lets the
 * caller drop the waiter when the client socket closes mid-poll.
 */
export function awaitMessages(store, { after, from, waitMs, consumer, peek, onAbort }) {
  const isModel = consumer === "model";
  const effectiveAfter = after ?? (isModel ? store.modelCursor : 0);

  const deliver = (msgs) => {
    if (isModel && !peek && msgs.length) {
      store.modelCursor = Math.max(store.modelCursor, msgs[msgs.length - 1].id);
    }
    return msgs;
  };

  const ready = pending(store, effectiveAfter, from);
  if (ready.length || !waitMs) {
    if (isModel) {
      store.lastModelWaitEnd = Date.now();
      store.lastModelWaitMs = waitMs || 0;
    }
    return Promise.resolve(deliver(ready));
  }

  return new Promise((resolve) => {
    const waiter = { after: effectiveAfter, from };
    let timer = null;
    const finish = (msgs) => {
      store.waiters.delete(waiter);
      clearTimeout(timer);
      if (isModel) {
        store.openModelWaits--;
        store.lastModelWaitEnd = Date.now();
        store.lastModelWaitMs = waitMs;
      }
      resolve(deliver(msgs));
    };
    waiter.settle = finish;
    store.waiters.add(waiter);
    if (isModel) store.openModelWaits++;
    timer = setTimeout(() => finish([]), waitMs);
    if (onAbort) onAbort(() => finish([]));
  });
}


