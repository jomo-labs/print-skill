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

// ── Overflow pagination ─────────────────────────────────────────────────────
// Paper is a fixed physical size, so content that outgrows a sheet has to go
// somewhere: it continues onto another sheet. A real one — same paper, same
// margins, same themed frame and shadow as the sheet it continues, offset
// below it on screen and printed as the next page of the PDF.
//
// The split is a RUNTIME VIEW of the document, never part of it. The file on
// disk keeps the single authored flow: unpaginate() rewinds to that flow
// before every pass, applySize() re-splits from scratch on load, on paper
// change and on variant switch, and serializeForSave() unpaginates the DOM it
// writes back. That is also what makes the split idempotent for the print
// pipeline, which re-renders the LIVE DOM — an already-split page re-splits
// into exactly the same sheets.
//
// Sheets fill greedily, and a node moves WHOLE whenever it would fit on a
// sheet of its own: only content too tall for ANY sheet is cut, so a
// paragraph or a section is never torn merely for straddling the boundary.
// What cannot be cut at all — an image, a table, one oversized block — stays
// where it is and overflows its sheet, spilling past the paper edge onto the
// canvas. Nothing is drawn to point that out: a block visibly hanging off the
// sheet it belongs to is already the clearest possible statement that the
// content, not the layout, is the thing to fix.

// A runaway guard, not an expected limit: every pass leaves at least one node
// behind (splitOff returns null when it cannot), so this only ever catches a
// bug in the fitting below.
const MAX_SHEETS = 200;

// Never cut these: their content is not a flow that can be continued, so they
// move whole or they overflow.
const ATOMIC_TAGS = new Set([
  'IMG', 'SVG', 'CANVAS', 'VIDEO', 'AUDIO', 'IFRAME', 'OBJECT', 'EMBED',
  'TABLE', 'HR', 'BR', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'PRE',
]);

// Ties a cut element to the shells carrying the rest of it, so unpaginate()
// can put the pieces back in the right place.
let splitSeq = 0;

function isContinuation(el) {
  return !!el && el.nodeType === 1 && el.hasAttribute('data-mp-continuation');
}

// A sheet plus every continuation hanging off it, in order.
function sheetChain(sheet) {
  const chain = [sheet];
  for (let n = sheet.nextElementSibling; isContinuation(n); n = n.nextElementSibling) chain.push(n);
  return chain;
}

// The sheets pagination owns: every sheet of a nested multi-sheet assembly,
// or the one active top-level sheet. Inactive variants are left alone — they
// are not on screen, and splitting them would only be undone at the next
// variant switch.
function originSheets() {
  const nested = Array.from(document.querySelectorAll('#page > .page')).filter(el => !isContinuation(el));
  if (nested.length) return nested;
  const active = getActivePage();
  return active ? [active] : [];
}

// Rewind to the authored flow: every continuation sheet's content goes back
// where it came from and the sheet itself disappears. Runs on the live
// document before each pass, and on the clone serializeForSave() writes out —
// same function, so the file can never disagree with what a reload rebuilds.
function unpaginate(root) {
  const destinations = new Set();
  for (const cont of Array.from(root.querySelectorAll('[data-mp-continuation]'))) {
    // A chain merges front to back and each sheet is removed as it goes, so
    // the previous sibling is always the sheet this one continues.
    const dest = cont.previousElementSibling;
    if (dest) {
      destinations.add(dest);
      while (cont.firstChild) mergeBack(dest, cont.firstChild);
    }
    cont.remove();
  }
  root.querySelectorAll('[data-mp-split-src]').forEach(el => el.removeAttribute('data-mp-split-src'));
  // splitText() cuts at a word boundary and leaves the whitespace on the
  // head, so joining the halves back into one text node restores the original
  // string exactly.
  destinations.forEach(el => el.normalize());
}

// Move one node from a continuation sheet back where it came from. A node
// that is the tail shell of a cut element is not restored as a node at all —
// its children rejoin the element it was cut from.
function mergeBack(dest, node) {
  const gid = node.nodeType === 1 && node.getAttribute('data-mp-split');
  if (gid) {
    const target = dest.querySelector(`[data-mp-split-src="${gid}"]`);
    if (target) {
      while (node.firstChild) mergeBack(target, node.firstChild);
      node.remove();
      return;
    }
  }
  dest.appendChild(node);
}

// Split every sheet that overflows into as many sheets as its content needs.
// `data-mp-paginate="off"` on the body opts a page out and restores the old
// behaviour: one sheet, and overflow spilling past its edge.
function paginate(p) {
  if (document.body.dataset.mpPaginate === 'off') return;
  for (const origin of originSheets()) paginateSheet(origin, p);
}

// What the pass had to do, published three ways: to the toolbar, to the body
// as data-mp-overflow, and to window.mpFit for fit-cli.mjs.
//
// This is the point of the whole reporting path. Sheets the shell had to add
// are sheets the AUTHOR did not lay out, and where a document breaks is a
// design decision — which page each thing lands on, whether a page feels
// complete (principles.md VII). The split keeps that content from being lost,
// but it chooses the breaks by what happened to fit, which is exactly the
// accident the design is supposed to prevent. So the shell says so, loudly
// enough that the generation can go back and either make it fit one sheet or
// lay the further sheets out on purpose.
//
// A page that fits carries NO attribute — the diagnostic only ever marks a
// failure, so a clean document stays clean.
function reportFit(p) {
  const origins = originSheets();
  let rendered = 0, overflowing = 0;
  for (const origin of origins) {
    for (const sheet of sheetChain(origin)) {
      rendered++;
      if (sheet.scrollHeight > p.h + 1) overflowing++;
    }
  }
  const fit = { authored: origins.length, rendered, overflowing };
  window.mpFit = fit;
  if (rendered > fit.authored || overflowing) document.body.dataset.mpOverflow = String(rendered);
  else delete document.body.dataset.mpOverflow;
  showFitBadge(fit);
  return fit;
}

// The user's half of the same news. Hidden while the page fits, so the
// resting toolbar stays Print and Edit.
function showFitBadge({ authored, rendered, overflowing }) {
  const badge = mpq('#mp-fit-badge');
  if (!badge) return;
  const spilled = rendered > authored;
  badge.style.display = (spilled || overflowing) ? 'inline-flex' : 'none';
  if (!spilled && !overflowing) return;
  badge.textContent = overflowing && !spilled
    ? 'content overflows the sheet'
    : `content runs onto ${rendered} sheets`;
  badge.title = overflowing
    ? 'Some content is too tall for any sheet and hangs past the paper edge. ' +
      'It prints clipped — shorten it, or give it a sheet laid out for it.'
    : `This page was authored as ${authored} sheet${authored === 1 ? '' : 's'} and its ` +
      `content needs ${rendered}. Nothing is lost — the extra sheets print — but the ` +
      'breaks fall where the content ran out of room rather than where they were designed.';
}

function paginateSheet(origin, p) {
  let sheet = origin;
  for (let i = 0; i < MAX_SHEETS; i++) {
    const cs = getComputedStyle(sheet);
    const top = parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop);
    const capacity = p.h - top - parseFloat(cs.paddingBottom) - parseFloat(cs.borderBottomWidth);
    if (!(capacity > 0)) return;
    // The sheet's own content-box bottom, in viewport coordinates. Every fit
    // test below is a comparison against this one line.
    const limit = sheet.getBoundingClientRect().top + top + capacity;
    const overflow = splitOff(sheet, limit, capacity);
    // null: the very first node overflows and cannot be cut, so nothing would
    // stay behind and a continuation would only rebuild this same sheet. It
    // stays put and overflows past the paper edge, in plain sight.
    if (!overflow || !overflow.length) return;
    const next = makeContinuation(sheet, p);
    overflow.forEach(node => next.appendChild(node));
    sheet = next;
  }
}

// The nodes of `container` that do not fit above `limit`, in order. Returns
// [] when everything fits, and null when nothing can be moved without leaving
// the container empty (no progress — the caller must stop).
function splitOff(container, limit, capacity) {
  const kids = laidOutChildren(container);
  for (let i = 0; i < kids.length; i++) {
    const { node, box } = kids[i];
    if (box.bottom <= limit) continue;
    // Everything after it goes too — and that is every SIBLING, not just the
    // laid-out ones. The whitespace between two elements is a node like any
    // other, and leaving it behind while its neighbours move would quietly
    // rewrite the authored markup (two inline elements that were separated by
    // a space would come back joined). Read before splitNode() runs, so a
    // text tail it inserts right after `node` isn't counted twice.
    const rest = [];
    for (let n = node.nextSibling; n; n = n.nextSibling) rest.push(n);
    // Too tall for any sheet: cutting it is the only way it can ever be
    // placed. Anything that WOULD fit on a sheet of its own moves whole
    // instead, which is what keeps paragraphs and sections intact.
    if (box.top < limit && box.height > capacity) {
      const tail = splitNode(node, limit, capacity);
      if (tail) return [tail, ...rest];
    }
    if (i === 0) return null;
    return [node, ...rest];
  }
  return [];
}

// Cut `node` in two at `limit`: what fits stays, the rest moves into a shell
// carrying the same tag, classes and attributes, so the continuation reads as
// the same element. Returns the shell (detached), or null if it cannot be cut.
function splitNode(node, limit, capacity) {
  if (node.nodeType === 3) return splitText(node, limit);
  if (node.nodeType !== 1 || ATOMIC_TAGS.has(node.tagName)) return null;
  const tail = splitOff(node, limit, capacity);
  if (!tail || !tail.length) return null;
  // A shell that already carries a group id is itself the continuation of an
  // earlier cut: its own tail rejoins the SAME original, so the id rides
  // along rather than opening a new group.
  let gid = node.getAttribute('data-mp-split');
  if (!gid) {
    gid = String(++splitSeq);
    node.setAttribute('data-mp-split-src', gid);
  }
  const shell = node.cloneNode(false);
  shell.removeAttribute('id');            // an id belongs to one element
  shell.removeAttribute('data-mp-split-src');
  shell.setAttribute('data-mp-split', gid);
  tail.forEach(n => shell.appendChild(n));
  return shell;
}

// Cut a run of text at the last word boundary that still clears `limit`. The
// whitespace stays on the head, so head + tail is character-for-character the
// original string and unpaginate() restores it by normalizing the two halves
// back together.
function splitText(node, limit) {
  const text = node.nodeValue;
  const bounds = [];
  for (let i = 1; i < text.length; i++) {
    if (/\s/.test(text[i - 1]) && !/\s/.test(text[i])) bounds.push(i);
  }
  if (!bounds.length) return null;
  const range = document.createRange();
  const fits = (end) => {
    range.setStart(node, 0);
    range.setEnd(node, end);
    return range.getBoundingClientRect().bottom <= limit;
  };
  // Not even the first word clears the line — there is no cut to make here.
  if (!fits(bounds[0])) return null;
  let lo = 0, hi = bounds.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(bounds[mid])) lo = mid; else hi = mid - 1;
  }
  return node.splitText(bounds[lo]);
}

// Children that take part in the sheet's flow, with their boxes. Comments,
// whitespace-only text and display:none elements have no box to fit;
// out-of-flow boxes (absolute, fixed) don't push content down, so they never
// decide a break either.
function laidOutChildren(el) {
  const out = [];
  for (const node of el.childNodes) {
    const box = nodeRect(node);
    if (box) out.push({ node, box });
  }
  return out;
}

function nodeRect(node) {
  if (node.nodeType === 3) {
    if (!node.nodeValue.trim()) return null;
    const range = document.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    return (r.width || r.height) ? r : null;
  }
  if (node.nodeType !== 1) return null;
  const cs = getComputedStyle(node);
  if (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed') return null;
  const r = node.getBoundingClientRect();
  return (r.width || r.height) ? r : null;
}

// A continuation sheet IS a sheet: it inherits the origin's own classes, so a
// themed .page continues onto an identically themed one and picks up paper,
// margins, frame and shadow from the page's own CSS with nothing restated
// here. Only the id (which belongs to one element) and the variant/active
// classes (which the chrome owns) are left behind.
function makeContinuation(prev, p) {
  const sheet = document.createElement('div');
  sheet.className = Array.from(prev.classList)
    .filter(c => c !== 'variant-page' && c !== 'active')
    .join(' ');
  sheet.classList.add('page', 'mp-continuation');
  sheet.setAttribute('data-mp-continuation', '');
  sheet.style.width = p.w + 'px';
  sheet.style.height = p.h + 'px';
  sheet.style.minHeight = '0';
  prev.parentNode.insertBefore(sheet, prev.nextSibling);
  return sheet;
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
  // the reverse. Content that outgrows a sheet continues onto another one
  // (see paginate); the little that cannot be split spills visibly past the
  // sheet's bottom edge, an error state to fix at generation time, rather
  // than silently stretching the page.
  // Back to the authored single flow before anything is measured: the sheets
  // pagination added last pass are a view, and this pass rebuilds them from
  // scratch against the paper that is current now.
  unpaginate(document);
  const nested = document.querySelector('#page > .page');
  document.querySelectorAll('.variant-page, #page').forEach(el => {
    el.style.width = p.w + 'px';
    // The screen-fit transform and its margin compensation are cleared before
    // the fit pass: getBoundingClientRect reports SCALED pixels, and the
    // capacity every fit test below is measured against is in CSS pixels.
    // scaleToFit() puts both back at the end of applySize().
    el.style.transform = '';
    el.style.marginBottom = '';
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
    el.style.transform = '';
    el.style.marginBottom = '';
  });
  paginate(p);
  reportFit(p);
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
  // Only the screen-fit transform reacts to the viewport — sheet
  // width/min-height/padding (the WYSIWYG print geometry) never change.
  const available = window.innerWidth - 80;
  const s = Math.min(available / w, 1);
  const active = getActivePage();
  if (!active) return;
  for (const el of sheetChain(active)) {
    el.style.transform = s < 1 ? `scale(${s})` : '';
    el.style.transformOrigin = 'top center';
    // A scaled sheet still takes its FULL height in the flow — the transform
    // is paint, not layout. Pulling the surplus back off the bottom is what
    // keeps the offset between stacked sheets (and the room below the last
    // one) the distance the screen actually shows, at every zoom. Print
    // resets the margin: the offset is screen presentation, and the sheets
    // print at 1:1 anyway.
    el.style.marginBottom = s < 1 ? -Math.round(el.offsetHeight * (1 - s)) + 'px' : '';
  }
}

// ── Variant picker ───────────────────────────────────────────────────────────

let variantPages = [], variantTotal = 0, variantCurrent = 0;

function showVariant(n) {
  variantCurrent = n;
  variantPages.forEach((el, i) => el.classList.toggle('active', i === n));
  mpq('#mp-variant-label').textContent = (n + 1) + ' / ' + variantTotal;
  // Re-apply size so width/transform/sheets target the newly active variant
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
    // Double-click is also the selection gesture: it marks the element
    // (screen-only outline; serializeForSave strips the class) and tells the
    // model, which acknowledges it in the user's own session.
    selectElement(el);
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
  clearSelection();
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
// re-derived on load: applySize() sets page widths and splits the overflow
// onto continuation sheets, scaleToFit() sets transform and margins, init()
// adds mp-embedded, edit mode adds the rest.
function serializeForSave() {
  const root = document.documentElement.cloneNode(true);
  root.querySelectorAll('.mp-hover-box').forEach(el => el.remove());
  // Continuation sheets are a runtime view of one authored flow (see
  // paginate) — the file keeps the flow. Same function the live document
  // rewinds through, so what is saved is exactly what a reload re-splits.
  unpaginate(root);
  // ALL chrome is runtime-only (injectChrome rebuilds it every load) —
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
  root.querySelectorAll('.page, .variant-page, .page-surround').forEach(el => el.removeAttribute('style'));
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
// doing — holding an uncommitted double-click text edit — postpones it. That
// reads harsh for the text edit, so it's worth
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
// "Handling a message"), and in between the file passes through versions the
// user was never meant to see. So the live channel below holds the poll for
// that window (modelWorking()) and, on done, calls the tick itself — the
// finished page arrives with the model's confirmation, in one reload instead
// of a flicker through every intermediate write. The hold is capped there,
// not here: a model that dies mid-edit must not freeze the preview, which is
// the whole failure this poll exists to avoid.
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
// Everything that reaches the file some other way — a page the user rewrites
// by hand, a model whose harness can't post status at all — still lands
// within a tick. The model's signal makes the common path exact; the poll is
// what makes every path work.
let reloadIfChanged = null;
function initAutoReload() {
  if (location.protocol === 'file:') return;
  const tick = async () => {
    // One hold besides our own write, bounded by the thing that set it: the
    // model's working window (see the Live channel).
    if (saving || modelWorking()) return;
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
  // final state — the live channel on `status done`. Without it the finished
  // page would still be up to a tick behind the message announcing it.
  reloadIfChanged = tick;
  // Seed the baseline now, not on the first interval tick — an edit landing
  // within the first poll period would otherwise BECOME the baseline and
  // never trigger the reload it should have.
  tick();
  setInterval(tick, 1500);
}

// ── Live channel ────────────────────────────────────────────────────────────
// The page's half of the connection to the model. There is no chat panel and
// no chat: the user talks to their model in the model's OWN session, where
// they already are and where the answer is going to appear anyway. What
// crosses this channel is only what neither side can know alone:
//
//   page → model   the element the user just double-clicked, or cleared — so
//                  the model can name it back to them in that session and
//                  treat it as the subject of whatever they type next.
//   model → page   `status working` / `status done` around an edit, which
//                  holds the auto-reload across a half-written file; and
//                  presence, which the toolbar shows and nothing else needs.
//
// Both directions ride one endpoint and one 1.5s poll. The poll runs for the
// whole life of a served page, not only in edit mode: the toolbar's indicator
// has to be honest before the user touches anything, and `status done` has to
// refresh a page nobody happens to be editing.
const SELECT_NOTICE_MS = 400;   // settle time before a selection is reported
const WORKING_HOLD_MS = 30000;  // cap on the model's hold — see Auto-reload

let modelListening = false;
let liveCursor = 0;
// The epoch of the server that has been told what is selected here. It is
// per-tab-persistent, not per-page-load, and that is the whole point: the
// model's own edit reloads this tab constantly, and re-announcing on every
// one of those would be noise, while a server that RESTARTED has never heard
// of the element still outlined on screen. Comparing epochs tells those two
// apart; comparing page loads cannot.
let toldEpoch = null;
let workingSince = 0;
let workingNote = '';

function modelWorking() { return Date.now() - workingSince < WORKING_HOLD_MS; }

const liveUrl = () => `/chat/${location.pathname.replace(/^\//, '')}/messages`;

function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch {} }
function ssGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }

function setListening(on) {
  if (on === modelListening) return;
  modelListening = on;
  renderLiveStatus();
}

// The toolbar's one piece of connection state, pinned to the right. It answers
// exactly one question — is anyone on the other end — because that is the only
// one the page can answer; everything else is in the model's session.
function renderLiveStatus() {
  const el = mpq('#mp-live-status');
  if (!el) return;
  const working = modelWorking();
  el.classList.toggle('mp-live-on', modelListening);
  el.classList.toggle('mp-live-working', working);
  el.title = working
    ? (workingNote || 'The model is editing this page')
    : modelListening
      ? 'A model is listening — ask it for changes in its own session'
      : 'No model is listening on this page';
  const label = mpq('#mp-live-status .mp-live-label');
  if (label) {
    label.textContent = working ? 'Working' : modelListening ? 'Live' : 'Not connected';
  }
}

function applyStatus(state, text, ts) {
  if (state === 'working') {
    workingSince = ts || Date.now();
    workingNote = text || '';
    renderLiveStatus();
    return;
  }
  workingSince = 0;
  workingNote = '';
  renderLiveStatus();
  // `done` means the file has reached its final state — don't wait out a tick
  // to show it.
  if (state === 'done') reloadIfChanged?.();
}

function initLiveChannel() {
  if (location.protocol === 'file:') return;
  const tick = async () => {
    try {
      // from=model: the page only needs what the model says. Its own
      // selection notices coming back would be noise.
      const res = await fetch(`${liveUrl()}?after=${liveCursor}&from=model`, { cache: 'no-store' });
      if (!res.ok) return;
      const body = await res.json();
      if (body.epoch !== toldEpoch) {
        // A server we have not spoken to: either the first poll of this tab's
        // life, or one that restarted under us. Its message log is gone (so
        // old ids would deadlock a cursor) and it knows nothing about the
        // selection — say it again. Claim the epoch first, so this runs once
        // per server and not once per tick.
        liveCursor = 0;
        toldEpoch = body.epoch;
        ssSet('mpToldEpoch', body.epoch);
        noticedSelector = null;
        noticeSelection();
      }
      for (const m of body.messages) {
        liveCursor = Math.max(liveCursor, m.id);
        if (m.kind === 'status') applyStatus(m.data?.state, m.text, m.ts);
      }
      setListening(body.listening);
      // The hold expires on its own if the model stops reporting (see
      // Auto-reload); the label has to expire with it, or a model that died
      // mid-edit would leave "Working" up for good.
      if (workingSince && !modelWorking()) { workingSince = 0; workingNote = ''; }
      renderLiveStatus();
    } catch { /* offline or server restarting — next tick retries */ }
  };
  tick();
  setInterval(tick, 1500);
}

// ── Selection ───────────────────────────────────────────────────────────────
// Double-clicking an element in edit mode selects it, and the model is told at
// once — that is what lets it answer "make it bigger" in its own session
// without the user having to describe which thing they mean.
//
// Debounced, because selecting is a hunt: clicking through four paragraphs to
// find the right one should reach the model once, at the one they settled on.
// Deduped by selector, so a re-select (or a reload that restores it) says
// nothing — the model already knows.

let selectedEl = null;
let noticeTimer = null;
let noticedSelector = null;

function selectElement(el) {
  document.querySelectorAll('.mp-selected').forEach(s => {
    if (s !== el) s.classList.remove('mp-selected');
  });
  el.classList.add('mp-selected');
  selectedEl = el;
  ssSet('mpSelected', buildSelector(el));
  noticeSelection();
}

function clearSelection() {
  document.querySelectorAll('.mp-selected').forEach(s => {
    s.classList.remove('mp-selected');
    if (!s.classList.length) s.removeAttribute('class');
  });
  selectedEl = null;
  ssSet('mpSelected', '');
  noticeSelection();
}

// Captured fresh each time, so the snapshot carries whatever the user has
// just typed into the element — minus the runtime-only state.
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

function noticeSelection() {
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(async () => {
    if (location.protocol === 'file:') return;
    const live = selectedEl?.isConnected ? selectedEl : null;
    const payload = live ? captureElement(live) : { selector: null };
    if (payload.selector === noticedSelector) return;
    noticedSelector = payload.selector;
    try {
      const res = await fetch(liveUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'user',
          kind: 'selection',
          text: payload.selector ? `selected ${payload.selector}` : 'cleared the selection',
          data: payload,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      // Unreachable or refused: forget that we said it, so the next change
      // (or the next server we meet) reports the real state instead of
      // assuming this one landed.
      noticedSelector = null;
    }
  }, SELECT_NOTICE_MS);
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

// The reload that lands here is almost always the model's own edit to the
// element the user has selected — so re-resolve it and re-mark it, silently:
// the model told us to reload, it has not forgotten what we were discussing.
// If the element did not survive that edit, the model's context IS stale, and
// that is the one case worth reporting.
function restoreSelection() {
  toldEpoch = ssGet('mpToldEpoch');
  const sel = ssGet('mpSelected');
  if (!sel) return;
  let el = null;
  try { el = document.querySelector(sel); } catch { /* no longer parses */ }
  if (el) {
    selectedEl = el;
    el.classList.add('mp-selected');
    noticedSelector = sel;  // already known to the model — say nothing
    return;
  }
  noticedSelector = sel;    // ...so the deselect below reads as a change
  ssSet('mpSelected', '');
  noticeSelection();
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
// may reach the toolbar or the edit overlay. The shadow
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
// through these.
function mpq(sel) { return chromeRoot ? chromeRoot.querySelector(sel) : null; }
function mpAll(sel) { return chromeRoot ? Array.from(chromeRoot.querySelectorAll(sel)) : []; }

// Screen-state flags the chrome styles itself by (chrome.css :host([...])).
// The matching body classes stay too — chrome-host.css reads those for the
// document side of the same state (toolbar space, the selection outline).
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
  // Two of these are only ever found on older pages: .page-break-guide, the
  // dotted rules an older shell drew inside the sheet to mark overflow
  // (continuation sheets replaced them — overflow that lands on its own sheet
  // has nothing to warn about, and a remainder that still cannot be placed
  // says so by hanging off the paper), and #mp-chat-panel, from before the
  // chat panel was retired. Both go like any other stale chrome.
  document.querySelectorAll('#mp-chrome-root, #mp-toolbar, #mp-overlay, #mp-chat-panel, .page-break-guide')
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

  // Edit toggle: pencil when idle; X + "Editing" while active.
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

  // Everything after this spacer sits at the toolbar's right edge, and nothing
  // to its left ever shifts. A spacer rather than margin-left:auto on the
  // first right-hand item, so that item keeps a plain resolved margin whatever
  // else is beside it — auto margins resolve to a used value that depends on
  // the free space, which makes the right-hand group's computed style a
  // function of the page's content.
  const spacer = document.createElement('div');
  spacer.className = 'mp-toolbar-spacer';
  toolbar.appendChild(spacer);

  // Connection state: the whole of the chrome's opinion about the model —
  // whether one is listening. The conversation is elsewhere.
  const live = document.createElement('div');
  live.id = 'mp-live-status';
  const dot = document.createElement('span');
  dot.className = 'mp-live-dot';
  const liveLabel = document.createElement('span');
  liveLabel.className = 'mp-live-label';
  liveLabel.textContent = 'Not connected';
  live.appendChild(dot);
  live.appendChild(liveLabel);
  toolbar.appendChild(live);

  // Overflow notice — hidden while the page fits (showFitBadge). Last in the
  // toolbar, so appearing and disappearing never moves the buttons under the
  // user's cursor.
  const fit = document.createElement('span');
  fit.id = 'mp-fit-badge';
  fit.style.display = 'none';
  toolbar.appendChild(fit);

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
  // Before the live channel opens: its first poll reconciles the selection
  // against the server's epoch, so the restored selection has to be in place
  // by then.
  restoreSelection();
  // Same reasoning as the auto-reload, one step further: the live channel is
  // what carries the model's `status done`, so it comes up before anything
  // page-shaped too.
  initLiveChannel();
  renderLiveStatus();

  // Per-page configuration is declarative: assembly sets data attributes on
  // <body> (the document carries data, never chrome API calls). Legacy pages
  // instead carry an injected applySize() script line after this script —
  // that global still works, so they self-configure too. Live edit is NOT
  // among these: it is not a property of the document at all, only of
  // whether this page is being served.

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
