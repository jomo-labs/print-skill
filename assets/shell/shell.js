// localStorage throws in opaque-origin contexts (e.g. Playwright's
// page.set_content(), sandboxed embeds). Writes go through this accessor so
// applySize() completes — and the print pipeline still works — even where
// storage is unavailable. (Nothing reads storage back on this surface: paper
// size deliberately starts at letter — see init.)
function lsSet(key, value) { try { localStorage.setItem(key, value); } catch {} }
function lsGet(key) { try { return localStorage.getItem(key); } catch { return null; } }

// ── Live edit capability flag ───────────────────────────────────────────────
// Set at assembly time via an injected <script>setLiveEditSupported(true)</script>
// (same mechanism as applySize) when the generating agent's harness can run
// the chat listen loop — see references/harness-support.md. Absence = false.
// chat.js reads the flag lazily on panel open/send, so injection order
// relative to chat.js never matters.
window.LIVE_EDIT_SUPPORTED = false;
function setLiveEditSupported(v) { window.LIVE_EDIT_SUPPORTED = !!v; }

// ── Paper size ──────────────────────────────────────────────────────────────

const PAPERS = {
  letter: { w: 816,  h: 1056, css: 'letter' },
  // A4 is 793.7 x 1122.5 CSS px — floored, not rounded. The sheet element is
  // sized to exactly these values and prints into a zero-margin page box, so
  // a dimension rounded UP past the real page box would spill a hairline onto
  // a second, blank sheet. Half a pixel of slack is invisible; a blank page
  // is not.
  a4:     { w: 793,  h: 1122, css: 'A4' },
  legal:  { w: 816,  h: 1344, css: 'legal' },
  // 'half-letter' is not a CSS page-size keyword (Chromium drops it and falls
  // back to the printer default) — explicit dimensions are required here.
  half:   { w: 528,  h: 816,  css: '5.5in 8.5in' },
  // Letter rotated — wide formats (certificates, banners). A page declares it
  // at assembly time via an injected applySize('landscape') call.
  landscape: { w: 1056, h: 816, css: 'letter landscape' },
};

function getActivePage() {
  return document.querySelector('.variant-page.active') || document.getElementById('page');
}

function applySize(key) {
  const p = PAPERS[key] || PAPERS.letter;
  // Keep the select in sync for programmatic callers that invoke applySize
  // directly.
  const sel = document.getElementById('mp-paper-select');
  if (sel && sel.value !== key) sel.value = key;
  // WYSIWYG contract: the .page element IS the sheet, on screen and in print
  // alike — same width, same min-height, no print-time zoom, no extra @page
  // margin. Its padding is the page margin. min-height (not height) so a
  // genuine overflow stays visible past the boundary instead of being
  // silently scaled or clipped — overflow is a content-length bug to fix at
  // generation time, and it spills onto a second printed sheet exactly as
  // the on-screen guides show.
  document.querySelectorAll('.variant-page, #page').forEach(el => {
    el.style.width = p.w + 'px';
    el.style.minHeight = p.h + 'px';
  });
  // Nested multi-page assemblies (#page is then a transparent container):
  // each nested sheet is one full page too.
  document.querySelectorAll('#page > .page').forEach(el => { el.style.minHeight = p.h + 'px'; });
  // Page-break guides only on the active page, and only when its content
  // actually overflows one sheet. Skipped for nested multi-page assemblies —
  // their sheets are discrete .page elements, there is no fragmentation to
  // mark. Print fragments an overflowing sheet with box-decoration-break:
  // clone (every fragment repeats the sheet's own padding and border), so
  // per-sheet content capacity is the paper height minus BOTH decoration
  // edges, and the first break lands one bottom-decoration short of the
  // paper height. Sections still snap breaks earlier via break-inside rules;
  // the guides mark the latest possible break.
  document.querySelectorAll('.page-break-guide').forEach(g => g.remove());
  const activePg = getActivePage();
  const nested = document.querySelector('#page > .page');
  if (!nested && activePg.offsetHeight > p.h) {
    const cs = getComputedStyle(activePg);
    const decoTop = parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth);
    const decoBottom = parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth);
    const step = Math.max(p.h - decoTop - decoBottom, 1);
    for (let y = p.h - decoBottom; y < activePg.offsetHeight; y += step) {
      const guide = document.createElement('div');
      guide.className = 'page-break-guide';
      guide.style.cssText = `position:absolute;left:0;right:0;top:${y}px;height:2px;` +
        `background:repeating-linear-gradient(90deg,oklch(67% 0.006 78) 0 6px,transparent 6px 12px);` +
        `pointer-events:none;`;
      activePg.appendChild(guide);
    }
  }
  // margin: 0 — the sheet fills the page box edge to edge. Physical printers
  // with a hardware non-printable border will offer their own fit/shrink in
  // the print dialog; the artifact itself is never pre-shrunk. (A user-facing
  // safe-margin control can layer on top of this later by reserving space
  // INSIDE the sheet, never by changing the page box.)
  document.getElementById('dynamic-page-css').textContent = `@page { size: ${p.css}; margin: 0; }`;
  lsSet('mpPaper', key);
  scaleToFit(p.w);
}

function scaleToFit(w) {
  // The open chat panel narrows the viewport; only the screen-fit transform
  // reacts — sheet width/min-height/padding (the WYSIWYG print geometry)
  // never change. chat.js re-applies size on panel open/close.
  const chatW = document.body.classList.contains('mp-chat-open') ? 336 : 0;
  const available = window.innerWidth - 80 - chatW;
  const s = Math.min(available / w, 1);
  const el = getActivePage();
  el.style.transform = s < 1 ? `scale(${s})` : '';
  el.style.transformOrigin = 'top center';
  el.parentElement.style.paddingBottom = s < 1 ? Math.round(el.offsetHeight * (s - 1)) + 'px' : '';
}

// ── Variant picker ───────────────────────────────────────────────────────────

let variantPages = [], variantTotal = 0, variantCurrent = 0;

function showVariant(n) {
  variantCurrent = n;
  variantPages.forEach((el, i) => el.classList.toggle('active', i === n));
  document.getElementById('mp-variant-label').textContent = (n + 1) + ' / ' + variantTotal;
  // Re-apply size so width/transform/guides target the newly active variant
  applySize(document.getElementById('mp-paper-select').value || 'letter');
}

function initVariants() {
  variantPages = Array.from(document.querySelectorAll('.variant-page'));
  variantTotal = variantPages.length;
  if (variantTotal < 2) return;
  document.getElementById('mp-variant-sep').style.display = '';
  document.getElementById('mp-variant-nav').style.display = 'flex';
  document.getElementById('mp-btn-prev').addEventListener('click', () =>
    showVariant((variantCurrent - 1 + variantTotal) % variantTotal));
  document.getElementById('mp-btn-next').addEventListener('click', () =>
    showVariant((variantCurrent + 1) % variantTotal));
  showVariant(0);
}

// ── Edit mode ───────────────────────────────────────────────────────────────

const EDITABLE_TAGS = new Set(['h1','h2','h3','h4','h5','h6','p','li','td','th','blockquote','figcaption','span','a','strong','em','div']);
const ELEMENT_LABELS = {h1:'Title',h2:'Heading',h3:'Subheading',h4:'Subheading',h5:'Subheading',h6:'Subheading',p:'Paragraph',li:'List item',td:'Cell',th:'Header',blockquote:'Quote',figcaption:'Caption',span:'Text',a:'Link',strong:'Bold',em:'Italic',div:'Block'};

let editMode = false, hoverBox = null, editListeners = null;
const overlay = document.getElementById('mp-overlay');

function clearHover() { if (hoverBox) { hoverBox.remove(); hoverBox = null; } }

function showHover(el) {
  clearHover();
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return;
  hoverBox = document.createElement('div');
  hoverBox.className = 'mp-hover-box';
  hoverBox.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
  const lbl = document.createElement('div');
  lbl.className = 'mp-hover-label';
  lbl.textContent = (ELEMENT_LABELS[el.tagName.toLowerCase()] || el.tagName) + ' — double-click to edit';
  hoverBox.appendChild(lbl);
  overlay.appendChild(hoverBox);
}

function enableEditMode() {
  editMode = true;
  document.getElementById('mp-btn-edit').classList.add('active');
  document.body.classList.add('edit-active');

  const onMove = (e) => {
    const el = e.target;
    const pg = getActivePage();
    if (!el || !pg || !pg.contains(el) || !EDITABLE_TAGS.has(el.tagName.toLowerCase())) { clearHover(); return; }
    showHover(el);
  };
  const onDbl = (e) => {
    const el = e.target;
    const pg = getActivePage();
    if (!el || !pg || !pg.contains(el) || !EDITABLE_TAGS.has(el.tagName.toLowerCase())) return;
    const before = el.innerHTML;
    el.contentEditable = 'true';
    el.focus();
    el.addEventListener('blur', () => {
      el.contentEditable = 'false';
      // Committing an edit persists it — see the Save section. No-op commits
      // (focused but unchanged) skip the write so ETags only move on real
      // changes. The data-mp-edited marker rides the same PUT as the edit
      // itself, so file and DOM can never disagree about what the user
      // touched — it's how the model finds user edits in the saved file
      // (and it strips the markers it has addressed).
      if (el.innerHTML !== before) {
        el.setAttribute('data-mp-edited', '');
        savePage();
      }
    }, { once: true });
  };
  const onScroll = () => { clearHover(); };
  const onKey = (e) => {
    // Escape commits (blurs) an in-progress text edit — blur is the only
    // thing that flips contentEditable back off (see onDbl's once-blur).
    if (e.key === 'Escape') { blurActiveEdit(); clearHover(); }
  };

  document.addEventListener('mousemove', onMove, { passive: true });
  document.addEventListener('dblclick', onDbl);
  document.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('keydown', onKey);

  editListeners = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('dblclick', onDbl);
    document.removeEventListener('scroll', onScroll);
    document.removeEventListener('keydown', onKey);
  };
}

// Ends an in-progress contentEditable session. Both Escape and leaving edit
// mode route through here — otherwise toggling Edit off would leave the
// last-edited element silently editable.
function blurActiveEdit() {
  if (document.activeElement?.isContentEditable) document.activeElement.blur();
}

function disableEditMode() {
  editMode = false;
  document.getElementById('mp-btn-edit').classList.remove('active');
  document.body.classList.remove('edit-active');
  blurActiveEdit();
  clearHover();
  if (editListeners) { editListeners(); editListeners = null; }
}

function toggleEditMode() { editMode ? disableEditMode() : enableEditMode(); }

// ── Save ────────────────────────────────────────────────────────────────────
// Committed text edits are PUT back to the page's own URL so the file on disk
// stays the single source of truth — the model reads user edits, and the
// auto-reload poll can safely replace the DOM knowing nothing lives only
// there. file:// pages have no server: their edits stay DOM-only (they still
// reach print via the serialized-DOM path), same degradation as printing.

// ETag of the file version this DOM was loaded from (or last saved as).
// Shared between save (If-Match, so a stale DOM never clobbers a newer file)
// and the auto-reload poll (baseline, so a tab doesn't reload on its own
// save).
let currentEtag = null;
let saving = false;

// The saved document is the live DOM minus runtime-only state, so the file
// stays as clean as the assembly wrote it. Everything stripped here is
// re-derived on load: applySize() sets page widths/guides, scaleToFit() sets
// transform and padding, init() adds mp-embedded, edit mode adds the rest.
function serializeForSave() {
  const root = document.documentElement.cloneNode(true);
  root.querySelectorAll('.page-break-guide, .mp-hover-box').forEach(el => el.remove());
  // Chat panel DOM is runtime-only chrome (chat.js rebuilds it every load);
  // data-mp-edited markers on content are NOT stripped — persisting them is
  // how the model finds user edits in the file.
  root.querySelector('#mp-chat-panel')?.remove();
  const overlay = root.querySelector('#mp-overlay');
  if (overlay) overlay.replaceChildren();
  root.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
  const body = root.querySelector('body');
  if (body) {
    body.classList.remove('edit-active', 'mp-embedded', 'mp-chat-open');
    if (!body.classList.length) body.removeAttribute('class');
  }
  root.querySelectorAll('.variant-page, #page, .page-surround').forEach(el => el.removeAttribute('style'));
  return '<!DOCTYPE html>\n' + root.outerHTML;
}

async function savePage() {
  if (location.protocol === 'file:') return;
  saving = true;
  try {
    const res = await fetch(location.pathname, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/html',
        ...(currentEtag ? { 'If-Match': currentEtag } : {}),
      },
      body: serializeForSave(),
    });
    if (res.status === 412) {
      // The model rewrote the file while this edit was in progress. The
      // conflict is inherently lossy; the file wins — reload to show it.
      location.reload();
      return;
    }
    if (!res.ok) return;
    const tag = res.headers.get('ETag');
    if (tag) currentEtag = tag;
  } catch {
    /* server unreachable — the edit stays in the DOM, as before */
  } finally {
    saving = false;
  }
}

// ── Print ───────────────────────────────────────────────────────────────────
// Both print paths produce the same geometry — the on-screen sheet at 1:1
// inside a zero-margin page box. Print prefers the server-side /render-pdf
// pipeline (deterministic renderer, identical on every machine) and falls
// back to this page's own window.print() whenever that pipeline can't be
// reached: file:// origins skip the attempt entirely, and any fetch failure
// (offline, server error) falls back from the catch block. The fallback is
// only a different renderer, not a different layout.
async function printThisPage() {
  const btn = document.getElementById('mp-btn-print');
  if (location.protocol === 'file:') { window.print(); return; }
  // The tab must open synchronously inside the click so popup blockers don't
  // eat it; it navigates to the PDF once rendering finishes.
  const tab = window.open('', '_blank');
  if (tab) {
    tab.document.write(
      '<title>Preparing…</title><p style="font-family:-apple-system,sans-serif;' +
      'padding:2em;">Preparing your printable…</p>');
    tab.document.close();
  }
  // Captured before the button mutations below — the toolbar is print-hidden
  // so a stray "Preparing…" label wouldn't show up in the rendered PDF
  // either way, but there's no reason to serialize transient UI state.
  const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Preparing…';
  try {
    const res = await fetch('/render-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // path lets the server stage the render temp next to this page, so
      // relative asset references resolve for nested build/<project>/ pages.
      body: JSON.stringify({ html, title: document.title, path: location.pathname }),
    });
    if (!res.ok) throw new Error(`server returned ${res.status}`);
    const blob = await res.blob();
    if (tab) {
      const url = URL.createObjectURL(blob);
      tab.location = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else {
      // Popup blocked — hand the PDF over as a download instead.
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (document.title.replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '').toLowerCase() || 'printable') + '.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }
  } catch (e) {
    // Offline, or the endpoint isn't reachable from wherever this file is
    // hosted — fall back to this page's own print CSS (same 1:1 geometry)
    // rather than leaving the user with nothing.
    if (tab) tab.close();
    window.print();
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

// ── Auto-reload ─────────────────────────────────────────────────────────────
// The model edits generated pages on disk (SKILL.md "Editing an existing
// page"); this poll makes those edits appear in an already-open tab without a
// manual refresh. Every 1.5s the shell HEADs its own URL and reloads when the
// server's ETag (an mtime+size signature — see serveFile in server.mjs)
// changes. Guards, in order:
//   - file:// pages have no server to ask — skip entirely, same rule as
//     printThisPage().
//   - an in-progress double-click text edit is never yanked away: polling is
//     deferred while a contentEditable element has focus, and while a save
//     is in flight (the save's own write must update the baseline via the
//     PUT response, not race the poll into a self-reload).
//   - non-ok responses and network errors are ignored, never reloaded on:
//     a restarting server, or the deleted temp .render-*.html this same
//     script polls from inside the headless PDF render, would otherwise
//     wipe the page mid-print.
//   - hosts that serve no ETag (a page uploaded somewhere static) get no
//     auto-reload rather than spurious ones.
function initAutoReload() {
  if (location.protocol === 'file:') return;
  const tick = async () => {
    // Deferred while typing in the chat panel for the same reason as an
    // in-progress text edit: a reload would eat the half-typed input.
    if (saving || document.activeElement?.isContentEditable ||
        document.activeElement?.closest?.('#mp-chat-panel')) return;
    try {
      const res = await fetch(location.pathname, { method: 'HEAD', cache: 'no-store' });
      if (!res.ok) return;
      const tag = res.headers.get('ETag');
      // Re-check after the await: a save that started while this HEAD was in
      // flight will move the baseline itself — comparing against the
      // pre-save baseline here would reload the tab on its own write.
      if (!tag || saving) return;
      if (currentEtag !== null && tag !== currentEtag) { location.reload(); return; }
      currentEtag = tag;
    } catch { /* offline or server restarting — try again next tick */ }
  };
  // Seed the baseline now, not on the first interval tick — an edit landing
  // within the first poll period would otherwise BECOME the baseline and
  // never trigger the reload it should have.
  tick();
  setInterval(tick, 1500);
}

// ── Init ────────────────────────────────────────────────────────────────────

(function init() {
  // Detect iframe embedding — strip standalone chrome
  if (window.self !== window.top) document.body.classList.add('mp-embedded');

  // Toolbar buttons
  document.getElementById('mp-btn-print').addEventListener('click', printThisPage);
  document.getElementById('mp-btn-edit').addEventListener('click', toggleEditMode);

  // Pages ship their design baked in: the shell's :root tokens plus whatever
  // #content-overrides the generation wrote (ad-hoc theme tokens included).
  // Nothing is applied or restored at load — design changes happen at
  // generation time, never in the shell.
  //
  // Paper size deliberately NOT restored from storage: all file:// pages share
  // one localStorage, so a paper picked on some other document weeks ago would
  // silently re-target this page's @page size and sheet geometry — while the
  // user's print dialog stays on their printer's paper, producing clipped or
  // half-blank sheets. Every standalone page opens at letter; the toolbar
  // picker still works per visit, and an embedding host can re-apply its own
  // saved choice via applySize after load.
  const savedPaper = 'letter';
  document.getElementById('mp-paper-select').value = savedPaper;

  initVariants();
  applySize(savedPaper);
  initAutoReload();
  window.addEventListener('resize', () => scaleToFit(PAPERS[document.getElementById('mp-paper-select').value]?.w || 816));
})();
