// Where this script was loaded from — the base for resolving sibling shell
// assets (chrome.css) on pages the server didn't wrap. Read at parse time:
// document.currentScript is only meaningful while the script is executing.
const SHELL_SRC = document.currentScript?.src || location.href;

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

// Base paper sizes, portrait dimensions. Orientation is a SEPARATE axis —
// any size combines with portrait/landscape (dimensions swap; the @page css
// gains the landscape keyword, or swaps explicit lengths where a named
// page-size keyword doesn't exist).
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
  // back to the printer default) — explicit dimensions are required here, and
  // per spec the landscape keyword doesn't combine with lengths, so the
  // landscape variant swaps them instead.
  half:   { w: 528,  h: 816,  css: '5.5in 8.5in', cssLandscape: '8.5in 5.5in' },
};

function getActivePage() {
  return document.querySelector('.variant-page.active') || document.getElementById('page');
}

// Current paper/orientation are state, not control values: the toolbar's
// pickers are injected chrome and legacy pages may carry their own baked
// select, so a control may not exist when size is applied or read —
// applySize keeps whatever is present in sync.
let currentPaper = 'letter';
let currentOrientation = 'portrait';

// Effective sheet dimensions + @page size for the current paper×orientation.
function paperDims() {
  const p = PAPERS[currentPaper] || PAPERS.letter;
  if (currentOrientation === 'landscape') {
    return { w: p.h, h: p.w, css: p.cssLandscape || `${p.css} landscape` };
  }
  return { w: p.w, h: p.h, css: p.css };
}

function applySize(key, orientation) {
  // Legacy alias: 'landscape' was once a paper key meaning letter-landscape
  // (older pages carry applySize('landscape') lines or data-mp-paper values).
  if (key === 'landscape') { key = 'letter'; orientation = 'landscape'; }
  currentPaper = PAPERS[key] ? key : 'letter';
  if (orientation === 'portrait' || orientation === 'landscape') currentOrientation = orientation;
  const p = paperDims();
  // Sync the toolbar's combo boxes so they read the current state, however it
  // was set. They live in the chrome's shadow root — the document fallback is
  // only for a legacy page's baked select.
  const sel = mpq('#mp-paper-select') || document.getElementById('mp-paper-select');
  if (sel && sel.value !== currentPaper) sel.value = currentPaper;
  const osel = mpq('#mp-orient-select') || document.getElementById('mp-orient-select');
  if (osel && osel.value !== currentOrientation) osel.value = currentOrientation;
  // Persist the choice on the body dataset: the Print pipeline reloads the
  // serialized DOM in headless Chromium, whose init() reads these attributes
  // — without them a runtime paper/orientation change would silently reset
  // to the assembly-time configuration in the rendered PDF. A text-edit save
  // then also writes the choice into the file as document configuration.
  if (currentPaper === 'letter') delete document.body.dataset.mpPaper;
  else document.body.dataset.mpPaper = currentPaper;
  if (currentOrientation === 'landscape') document.body.dataset.mpOrientation = 'landscape';
  else delete document.body.dataset.mpOrientation;
  // WYSIWYG contract: the .page element IS the sheet, on screen and in print
  // alike — same width, same HEIGHT, no print-time zoom, no extra @page
  // margin. Its padding is the page margin. The dimension is IMMUTABLE —
  // paper is a fixed physical size, so content must be made to fit it, never
  // the reverse: overflow spills visibly past the sheet's bottom edge (an
  // error state to fix at generation time, marked by the break guides below)
  // instead of silently stretching the page.
  const nested = document.querySelector('#page > .page');
  document.querySelectorAll('.variant-page, #page').forEach(el => {
    el.style.width = p.w + 'px';
    if (nested && el.id === 'page') {
      // Two-sheet assemblies: #page is a transparent container around the
      // nested sheets, not a sheet itself — it must grow around them.
      el.style.height = 'auto';
    } else {
      el.style.height = p.h + 'px';
    }
    // '0', not '' — older generated pages carry min-height sheet rules in
    // their frozen inline stylesheet, and CSS min-height would beat the
    // fixed inline height; an inline 0 neutralizes it everywhere.
    el.style.minHeight = '0';
  });
  // Nested multi-page assemblies: each nested sheet is one full fixed page.
  document.querySelectorAll('#page > .page').forEach(el => {
    el.style.height = p.h + 'px';
    el.style.minHeight = '0';
  });
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
  // Fixed sheet height means overflow no longer grows the element —
  // scrollHeight is where the content actually ends.
  if (!nested && activePg.scrollHeight > p.h + 1) {
    const cs = getComputedStyle(activePg);
    const decoTop = parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth);
    const decoBottom = parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth);
    const step = Math.max(p.h - decoTop - decoBottom, 1);
    for (let y = p.h - decoBottom; y < activePg.scrollHeight; y += step) {
      const guide = document.createElement('div');
      guide.className = 'page-break-guide';
      // !important throughout: these are chrome nodes living in the page's
      // own flow, so inline importance is what keeps page CSS off them.
      guide.style.cssText =
        `position:absolute!important;left:0!important;right:0!important;top:${y}px!important;` +
        `height:2px!important;margin:0!important;border:0!important;opacity:1!important;` +
        `display:block!important;z-index:1!important;pointer-events:none!important;` +
        `background:repeating-linear-gradient(90deg,oklch(67% 0.006 78) 0 6px,transparent 6px 12px)!important;`;
      activePg.appendChild(guide);
    }
  }
  // margin: 0 — the sheet fills the page box edge to edge. Physical printers
  // with a hardware non-printable border will offer their own fit/shrink in
  // the print dialog; the artifact itself is never pre-shrunk. (A user-facing
  // safe-margin control can layer on top of this later by reserving space
  // INSIDE the sheet, never by changing the page box.)
  document.getElementById('dynamic-page-css').textContent = `@page { size: ${p.css}; margin: 0; }`;
  lsSet('mpPaper', currentPaper);
  scaleToFit(p.w);
}

function setOrientation(o) {
  applySize(currentPaper, o === 'landscape' ? 'landscape' : 'portrait');
}

function scaleToFit(w) {
  // The open chat panel takes a column of the viewport; only the screen-fit
  // transform reacts — sheet width/min-height/padding (the WYSIWYG print
  // geometry) never change. chat.js re-applies size on panel open/close.
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
  mpq('#mp-variant-label').textContent = (n + 1) + ' / ' + variantTotal;
  // Re-apply size so width/transform/guides target the newly active variant
  applySize(currentPaper);
}

function initVariants() {
  variantPages = Array.from(document.querySelectorAll('.variant-page'));
  variantTotal = variantPages.length;
  if (variantTotal < 2) return;
  mpq('#mp-variant-sep').style.display = '';
  mpq('#mp-variant-nav').style.display = 'flex';
  mpq('#mp-btn-prev').addEventListener('click', () =>
    showVariant((variantCurrent - 1 + variantTotal) % variantTotal));
  mpq('#mp-btn-next').addEventListener('click', () =>
    showVariant((variantCurrent + 1) % variantTotal));
  showVariant(0);
}

// ── Edit mode ───────────────────────────────────────────────────────────────

const EDITABLE_TAGS = new Set(['h1','h2','h3','h4','h5','h6','p','li','td','th','blockquote','figcaption','span','a','strong','em','div']);
const ELEMENT_LABELS = {h1:'Title',h2:'Heading',h3:'Subheading',h4:'Subheading',h5:'Subheading',h6:'Subheading',p:'Paragraph',li:'List item',td:'Cell',th:'Header',blockquote:'Quote',figcaption:'Caption',span:'Text',a:'Link',strong:'Bold',em:'Italic',div:'Block'};

let editMode = false, hoverBox = null, editListeners = null;

// Assigned by injectChrome() — the overlay is runtime-built chrome, so it
// does not exist yet when this script parses (a const lookup here would bind
// null and silently kill the hover boxes).
let overlay = null;

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
  mpq('#mp-btn-edit').classList.add('active');
  const label = mpq('#mp-btn-edit-label');
  if (label) label.textContent = 'Stop Editing';
  // Both sides of the state again: the body class carries the edit cursor
  // (chrome-host.css), the host attribute reveals the toolbar's page-setup
  // controls (chrome.css).
  document.body.classList.add('edit-active');
  setChromeState('data-mp-edit-active', true);
  // Editing and the chat panel are one combined mode — chat.js (when
  // present) opens the panel and auto-enables live through this hook. The
  // shell stays fully functional without it.
  window.mpChatOnEditMode?.(true);

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
    // Double-click is also the element-selection gesture for the chat panel:
    // mark it (screen-only outline; serializeForSave strips the class) and
    // hand it to chat.js, which shows it as a removable chip.
    document.querySelectorAll('.mp-selected').forEach(s => { if (s !== el) s.classList.remove('mp-selected'); });
    el.classList.add('mp-selected');
    window.mpChatOnElementSelected?.(el);
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
  mpq('#mp-btn-edit').classList.remove('active');
  const label = mpq('#mp-btn-edit-label');
  if (label) label.textContent = 'Edit';
  document.body.classList.remove('edit-active');
  setChromeState('data-mp-edit-active', false);
  blurActiveEdit();
  clearHover();
  document.querySelectorAll('.mp-selected').forEach(s => s.classList.remove('mp-selected'));
  if (editListeners) { editListeners(); editListeners = null; }
  window.mpChatOnEditMode?.(false);
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
  // ALL chrome is runtime-only (injectChrome/chat.js rebuild it every load) —
  // stripping it here keeps the saved file a pure document, and turns the
  // first save of a legacy page (baked-in chrome) into a cleanse.
  // data-mp-edited markers on content are NOT stripped — persisting them is
  // how the model finds user edits in the file.
  // Chrome lives in one shadow host ([data-mp-chrome]); the serve-time wrap
  // (its stylesheet, its scripts) is tagged the same way, and legacy pages
  // carry the old baked-in chrome by id. The file on disk keeps none of it.
  root.querySelectorAll('[data-mp-chrome], #mp-chrome-root, #mp-toolbar, #mp-overlay, #mp-chat-panel')
      .forEach(el => el.remove());
  root.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
  root.querySelectorAll('.mp-selected').forEach(el => {
    el.classList.remove('mp-selected');
    if (!el.classList.length) el.removeAttribute('class');
  });
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
  const btn = mpq('#mp-btn-print');
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
// changes.
//
// A CHANGED FILE ALWAYS RELOADS, IMMEDIATELY. Nothing about what the USER is
// doing — typing in the chat panel, holding an uncommitted double-click text
// edit — postpones it. That reads harsh for the text edit, so it's worth
// saying why it isn't: an uncommitted edit is already unsaveable the moment
// the file changes underneath it. Committing PUTs it with the stale ETag, the
// server answers 412, and savePage() reloads and drops it (see Save). Holding
// the reload never rescued that edit; it only hid the newer page and let the
// user pour more typing into something already lost. Reloading at once costs
// the same edit and tells them straight away.
//
// The MODEL is the one voice that can hold it, because it is the one that
// knows the file is mid-change. Its live loop brackets an edit with `status
// working` before the first write and `status done` after the last (SKILL.md
// "Answering a chat message"), and in between the file passes through
// versions the user was never meant to see. So chat.js holds the poll for
// that window (window.mpModelWorking) and, on done, calls the tick itself —
// the finished page arrives with the model's confirmation, in one reload
// instead of a flicker through every intermediate write. The hold is capped
// there, not here: a model that dies mid-edit must not freeze the preview,
// which is the whole failure this poll exists to avoid.
//
// What stays is not deferral:
//   - file:// pages have no server to ask — skip entirely, same rule as
//     printThisPage().
//   - a save in flight, and the same re-check after the HEAD: the tab's OWN
//     write moves the ETag too, and its new baseline arrives on the PUT
//     response. Without this the tab reloads in reaction to itself.
//   - non-ok responses and network errors are ignored, never reloaded on:
//     a restarting server, or the deleted temp .render-*.html this same
//     script polls from inside the headless PDF render, would otherwise
//     wipe the page mid-print.
//   - hosts that serve no ETag (a page uploaded somewhere static) get no
//     auto-reload rather than spurious ones.
//
// Everything that reaches the file some other way — an edit made from the
// harness conversation instead of the chat panel, a page the user rewrites by
// hand, a model whose harness can't post status at all — still lands within a
// tick. The model's signal makes the common path exact; the poll is what
// makes every path work.
function initAutoReload() {
  if (location.protocol === 'file:') return;
  const tick = async () => {
    // Two holds, both of them bounded elsewhere by the thing that set them:
    // an open IME composition (text that exists in neither the input's value
    // nor the mirrored draft, so there would be nothing to restore), and the
    // model's own working window.
    if (saving || window.mpChatComposing?.() || window.mpModelWorking?.()) return;
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
  // Out-of-band check, for a caller that KNOWS the file just reached its
  // final state — chat.js on `status done`. Without it the finished page
  // would still be up to a tick behind the message announcing it.
  window.mpReloadIfChanged = tick;
  // Seed the baseline now, not on the first interval tick — an edit landing
  // within the first poll period would otherwise BECOME the baseline and
  // never trigger the reload it should have.
  tick();
  setInterval(tick, 1500);
}

// ── Chrome injection ────────────────────────────────────────────────────────
// The generated file is a pure document; ALL skill chrome is built here at
// runtime, so shell updates apply to already-generated pages the moment
// they're (re)loaded. Any pre-existing #mp-toolbar/#mp-overlay in the file is
// a legacy page with baked-in chrome — it's removed and replaced, and the
// next PUT save cleanses it from the file (serializeForSave strips chrome).
//
// The chrome is built inside a SHADOW ROOT, and that is a guarantee, not a
// detail: a generated page carries arbitrary CSS — a theme redefines every
// --color-*/--font-* token, custom_css can name any selector — and none of it
// may reach the toolbar, the edit overlay, or the chat panel. The shadow
// boundary stops page selectors; `all: initial` on the host stops inheritance
// through it; chrome.css resolves its own --mp-* tokens so nothing depends on
// a document token. The page's only remaining lever would be styling the host
// element itself, which the inline declarations below take away: an inline
// !important declaration outranks every author stylesheet rule, important or
// not, so no page CSS can move, hide, or restyle the chrome.
const HOST_STYLE = [
  // Cuts inheritance at the boundary (and every property the page could
  // otherwise set on the host) down to the initial value.
  'all: initial !important',
  // The chrome's own elements are position:fixed; the host is a zero-size
  // anchor that never takes part in the page's layout.
  'position: fixed !important',
  'top: 0 !important',
  'left: 0 !important',
  'width: 0 !important',
  'height: 0 !important',
  'display: block !important',
  'z-index: 2147483000 !important',
  // Children opt back in (chrome.css) — the host itself never eats a click.
  'pointer-events: none !important',
  // The chrome is a light UI regardless of the OS/page color scheme.
  'color-scheme: light !important',
].join(';');

let chromeHost = null;  // the light-DOM host element
let chromeRoot = null;  // its shadow root — every chrome node lives in here

// Chrome lookups. Chrome is NOT in the document, so document.getElementById
// would never find it: everything that reaches for a chrome element goes
// through these (chat.js included).
function mpq(sel) { return chromeRoot ? chromeRoot.querySelector(sel) : null; }
function mpAll(sel) { return chromeRoot ? Array.from(chromeRoot.querySelectorAll(sel)) : []; }

// Screen-state flags the chrome styles itself by (chrome.css :host([...])).
// The matching body classes stay too — chrome-host.css reads those for the
// document side of the same state (toolbar space, the panel's column).
function setChromeState(name, on) { if (chromeHost) chromeHost.toggleAttribute(name, !!on); }

// The chrome's stylesheet. Served pages carry it inline in an inert
// <template> the server injected, so it applies synchronously — the chrome
// never paints unstyled. Anything else (a legacy page that links the shell
// itself, file:// use) falls back to a <link> next to this script.
function chromeStylesheet() {
  const tpl = document.getElementById('mp-chrome-css');
  if (tpl && tpl.content && tpl.content.childElementCount) return tpl.content.cloneNode(true);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('chrome.css', SHELL_SRC).href;
  return link;
}

function injectChrome() {
  // Whatever chrome the document already carries goes: a legacy page's baked
  // toolbar, or the empty host left in a re-serialized DOM (the print
  // pipeline re-renders the serialized page).
  document.querySelectorAll('#mp-chrome-root, #mp-toolbar, #mp-overlay, #mp-chat-panel')
          .forEach(el => el.remove());

  chromeHost = document.createElement('div');
  chromeHost.id = 'mp-chrome-root';
  chromeHost.setAttribute('data-mp-chrome', '');   // serializeForSave strips it
  chromeHost.setAttribute('style', HOST_STYLE);
  chromeRoot = chromeHost.attachShadow({ mode: 'open' });
  chromeRoot.appendChild(chromeStylesheet());

  const toolbar = document.createElement('div');
  toolbar.id = 'mp-toolbar';
  const sep = () => {
    const s = document.createElement('div');
    s.className = 'mp-sep';
    return s;
  };

  // Print is the toolbar's first control and never moves: it is the one
  // action every page has in every mode, and anchoring it at the left edge
  // keeps it under the same pixel whether or not edit mode has expanded the
  // controls to its right.
  const print = document.createElement('button');
  print.id = 'mp-btn-print';
  print.textContent = 'Print / Save PDF';
  toolbar.appendChild(print);

  toolbar.appendChild(sep());

  // Combined edit+chat toggle: pencil when idle; X + "Editing" while active.
  // chat.js (when present) opens/closes the side panel through the mode hook.
  const edit = document.createElement('button');
  edit.id = 'mp-btn-edit';
  edit.innerHTML =
    '<svg class="mp-icon-pencil" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>' +
    '<svg class="mp-icon-x" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
    '<span id="mp-btn-edit-label">Edit</span>';
  toolbar.appendChild(edit);

  // Page setup, right of the edit toggle (so the controls edit mode adds all
  // grow rightward, away from Print): paper size and orientation as two
  // combo boxes. They're independent axes — any size combines with either
  // orientation — so they stay two controls, not one product list. Built
  // always, shown only in edit mode (chrome.css gates them on the host's
  // data-mp-edit-active), so applySize() can keep them in sync whether or not
  // they're on screen.
  const setup = document.createElement('div');
  setup.id = 'mp-page-setup';
  const combo = (id, options) => {
    const s = document.createElement('select');
    s.id = id;
    s.className = 'mp-combo';
    for (const [value, label] of options) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      s.appendChild(o);
    }
    setup.appendChild(s);
    return s;
  };
  const paperSel = combo('mp-paper-select', [
    ['letter', 'US Letter'], ['a4', 'A4'], ['legal', 'Legal'], ['half', 'Half'],
  ]);
  paperSel.title = 'Paper size';
  paperSel.setAttribute('aria-label', 'Paper size');
  paperSel.addEventListener('change', () => applySize(paperSel.value));
  const orientSel = combo('mp-orient-select', [
    ['portrait', 'Portrait'], ['landscape', 'Landscape'],
  ]);
  orientSel.title = 'Orientation';
  orientSel.setAttribute('aria-label', 'Orientation');
  orientSel.addEventListener('change', () => setOrientation(orientSel.value));
  toolbar.appendChild(setup);

  // Variant nav — hidden until initVariants() detects multiple .variant-page
  const vsep = sep();
  vsep.id = 'mp-variant-sep';
  vsep.style.display = 'none';
  toolbar.appendChild(vsep);
  const nav = document.createElement('div');
  nav.id = 'mp-variant-nav';
  const prev = document.createElement('button');
  prev.id = 'mp-btn-prev';
  prev.className = 'mp-nav-btn';
  prev.title = 'Previous variant';
  prev.innerHTML = '&#8592;';
  const label = document.createElement('span');
  label.id = 'mp-variant-label';
  label.textContent = '1 / 1';
  const next = document.createElement('button');
  next.id = 'mp-btn-next';
  next.className = 'mp-nav-btn';
  next.title = 'Next variant';
  next.innerHTML = '&#8594;';
  nav.appendChild(prev);
  nav.appendChild(label);
  nav.appendChild(next);
  toolbar.appendChild(nav);

  const ov = document.createElement('div');
  ov.id = 'mp-overlay';
  chromeRoot.appendChild(toolbar);
  chromeRoot.appendChild(ov);
  overlay = ov;

  // Mounted on <html>, not in <body>: a page's own selectors (`body > *`,
  // `.page-surround + *`) then never even match the host element.
  document.documentElement.appendChild(chromeHost);
}

// ── Init ────────────────────────────────────────────────────────────────────

(function init() {
  injectChrome();

  // Detect iframe embedding — strip standalone chrome. The state is flagged
  // twice on purpose: the body class drives the document-side trim
  // (chrome-host.css), the host attribute the chrome's own (chrome.css).
  if (window.self !== window.top) {
    document.body.classList.add('mp-embedded');
    setChromeState('data-mp-embedded', true);
  }

  // Toolbar buttons
  mpq('#mp-btn-print').addEventListener('click', printThisPage);
  mpq('#mp-btn-edit').addEventListener('click', toggleEditMode);

  // Before the page-shaped work below, which reads elements a malformed or
  // hand-written document may not have: whatever else this page breaks, the
  // tab must keep following the file, so the model's next edit can fix it
  // without the user having to reload by hand.
  initAutoReload();

  // Per-page configuration is declarative: assembly sets data attributes on
  // <body> (the document carries data, never chrome API calls). Legacy pages
  // instead carry injected applySize()/setLiveEditSupported() script lines
  // after this script — those globals still work, so they self-configure too.
  if (document.body.dataset.mpLiveEdit) setLiveEditSupported(true);

  // Pages ship their design baked in: the shell's :root tokens plus whatever
  // #content-overrides the generation wrote (ad-hoc theme tokens included).
  // Nothing is applied or restored at load — design changes happen at
  // generation time, never in the shell.
  //
  // Paper size deliberately NOT restored from storage: all file:// pages share
  // one localStorage, so a paper picked on some other document weeks ago would
  // silently re-target this page's @page size and sheet geometry — while the
  // user's print dialog stays on their printer's paper, producing clipped or
  // half-blank sheets. Every standalone page opens at its own configured
  // paper; the toolbar picker still works per visit, and an embedding host
  // can re-apply its own saved choice via applySize after load.
  // data-mp-paper may carry the legacy 'landscape' alias (applySize resolves
  // it); data-mp-orientation is the separate-axis form.
  const configured = document.body.dataset.mpPaper;
  const savedPaper = (PAPERS[configured] || configured === 'landscape') ? configured : 'letter';
  const configuredOrient = document.body.dataset.mpOrientation === 'landscape' ? 'landscape' : undefined;

  initVariants();
  applySize(savedPaper, configuredOrient);
  window.addEventListener('resize', () => scaleToFit(paperDims().w));
})();
