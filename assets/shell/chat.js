// Chat panel: user ↔ model communication from the preview chrome.
//
// Everything routes through typed INTENTS and dispatchIntent() — the UI never
// talks to a transport directly. Adding a new page interaction that needs the
// model means adding ONE registry entry (how it serializes for the live
// server, how it formats as a copy/paste instruction); the transports and the
// panel never change. dispatchIntent() picks the route per the current state:
//
//   live     served: the local server is up, so live editing works. Messages
//            POST to /chat/<page>/messages and the model's replies/status
//            stream back via the poll.
//   file     file:// — no server exists; input is disabled and intents
//            render as copy/paste cards.
//
// That is the entire state space. Live edit is supported exactly when the
// page is served — never a flag baked into the document, and never something
// the chrome can turn on or off. Whether a model happens to be listening at
// this instant is PRESENCE: it shows in the presence line, and it is not a
// mode, because the model connects on its own when it serves the page.
//
// The panel is runtime-only chrome: built here on demand, stripped by
// serializeForSave(), hidden in print and embedded modes. Chat never touches
// page content and never calls savePage() — the file on disk stays exactly
// what the assembly/edit flows wrote.

(function () {
  const POLL_MS = 1500; // same cadence as the auto-reload poll

  // ── Mode ──────────────────────────────────────────────────────────────────

  const served = () => location.protocol !== 'file:';

  // 'live' | 'file' — see the header comment. Being served IS the capability.
  const panelState = () => (served() ? 'live' : 'file');
  // The state whose intents render copy/paste cards instead of POSTing.
  const isPasteState = (s) => s === 'file';

  const pageFileName = () =>
    served() ? decodeURIComponent(location.pathname.replace(/^\//, ''))
             : (location.pathname.split('/').pop() || document.title);

  // ── Intent registry ───────────────────────────────────────────────────────
  // payload shapes:
  //   chat-message     { text }
  //   element-request  { text, selector, snapshot, edited }
  //   page-request     { text }
  //   element-selected { selector, snapshot, edited } — selector null = none
  //
  // `quiet: true` marks an intent that is a NOTICE rather than something the
  // user said: it posts without a chat bubble, and it has no paste form,
  // because there is no model to notify when nothing is served.
  const INTENTS = {
    'chat-message': {
      toLive: p => ({ kind: 'message', text: p.text }),
      toPaste: p => `Regarding the printable page "${document.title}" (file: ${pageFileName()}):\n\n${p.text}`,
    },
    'element-request': {
      toLive: p => ({ kind: 'message', text: p.text,
                      data: { selector: p.selector, snapshot: p.snapshot, edited: p.edited } }),
      toPaste: p => `In ${pageFileName()}, about the element \`${p.selector}\`` +
                    (p.edited ? ' (I edited it in the browser; it carries data-mp-edited in the file)' : '') +
                    `, which currently reads:\n\n${p.snapshot}\n\n${p.text}`,
    },
    'page-request': {
      toLive: p => ({ kind: 'message', text: p.text, data: { scope: 'page' } }),
      toPaste: p => `Please re-read ${pageFileName()} from disk (it contains my latest browser edits, ` +
                    `marked with data-mp-edited) and then: ${p.text}`,
    },
    'element-selected': {
      quiet: true,
      toLive: p => ({
        kind: 'selection',
        text: p.selector ? `selected ${p.selector}` : 'cleared the selection',
        data: p.selector
          ? { selector: p.selector, snapshot: p.snapshot, edited: p.edited }
          : { selector: null },
      }),
    },
  };

  /**
   * Route an intent. Opens the panel, then: live → POST to the server
   * (optimistic bubble; a failed POST falls back to a paste card so a message
   * is never lost); file:// → paste card into the log.
   */
  async function dispatchIntent(intent) {
    const spec = INTENTS[intent.type];
    if (!spec) return;
    // A notice never opens the panel. Leaving edit mode clears the selection,
    // and that clear is itself a notice — opening the panel for it would pop
    // the panel back up 400ms after the user pressed Done.
    if (!spec.quiet) openPanel();
    if (isPasteState(panelState())) {
      // Nothing is served, so there is nobody to notify — a notice is simply
      // dropped rather than becoming a paste card the user never asked for.
      if (spec.quiet) return;
      manualTransport.send(intent, spec);
    } else {
      await liveTransport.send(intent, spec);
    }
    refreshMode();
  }

  // ── Live transport ────────────────────────────────────────────────────────

  let cursor = 0;            // highest message id processed by the poll
  let epoch = null;          // server restart detection
  let modelListening = false;
  let pollTimer = null;
  const seenIds = new Set(); // dedupe our own POSTs against the poll echo

  const chatUrl = () => `/chat/${location.pathname.replace(/^\//, '')}/messages`;

  const liveTransport = {
    async send(intent, spec) {
      const label = intent.type === 'element-request'
        ? `⌖ ${intent.payload.selector}\n${intent.payload.text}`
        : intent.payload.text;
      const bubble = spec.quiet ? null : addBubble('user', label);
      try {
        const res = await fetch(chatUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'user', ...spec.toLive(intent.payload) }),
        });
        if (!res.ok) throw new Error(`server returned ${res.status}`);
        const body = await res.json();
        seenIds.add(body.id);
        setListening(body.listening);
      } catch {
        // Server unreachable. A notice is dropped — it describes a state the
        // page still shows, and the next one supersedes it anyway. Anything
        // the user actually said degrades to the manual transport, with the
        // bubble left as a record of what the card contains.
        if (spec.quiet) return;
        bubble.classList.add('mp-msg-failed');
        addPasteCard(spec.toPaste(intent.payload),
          'Could not reach the local server — paste this to your model instead.');
      }
    },
    start() {
      // Every served page polls: the poll is what carries the model's
      // replies, its status, and the presence signal.
      if (pollTimer || !served()) return;
      const tick = async () => {
        try {
          const res = await fetch(`${chatUrl()}?after=${cursor}&from=any`, { cache: 'no-store' });
          if (!res.ok) return;
          const body = await res.json();
          if (epoch !== null && body.epoch !== epoch) {
            // Server restarted: in-memory history is gone; old cursors would
            // deadlock against the new id sequence.
            cursor = 0;
            seenIds.clear();
            // The selection lived in that history too. The element is still
            // selected on the page and still chipped in the panel, so the
            // model that reconnects must be told again — otherwise the user
            // is looking at a chip the model has never heard of.
            noticedSelector = null;
            noticeSelection();
            addDivider('server restarted — earlier messages were lost');
          }
          epoch = body.epoch;
          for (const m of body.messages) {
            cursor = Math.max(cursor, m.id);
            if (seenIds.has(m.id)) continue;
            seenIds.add(m.id);
            if (m.kind === 'status') setStatus(m.data?.state, m.text, m.ts);
            else if (m.kind === 'selection') continue; // a notice, not conversation
            else if (m.from === 'model') addBubble('model', m.text);
            else addBubble('user', m.text); // another tab's message
          }
          setListening(body.listening);
        } catch { /* offline or server restarting — next tick retries */ }
      };
      tick();
      pollTimer = setInterval(tick, POLL_MS);
    },
    stop() {
      clearInterval(pollTimer);
      pollTimer = null;
    },
  };

  // ── Manual transport ──────────────────────────────────────────────────────

  const manualTransport = {
    send(intent, spec) {
      addPasteCard(spec.toPaste(intent.payload));
    },
  };

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // file:// and older engines: hidden-textarea fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed!important;top:0!important;left:-9999px!important;' +
                        'display:block!important;opacity:0!important;';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* leave the text visible for hand-copying */ }
      ta.remove();
    }
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = orig; }, 1200);
    }
  }

  // ── Panel DOM ─────────────────────────────────────────────────────────────

  let panel = null, log = null, presenceEl = null, inputEl = null, sendEl = null;
  let attachCtx = null; // { el } — the element double-click selected in edit mode

  // ── Composition signal (read by shell.js's auto-reload poll) ─────────────
  // The poll reloads on a changed file no matter what the user is doing, and
  // typing here is safe under that rule: the draft, caret and focus are
  // mirrored to sessionStorage on every keystroke and restored on the other
  // side. An IME composition is the exception the mirror can't cover — the
  // characters being composed are in neither the input's value nor the
  // draft — so the poll waits out the composition, and only that.
  let composing = false;
  window.mpChatComposing = () => composing;

  // ── Model work window (read by shell.js's auto-reload poll) ──────────────
  // The model brackets an edit with `status working` before its first write
  // and `status done` after its last (SKILL.md's live loop), and in between
  // the file passes through versions nobody meant to show: a heading fixed
  // but its spacing not yet, a section half-rewritten. So the preview holds
  // across that window and refreshes once at the end, arriving with the
  // model's confirmation rather than flickering ahead of it.
  //
  // Two things keep the hold from becoming the staleness it replaced. It is
  // measured from the status message's OWN timestamp, so it expires on its
  // own if the model stops reporting — a crashed edit, a harness that never
  // sends done — and a working status replayed out of the server's history
  // after a reload is already long expired, holding nothing. And `done`
  // doesn't merely release it: it asks for the reload immediately.
  const WORKING_HOLD_MS = 30000;
  let workingSince = 0; // ts of the latest working status; 0 when not working
  window.mpModelWorking = () => Date.now() - workingSince < WORKING_HOLD_MS;

  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function buildPanel() {
    if (panel) return;
    panel = el('aside', null); panel.id = 'mp-chat-panel';

    // Nothing but the conversation lives here: log, presence, input. Page
    // setup (paper size, orientation) is toolbar chrome that shell.js owns,
    // and the toolbar's EDIT/Done button is the only thing that opens or
    // closes the panel.
    const body = el('div', null); body.id = 'mp-panel-body';
    panel.appendChild(body);

    log = el('div', null); log.id = 'mp-chat-log';
    body.appendChild(log);

    presenceEl = el('div', null); presenceEl.id = 'mp-chat-presence';
    body.appendChild(presenceEl);

    const form = el('form', null); form.id = 'mp-chat-form';
    // Chip row: filled by double-click element selection in edit mode.
    const attachRow = el('div', null); attachRow.id = 'mp-chat-attach';
    form.appendChild(attachRow);

    inputEl = document.createElement('textarea');
    inputEl.id = 'mp-chat-input';
    inputEl.rows = 2;
    inputEl.placeholder = 'Ask for a change…';
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
    });
    // Draft + caret + focus are mirrored into sessionStorage on every event
    // that can move them, so the auto-reload poll can replace the document
    // under a focused, half-written message and restore() puts it back
    // exactly as it was (see Session persistence).
    for (const type of ['input', 'keyup', 'click', 'focus', 'blur']) {
      inputEl.addEventListener(type, rememberDraft);
    }
    inputEl.addEventListener('compositionstart', () => { composing = true; });
    inputEl.addEventListener('compositionend', () => { composing = false; rememberDraft(); });
    form.appendChild(inputEl);

    sendEl = el('button', 'mp-chat-send', 'Send');
    sendEl.type = 'submit';
    form.appendChild(sendEl);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = '';
      rememberDraft();
      // Element context is captured at SEND time from the live element, so
      // the snapshot includes the edits the user just made to it — and it is
      // re-captured for EVERY message while the chip stands, which is what
      // makes the selection a running context rather than a one-shot tag.
      // The chip deliberately survives the send; only the user clears it.
      const intent = attachCtx?.el?.isConnected
        ? { type: 'element-request', payload: { text, ...captureElement(attachCtx.el) } }
        : { type: 'chat-message', payload: { text } };
      dispatchIntent(intent);
    });
    body.appendChild(form);

    // Into the chrome's shadow root (shell.js), never the document: the panel
    // is server-managed chrome and stays out of reach of the page's CSS.
    chromeRoot.appendChild(panel);
  }

  // ── Panel state / mode rendering ─────────────────────────────────────────

  // Combined mode: shell.js owns the EDIT/Done button and calls this hook
  // when edit mode flips — the panel has no chrome of its own to close it.
  window.mpChatOnEditMode = (on) => {
    if (on) { openPanel(); return; }
    clearAttach();
    closePanel();
  };

  function openPanel() {
    buildPanel();
    if (!document.body.classList.contains('mp-chat-open')) {
      // Both sides of one state: the body class opens the document's gutter
      // (chrome-host.css), the host attribute shows the panel (chrome.css).
      document.body.classList.add('mp-chat-open');
      setChromeState('data-mp-chat-open', true);
      ssSet('mpChatOpen', '1');
      applySize(currentPaper);
    }
    refreshMode();
  }

  function closePanel() {
    document.body.classList.remove('mp-chat-open');
    setChromeState('data-mp-chat-open', false);
    ssSet('mpChatOpen', '');
    liveTransport.stop();
    applySize(currentPaper);
  }

  // The conversation opens with a greeting bubble. It says what this panel is
  // for — never how to switch live editing on, because there is no switch:
  // a served page is already live. It is written once and stays put.
  function buildStarter(state) {
    const card = el('div', 'mp-msg mp-msg-model mp-starter');
    card.appendChild(el('p', null, state === 'file'
      ? 'Live editing needs the local server — open this page through it to chat with your model.'
      : 'Double-click any text on the page to edit it, or tell me what to change.'));
    return card;
  }

  // Re-render the state-dependent chrome (starter card, presence, polling,
  // input enablement). Called on open, presence changes, and after each
  // dispatched intent.
  function refreshMode() {
    if (!panel) return;
    const state = panelState();
    panel.dataset.mode = state;

    if (!log.querySelector('.mp-starter')) log.prepend(buildStarter(state));

    const isFile = state === 'file';
    if (inputEl) inputEl.disabled = isFile;
    if (sendEl) sendEl.disabled = isFile;
    if (isFile) liveTransport.stop();
    else liveTransport.start();
    renderPresence();
  }

  function setListening(v) {
    if (v === modelListening) return;
    modelListening = v;
    if (v) addBubble('model', 'Connected!');
    refreshMode();
  }

  // The model's working state renders in the conversation itself (animated
  // dots + label, kept last); the presence line below stays about the
  // connection. Re-posted `status working "<note>"` updates the label.
  let workingEl = null;
  function setStatus(state, text, ts) {
    if (state === 'working') {
      // Re-posted progress notes extend the window — a long edit that keeps
      // reporting keeps holding, one that goes quiet stops.
      workingSince = ts || Date.now();
      const label = text || 'Working…';
      if (workingEl?.isConnected) {
        workingEl.querySelector('.mp-working-label').textContent = label;
      } else {
        workingEl = el('div', 'mp-msg mp-msg-model mp-working');
        const dots = el('span', 'mp-dots');
        for (let i = 0; i < 3; i++) dots.appendChild(el('i'));
        workingEl.appendChild(dots);
        workingEl.appendChild(el('span', 'mp-working-label', label));
        scrolled(() => log.appendChild(workingEl));
      }
    } else {
      // done / idle: the file has reached its final state, so show it now
      // rather than up to a poll tick after the message that announces it.
      const wasWorking = workingSince !== 0;
      workingSince = 0;
      workingEl?.remove();
      workingEl = null;
      if (wasWorking) window.mpReloadIfChanged?.();
    }
  }

  function renderPresence() {
    if (!presenceEl) return;
    const state = panelState();
    if (state === 'file') {
      presenceEl.textContent = '';
      presenceEl.className = '';
      return;
    }
    if (modelListening) {
      presenceEl.textContent = 'Model is connected';
      presenceEl.className = 'mp-presence-live';
    } else {
      presenceEl.textContent = 'No model connected';
      presenceEl.className = 'mp-presence-off';
    }
  }

  // ── Log rendering ────────────────────────────────────────────────────────

  function scrolled(fn) {
    const stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 8;
    const node = fn();
    if (stick) log.scrollTop = log.scrollHeight;
    return node;
  }

  function addBubble(role, text) {
    const node = scrolled(() => log.appendChild(el('div', `mp-msg ${role === 'user' ? 'mp-msg-user' : 'mp-msg-model'}`, text)));
    // The working indicator reads as "typing" — keep it below new messages.
    if (workingEl?.isConnected) log.appendChild(workingEl);
    return node;
  }

  function addDivider(text) {
    return scrolled(() => log.appendChild(el('div', 'mp-chat-divider', text)));
  }

  function addPasteCard(text, hint) {
    return scrolled(() => {
      const card = el('div', 'mp-paste-card');
      const pre = el('pre', null, text);
      card.appendChild(pre);
      const row = el('div', 'mp-paste-row');
      const btn = el('button', 'mp-copy-btn', 'Copy');
      btn.type = 'button';
      btn.addEventListener('click', () => copyText(text, btn));
      row.appendChild(btn);
      row.appendChild(el('span', 'mp-paste-hint', hint || 'Paste this to your model'));
      card.appendChild(row);
      log.appendChild(card);
      return card;
    });
  }

  // ── Element selection ────────────────────────────────────────────────────
  // Double-click in edit mode is the selection gesture: shell.js marks the
  // element .mp-selected and calls the hook below; the chip in the chat area
  // is the removable handle for that selection. No separate pick mode.
  //
  // A selection does two things. It tells the model straight away which
  // element the user is looking at — so the model can acknowledge it before a
  // word is typed — and it STICKS: the chip survives sending, so every
  // message after it carries the same element as its target until the user
  // picks another one or clears it. That is the whole point of selecting
  // something: "this is what we are talking about now", not "this one
  // message is about that".

  window.mpChatOnElementSelected = (target) => {
    attachCtx = { el: target };
    renderAttachChip();
    noticeSelection();
  };

  // ── Telling the model ────────────────────────────────────────────────────
  // Debounced, because selecting is a hunt: a user double-clicking through
  // four paragraphs to find the right one should wake the model once, at the
  // element they settled on, not four times. And deduped by selector, so a
  // re-select of the same element (or a reload that restores it) says
  // nothing — the model already knows.
  const SELECT_NOTICE_MS = 400;
  let noticeTimer = null;
  let noticedSelector = null;

  function noticeSelection() {
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      const live = attachCtx?.el?.isConnected ? attachCtx.el : null;
      const payload = live ? captureElement(live) : { selector: null };
      if (payload.selector === noticedSelector) return;
      noticedSelector = payload.selector;
      dispatchIntent({ type: 'element-selected', payload });
    }, SELECT_NOTICE_MS);
  }

  // Fresh capture at send time — includes the user's just-made edits, minus
  // runtime-only state (selection class, contenteditable).
  function captureElement(target) {
    const clone = target.cloneNode(true);
    clone.removeAttribute('contenteditable');
    clone.classList.remove('mp-selected');
    if (!clone.classList.length) clone.removeAttribute('class');
    return {
      selector: buildSelector(target),
      snapshot: clone.outerHTML.slice(0, 2048),
      edited: target.hasAttribute('data-mp-edited'),
    };
  }

  function renderAttachChip() {
    const row = mpq('#mp-chat-attach');
    if (!row) return;
    row.querySelector('.mp-attach-chip')?.remove();
    // Mirrored for the reload the model's own edit causes: the selection has
    // to outlive it, or the context would drop out from under the user
    // exactly when they are iterating on one element (see restore()).
    ssSet('mpChatSel', attachCtx?.el?.isConnected ? buildSelector(attachCtx.el) : '');
    if (!attachCtx?.el) return;
    const chip = el('span', 'mp-attach-chip');
    const x = el('button', 'mp-attach-clear', '✕');
    x.type = 'button';
    x.title = 'Remove — deselects the element';
    x.addEventListener('click', clearAttach);
    chip.appendChild(x); // X sits on the left of the chip
    chip.appendChild(el('span', 'mp-attach-label', `⌖ ${buildSelector(attachCtx.el)}`));
    row.appendChild(chip);
  }

  // Removing the chip also deselects the element on the page — and tells the
  // model, so it stops treating that element as what the conversation is
  // about. Leaving edit mode clears it the same way: selection is an
  // edit-mode idea, and a stale one would silently steer later messages.
  function clearAttach() {
    if (attachCtx?.el) {
      attachCtx.el.classList.remove('mp-selected');
      if (!attachCtx.el.classList.length) attachCtx.el.removeAttribute('class');
      if (document.activeElement === attachCtx.el) attachCtx.el.blur();
    }
    attachCtx = null;
    renderAttachChip();
    noticeSelection();
  }

  function buildSelector(target) {
    const pg = getActivePage();
    if (target.id) return '#' + target.id;
    const parts = [];
    let cur = target;
    while (cur && cur !== pg) {
      if (cur.id) { parts.unshift('#' + cur.id); break; }
      const tag = cur.tagName.toLowerCase();
      const sibs = Array.from(cur.parentElement?.children || []).filter(c => c.tagName === cur.tagName);
      parts.unshift(sibs.length > 1 ? `${tag}:nth-of-type(${sibs.indexOf(cur) + 1})` : tag);
      cur = cur.parentElement;
    }
    if (parts[0]?.[0] !== '#') {
      parts.unshift(pg.classList.contains('variant-page') ? '.variant-page.active' : '#page');
    }
    return parts.join(' > ');
  }

  // ── Session persistence ───────────────────────────────────────────────────
  // The auto-reload poll replaces the whole document whenever the model edits
  // the file; per-tab sessionStorage carries the panel open-state, the input's
  // draft, caret and focus, and the selected element across that reload. Live
  // history is refetched from the server (cursor 0).

  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch {} }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }

  // Everything about the input that a reload would otherwise drop: the text,
  // where the caret sits in it, and whether it had focus at all.
  function rememberDraft() {
    if (!inputEl) return;
    ssSet('mpChatDraft', inputEl.value);
    ssSet('mpChatCaret', String(inputEl.selectionStart ?? inputEl.value.length));
    ssSet('mpChatFocus', chromeRoot.activeElement === inputEl ? '1' : '0');
  }

  function restore() {
    if (ssGet('mpChatOpen') !== '1') return;
    // Panel open == edit mode: re-enter the combined mode through shell.js so
    // the button state, hover/dblclick listeners, and panel all come back.
    if (typeof enableEditMode === 'function' && !document.body.classList.contains('edit-active')) {
      enableEditMode(); // its hook opens the panel
    } else {
      openPanel();
    }
    restoreSelection();
    if (!inputEl) return;
    const draft = ssGet('mpChatDraft');
    if (draft) inputEl.value = draft;
    // Focus last, and only if it was there before: the reload is meant to be
    // invisible to someone in the middle of writing a message.
    if (ssGet('mpChatFocus') === '1') {
      inputEl.focus();
      const caret = Math.min(Number(ssGet('mpChatCaret')) || 0, inputEl.value.length);
      try { inputEl.setSelectionRange(caret, caret); } catch {}
    }
  }

  // The reload that lands here is almost always the model's own edit to the
  // element the user has selected — so re-resolve it and put the chip back,
  // silently: the model told us to reload, it has not forgotten what we were
  // discussing. If the element did not survive the edit (rewritten, renamed,
  // removed), the model's context IS stale, and that is the one case worth a
  // notice.
  function restoreSelection() {
    const sel = ssGet('mpChatSel');
    if (!sel) return;
    let el = null;
    try { el = document.querySelector(sel); } catch { /* selector no longer parses */ }
    if (el) {
      attachCtx = { el };
      el.classList.add('mp-selected');
      noticedSelector = sel;   // already known to the model — say nothing
      renderAttachChip();
      return;
    }
    noticedSelector = sel;     // ...so the deselect below reads as a change
    ssSet('mpChatSel', '');
    noticeSelection();
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  // The EDIT button lives in shell.js; this file only reacts through the
  // mpChatOnEditMode hook. Restore waits for the document to finish parsing
  // because it rebuilds the panel into it — there is nothing left to read
  // off the document itself, live edit being a property of the server.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restore);
  } else {
    restore();
  }

  // Future chrome interactions dispatch through here.
  window.mpDispatchIntent = dispatchIntent;
})();
