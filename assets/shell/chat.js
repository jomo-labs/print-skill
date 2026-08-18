// Chat panel: user ↔ model communication from the preview chrome.
//
// Everything routes through typed INTENTS and dispatchIntent() — the UI never
// talks to a transport directly. Adding a new page interaction that needs the
// model means adding ONE registry entry (how it serializes for the live
// server, how it formats as a copy/paste instruction); the transports and the
// panel never change. dispatchIntent() picks the route per the current state:
//
//   live     served, toggle on, and a model is listening (presence from the
//            server — the ground truth, regardless of the assembly-time
//            flag): messages POST to /chat/<page>/messages and the model's
//            replies/status stream back via the poll.
//   ready    served, toggle on, LIVE_EDIT_SUPPORTED (assembly-injected — see
//            shell.js), no model listening yet: messages still POST (they
//            queue server-side and the model's first `wait` drains them);
//            the panel shows how to connect ("/print live").
//   dormant  served, toggle on, no flag: the flag is an assembly-time GUESS,
//            so the panel still shows the "/print live" guidance and still
//            polls — if a model connects anyway, the state upgrades to live.
//            Until then intents render copy/paste cards (nothing queues
//            invisibly where no listener may ever come).
//   off      the user flipped the Live toggle off: copy/paste cards.
//   file     file:// — no server exists, the one structurally impossible
//            case: copy/paste cards.
//
// The panel is runtime-only chrome: built here on demand, stripped by
// serializeForSave(), hidden in print and embedded modes. Chat never touches
// page content and never calls savePage() — the file on disk stays exactly
// what the assembly/edit flows wrote.

(function () {
  const POLL_MS = 1500; // same cadence as the auto-reload poll

  // ── Mode ──────────────────────────────────────────────────────────────────

  const served = () => location.protocol !== 'file:';
  const toggleOn = () => lsGet('mpChatLive') !== 'off';

  // 'live' | 'ready' | 'dormant' | 'off' | 'file' — see the header comment.
  // Presence outranks the flag: a listening model means live, always.
  function panelState() {
    if (!served()) return 'file';
    if (!toggleOn()) return 'off';
    if (modelListening) return 'live';
    return window.LIVE_EDIT_SUPPORTED === true ? 'ready' : 'dormant';
  }
  // States whose intents render copy/paste cards instead of POSTing.
  const isPasteState = (s) => s === 'dormant' || s === 'off' || s === 'file';

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
   * Route an intent. Opens the panel, then:
   *  live/ready → POST to the server (optimistic bubble; a failed POST falls
   *               back to a paste card so a message is never lost);
   *  manual     → render the paste card.
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
    // The empty-state guidance was consumed by the first message; re-render
    // so ready/dormant keep their compact "/print live" hint above the log.
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
      if (pollTimer || !served() || !toggleOn()) return;
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
      persistCards();
    },
  };

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // file:// and older engines: hidden-textarea fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
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

  let panel = null, log = null, presenceEl = null, inputEl = null, sendEl = null, toggleEl = null;
  let attachCtx = null; // { el } — the element double-click selected in edit mode

  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function buildPanel() {
    if (panel) return;
    panel = el('aside', null); panel.id = 'mp-chat-panel';

    const head = el('div', 'mp-chat-head');
    head.appendChild(el('span', 'mp-chat-title', 'Edit'));
    // Live toggle on every served page ('off' needs a way back, and dormant
    // pages are live-capable too); only file:// (no server) hides it.
    if (served()) {
      const label = el('label', 'mp-live-toggle');
      toggleEl = document.createElement('input');
      toggleEl.type = 'checkbox';
      toggleEl.checked = lsGet('mpChatLive') !== 'off';
      toggleEl.title = 'Live: send messages straight to your model. Off: get copy/paste instructions instead.';
      toggleEl.addEventListener('change', () => {
        lsSet('mpChatLive', toggleEl.checked ? 'on' : 'off');
        refreshMode();
      });
      label.appendChild(toggleEl);
      label.appendChild(el('span', null, 'Live'));
      head.appendChild(label);
    }
    const close = el('button', 'mp-chat-close', '×');
    close.type = 'button';
    close.title = 'Exit editing';
    // Panel and edit mode are one combined state: closing the panel exits
    // edit mode, whose hook closes the panel.
    close.addEventListener('click', () => {
      if (typeof disableEditMode === 'function') disableEditMode();
      else closePanel();
    });
    head.appendChild(close);
    panel.appendChild(head);

    // Page-setup strip: document-level controls, visually separated from the
    // conversation scroller below it.
    const setup = el('div', null); setup.id = 'mp-panel-setup';
    const setupLabel = el('label', 'mp-setup-label', 'Paper size');
    setupLabel.htmlFor = 'mp-paper-select';
    setup.appendChild(setupLabel);
    const select = document.createElement('select');
    select.id = 'mp-paper-select';
    for (const [value, label] of [
      ['letter', 'US Letter'], ['landscape', 'Letter Landscape'], ['a4', 'A4'],
      ['legal', 'Legal'], ['half', 'Half Letter'],
    ]) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      select.appendChild(opt);
    }
    select.value = currentPaper; // shell.js state; applySize keeps it synced
    select.addEventListener('change', () => applySize(select.value));
    setup.appendChild(select);
    panel.appendChild(setup);

    log = el('div', null); log.id = 'mp-chat-log';
    panel.appendChild(log);

    presenceEl = el('div', null); presenceEl.id = 'mp-chat-presence';
    panel.appendChild(presenceEl);

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
    inputEl.addEventListener('input', () => ssSet('mpChatDraft', inputEl.value));
    form.appendChild(inputEl);

    sendEl = el('button', 'mp-chat-send', 'Send');
    sendEl.type = 'submit';
    form.appendChild(sendEl);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = '';
      ssSet('mpChatDraft', '');
      // Element context is captured at SEND time from the live element, so
      // the snapshot includes the edits the user just made to it.
      const intent = attachCtx?.el?.isConnected
        ? { type: 'element-request', payload: { text, ...captureElement(attachCtx.el) } }
        : { type: 'chat-message', payload: { text } };
      clearAttach();
      dispatchIntent(intent);
    });
    panel.appendChild(form);

    document.body.appendChild(panel);
  }

  // ── Panel state / mode rendering ─────────────────────────────────────────

  // Combined mode: shell.js owns the EDIT toggle and calls this hook when
  // edit mode flips. Entering edit auto-enables live where the page supports
  // it — un-doing a previous explicit toggle-off the moment the user starts
  // editing (the header toggle still turns it off again mid-session).
  window.mpChatOnEditMode = (on) => {
    if (on) {
      if (window.LIVE_EDIT_SUPPORTED === true && served()) lsSet('mpChatLive', 'on');
      openPanel();
    } else {
      closePanel();
    }
  };

  function openPanel() {
    buildPanel();
    if (!document.body.classList.contains('mp-chat-open')) {
      document.body.classList.add('mp-chat-open');
      ssSet('mpChatOpen', '1');
      applySize(currentPaper);
    }
    refreshMode();
  }

  function closePanel() {
    document.body.classList.remove('mp-chat-open');
    ssSet('mpChatOpen', '');
    liveTransport.stop();
    applySize(currentPaper);
  }

  // The "/print live" guidance, in two variants sharing one content: the
  // centered empty state (log still empty) and the compact hint card pinned
  // above an existing conversation.
  function buildLiveGuidance(kind, state) {
    const box = el('div', kind === 'empty' ? 'mp-chat-empty' : 'mp-chat-hint');
    if (kind === 'empty') box.appendChild(el('p', null, 'Start live mode'));
    const line = el('p', null);
    line.appendChild(el('span', null, 'Copy '));
    line.appendChild(el('code', null, '/print live'));
    line.appendChild(el('span', null, ' and send it to your model to connect.'));
    box.appendChild(line);
    const row = el('p', null);
    const copy = el('button', 'mp-copy-btn', 'Copy');
    copy.type = 'button';
    copy.addEventListener('click', () => copyText('/print live', copy));
    row.appendChild(copy);
    box.appendChild(row);
    if (state === 'dormant') {
      box.appendChild(el('p', 'mp-live-note',
        'If your model supports live mode it will connect here; until then, anything you send becomes an instruction you can copy to it.'));
    }
    return box;
  }

  // Full-panel takeover for the ready state: the model isn't connected yet,
  // so the ONLY next step is starting live mode — make it unmissable (bold,
  // inverted, spinner) and disable the input until presence arrives. The
  // header Live toggle stays reachable as the escape hatch to manual mode.
  function buildConnectTakeover() {
    const box = el('div', 'mp-connect-takeover');
    box.appendChild(el('div', 'mp-takeover-title', 'Start live mode'));
    const line = el('p', null);
    line.appendChild(el('span', null, 'Copy '));
    line.appendChild(el('code', null, '/print live'));
    line.appendChild(el('span', null, ' and send it to your model.'));
    box.appendChild(line);
    const copy = el('button', 'mp-copy-btn mp-copy-invert', 'Copy /print live');
    copy.type = 'button';
    copy.addEventListener('click', () => copyText('/print live', copy));
    box.appendChild(copy);
    const wait = el('div', 'mp-takeover-wait');
    wait.appendChild(el('span', 'mp-spinner'));
    wait.appendChild(el('span', null, 'Waiting for your model to connect…'));
    box.appendChild(wait);
    return box;
  }

  // Re-render the state-dependent chrome (empty state, takeover, presence,
  // polling, input enablement). Called on open, toggle flips, presence
  // changes, and after each dispatched intent.
  function refreshMode() {
    if (!panel) return;
    const state = panelState();
    panel.dataset.mode = state;
    if (toggleEl) toggleEl.checked = toggleOn();

    panel.querySelector('.mp-chat-empty')?.remove();
    panel.querySelector('.mp-chat-hint')?.remove();
    panel.querySelector('.mp-connect-takeover')?.remove();
    log.style.display = '';
    // Only the ready takeover locks the input — everywhere else typing works
    // (live sends; dormant/off/file produce paste cards).
    const locked = state === 'ready';
    if (inputEl) inputEl.disabled = locked;
    if (sendEl) sendEl.disabled = locked;

    if (state === 'ready') {
      liveTransport.start(); // presence poll — connection dismisses the takeover
      log.style.display = 'none';
      panel.insertBefore(buildConnectTakeover(), presenceEl);
      presenceEl.textContent = '';
      presenceEl.className = '';
    } else if (state === 'off' || state === 'file') {
      liveTransport.stop();
      if (!log.childElementCount) {
        const empty = el('div', 'mp-chat-empty');
        if (state === 'off') {
          empty.appendChild(el('p', null, 'Live is off.'));
          empty.appendChild(el('p', null, 'Flip Live above to reconnect — or keep going here, and your requests become instructions you can copy to your model.'));
        } else {
          empty.appendChild(el('p', null, 'Live mode needs the local server.'));
          empty.appendChild(el('p', null, 'This page was opened straight from disk, so chat directly with your model — your requests become instructions you can copy to it.'));
        }
        log.appendChild(empty);
      }
      renderPresence();
    } else {
      liveTransport.start();
      if (state === 'dormant') {
        if (!log.childElementCount) log.appendChild(buildLiveGuidance('empty', state));
        else log.prepend(buildLiveGuidance('hint', state));
      }
      renderPresence();
    }
  }

  function setListening(v) {
    if (v === modelListening) return;
    modelListening = v;
    refreshMode();
  }

  let statusState = null;
  function setStatus(state, text) {
    statusState = state === 'working' ? (text || 'Working…') : null;
    renderPresence();
  }

  function renderPresence() {
    if (!presenceEl) return;
    const state = panelState();
    if (state !== 'live') {
      // ready has the takeover's spinner; dormant shows nothing until
      // presence appears (which flips it to live)
      presenceEl.textContent = '';
      presenceEl.className = '';
      return;
    }
    if (statusState) {
      // Model is working on something from this panel: animated "…" dots.
      presenceEl.textContent = '';
      presenceEl.className = 'mp-presence-working';
      const dots = el('span', 'mp-dots');
      for (let i = 0; i < 3; i++) dots.appendChild(el('i'));
      presenceEl.appendChild(dots);
      presenceEl.appendChild(el('span', null, statusState));
    } else if (modelListening) {
      presenceEl.textContent = 'Model is listening';
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
    panel.querySelector('.mp-chat-empty')?.remove();
    return scrolled(() => log.appendChild(el('div', `mp-msg ${role === 'user' ? 'mp-msg-user' : 'mp-msg-model'}`, text)));
  }

  function addDivider(text) {
    return scrolled(() => log.appendChild(el('div', 'mp-chat-divider', text)));
  }

  function addPasteCard(text, hint) {
    panel.querySelector('.mp-chat-empty')?.remove();
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
    const row = document.getElementById('mp-chat-attach');
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
  // the file; per-tab sessionStorage carries the panel across that reload.
  // Live history is refetched from the server (cursor 0); only manual-mode
  // paste cards need storing, since they exist nowhere else.

  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch {} }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }

  function persistCards() {
    if (!isPasteState(panelState())) return;
    const cards = Array.from(log.querySelectorAll('.mp-paste-card pre')).map(p => p.textContent).slice(-20);
    ssSet('mpChatCards', JSON.stringify(cards));
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
    const draft = ssGet('mpChatDraft');
    if (draft && inputEl) inputEl.value = draft;
    if (isPasteState(panelState())) {
      try {
        for (const text of JSON.parse(ssGet('mpChatCards') || '[]')) addPasteCard(text);
      } catch { /* corrupt store — start clean */ }
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
