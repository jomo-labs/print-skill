// In-memory per-page chat store for the shell's Chat panel.
//
// One store per served page, holding a bounded message log plus the
// bookkeeping that makes the two consumers work:
//   - the shell polls with wait=0 on its usual 1.5s cadence;
//   - the model's chat-cli polls with a bounded long-poll (wait<=25s) as
//     consumer=model, which drives both a server-held delivery cursor (so the
//     stateless one-shot CLI never re-reads messages) and the presence signal
//     the panel shows as "model is listening".
//
// Everything is in-memory by design: chat history is conversation, not
// document state (the page file remains the single source of truth for
// content). `epoch` is the restart contract — a client that sees the epoch
// change resets its cursor to 0 instead of silently deadlocking on a stale
// `after` id that the new process will never reach.
import crypto from "node:crypto";

const MAX_MESSAGES = 500;

const stores = new Map();

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

export function getStore(page) {
  let s = stores.get(page);
  if (!s) {
    s = newStore();
    stores.set(page, s);
  }
  return s;
}

export function listening(store) {
  if (store.openModelWaits > 0) return true;
  const grace = Math.max(45_000, 2.5 * store.lastModelWaitMs);
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
      store.lastModelWaitMs = Math.max(store.lastModelWaitMs, waitMs || 0);
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

/**
 * Resolve every pending long-poll (empty) so open sockets never hold the
 * server up — called from startServer's close() ahead of server.close(),
 * without which render-cli's one-shot server and SIGINT shutdown would hang
 * until the longest poll times out.
 */
export function closeAll() {
  for (const store of stores.values()) {
    for (const w of [...store.waiters]) w.settle([]);
  }
}
