// Chat panel: user ↔ model communication from the preview chrome.
//
// Everything routes through typed INTENTS and dispatchIntent() — the UI never
// talks to a transport directly. Adding a new page interaction that needs the
// model means adding ONE registry entry (how it serializes for the live
// server, how it formats as a copy/paste instruction); the transports and the
// panel never change. dispatchIntent() picks the route per the current mode:
//
//   live    LIVE_EDIT_SUPPORTED (assembly-injected — see shell.js), the Live
//           toggle is on, the page is served, and the model is listening
//           (presence from the server): messages POST to /chat/<page>/messages
//           and the model's replies/status stream back via the poll.
//   ready   same, but no model is listening yet: messages still POST (they
//           queue server-side and the model's first `wait` drains them) and
//           the panel shows how to connect ("/print live").
//   manual  flag false, toggle off, or file://: every intent renders a
//           copy/paste card the user relays to their model by hand.
//
// The panel is runtime-only chrome: built here on demand, stripped by
// serializeForSave(), hidden in print and embedded modes. Chat never touches
// page content and never calls savePage() — the file on disk stays exactly
// what the assembly/edit flows wrote.

(function () {
  const POLL_MS = 1500; // same cadence as the auto-reload poll

  // ── Mode ──────────────────────────────────────────────────────────────────

  const served = () => location.protocol !== 'file:';
  const liveCapable = () =>
    window.LIVE_EDIT_SUPPORTED === true && lsGet('mpChatLive') !== 'off' && served();
  // 'live' | 'ready' | 'manual' — ready/live differ only by model presence.
  const chatMode = () => (liveCapable() ? (modelListening ? 'live' : 'ready') : 'manual');

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
    if (chatMode() === 'manual') {
      manualTransport.send(intent, spec);
      return;
    }
    await liveTransport.send(intent, spec);
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
      if (pollTimer || !liveCapable()) return;
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

  let panel = null, log = null, presenceEl = null, inputEl = null, toggleEl = null;
  let attachCtx = null; // {selector, snapshot, edited} from element pick mode

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
    head.appendChild(el('span', 'mp-chat-title', 'Chat'));
    // Live toggle only where live could ever apply — flag set and served.
    if (window.LIVE_EDIT_SUPPORTED === true && served()) {
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
    close.title = 'Close';
    close.addEventListener('click', closePanel);
    head.appendChild(close);
    panel.appendChild(head);

    log = el('div', null); log.id = 'mp-chat-log';
    panel.appendChild(log);

    presenceEl = el('div', null); presenceEl.id = 'mp-chat-presence';
    panel.appendChild(presenceEl);

    const form = el('form', null); form.id = 'mp-chat-form';
    const attachRow = el('div', null); attachRow.id = 'mp-chat-attach';
    const attachBtn = el('button', 'mp-attach-btn', '⌖ Attach element');
    attachBtn.type = 'button';
    attachBtn.title = 'Point at an element on the page to talk about it';
    attachBtn.addEventListener('click', enterPickMode);
    attachRow.appendChild(attachBtn);
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

    const send = el('button', 'mp-chat-send', 'Send');
    send.type = 'submit';
    form.appendChild(send);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = '';
      ssSet('mpChatDraft', '');
      const intent = attachCtx
        ? { type: 'element-request', payload: { text, ...attachCtx } }
        : { type: 'chat-message', payload: { text } };
      clearAttach();
      dispatchIntent(intent);
    });
    panel.appendChild(form);

    document.body.appendChild(panel);
  }

  // ── Panel state / mode rendering ─────────────────────────────────────────

  function openPanel() {
    buildPanel();
    if (!document.body.classList.contains('mp-chat-open')) {
      document.body.classList.add('mp-chat-open');
      document.getElementById('mp-btn-chat')?.classList.add('active');
      ssSet('mpChatOpen', '1');
      applySize(document.getElementById('mp-paper-select').value || 'letter');
    }
    refreshMode();
  }

  function closePanel() {
    exitPickMode();
    document.body.classList.remove('mp-chat-open');
    document.getElementById('mp-btn-chat')?.classList.remove('active');
    ssSet('mpChatOpen', '');
    liveTransport.stop();
    applySize(document.getElementById('mp-paper-select').value || 'letter');
  }

  function togglePanel() {
    document.body.classList.contains('mp-chat-open') ? closePanel() : openPanel();
  }

  // Re-render the mode-dependent chrome (empty state, hint, presence,
  // polling). Called on open, toggle flips, and presence changes.
  function refreshMode() {
    if (!panel) return;
    const mode = chatMode();
    panel.dataset.mode = mode;
    if (toggleEl) toggleEl.checked = lsGet('mpChatLive') !== 'off';

    panel.querySelector('.mp-chat-empty')?.remove();
    panel.querySelector('.mp-chat-hint')?.remove();

    if (mode === 'manual') {
      liveTransport.stop();
      if (!log.childElementCount) {
        const empty = el('div', 'mp-chat-empty');
        empty.appendChild(el('p', null, 'Live mode is not supported.'));
        empty.appendChild(el('p', null, 'Chat directly with your model — anything you do here becomes an instruction you can copy and paste to it.'));
        log.appendChild(empty);
      }
      presenceEl.textContent = '';
      presenceEl.className = '';
    } else {
      liveTransport.start();
      if (mode === 'ready') {
        const hint = el('div', 'mp-chat-hint');
        hint.appendChild(el('span', null, 'Live mode available — send '));
        hint.appendChild(el('code', null, '/print live'));
        hint.appendChild(el('span', null, ' to your model to connect.'));
        const copy = el('button', 'mp-copy-btn', 'Copy');
        copy.type = 'button';
        copy.addEventListener('click', () => copyText('/print live', copy));
        hint.appendChild(copy);
        log.prepend(hint);
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
    if (!presenceEl || chatMode() === 'manual') return;
    if (statusState) {
      presenceEl.textContent = statusState;
      presenceEl.className = 'mp-presence-working';
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

  // ── Element pick mode ─────────────────────────────────────────────────────
  // Reuses shell.js's hover-box machinery (showHover/clearHover/overlay are
  // page-globals) so picking looks exactly like edit mode's targeting.

  let pickListeners = null;

  function enterPickMode() {
    if (pickListeners) return;
    document.body.classList.add('mp-chat-picking');
    const onMove = (e) => {
      const pg = getActivePage();
      const t = e.target;
      if (!t || !pg || !pg.contains(t) || t === pg) { clearHover(); return; }
      showHover(t);
    };
    const onClick = (e) => {
      const pg = getActivePage();
      const t = e.target;
      if (!t || !pg || !pg.contains(t) || t === pg) return;
      e.preventDefault();
      e.stopPropagation();
      attachCtx = {
        selector: buildSelector(t),
        snapshot: t.outerHTML.slice(0, 2048),
        edited: t.hasAttribute('data-mp-edited'),
      };
      exitPickMode();
      renderAttachChip();
      inputEl?.focus();
    };
    const onKey = (e) => { if (e.key === 'Escape') exitPickMode(); };
    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey);
    pickListeners = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey);
    };
  }

  function exitPickMode() {
    document.body.classList.remove('mp-chat-picking');
    clearHover();
    if (pickListeners) { pickListeners(); pickListeners = null; }
  }

  function renderAttachChip() {
    const row = document.getElementById('mp-chat-attach');
    if (!row) return;
    row.querySelector('.mp-attach-chip')?.remove();
    if (!attachCtx) return;
    const chip = el('span', 'mp-attach-chip', `⌖ ${attachCtx.selector}`);
    const x = el('button', 'mp-attach-clear', '×');
    x.type = 'button';
    x.addEventListener('click', clearAttach);
    chip.appendChild(x);
    row.appendChild(chip);
  }

  function clearAttach() {
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
    if (chatMode() !== 'manual') return;
    const cards = Array.from(log.querySelectorAll('.mp-paste-card pre')).map(p => p.textContent).slice(-20);
    ssSet('mpChatCards', JSON.stringify(cards));
  }

  function restore() {
    if (ssGet('mpChatOpen') !== '1') return;
    openPanel();
    const draft = ssGet('mpChatDraft');
    if (draft && inputEl) inputEl.value = draft;
    if (chatMode() === 'manual') {
      try {
        for (const text of JSON.parse(ssGet('mpChatCards') || '[]')) addPasteCard(text);
      } catch { /* corrupt store — start clean */ }
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  const btn = document.getElementById('mp-btn-chat');
  if (btn) btn.addEventListener('click', togglePanel);
  // Restore only after the whole document has parsed: the assembly-injected
  // setLiveEditSupported(true) line sits before </body>, AFTER this script,
  // so restoring synchronously here would read the flag as false and rebuild
  // a live panel in manual mode.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restore);
  } else {
    restore();
  }

  // Future chrome interactions dispatch through here.
  window.mpDispatchIntent = dispatchIntent;
})();
