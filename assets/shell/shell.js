// localStorage throws in opaque-origin contexts (e.g. Playwright's
// page.set_content(), sandboxed embeds). Writes go through this accessor so
// applySize() completes — and the print pipeline still works — even where
// storage is unavailable. (Nothing reads storage back on this surface: paper
// size deliberately starts at letter — see init.)
function lsSet(key, value) { try { localStorage.setItem(key, value); } catch {} }

// ── Paper size ──────────────────────────────────────────────────────────────

const PAPERS = {
  letter: { w: 816,  h: 1056, css: 'letter' },
  a4:     { w: 794,  h: 1123, css: 'A4' },
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
  // directly — computePrintFit reads the active key from it.
  const sel = document.getElementById('mp-paper-select');
  if (sel && sel.value !== key) sel.value = key;
  // Set width on all page elements (single page or all variants)
  document.querySelectorAll('.variant-page, #page').forEach(el => { el.style.width = p.w + 'px'; });
  // Page-break guides only on the active page
  document.querySelectorAll('.page-break-guide').forEach(g => g.remove());
  const activePg = getActivePage();
  for (let y = p.h; y < activePg.offsetHeight + p.h; y += p.h) {
    const guide = document.createElement('div');
    guide.className = 'page-break-guide';
    guide.style.cssText = `position:absolute;left:0;right:0;top:${y}px;height:2px;` +
      `background:repeating-linear-gradient(90deg,oklch(67% 0.006 78) 0 6px,transparent 6px 12px);` +
      `pointer-events:none;`;
    activePg.appendChild(guide);
  }
  document.getElementById('dynamic-page-css').textContent = `@page { size: ${p.css}; margin: ${PRINT_MARGIN_IN}in; }`;
  lsSet('mpPaper', key);
  scaleToFit(p.w);
  computePrintFit();
}

// ── Print fit ────────────────────────────────────────────────────────────────
// Print keeps the on-screen canvas geometry (see the @media print block); this
// computes the zoom that scales it into the sheet's printable area and writes
// it as static CSS. Static-by-print-time matters: Playwright's page.pdf() never
// fires beforeprint, so an unattended headless-PDF path can only consume
// a rule that already exists in the DOM.
//
// 0.25in (not the deterministic PDF pipeline's exact requirement) is a
// deliberate safety margin: a real printer's driver-reported printable area
// is invisible to page JS and can be narrower than what's assumed here,
// clipping content sized to fill right up to the edge (a physical printer
// once clipped a page whose zoom was computed against a tighter 0.2in guess). This constant is the
// last line of defense for the file:// case in printThisPage(), which has no
// server to render an exact PDF against.
const PRINT_MARGIN_IN = 0.25;
// Below this the page is genuinely multi-sheet: cap the shrink for legibility
// and let [data-mp-section] break rules take over. Content this long is a
// generation-side bug — plan content length to fit the sheet.
const PRINT_FIT_FLOOR = 0.6;

function computePrintFit() {
  const p = PAPERS[document.getElementById('mp-paper-select')?.value] || PAPERS.letter;
  const margin = PRINT_MARGIN_IN * 96;
  const printW = p.w - 2 * margin, printH = p.h - 2 * margin;
  // Printable sheets: the active variant in variant mode; else, for a nested
  // multi-page document (a two-sheet assembly puts its .page
  // sheets inside #page), the nested sheets — #page is then a transparent
  // container, neutralized by the :has() rule in the print block so zoom
  // can't compound; else the top-level .page itself.
  const nested = Array.from(document.querySelectorAll('#page > .page'));
  const pages = document.querySelectorAll('.variant-page').length
    ? [getActivePage()]
    : (nested.length ? nested
       : Array.from(document.querySelectorAll('.page-surround > .page')));
  const sheetSel = nested.length ? '#page > .page' : '.page-surround > .page';
  // One document-wide factor (the min across pages), not per-page factors —
  // mixed type sizes across sheets of a single artifact read as a misprint.
  // The width term caps the factor at ~0.95: a full-paper-width canvas can
  // never print at 1.0 inside the page margin.
  let z = 1;
  pages.forEach(el => {
    if (!el || !el.offsetWidth || !el.offsetHeight) return;
    // Fractional, transform-corrected height. offsetHeight rounds to the
    // nearest px (can under-report by half a pixel), and
    // getBoundingClientRect() is scaled by the screen-fit transform — divide
    // that scale back out via the width ratio.
    const r = el.getBoundingClientRect();
    const scale = el.offsetWidth ? (r.width / el.offsetWidth) : 1;
    const h = scale ? (r.height / scale) : el.offsetHeight;
    z = Math.min(z, printW / el.offsetWidth, printH / h);
  });
  // A height-bound factor lands the sheet EXACTLY at the printable height by
  // construction, and Chrome paginates on device-pixel rounding — a hairline
  // over spills a second, blank sheet (seen on HiDPI: dialog says "2 sheets"
  // while printToPDF says 1). Shave 0.4% and floor (never round up) so the
  // fit stays strictly inside the sheet on every display.
  z = Math.floor(z * 0.996 * 1e4) / 1e4;
  if (z < PRINT_FIT_FLOOR) {
    // The floor is a legibility backstop, not a fix — keep the overflow
    // visible to developers so generation-side length bugs stay detectable
    // (the zoom hack must not paper them over).
    console.warn(`[print-skill] print fit hit the ${PRINT_FIT_FLOOR} floor ` +
      `(needed ${z.toFixed(2)}) — content overflows one sheet; this is a ` +
      `generation-side content-length bug.`);
    z = PRINT_FIT_FLOOR;
  }
  document.getElementById('mp-print-fit-css').textContent =
    `@media print { ${sheetSel}, .variant-page.active { zoom: ${z.toFixed(4)}; } }`;
}

// Fonts load after init()'s first measurement and re-wrap lines; recompute so
// the precomputed factor reflects real metrics. beforeprint covers every
// browser print — including programmatic contentWindow.print() from an
// embedding host — right before the dialog snapshot.
if (document.fonts?.ready) document.fonts.ready.then(() => computePrintFit());
window.addEventListener('beforeprint', computePrintFit);

function scaleToFit(w) {
  const available = window.innerWidth - 80;
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
    el.contentEditable = 'true';
    el.focus();
    el.addEventListener('blur', () => { el.contentEditable = 'false'; }, { once: true });
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

// ── Print ───────────────────────────────────────────────────────────────────
// These pages are also saved, emailed, and printed as standalone files with
// no server reachable — see init()'s file:// paper-size comment. So Print
// prefers the server-side /render-pdf pipeline (a PDF's fixed page box is
// honored exactly by the OS/driver's printable-area fit) but
// falls back to this page's own window.print() whenever that pipeline can't
// be reached: file:// origins skip the attempt entirely, and any fetch
// failure (offline, server error) falls back from the catch block.
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
      body: JSON.stringify({ html, title: document.title }),
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
    // hosted — fall back to this page's own print-fit CSS rather than
    // leaving the user with nothing.
    if (tab) tab.close();
    window.print();
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
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
  // silently re-target this page's @page size and print-fit math — while the
  // user's print dialog stays on their printer's paper, producing clipped or
  // half-blank sheets. Every standalone page opens at letter; the toolbar
  // picker still works per visit, and an embedding host can re-apply its own
  // saved choice via applySize after load.
  const savedPaper = 'letter';
  document.getElementById('mp-paper-select').value = savedPaper;

  initVariants();
  applySize(savedPaper);
  window.addEventListener('resize', () => scaleToFit(PAPERS[document.getElementById('mp-paper-select').value]?.w || 816));
})();
