// Where this script was loaded from — the base for resolving sibling shell
// assets (chrome.css) on pages the server didn't wrap. Read at parse time:
// document.currentScript is only meaningful while the script is executing.
const SHELL_SRC = document.currentScript?.src || location.href;

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

// Current paper/orientation are state, fixed at generation time: init()
// reads them from the body's data attributes, and nothing at runtime
// changes them (the toolbar carries no pickers — paper is confirmed with
// the user before the page is generated).
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
      // The shell is about to stop existing, so anything the user's edit put
      // ON it has to survive onto the element it was cut from — that element
      // is the only one the file has. Without this, typing into the tail of a
      // paragraph that runs onto the next sheet would save the words and lose
      // the marker that tells the model they were typed.
      if (node.hasAttribute('data-mp-edited')) target.setAttribute('data-mp-edited', '');
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

// What the pass had to do, published three ways: to the toolbar as a status
// message with a FIX button beside it, to the body as data-mp-overflow, and
// to window.mpFit for fit-cli.mjs. The model hears about it when the user
// presses that button, and not before (sendFitReport).
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
  // The third failure this shell can find on its own: content cut off inside
  // a clipping container (see Clip detection below). Counted into the same
  // fit verdict, because it is the same problem wearing a different edge —
  // the content and the box the model gave it disagree about its size.
  const clippedEls = detectClipped();
  const fit = { authored: origins.length, rendered, overflowing, clipped: clippedEls.length };
  if (clippedEls.length) {
    // Where, as addresses into the AUTHORED flow (the same selectors a
    // selection reports), so the model can find each container in the file
    // without re-deriving what the page already measured. The count above is
    // always complete; only the address list is capped.
    fit.clippedAt = clippedEls.slice(0, CLIP_REPORT_MAX).map((el) => buildSelector(el));
  }
  const wasBroken = fitBroken(window.mpFit);
  window.mpFit = fit;
  // When the page BECAME wrong, for the toolbar's one message slot: a problem
  // that arrives while the user is looking at something else is news and takes
  // the line; a problem the document simply arrived with is not, and yields to
  // whatever the user is doing. 0 means the latter — so a first measurement
  // never claims to be news, however the page turns out.
  if (!fitBroken(fit)) brokenAt = 0;
  else if (!wasBroken) brokenAt = fitMeasured ? Date.now() : 0;
  fitMeasured = true;
  if (rendered > fit.authored || overflowing) document.body.dataset.mpOverflow = String(rendered);
  else delete document.body.dataset.mpOverflow;
  // Nothing wrong any more — whatever was handed over is finished with, and
  // the next problem (if one ever comes back) is a fresh one to hand over.
  //
  // The server is told too, because what it holds is STATE rather than a
  // stream of reports: a page that comes back into fit has to take its own
  // report back, or a model reading later goes looking for a problem this
  // document no longer has. Whether there is anything to take back is a
  // question about the SERVER, not about this page load — the fix arrives as
  // a reload, so by the time the page fits, this load never saw the problem
  // at all. The marker survives that reload; a variable would not.
  if (!fitBroken(fit)) {
    fitFixing = false;
    fitHandedAt = 0;
    const handed = !!ssGet('mpFitHanded');
    ssSet('mpFitHanded', '');
    if (handed) clearFitReport(fit);
  }
  renderLiveStatus();
  return fit;
}

// ── Fit report ──────────────────────────────────────────────────────────────
// A page that does not fit its sheets is the one error this shell can detect
// on its own, and it is not something the user can do anything about: the
// content and the layout are the MODEL's, so the fix is the model's too. But
// handing it over is still the user's call — an edit to their document is not
// something the page starts behind their back, and they may be mid-thought,
// mid-print, or about to change the content anyway. So the toolbar states the
// problem in red and puts a FIX button next to it: press it and the problem
// goes to the model over the live channel, the indicator starts pulsing, and
// when the model's `status done` reloads the page this pass re-measures a
// document that fits and the message goes away by itself. Nothing else clears
// it.
//
// The press does two things, and both are the user's to carry: it puts the
// problem on the record (where the model reads the details), and it copies
// `/print fix` to the clipboard — the ping itself, which travels the only
// channel that still exists: the user's own next message to their model. The
// toolbar then says exactly that, and nothing more. It does NOT start the
// indicator pulsing: the pulse belongs to the model alone (`status working`),
// so it never claims work that has not started.
//
// No dedupe, unlike the selection notice: nothing goes out unless a hand
// presses the button, so there is no loop to break. A problem the model could
// not fix leaves the button standing, to press again or to leave alone.

// Re-split and re-measure the document as it stands now. applySize is the
// whole fit pass (rewind to the authored flow, split, report), so the one
// runtime change that comes from outside it — a committed browser edit — gets
// there through this.
function refit() { applySize(currentPaper); }

// ── Clip detection ──────────────────────────────────────────────────────────
// document.css gives structural containers `overflow: clip`, so content that
// outgrows a fixed-size box is cut at its edge instead of painted over its
// neighbours — on paper, overlap is never right. But the cut is the lesser
// evil, not a fix: whatever is past the clip edge is simply absent from the
// printed sheet. So every fit pass hunts for it: each clipping container
// whose content exceeds its clip edge is marked data-mp-clipped (a red dashed
// outline in edit mode — chrome-host.css, gated like the selection's box —
// nothing at rest, nothing in print; the marker is
// runtime state, stripped by serializeForSave like the rest), and the count
// rides the same fit verdict as sheets that spilled, with the same red line,
// the same FIX button, and the same record for the model to read.
//
// Detection is geometric, not scrollHeight-based: getBoundingClientRect is
// layout truth regardless of clipping (clipping is paint-only), it works
// identically for `clip` and `hidden`, and it sidesteps engines that report
// a clipped element's scroll size as its client size. Each clipping
// container is judged against its OWN children — since nearly every
// container clips now, every clip boundary gets its own local check.

const CLIP_TOLERANCE = 1;    // px past the clip edge before it counts
const CLIP_REPORT_MAX = 8;   // addresses reported; the count is always full

// Every element inside the current sheets whose content exceeds its clip
// edge, marked in place. Runs inside the fit pass — after pagination, before
// scaleToFit — so every rect is in unscaled CSS px.
function detectClipped() {
  document.querySelectorAll('[data-mp-clipped]')
    .forEach((el) => el.removeAttribute('data-mp-clipped'));
  const clipped = [];
  for (const origin of originSheets()) {
    for (const sheet of sheetChain(origin)) {
      for (const el of sheet.querySelectorAll('*')) {
        // SVG viewports clip by UA design (that is what a viewBox is for) and
        // their internals aren't flowed content — never an overlap hazard.
        if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue;
        if (isClipped(el)) clipped.push(el);
      }
    }
  }
  clipped.forEach((el) => el.setAttribute('data-mp-clipped', ''));
  return clipped;
}

function isClipped(el) {
  const cs = getComputedStyle(el);
  const clipX = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
  const clipY = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
  if (!clipX && !clipY) return false;
  const kids = laidOutChildren(el);
  if (!kids.length) return false;
  const r = el.getBoundingClientRect();
  if (!(r.width || r.height)) return false;
  // The clip edge is the padding box — the border box minus the borders —
  // pushed out by overflow-clip-margin where the axis clips (hidden always
  // cuts at the padding box exactly; engines without the property parse to 0).
  const margin = parseFloat(cs.overflowClipMargin) || 0;
  const mx = (cs.overflowX === 'clip' ? margin : 0) + CLIP_TOLERANCE;
  const my = (cs.overflowY === 'clip' ? margin : 0) + CLIP_TOLERANCE;
  const left   = r.left   + parseFloat(cs.borderLeftWidth)   - mx;
  const right  = r.right  - parseFloat(cs.borderRightWidth)  + mx;
  const top    = r.top    + parseFloat(cs.borderTopWidth)    - my;
  const bottom = r.bottom - parseFloat(cs.borderBottomWidth) + my;
  for (const { node, box } of kids) {
    // A child's border box grows with its content vertically, but inline
    // content that cannot wrap (a long unbroken string) paints PAST the
    // child's own box. A non-clipping child's scroll size still counts that
    // overflow, so extend the measured box by it — its paint reaches there,
    // and paint is what the clip edge cuts.
    let bRight = box.right, bBottom = box.bottom;
    if (node.nodeType === 1) {
      const ncs = getComputedStyle(node);
      if (ncs.overflowX === 'visible') bRight += Math.max(0, node.scrollWidth - node.clientWidth);
      if (ncs.overflowY === 'visible') bBottom += Math.max(0, node.scrollHeight - node.clientHeight);
    }
    if (clipX && (box.left < left || bRight > right)) return true;
    if (clipY && (box.top < top || bBottom > bottom)) return true;
  }
  return false;
}

const FIX_COMMAND = '/print fix';   // what the press copies — the ping the user carries
let fitFixing = false;  // handed to the model this page load, no answer yet
let fitHandedAt = 0;    // when the press handed it over — see renderLiveStatus
let fitSending = false; // the press is in flight — don't send it twice
let fitMeasured = false; // the first pass has run — see reportFit
let brokenAt = 0;       // when the page became wrong, or 0 if it arrived so

// The page is wrong: it needed sheets its author did not lay out, content
// hangs past the paper edge, or content is cut off inside a clipping
// container.
function fitBroken(fit = window.mpFit) {
  return !!fit && (fit.rendered > fit.authored || fit.overflowing > 0 || fit.clipped > 0);
}

// The button needs a server to hand the problem to — and that is all it needs.
// Whether a model is listening is no longer knowable here, and it no longer
// matters: the problem is recorded, and the model reads the record when it
// next acts. A file:// page has nowhere to put it.
function fitFixable() { return location.protocol !== 'file:'; }

function fitProblemText({ authored, rendered, overflowing, clipped }) {
  const spilled = rendered > authored;
  if (overflowing && !spilled) return 'content overflows the sheet';
  if (spilled) return `content runs onto ${rendered} sheets`;
  return `content is cut off in ${clipped} place${clipped === 1 ? '' : 's'}`;
}

// Put FIX_COMMAND on the clipboard. Called inside a click either way, so the
// gesture-scoped clipboard permission applies; the execCommand fallback
// covers contexts where the async API is missing or refuses.
function copyFixCommand() {
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = FIX_COMMAND;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* out of options */ }
    ta.remove();
  };
  try { navigator.clipboard.writeText(FIX_COMMAND).catch(fallback); }
  catch { fallback(); }
}

// The FIX button's whole job: hand this page's fit problem to the model —
// the details onto the record, the ping onto the clipboard.
async function sendFitReport() {
  const fit = window.mpFit;
  if (fitSending || fitFixing || !fitBroken(fit) || !fitFixable()) return;
  // First, inside the click gesture, before any await can outlive it.
  copyFixCommand();
  fitSending = true;
  renderLiveStatus();
  try {
    const res = await fetch(liveUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'user',
        kind: 'fit',
        text: fitProblemText(fit),
        data: { ...fit, paper: currentPaper, orientation: currentOrientation },
      }),
    });
    if (!res.ok) throw new Error(String(res.status));
    fitFixing = true;
    fitHandedAt = Date.now();
    // Remembered across the reload the fix will cause, so the page knows there
    // is a report of its own to take back once it fits again.
    ssSet('mpFitHanded', '1');
  } catch {
    // Unreachable or refused: the button stays as it was, so the press can be
    // repeated rather than silently swallowed.
  }
  fitSending = false;
  renderLiveStatus();
}

// Take back a report the page has outgrown. Best effort and deliberately
// quiet: if it does not land, the next pass over a page that still fits will
// try again, and a model that reads a stale problem finds a document that
// does not have it.
function clearFitReport(fit) {
  if (location.protocol === 'file:') return;
  fetch(liveUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'user',
      kind: 'fit',
      text: 'fits',
      data: { ...fit, fits: true, paper: currentPaper, orientation: currentOrientation },
    }),
  }).catch(() => {});
}

// The user's half of the same news, in words: what is wrong with the page,
// and — in fitProblem() — why, at length, on hover. The toolbar's one status
// region draws it (renderLiveStatus); this is only the text.
function fitProblem({ authored, rendered, overflowing, clipped }) {
  if (overflowing) {
    return 'Some content is too tall for any sheet and hangs past the paper edge. ' +
      'It prints clipped — shorten it, or give it a sheet laid out for it.';
  }
  if (rendered > authored) {
    return `This page was authored as ${authored} sheet${authored === 1 ? '' : 's'} and its ` +
      `content needs ${rendered}. Nothing is lost — the extra sheets print — but the ` +
      'breaks fall where the content ran out of room rather than where they were designed.';
  }
  return `Content inside ${clipped} container${clipped === 1 ? '' : 's'} — outlined in red ` +
    'in edit mode — is bigger than the container and is cut off at its edge. What is past ' +
    'the edge will not print: shorten the content, or size the container for it.';
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
  scaleToFit(p.w);
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

// The element with an open contentEditable session, and the commit that ends
// it (flips contentEditable back off, persists a real change). Tracked here
// as well as on the element's own blur, because blur is NOT guaranteed to
// fire: double-clicking a NESTED element leaves focus on the ancestor editing
// host, so the ancestor never blurs — it would stay editable, with the
// browser's focus ring still drawn around it, beside the child the user
// actually just picked. One double-click has to mean one editable element and
// one outline, so the previous session is ended from here first.
let editingEl = null;
let finishEdit = null;

// Assigned by injectChrome() — the overlay is runtime-built chrome, so it
// does not exist yet when this script parses (a const lookup here would bind
// null and silently kill the hover boxes).
let overlay = null;

// The clipped element whose own dashed outline the hover box is standing in
// for — cleared with the box, so the outline comes back the moment the box
// leaves. See showHover.
let hoverClipEl = null;

function clearHover() {
  if (hoverBox) { hoverBox.remove(); hoverBox = null; }
  if (hoverClipEl) { hoverClipEl.removeAttribute('data-mp-clip-hover'); hoverClipEl = null; }
}

function showHover(el) {
  clearHover();
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return;
  hoverBox = document.createElement('div');
  hoverBox.className = 'mp-hover-box';
  // An element the fit pass marked as clipping its content is already wearing
  // a red dashed outline (chrome-host.css). Its hover box is not a second
  // rectangle saying a second thing: it IS that box — same red, dashed as
  // every hover is, with the label naming the problem instead of offering the
  // edit. The element's own outline steps aside while the box traces it
  // (data-mp-clip-hover), so there is one box on one element, always.
  const clipped = el.hasAttribute('data-mp-clipped');
  if (clipped) {
    hoverBox.classList.add('mp-hover-clipped');
    el.setAttribute('data-mp-clip-hover', '');
    hoverClipEl = el;
  }
  hoverBox.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
  const lbl = document.createElement('div');
  lbl.className = 'mp-hover-label';
  lbl.textContent = (ELEMENT_LABELS[el.tagName.toLowerCase()] || el.tagName) +
    (clipped ? ' — overflowing' : ' — double-click to edit');
  hoverBox.appendChild(lbl);
  overlay.appendChild(hoverBox);
}

// What a hover or a double-click landed on, or null when it is nothing this
// page offers to edit.
//
// The reach test is the SHEET CHAIN, never the page element alone. Content
// that outgrows its sheet continues onto sheets that are SIBLINGS of it (see
// makeContinuation), so `#page.contains()` is false for everything past sheet
// one — and asking the page instead of its chain is what used to leave edit
// mode dead on every document long enough to need a second sheet. A nested
// assembly is covered by the same test from the other side: its sheets, and
// their continuations, all live inside the container this returns.
function editableTarget(node) {
  const el = node && node.nodeType === 1 ? node : null;
  if (!el || !EDITABLE_TAGS.has(el.tagName.toLowerCase())) return null;
  const pg = getActivePage();
  if (!pg) return null;
  return sheetChain(pg).some(sheet => sheet.contains(el)) ? el : null;
}

function enableEditMode() {
  editMode = true;
  // Per tab, so the model's next edit — which reloads this tab out from under
  // the user — puts them back where they were instead of throwing them out of
  // edit mode mid-sentence. See restoreEditMode().
  ssSet('mpEditMode', '1');
  mpq('#mp-btn-edit').classList.add('active');
  const label = mpq('#mp-btn-edit-label');
  if (label) label.textContent = 'Stop Editing';
  // Both sides of the state again: the body class carries the edit cursor
  // (chrome-host.css), the host attribute reveals the toolbar's page-setup
  // controls (chrome.css).
  document.body.classList.add('edit-active');
  setChromeState('data-mp-edit-active', true);

  const onMove = (e) => {
    const el = editableTarget(e.target);
    if (!el) { clearHover(); return; }
    showHover(el);
  };
  const onDbl = (e) => {
    const el = editableTarget(e.target);
    if (!el) return;
    // Re-opening the element already being edited keeps its session — and the
    // pre-edit snapshot it holds, so the whole edit still counts as one.
    if (el === editingEl) { el.focus(); selectElement(el); return; }
    // Whatever else was being edited is done — including an ancestor of this
    // element, whose blur will never come (see finishEdit).
    finishEdit?.();
    const before = el.innerHTML;
    // The page as it stands when typing begins — the state undo returns to if
    // this session commits a real change. Captured here, not at commit: by
    // commit time the DOM already holds the typing.
    const histBefore = captureHistoryState();
    el.contentEditable = 'true';
    el.focus();
    // Double-click is also the selection gesture: it marks the element
    // (screen-only outline; serializeForSave strips the class) and records it
    // on the server, where the model reads it when a request needs a target.
    selectElement(el);
    const commit = () => {
      if (finishEdit !== commit) return;   // this session already ended
      editingEl = null;
      finishEdit = null;
      el.removeEventListener('blur', commit);
      el.contentEditable = 'false';
      // Committing an edit persists it — see the Save section. No-op commits
      // (focused but unchanged) skip the write so ETags only move on real
      // changes. The data-mp-edited marker rides the same PUT as the edit
      // itself, so file and DOM can never disagree about what the user
      // touched — it's how the model finds user edits in the saved file
      // (and it strips the markers it has addressed).
      if (el.innerHTML !== before) {
        pushHistory(histBefore);
        el.setAttribute('data-mp-edited', '');
        // Their text can outgrow the sheet it is on, and that is the same
        // failure as content that never fitted: re-split and re-measure, so
        // the toolbar says so and offers the same FIX button (reportFit).
        // AFTER the write lands, not beside it — the file the model goes and
        // reads, once they press it, has to be the one they just typed into.
        //
        // At commit, never while they type: the fit pass moves nodes between
        // sheets, which under a live caret would take the caret with it.
        savePage().finally(refit);
      }
    };
    editingEl = el;
    finishEdit = commit;
    el.addEventListener('blur', commit);
  };
  const onScroll = () => { clearHover(); };
  const onKey = (e) => {
    // Escape commits an in-progress text edit — see blurActiveEdit.
    if (e.key === 'Escape') { blurActiveEdit(); clearHover(); return; }
    // Ctrl/Cmd+Z undoes the last committed change; +Shift (or Ctrl+Y) redoes
    // it. Never from inside a text-editing session, where the browser's own
    // undo owns the keys — the page's history takes over only once the
    // session has committed.
    if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) {
      if (editingEl || document.activeElement?.isContentEditable) return;
      e.preventDefault();
      if (e.key.toLowerCase() === 'y' || e.shiftKey) redoEdit();
      else undoEdit();
      return;
    }
    // Delete (or Backspace — the key a Mac labels Delete) removes the
    // selected element — see deleteSelected. Never from inside a text-editing
    // session, where the same keys are how words come out: the element there
    // is a text field first, an object only after Escape ends the session.
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (editingEl || document.activeElement?.isContentEditable) return;
      if (e.target === chromeHost) return;   // focus is on a toolbar control
      if (!selectedEl?.isConnected) return;
      e.preventDefault();
      deleteSelected();
    }
  };
  // Selecting is pointing, and pointing ends when the hand moves away: a
  // click that lands off the selected element lets it go. Without this the
  // outline — and the toolbar's "selected" line — outlives the user's
  // interest, sitting on top of newer news like the fit error their own edit
  // just caused. Clicks on the chrome don't count (pressing FIX, or a toolbar
  // control, is not moving away — and the shadow boundary retargets those to
  // the host), and clicks inside the element — including the two a
  // double-click is made of — keep it.
  const onClick = (e) => {
    if (!selectedEl?.isConnected) return;
    if (e.target === chromeHost) return;
    const el = e.target instanceof Element ? e.target : null;
    if (el && el.closest('.mp-selected')) return;
    clearSelection();
  };

  document.addEventListener('mousemove', onMove, { passive: true });
  document.addEventListener('dblclick', onDbl);
  document.addEventListener('click', onClick);
  // Captured, because the sheets are not scrolled by the window: the canvas
  // is its own scroll region (.page-surround, chrome-host.css) and a scroll
  // event on an element does not bubble. Without the capture phase the hover
  // box — pinned to viewport coordinates — stays behind the moment the user
  // scrolls down toward sheet two.
  document.addEventListener('scroll', onScroll, { passive: true, capture: true });
  document.addEventListener('keydown', onKey);

  editListeners = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('dblclick', onDbl);
    document.removeEventListener('click', onClick);
    document.removeEventListener('scroll', onScroll, { capture: true });
    document.removeEventListener('keydown', onKey);
  };
}

// Ends an in-progress contentEditable session. Both Escape and leaving edit
// mode route through here — otherwise toggling Edit off would leave the
// last-edited element silently editable. The blur commits the session the
// normal way; finishEdit is the backstop for a session whose element is not
// the focused one (a nested double-click leaves focus on the ancestor), and a
// no-op once blur has already run it.
function blurActiveEdit() {
  if (document.activeElement?.isContentEditable) document.activeElement.blur();
  finishEdit?.();
}

function disableEditMode() {
  editMode = false;
  ssSet('mpEditMode', '');
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
//
// cleanClone() is that stripping alone, factored out because the save is not
// its only reader: undo/redo snapshots go through the same rewind, so a
// restored state is exactly a state the file could have held.
function cleanClone() {
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
  // Re-derived on every layout pass — the file never records a verdict the
  // next load will re-measure anyway (same rule as data-mp-overflow's absence).
  root.querySelectorAll('[data-mp-clipped]').forEach(el => el.removeAttribute('data-mp-clipped'));
  root.querySelectorAll('[data-mp-clip-hover]').forEach(el => el.removeAttribute('data-mp-clip-hover'));
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
  return root;
}

function serializeForSave() {
  return '<!DOCTYPE html>\n' + cleanClone().outerHTML;
}

// Saves run strictly one after another, each serializing the DOM as it stands
// when its turn comes. Two PUTs in flight at once would race their If-Match
// headers — the second still carries the ETag the first is about to replace,
// and its 412 would read as the model's edit and reload the tab. That was
// unreachable while only commits saved; undo can now follow a commit within
// the same click (see undoEdit), so the order is enforced here.
let saveQueue = Promise.resolve();

async function savePage() {
  if (location.protocol === 'file:') return;
  const turn = saveQueue.then(savePageNow);
  saveQueue = turn.catch(() => {});
  return turn;
}

async function savePageNow() {
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

// ── Undo / redo ─────────────────────────────────────────────────────────────
// A local history of the user's own committed changes — text edits and
// deletes — held in memory for this page load and nowhere else. Each entry is
// the authored body as cleanClone() writes it, captured BEFORE the change
// lands, so undoing restores exactly the state the file held (and a restore
// saves through the same PUT path, so the file follows the browser as ever).
//
// The model's edits are deliberately not history: they arrive as a reload
// (see Auto-reload), which clears these stacks — undo never silently rewinds
// work the user asked their model for, and the model's own record of the
// conversation is where that work is renegotiated.

const HISTORY_MAX = 50;
let undoStack = [];
let redoStack = [];

// The authored body, as the file would hold it. Body ATTRIBUTES are not part
// of the state: paper and orientation are fixed at generation time, and the
// rest (edit-active, data-mp-overflow) is runtime the restore re-derives.
function captureHistoryState() {
  return cleanClone().querySelector('body').innerHTML;
}

// A new change makes the undone future unreachable — same rule as every
// editor: the redo stack only survives while undo/redo are the only writers.
function pushHistory(state) {
  undoStack.push(state);
  if (undoStack.length > HISTORY_MAX) undoStack.shift();
  redoStack.length = 0;
  renderHistoryButtons();
}

function renderHistoryButtons() {
  const u = mpq('#mp-btn-undo');
  const r = mpq('#mp-btn-redo');
  if (u) u.disabled = !undoStack.length;
  if (r) r.disabled = !redoStack.length;
}

// Swap the page's content for a snapshot. The chrome lives on <html> outside
// the body, and the edit-mode listeners on document — both survive; what dies
// with the old body (hover box target, selection, an editing session) is
// cleared first. The snapshot carries no runtime sizing (cleanClone stripped
// it), so refit() runs before the save rather than after it: the sheets are
// back on screen at once, and the PUT serializes the same authored flow
// either way.
function restoreHistoryState(state) {
  finishEdit?.();
  clearHover();
  clearSelection();
  document.body.innerHTML = state;
  variantPages = Array.from(document.querySelectorAll('.variant-page'));
  variantTotal = variantPages.length;
  if (variantTotal) {
    // The snapshot remembers its own active variant; trust it, and fall back
    // to the nearest index only for a snapshot that somehow carries none.
    const act = variantPages.findIndex(el => el.classList.contains('active'));
    variantCurrent = act >= 0 ? act : Math.min(variantCurrent, variantTotal - 1);
    variantPages.forEach((el, i) => el.classList.toggle('active', i === variantCurrent));
    const lbl = mpq('#mp-variant-label');
    if (lbl) lbl.textContent = (variantCurrent + 1) + ' / ' + variantTotal;
  }
  refit();
  savePage();
}

// Both directions end an open editing session first: pressing Undo mid-typing
// means "take back what I just did", and the blur commits that typing — which
// pushes it — so the pop below takes back exactly that. The save queue keeps
// the commit's PUT and the restore's PUT in order.
function undoEdit() {
  blurActiveEdit();
  if (!undoStack.length) return;
  redoStack.push(captureHistoryState());
  restoreHistoryState(undoStack.pop());
  renderHistoryButtons();
}

function redoEdit() {
  blurActiveEdit();
  if (!redoStack.length) return;
  undoStack.push(captureHistoryState());
  restoreHistoryState(redoStack.pop());
  renderHistoryButtons();
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

// ── The toolbar's status region ─────────────────────────────────────────────
// One indicator, one message, and — when there is something to hand over — one
// button. Everything the chrome has to say about this page arrives here, and
// only one thing is ever said at a time.
//
//   THE INDICATOR belongs to the model, and to nothing else: it pulses while
//   the model says it is working (`status working`), and rests the moment it
//   is idle. Nothing on this page — not a press, not a problem — can make it
//   move, so a pulse always means exactly one thing. While it pulses the slot
//   says "Working…" too — the model mid-edit outranks everything, because it
//   is the one state where asking for more is premature.
//
//   THE MESSAGE is a slot, not a stack: whatever is most current replaces
//   what was there. At rest it is a standing invitation — "Ask your model for
//   any changes" — because that is the one instruction this page always
//   supports. A selection takes the slot; a page that BREAKS while the user
//   holds a selection takes it back, being newer news and the half they
//   cannot see for themselves.
//
// It deliberately does NOT claim a model is "connected". Nothing subscribes
// any more, so the page has no way to know whether one is listening. What it
// can promise is true whenever the server is up: the page's state is
// recorded, and the model reads it when the user next asks it for anything.
function renderLiveStatus() {
  const el = mpq('#mp-live-status');
  if (!el) return;
  const fit = window.mpFit;
  const broken = fitBroken(fit);
  const selected = !!selectedEl?.isConnected;
  const working = modelWorking();

  // What the slot says, one of: the model mid-edit, the selection, the
  // standing fit problem (with its button), the instruction a FIX press
  // leaves behind, or the invitation.
  //
  // The problem has two moments of news — when the page became wrong, and
  // when the user handed it over — and a selection older than the newer of
  // them yields the slot. The press moment matters as much as the break: a
  // press has to visibly leave its instruction behind, never bounce the line
  // back to a selection made before it (which read as the press doing
  // nothing at all). A selection made after either is newer news and takes
  // the slot, as ever — with one exception: selecting the red-boxed element
  // ITSELF is pointing at the problem, not at competing news, so the slot
  // keeps stating the error (FIX button and all) rather than announcing a
  // selection of the very thing the error is about.
  const selClipped = selected && selectedEl.hasAttribute('data-mp-clipped');
  const news = Math.max(brokenAt, fitHandedAt);
  const sel = !working && selected && !selClipped && !(broken && news > selectedAt);
  const err = !working && broken && !sel && !fitFixing;
  const handed = !working && broken && !sel && fitFixing;

  el.classList.toggle('mp-live-busy', working);
  el.classList.toggle('mp-live-selected', sel);
  el.classList.toggle('mp-live-error', err);

  el.title = sel
    ? 'This element is recorded — your model reads it when you ask for a change'
    : err
      ? fitProblem(fit) + (fitFixable()
          ? ' Press Fix to hand it to your model.'
          : ' Open this page through the local server to hand it over.')
      : handed
        ? fitProblem(fit) + ' Send /print fix to your model and it picks the problem up.'
        : working
          ? (workingNote || 'The model is editing this page')
          : '';

  // The button stands beside a problem nobody has taken yet, and nowhere
  // else: not once it has been handed over, and never next to the selection
  // MESSAGE, where "Fix" would read as an offer to fix the element the user
  // picked. (When the picked element is the red-boxed one, the slot states
  // the problem instead — and there the offer is exactly right.)
  // ...and never beside "Working…": mid-edit, a press would race the very fix
  // it asks for.
  const btn = mpq('#mp-fit-fix');
  if (btn) {
    btn.style.display = err ? 'inline-flex' : 'none';
    btn.disabled = fitSending || !fitFixable();
  }

  const label = mpq('#mp-live-status .mp-live-label');
  if (!label) return;
  label.textContent = '';

  if (working) { label.textContent = 'Working…'; return; }
  if (sel) {
    // One voice, in the selection's own colour — the element's name carries
    // the weight. "Sent" is a small promise kept at the next turn: the model
    // reads the record the moment the user asks it for anything.
    const name = document.createElement('span');
    name.className = 'mp-live-name';
    name.textContent = nameElement(selectedDesc);
    label.appendChild(name);
    label.appendChild(document.createTextNode(' selected & sent to model'));
    return;
  }
  if (err) { label.textContent = fitProblemText(fit); return; }
  if (handed) {
    // The press copied the command; the command is the ping. Rendered as a
    // command — mono, boxed — and pressable again, because a clipboard is
    // easily overwritten between here and the model's session.
    const cmd = document.createElement('button');
    cmd.type = 'button';
    cmd.className = 'mp-live-cmd';
    cmd.textContent = FIX_COMMAND;
    cmd.title = 'Copy again';
    cmd.addEventListener('click', copyFixCommand);
    label.appendChild(cmd);
    label.appendChild(document.createTextNode(' command copied. Paste and send to your model.'));
    return;
  }
  // At rest: the invitation. True whether or not a model is around right now,
  // which is exactly as much as this page can honestly claim.
  label.textContent = 'Ask your model for any changes';
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
  // The model has come back. Whatever it did, the hand-off is over: either
  // the reload below re-measures a page that fits and the message goes with
  // it, or the problem survived and the user should see the button back,
  // ready to press again.
  fitFixing = false;
  renderLiveStatus();
  // `done` means the file has reached its final state — don't wait out a tick
  // to show it.
  if (state === 'done') reloadIfChanged?.();
}

function initLiveChannel() {
  if (location.protocol === 'file:') return;
  const tick = async () => {
    try {
      // Only the model's status crosses this way now — selections go the
      // other direction, and nothing comes back about them.
      const res = await fetch(`${liveUrl()}?after=${liveCursor}`, { cache: 'no-store' });
      if (!res.ok) return;
      const body = await res.json();
      if (body.epoch !== toldEpoch) {
        // A server we have not spoken to: either the first poll of this tab's
        // life, or one that restarted under us. Its ids restart (so an old
        // cursor would deadlock) and it holds no selection — record ours
        // again. Claim the epoch first, so this runs once per server and not
        // once per tick.
        liveCursor = 0;
        toldEpoch = body.epoch;
        ssSet('mpToldEpoch', body.epoch);
        noticedSelector = null;
        noticeSelection();
        // A fit problem is NOT re-announced to a new server: nothing goes out
        // without a press, and the button is still on screen to press.
      }
      for (const m of body.messages) {
        liveCursor = Math.max(liveCursor, m.id);
        if (m.kind === 'status') applyStatus(m.data?.state, m.text, m.ts);
      }
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
// Double-clicking an element in edit mode selects it, and the server records
// it — that is what lets the model answer "make it bigger" without the user
// having to describe which thing they mean. Nothing is pushed and nobody is
// woken: the record sits there until the model reads it, which it does when a
// request needs a target.
//
// Debounced, because selecting is a hunt: clicking through four paragraphs to
// find the right one should write once, at the one they settled on. Deduped by
// selector, so a re-select (or a reload that restores it) is not a write at
// all — the server already holds it.

let selectedEl = null;
let selectedDesc = null;   // how to name it — see selectElement
let selectedAt = 0;        // when they picked it — see renderLiveStatus
let noticeTimer = null;
let noticedSelector = null;

// One element, however many pieces the split left it in. Picking the tail of
// a paragraph that runs onto the next sheet is picking that paragraph: both
// pieces wear the outline (they are one thing on the page, and one thing in
// the file), and what is REMEMBERED is the head — the piece the authored flow
// keeps, and so the only one certain to still be there after the next
// re-split. Remembering the shell instead would drop the selection, silently,
// the moment their own edit re-paginated the sheet they made it on.
function selectElement(el) {
  const head = splitHead(el);
  const marked = new Set([el, head]);
  document.querySelectorAll('.mp-selected').forEach(s => {
    if (!marked.has(s)) s.classList.remove('mp-selected');
  });
  marked.forEach(s => s.classList.add('mp-selected'));
  selectedEl = head;
  // Described once, here, rather than on every toolbar redraw: naming the
  // element means rewinding a clone of the document to its authored flow
  // (authoredPosition), far too much work to repeat on a 1.5s tick.
  selectedDesc = describeElement(authoredPosition(head).el);
  selectedAt = Date.now();
  ssSet('mpSelected', buildSelector(head));
  ssSet('mpSelectedTag', head.tagName.toLowerCase());
  renderLiveStatus();
  noticeSelection();
}

function clearSelection() {
  document.querySelectorAll('.mp-selected').forEach(s => {
    s.classList.remove('mp-selected');
    if (!s.classList.length) s.removeAttribute('class');
  });
  selectedEl = null;
  selectedDesc = null;
  selectedAt = 0;
  ssSet('mpSelected', '');
  ssSet('mpSelectedTag', '');
  renderLiveStatus();
  noticeSelection();
}

// Pressing Delete with an element selected takes it off the page — asked
// first, in the element's own name, because one keypress is a small gesture
// for removing something permanently. Only the keydown path (edit mode's
// onKey) gets here, and only outside a text-editing session.
function deleteSelected() {
  const el = selectedEl;
  if (!el?.isConnected) return;
  // The sheet is the paper everything stands on, not an element standing on
  // it — there is no document left on the other side of deleting it.
  if (el.id === 'page' || el.classList.contains('page') || el.classList.contains('variant-page')) return;
  if (!window.confirm(`Delete ${nameElement(selectedDesc)} from the page?`)) return;
  // The state undo returns to — captured once the user has said yes, so a
  // declined dialog leaves no history entry behind.
  const histBefore = captureHistoryState();
  // Every piece the split left goes together: what is selected is the head
  // (selectElement), and any tail shells on later sheets are pieces of the
  // same element — left behind, the next unpaginate() would merge their
  // content back into a flow the element is no longer part of.
  const gid = el.getAttribute('data-mp-split-src');
  if (gid) document.querySelectorAll(`[data-mp-split="${gid}"]`).forEach(s => s.remove());
  el.remove();
  pushHistory(histBefore);
  clearHover();
  clearSelection();
  // Same commit path as a text edit: persist first, then re-measure — the
  // freed room can pull content back off a continuation sheet.
  savePage().finally(refit);
}

/**
 * How to say which element this is, in the words the user already saw: the
 * same label the hover chip uses, plus the two things that tell one of a kind
 * from another.
 *
 * `index` is its place among its repeats — the third list item, the second
 * block — and is 0 when there are no repeats to disambiguate, because "Title
 * #1" is noise when there is only one title.
 *
 * MEASURE THIS ON THE AUTHORED ELEMENT (authoredPosition), never the live one.
 * The index has to count the same siblings selectorWithin's nth-of-type
 * counts, or the user reads "List item #3" while the model is handed
 * `li:nth-of-type(2)` — and on a document the shell has split across sheets,
 * those two are routinely different numbers.
 */
function describeElement(el) {
  const tag = el.tagName.toLowerCase();
  const sibs = Array.from(el.parentElement?.children || []).filter(c => c.tagName === el.tagName);
  return {
    label: ELEMENT_LABELS[tag] || tag,
    index: sibs.length > 1 ? sibs.indexOf(el) + 1 : 0,
    text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
  };
}

/** `Block #2 ("Divide beef…")` — the element, named the way the user sees it. */
function nameElement({ label, index, text }) {
  return `${label}${index ? ` #${index}` : ''}${text ? ` ("${clip(text, 24)}")` : ''}`;
}

// Enough of the text to recognise the element, cut at a word so it reads as
// words rather than as a truncated string.
function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[.,;:]$/, '') + '…';
}

// Captured fresh each time, so the snapshot carries whatever the user has just
// typed into the element — minus the runtime-only state, and whole: an element
// cut across two sheets is one element again here, because that is how the
// model will find it in the file.
function captureElement(target) {
  const { el, pg } = authoredPosition(target);
  const clone = el.cloneNode(true);
  clone.removeAttribute('contenteditable');
  clone.classList.remove('mp-selected');
  if (!clone.classList.length) clone.removeAttribute('class');
  return {
    selector: selectorWithin(el, pg),
    ...describeElement(el),
    snapshot: clone.outerHTML.slice(0, 2048),
    edited: el.hasAttribute('data-mp-edited'),
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

// The selector is an address in the FILE, and the file keeps the authored
// flow, never the runtime split (see paginate): a continuation sheet does not
// exist there, and a shell carrying the tail of a cut element is not an
// element there at all. Measured on the live DOM, an element on sheet two
// therefore gets an address the model cannot follow — or, worse, on a nested
// assembly, one that resolves in the file to a DIFFERENT authored sheet
// sitting at the same index.
//
// So the path is measured after a rewind, through the same unpaginate() the
// save writes through: what the model is told to look at is exactly what it
// finds. The rewind runs on a CLONE — the live DOM keeps its sheets, and the
// user keeps their caret.
const LOCATE_ATTR = 'data-mp-locate';

function buildSelector(target) {
  const { el, pg } = authoredPosition(target);
  return selectorWithin(el, pg);
}

// Where `target` sits in the authored flow, as an element/page pair. The pair
// is the live one whenever nothing was split — the common case, and no clone
// is taken for it.
function authoredPosition(target) {
  const el = splitHead(target);
  const pg = getActivePage();
  if (!pg || el === pg || !document.querySelector('[data-mp-continuation]')) return { el, pg };
  pg.setAttribute(LOCATE_ATTR, 'page');
  el.setAttribute(LOCATE_ATTR, 'target');
  try {
    const root = document.documentElement.cloneNode(true);
    unpaginate(root);
    const cel = root.querySelector(`[${LOCATE_ATTR}="target"]`);
    const cpg = root.querySelector(`[${LOCATE_ATTR}="page"]`);
    if (!cel || !cpg) return { el, pg };   // rewound out of existence — say what is on screen
    cel.removeAttribute(LOCATE_ATTR);
    cpg.removeAttribute(LOCATE_ATTR);
    return { el: cel, pg: cpg };
  } finally {
    // Both marks come off the live document before anything else can see it:
    // the clone above is synchronous, so no save, no print and no render ever
    // observes them.
    pg.removeAttribute(LOCATE_ATTR);
    el.removeAttribute(LOCATE_ATTR);
  }
}

// The element a continuation shell is a piece of. splitNode() repeats the tag
// onto each further sheet and ties the pieces together with a group id; only
// the head — the one piece the authored flow keeps — carries the -src half of
// that id, so it is the element the file, and the model, know.
function splitHead(el) {
  const gid = el.nodeType === 1 && el.getAttribute('data-mp-split');
  return (gid && document.querySelector(`[data-mp-split-src="${gid}"]`)) || el;
}

function selectorWithin(target, pg) {
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
    parts.unshift(pg?.classList.contains('variant-page') ? '.variant-page.active' : '#page');
  }
  return parts.join(' > ');
}

// A reload here is almost always the model's edit landing, which the user did
// not ask for and should barely notice. Leaving them outside edit mode is the
// most jarring way to fail that: the cursor changes, the controls vanish, and
// whatever they were pointing at stops being pointed at. So edit mode is a
// per-tab fact that survives the reload, exactly as it survived every reload
// before the chat panel (which used to carry this) was retired.
//
// Only the mode, not the editing session: an uncommitted text edit is already
// gone by the time the file changed underneath it (see Auto-reload), and
// re-opening an element for typing would steal focus the user did not ask to
// move.
function restoreEditMode() {
  if (ssGet('mpEditMode') === '1' && !editMode) enableEditMode();
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
  // A positional selector (`#page > p:nth-of-type(2)`) can still match after a
  // big rewrite while pointing at something else entirely. The tag is the
  // cheapest check that it is still the same KIND of thing — the text is not,
  // since changing it is usually the whole point of the edit. A mismatch is
  // treated as gone: better to let go than to hold the wrong element.
  const tag = ssGet('mpSelectedTag');
  if (el && tag && el.tagName.toLowerCase() !== tag) el = null;
  if (el) {
    selectedEl = el;
    selectedDesc = describeElement(authoredPosition(el).el);
    selectedAt = Date.now();
    el.classList.add('mp-selected');
    noticedSelector = sel;  // already recorded on this server — nothing to do
    renderLiveStatus();
    return;
  }
  noticedSelector = sel;    // ...so the deselect below reads as a change
  ssSet('mpSelected', '');
  ssSet('mpSelectedTag', '');
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

  // Undo / redo — history over the user's own committed changes (see the
  // Undo/redo section). Edit-mode controls: chrome.css reveals them with the
  // rest of the editing chrome, and renderHistoryButtons() keeps each
  // disabled while its stack is empty.
  const hsep = sep();
  hsep.id = 'mp-history-sep';
  toolbar.appendChild(hsep);
  const history = document.createElement('div');
  history.id = 'mp-history';
  const undoBtn = document.createElement('button');
  undoBtn.id = 'mp-btn-undo';
  undoBtn.className = 'mp-nav-btn';
  undoBtn.title = 'Undo (Ctrl+Z)';
  undoBtn.disabled = true;
  undoBtn.innerHTML =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';
  const redoBtn = document.createElement('button');
  redoBtn.id = 'mp-btn-redo';
  redoBtn.className = 'mp-nav-btn';
  redoBtn.title = 'Redo (Ctrl+Shift+Z)';
  redoBtn.disabled = true;
  redoBtn.innerHTML =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>';
  history.appendChild(undoBtn);
  history.appendChild(redoBtn);
  toolbar.appendChild(history);

  // No page-setup controls: paper size and orientation are confirmed with
  // the user before generation and fixed in the body's data attributes —
  // changing them afterwards means asking the model to regenerate.

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

  // The status region: indicator, message, and the FIX button that hands a fit
  // problem over. One element for all of it — see renderLiveStatus. It is last
  // in the toolbar, so the message growing and shrinking never moves a button
  // out from under the user's cursor, and the button is built once and hidden
  // rather than created on demand, so the indicator beside it never shifts.
  const live = document.createElement('div');
  live.id = 'mp-live-status';
  const dot = document.createElement('span');
  dot.className = 'mp-live-dot';
  const liveLabel = document.createElement('span');
  liveLabel.className = 'mp-live-label';
  const fitFix = document.createElement('button');
  fitFix.id = 'mp-fit-fix';
  fitFix.type = 'button';
  fitFix.textContent = 'Fix';
  fitFix.title = 'Hand this to the model to fix';
  fitFix.style.display = 'none';
  fitFix.addEventListener('click', sendFitReport);
  live.appendChild(dot);
  live.appendChild(liveLabel);
  live.appendChild(fitFix);
  toolbar.appendChild(live);

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
  mpq('#mp-btn-undo').addEventListener('click', undoEdit);
  mpq('#mp-btn-redo').addEventListener('click', redoEdit);

  // Before the page-shaped work below, which reads elements a malformed or
  // hand-written document may not have: whatever else this page breaks, the
  // tab must keep following the file, so the model's next edit can fix it
  // without the user having to reload by hand.
  initAutoReload();
  // Before the live channel opens: its first poll reconciles the selection
  // against the server's epoch, so the restored selection has to be in place
  // by then. Edit mode comes back first, because the selection belongs to it.
  restoreEditMode();
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
  // Paper size comes from the page's own body attributes and nowhere else:
  // it is confirmed with the user at generation time, so every standalone
  // page opens at its own configured paper. An embedding host can still
  // re-apply a choice of its own via applySize after load.
  // data-mp-paper may carry the legacy 'landscape' alias (applySize resolves
  // it); data-mp-orientation is the separate-axis form.
  const configured = document.body.dataset.mpPaper;
  const savedPaper = (PAPERS[configured] || configured === 'landscape') ? configured : 'letter';
  const configuredOrient = document.body.dataset.mpOrientation === 'landscape' ? 'landscape' : undefined;

  initVariants();
  applySize(savedPaper, configuredOrient);
  window.addEventListener('resize', () => scaleToFit(paperDims().w));
})();
