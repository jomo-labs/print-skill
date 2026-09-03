#!/usr/bin/env node
// The Part B self-check from references/design-rules.md, run by machine.
//
// Why this exists: every item in that checklist is a text-pattern test over
// CSS the model just wrote, and the model was running them by hand — dozens of
// shell greps per page — while still shipping violations. Machine execution is
// cheaper AND strictly more correct. It also reports EVERY violation in one
// pass, with the offending declaration and its line, so a single fix round
// closes all of them; the prose used to prescribe re-running the whole
// checklist after each edit, which is a fix-pass multiplier and nothing else.
//
// THE INPUT CONTRACT — the load-bearing detail. This lints the AUTHORED
// channels (custom_css, content_html's inline `style` attributes, font_import)
// and never an assembled page. assets/shell/document.css is inlined into every
// assembled page and legitimately carries a 48px blurred shadow (the viewer's
// sheet chrome), `background: white !important` (the paper lock) and a
// radial-gradient (the halftone utility) — all things the shell is allowed and
// the author is not. A linter pointed at the output would fail 100% of builds.
// findSheetEdgeBorders() in lib.mjs holds the same contract; the token check,
// which deliberately scans the whole document, is the opposite case and not the
// precedent here.
//
// Item 8 (font_import) is reported as a WARNING, not a violation: the rule's
// own remedy is to drop the import and fall back to the preloaded trio, and
// assemble-cli already does exactly that. Failing the build instead would cost
// a full re-author for a page that assembles correctly without it.
//
// Usage:
//   node lint-cli.mjs [--css <overrides.css>] [--content <content.html>]
//                     [--font-import <url>] [--help]
// Exit: 0 clean · 1 violations · 2 bad usage
import { promises as fs } from "node:fs";
import path from "node:path";
import { isGoogleFontsUrl, takeValue } from "./lib.mjs";

const USAGE = `usage: node lint-cli.mjs [--css <overrides.css>] [--content <content.html>]
                         [--font-import <url>] [--help]

Runs the Part B checks from references/design-rules.md over the AUTHORED
channels. Never point it at an assembled page: the shell's own stylesheet
breaks half of these by design.

  --css <file>         the authored custom_css channel. Optional — a page with
                       no custom_css lints clean.
  --content <file>     the authored content_html channel; its inline style=""
                       attributes are linted under the same rules (item 7).
  --font-import <url>  the authored font_import channel (item 8).
  --help               print this and exit 0.

Every violation is reported in one pass with its line and the offending
declaration, so one fix round closes all of them.
Exit: 0 clean · 1 violations · 2 bad usage`;

const argv = process.argv.slice(2);
if (argv.includes("--help")) {
  console.log(USAGE);
  process.exit(0);
}
const cssArg = takeValue(argv, "--css", undefined);
const contentArg = takeValue(argv, "--content", undefined);
const fontImport = takeValue(argv, "--font-import", undefined);
if (argv.length || (cssArg === undefined && contentArg === undefined && fontImport === undefined)) {
  if (argv.length) console.error(`lint-cli: unrecognized argument(s): ${argv.join(" ")}`);
  console.error(USAGE);
  process.exit(2);
}

const readOrDie = async (p, what) => {
  try {
    return await fs.readFile(path.resolve(p), "utf-8");
  } catch {
    console.error(`lint-cli: cannot read ${what}: ${p}`);
    process.exit(2);
  }
};

const css = cssArg === undefined ? "" : await readOrDie(cssArg, "--css");
const content = contentArg === undefined ? "" : await readOrDie(contentArg, "--content");

// ── Findings ───────────────────────────────────────────────────────────────

const violations = [];
const warnings = [];
/** One violation. `item` is the Part B item number; `where` is "file:line". */
const flag = (item, rule, where, snippet, why) =>
  violations.push({ item, rule, where, snippet, why });

const clip = (s, n = 120) => {
  const one = String(s).replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};
const lineOf = (text, index) => text.slice(0, Math.max(0, index)).split("\n").length;

// ── CSS shredding ──────────────────────────────────────────────────────────
// Comments are blanked rather than removed so every index still maps to the
// original text and reported line numbers are the author's own.
const blankComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

// Flat rule scan, same shape as findSheetEdgeBorders: `[^{}]` cannot cross a
// brace, so a nested at-rule's prelude is skipped and its inner rules are
// matched on their own — which is what we want, since @media print { .x { … } }
// is still `.x` being styled.
function* rulesOf(text) {
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    yield {
      selectors: m[1].trim().replace(/\s+/g, " "),
      decls: m[2],
      declsAt: m.index + m[1].length + 1,
    };
  }
}

function* declsOf(block, base) {
  for (const m of block.matchAll(/([-A-Za-z][-A-Za-z0-9_]*)\s*:\s*([^;}]*)/g)) {
    const prop = m[1].trim().toLowerCase();
    const value = m[2].trim();
    if (!value) continue;
    yield { prop, value, at: base + m.index };
  }
}

/** Split a value on its top-level commas — shadow layers, font stacks. */
function splitLayers(value) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

/** Every selector's subject, the way findSheetEdgeBorders reads one. */
const subjectsOf = (selectors) =>
  selectors.split(",").map((sel) => {
    const last = sel.trim().split(/[\s>+~]+/).pop() || "";
    return last.replace(/::?[A-Za-z-]+(\([^)]*\))?/g, "");
  });

const isRootRule = (selectors) =>
  selectors.split(",").every((sel) => /^:root\b/i.test(sel.trim()));

const subjectTags = (selectors) =>
  subjectsOf(selectors).map((s) => (s.match(/^[A-Za-z][A-Za-z0-9]*/) || [""])[0].toLowerCase());

// ── Item 1 and 2: raw text, before any parsing ─────────────────────────────
// These run on the ORIGINAL text, comments included: a `</style>` inside a
// comment closes the tag just as well as one outside it.
const RAW_CHECKS = [
  { item: 1, rule: "no markup breakout", re: /<[A-Za-z/]/g,
    why: "`<` followed by a letter or `/` can close the page's <style> tag" },
  { item: 1, rule: "no remote loads", re: /@import/gi,
    why: "fonts are the font_import channel's job; nothing else may load a remote resource" },
  { item: 1, rule: "no remote loads", re: /url\s*\(/gi,
    why: "url() loads a remote or embedded resource; the only sanctioned load is font_import" },
  { item: 2, rule: "no backslashes", re: /\\/g,
    why: "CSS escapes smuggle banned constructs past a text check (`@\\69mport` is `@import`) " +
         "and authored CSS never needs them" },
];

function rawScan(text, source, offset = 0, base = "") {
  for (const { item, rule, re, why } of RAW_CHECKS) {
    const hits = [...text.matchAll(re)];
    if (!hits.length) continue;
    const line = lineOf(base || text, (base ? offset : 0) + hits[0].index);
    const more = hits.length > 1 ? ` (${hits.length} occurrences)` : "";
    flag(item, rule, `${source}:${line}`, `${clip(hits[0][0])}${more}`, why);
  }
}

// ── Item 4: the background allowlist ───────────────────────────────────────
const BACKGROUND_OK = new Set([
  "var(--color-ink)", "var(--color-paper)", "var(--color-pull-bg)",
  "transparent", "none", "inherit",
]);
const squash = (v) => v.toLowerCase().replace(/\s+/g, "");

// ── Item 6: literal colors ─────────────────────────────────────────────────
const NAMED_COLORS = new Set((
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue " +
  "blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk " +
  "crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki " +
  "darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen " +
  "darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue " +
  "dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite " +
  "gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki " +
  "lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
  "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen " +
  "lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen " +
  "magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen " +
  "mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream " +
  "mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid " +
  "palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum " +
  "powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown " +
  "seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen " +
  "steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen"
).split(" "));
const COLOR_FN = /\b(rgba?|hsla?|hwb|oklch|oklab|lab|lch|color|color-mix)\s*\(/gi;
// Font stacks name families, not colors, and a family called Salmon or Gold is
// a real risk of a false positive; hex and color functions are still caught.
const NAMES_EXEMPT = /^(--)?font(-|$)|^content$/;

function literalColors(prop, value) {
  const bare = value
    .replace(/"[^"]*"|'[^']*'/g, " ")            // family names, content strings
    .replace(/var\(\s*--[A-Za-z0-9_-]+/g, "var("); // token NAMES are not values
  const found = [];
  for (const m of bare.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)) found.push(m[0]);
  for (const m of bare.matchAll(COLOR_FN)) found.push(`${m[1]}()`);
  if (!NAMES_EXEMPT.test(prop)) {
    for (const m of bare.matchAll(/\b[A-Za-z][A-Za-z]{2,19}\b/g)) {
      if (NAMED_COLORS.has(m[0].toLowerCase())) found.push(m[0]);
    }
  }
  return [...new Set(found)];
}

// ── Item 5: the blur radius of every shadow layer ──────────────────────────
const LENGTH = /-?(?:\d+\.?\d*|\.\d+)(?:px|pt|pc|in|cm|mm|q|em|rem|ex|ch|vw|vh|vmin|vmax|%)?/gi;
function blurRadius(layer) {
  // Drop function calls (var(), rgb(), calc()) so only bare lengths remain.
  let bare = layer;
  for (let i = 0; i < 4; i++) bare = bare.replace(/[A-Za-z-]+\([^()]*\)/g, " ");
  const lengths = bare.match(LENGTH) || [];
  return lengths.length >= 3 ? lengths[2] : null;
}

// ── Item 9: display leading needs its own clearance ────────────────────────
const isDisplayLeading = (value) => {
  const v = value.trim().toLowerCase();
  if (v.includes("var(--leading-display)")) return true;
  if (/^\d*\.?\d+$/.test(v)) return parseFloat(v) < 1.2;        // unitless
  if (/^\d*\.?\d+(em|rem)$/.test(v)) return parseFloat(v) < 1.2;
  if (/^\d*\.?\d+%$/.test(v)) return parseFloat(v) < 120;
  return false; // px, normal, an unknown var() — not judgeable from the text
};
const PADDING_PROPS = /^padding(-block(-start|-end)?|-top|-bottom)?$/;
/** The block-axis parts of a padding declaration, or [] if it sets none. */
const blockPadding = (prop, value) => {
  const parts = value.trim().split(/\s+/);
  if (prop === "padding") return [parts[0], parts[2] ?? parts[0]];
  if (prop === "padding-block") return [parts[0], parts[1] ?? parts[0]];
  return [parts[0]];
};
const isZeroLength = (v) => /^-?0*\.?0*(px|pt|pc|in|cm|mm|q|em|rem|ex|ch|%)?$/i.test(String(v || ""));

// ── The block walker: items 3-6 (and 9 for stylesheet rules) ───────────────
function lintBlock({ decls, base, text, source, selectors, isRoot, inline }) {
  const at = (i) => `${source}:${lineOf(text, i)}`;
  const seen = [];
  for (const { prop, value, at: i } of declsOf(decls, base)) {
    const where = at(i);
    const snippet = clip(`${prop}: ${value}`);
    seen.push({ prop, value, where, snippet });

    // 3. Paper stays white.
    if (prop === "--color-paper" && !/^(white|#fff|#ffffff)$/i.test(value.trim())) {
      flag(3, "paper stays white", where, snippet,
        "--color-paper may only be white, #fff or #ffffff — best is not to override it");
    }

    // 4. Backgrounds from the allowlist only.
    if (prop === "background" || prop === "background-color") {
      if (!BACKGROUND_OK.has(squash(value))) {
        flag(4, "backgrounds from the allowlist only", where, snippet,
          "the whole value must be exactly one of var(--color-ink), var(--color-paper), " +
          "var(--color-pull-bg), transparent, none, inherit — no !important, no shorthand; " +
          "use .invert / .tint, a border or a print-flat shadow to carry color");
      }
    }
    if (prop === "background-image" && squash(value) !== "none") {
      flag(4, "backgrounds from the allowlist only", where, snippet,
        "background-image must be none — a gradient prints as muddy dithered ink; " +
        "draw pictorial artwork as inline stroked SVG instead");
    }
    if (/^(filter|backdrop-filter|mix-blend-mode)$/.test(prop)) {
      flag(4, "no filter, backdrop-filter or mix-blend-mode", where, snippet,
        `${prop} is banned outright; the one sanctioned use is defining --image-filter ` +
        "inside :root");
    }
    if (prop === "--image-filter" && !isRoot) {
      flag(4, "no filter, backdrop-filter or mix-blend-mode", where, snippet,
        "--image-filter may only be defined inside :root");
    }
    if (prop === "box-shadow" && /\binset\b/i.test(value)) {
      flag(4, "no inset shadow", where, snippet,
        "an inset shadow is a disguised full-element fill — use an outer print-flat " +
        "shadow or a border");
    }

    // 5. Shadows are print-flat.
    if (prop === "box-shadow" || prop === "text-shadow") {
      for (const layer of splitLayers(value)) {
        const blur = blurRadius(layer);
        if (blur !== null && parseFloat(blur) !== 0) {
          flag(5, "shadows are print-flat", where, snippet,
            `the layer \`${clip(layer, 60)}\` has a ${blur} blur radius — the third length ` +
            "must be 0 or absent (`8px 8px 0 var(--color-accent)` is the shape that prints)");
        }
      }
    }

    // 6. No literal colors outside :root.
    if (!isRoot) {
      const literals = literalColors(prop, value);
      if (literals.length) {
        flag(6, "no literal colors outside :root", where, snippet,
          `${literals.join(", ")} — outside a :root token block every color goes through a ` +
          "var(--color-*) token, white included (transparent and currentColor are fine)");
      }
    }
  }

  if (inline) return;

  // 9. Display type keeps its own clearance. Rule-scoped, as the item is
  // written: the padding has to sit on the same element the tight leading
  // does. h1/h2 already carry it from the element defaults, so a rule whose
  // subject is one of those is exempt from needing it — but not from the
  // "never zero it" half below.
  const tags = subjectTags(selectors);
  const headings = tags.length > 0 && tags.every((t) => t === "h1" || t === "h2");
  const leading = seen.find((d) => d.prop === "line-height" && isDisplayLeading(d.value));
  const padded = seen.some(
    (d) => PADDING_PROPS.test(d.prop) && blockPadding(d.prop, d.value).some((p) => !isZeroLength(p)),
  );
  if (leading && !padded && !headings) {
    flag(9, "display type keeps its clearance", leading.where, `${selectors} { ${leading.snippet} }`,
      "an element set to display leading also needs `padding-block: var(--display-overhang)` — " +
      "the ink hangs outside its box and the container around it clips at its edge");
  }
  if (!tags.some((t) => t === "h1" || t === "h2")) return;
  for (const d of seen) {
    if (!PADDING_PROPS.test(d.prop)) continue;
    if (blockPadding(d.prop, d.value).every((p) => isZeroLength(p))) {
      flag(9, "display type keeps its clearance", d.where, `${selectors} { ${d.snippet} }`,
        "h1/h2 carry their clearance as padding-block — zeroing it prints the descenders " +
        "sheared. Zeroing the *margin* is what you want here");
    }
  }
}

// ── Run: the stylesheet ────────────────────────────────────────────────────
const cssSource = cssArg ? path.basename(cssArg) : "custom_css";
if (css.trim()) {
  rawScan(css, cssSource);
  const shredded = blankComments(css);
  for (const { selectors, decls, declsAt } of rulesOf(shredded)) {
    lintBlock({
      decls, base: declsAt, text: css, source: cssSource, selectors,
      isRoot: isRootRule(selectors), inline: false,
    });
  }
}

// ── Run: inline style attributes in the content (item 7) ───────────────────
const contentSource = contentArg ? path.basename(contentArg) : "content_html";
for (const m of content.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
  const value = m[1] !== undefined ? m[1] : m[2];
  if (!value.trim()) continue;
  const at = m.index + m[0].indexOf(value);
  rawScan(value, contentSource, at, content);
  lintBlock({
    decls: value, base: at, text: content, source: contentSource,
    selectors: "inline style", isRoot: false, inline: true,
  });
}

// ── Run: font_import (item 8 — a warning, see the header note) ─────────────
if (fontImport !== undefined && !isGoogleFontsUrl(fontImport)) {
  warnings.push(
    `item 8: font_import is not a plain https://fonts.googleapis.com/ URL and will be ` +
    `dropped — pick a font from the preloaded trio (Playfair Display, Source Serif 4, ` +
    `Inter) or fix the URL: ${clip(fontImport, 90)}`);
}

// ── Report ─────────────────────────────────────────────────────────────────
for (const w of warnings) console.error(`warning: ${w}`);

if (!violations.length) {
  console.log("css lint: ok");
  process.exit(0);
}

// One pass, sorted the way the author reads the file, so a single round of
// edits closes every finding.
violations.sort((a, b) => a.where.localeCompare(b.where, undefined, { numeric: true }) ||
                          a.item - b.item);
console.error(`css lint FAILED: ${violations.length} violation${violations.length === 1 ? "" : "s"} ` +
  "(references/design-rules.md Part B)");
for (const { item, rule, where, snippet, why } of violations) {
  console.error(`  - ${where} · item ${item}, ${rule}`);
  console.error(`      ${snippet}`);
  console.error(`      ${why}`);
}
console.error(
  "Fix all of the above in one pass — they are every violation there is. If the CSS still " +
  "fails after two passes, degrade per Part C: drop custom_css and font_import, keep the " +
  "content, and say so in your report.");
process.exit(1);
