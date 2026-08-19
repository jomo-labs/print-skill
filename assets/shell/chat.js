// Chat panel: user ↔ model communication from the preview chrome.
//
// Everything routes through typed INTENTS and dispatchIntent() — the UI never
// talks to a transport directly. Adding a new page interaction that needs the
// model means adding ONE registry entry (how it serializes for the live
// server, how it formats as a copy/paste instruction); the transports and the
// panel never change. dispatchIntent() picks the route per the current state:
//
//   live     served and a model is listening (presence from the
//            server — the ground truth, regardless of the assembly-time
//            flag): messages POST to /chat/<page>/messages and the model's
//            replies/status stream back via the poll.
//   ready    served, LIVE_EDIT_SUPPORTED (assembly-injected — see shell.js),
//            no model listening yet: messages still POST (they queue
//            server-side and the model's first `wait` drains them).
//   dormant  served, no flag (assembly judged live unavailable): same queue
//            behavior, and polling continues — presence is ground truth, so
//            a model that connects anyway upgrades the panel to live.
//   file     file:// — no server exists; input is disabled.
//
// Until a model connects, the first entry in the conversation is a starter
// card with the copyable "/print live" command.
//
// The panel is runtime-only chrome: built here on demand, stripped by
// serializeForSave(), hidden in print and embedded modes. Chat never touches
// page content and never calls savePage() — the file on disk stays exactly
// what the assembly/edit flows wrote.

(function () {
  const POLL_MS = 1500; // same cadence as the auto-reload poll

  // ── Mode ──────────────────────────────────────────────────────────────────

  const served = () => location.protocol !== 'file:';

  // 'live' | 'ready' | 'dormant' | 'file' — see the header comment.
  // Presence outranks the flag: a listening model means live, always.
  function panelState() {
    if (!served()) return 'file';
    if (modelListening) return 'live';
    return window.LIVE_EDIT_SUPPORTED === true ? 'ready' : 'dormant';
  }
  // States whose intents render copy/paste cards instead of POSTing.
  const isPasteState = (s) => s === 'file';

  const pageFileName = () =>
    served() ? decodeURIComponent(location.pathname.replace(/^\//, ''))
             : (location.pathname.split('/').pop() || document.title);

  // ── Intent registry ───────────────────────────────────────────────────────
  // payload shapes:
  //   chat-message    { text }
  //   element-request { text, selector, snapshot, edited }
  //   page-request    { text }
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
  };

  /**
   * Route an intent. Opens the panel, then: live/ready → POST to the server
   * (optimistic bubble; a failed POST falls back to a paste card so a message
   * is never lost); file:// → paste card into the log.
   */
  async function dispatchIntent(intent) {
    openPanel();
    const spec = INTENTS[intent.type];
    if (!spec) return;
    if (isPasteState(panelState())) {
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
      const bubble = addBubble('user', label);
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
        // Server unreachable — degrade to the manual transport for this
        // intent; the bubble stays as a record of what the card contains.
        bubble.classList.add('mp-msg-failed');
        addPasteCard(spec.toPaste(intent.payload),
          'Could not reach the local server — paste this to your model instead.');
      }
    },
    start() {
      // Polls in dormant too — presence is how a flag-less page discovers a
      // model connected anyway and upgrades itself to live.
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
            addDivider('server restarted — earlier messages were lost');
          }
          epoch = body.epoch;
          for (const m of body.messages) {
            cursor = Math.max(cursor, m.id);
            if (seenIds.has(m.id)) continue;
            seenIds.add(m.id);
            if (m.kind === 'status') setStatus(m.data?.state, m.text);
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
      // the snapshot includes the edits the user just made to it.
      const intent = attachCtx?.el?.isConnected
        ? { type: 'element-request', payload: { text, ...captureElement(attachCtx.el) } }
        : { type: 'chat-message', payload: { text } };
      clearAttach();
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
    if (on) openPanel();
    else closePanel();
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

  // Until a model connects, the conversation opens with a starter card: how
  // to go live, with the command in its own copyable row. Removed the moment
  // presence arrives; re-added if the connection lapses.
  function buildStarter(state) {
    // A regular model chat bubble — the conversation starts with the model
    // telling you how to connect.
    const card = el('div', 'mp-msg mp-msg-model mp-starter');
    if (state === 'file') {
      card.appendChild(el('p', null,
        'Live editing needs the local server — open this page through it to chat with your model.'));
    } else {
      card.appendChild(el('p', null,
        'Connect with your model and edit live! Just copy/paste the command below.'));
      const row = el('div', 'mp-copy-row');
      row.appendChild(el('code', null, '/print live'));
      const copy = el('button', 'mp-copy-btn', 'Copy');
      copy.type = 'button';
      copy.addEventListener('click', () => copyText('/print live', copy));
      row.appendChild(copy);
      card.appendChild(row);
    }
    return card;
  }

  // Re-render the state-dependent chrome (starter card, presence, polling,
  // input enablement). Called on open, presence changes, and after each
  // dispatched intent.
  function refreshMode() {
    if (!panel) return;
    const state = panelState();
    panel.dataset.mode = state;

    log.querySelector('.mp-starter')?.remove();
    if (state !== 'live') log.prepend(buildStarter(state));

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
  function setStatus(state, text) {
    if (state === 'working') {
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
      workingEl?.remove();
      workingEl = null;
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
      presenceEl.textContent = 'Messages queue until your model connects';
      presenceEl.className = 'mp-presence-queued';
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

  // ── Element selection chips ──────────────────────────────────────────────
  // Double-click in edit mode is the selection gesture: shell.js marks the
  // element .mp-selected and calls the hook below; the chip in the chat area
  // is the removable handle for that selection. No separate pick mode.

  window.mpChatOnElementSelected = (target) => {
    attachCtx = { el: target };
    renderAttachChip();
  };

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

  // Removing the chip also deselects the element on the page.
  function clearAttach() {
    if (attachCtx?.el) {
      attachCtx.el.classList.remove('mp-selected');
      if (!attachCtx.el.classList.length) attachCtx.el.removeAttribute('class');
      if (document.activeElement === attachCtx.el) attachCtx.el.blur();
    }
    attachCtx = null;
    renderAttachChip();
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
  // the file; per-tab sessionStorage carries the panel open-state and the
  // input's draft, caret and focus across that reload. Live history is
  // refetched from the server (cursor 0).

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

  // ── Init ─────────────────────────────────────────────────────────────────
  // The EDIT button lives in shell.js; this file only reacts through the
  // mpChatOnEditMode hook. Restore runs only after the whole document has
  // parsed: the assembly-injected setLiveEditSupported(true) line sits before
  // </body>, AFTER this script, so restoring synchronously here would read
  // the flag as false and rebuild a live panel in manual mode.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restore);
  } else {
    restore();
  }

  // Future chrome interactions dispatch through here.
  window.mpDispatchIntent = dispatchIntent;
})();
