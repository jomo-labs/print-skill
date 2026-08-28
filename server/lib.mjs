// Small pieces shared across the server and its CLIs. Nothing here knows
// about HTTP, pages, or Playwright — it is the one home for helpers that were
// otherwise copy-pasted per entry point.
import { realpathSync } from "node:fs";

/** Filesystem-safe name from a page title; "printable" when nothing survives. */
export function slugify(title) {
  return (
    String(title || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "printable"
  );
}

/**
 * Consume a boolean `--flag` from argv (mutating it). Returns true when the
 * flag was present, undefined otherwise — so callers can distinguish "given"
 * from "absent" the way the old per-CLI copies did.
 */
export function takeFlag(argv, name) {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  argv.splice(i, 1);
  return true;
}

/**
 * Consume a `--flag value` pair from argv (mutating it). Returns the value,
 * or `fallback` when the flag is absent or dangling at the end.
 */
export function takeValue(argv, name, fallback) {
  const i = argv.indexOf(name);
  if (i === -1 || i === argv.length - 1) return fallback;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
}

/**
 * Custom-property references in `html` that nothing in `html` defines.
 *
 * An undefined `var(--x)` is not an error the browser reports: the whole
 * declaration becomes invalid at computed-value time, so a margin or gap
 * silently collapses to 0 and the page renders subtly broken. Models writing
 * custom css guess token names (the spacing scale is non-contiguous, so
 * `--space-7` is a natural wrong guess between `--space-6` and `--space-8`),
 * which makes this worth failing at assembly rather than trusting the eye.
 *
 * A reference with a fallback (`var(--x, 4px)`) resolves by definition and is
 * not flagged. Returns [{ name, count, suggestion }] sorted by name;
 * `suggestion` lists the nearest defined tokens sharing the name's stem
 * (e.g. `--space-6, --space-8` for `--space-7`), or "" when none match.
 */
export function findUndefinedTokenRefs(html) {
  const defined = new Set(
    [...html.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1]),
  );
  const counts = new Map();
  for (const [, name, next] of html.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*([),])/g)) {
    if (next === ",") continue; // carries a fallback — resolves regardless
    if (!defined.has(name)) counts.set(name, (counts.get(name) || 0) + 1);
  }
  const suggest = (name) => {
    const m = name.match(/^(.*?)(\d+)$/);
    if (!m) return "";
    const [, stem, numStr] = m;
    const num = parseInt(numStr, 10);
    const peers = [...defined]
      .map((d) => {
        const dm = d.match(/^(.*?)(\d+)$/);
        return dm && dm[1] === stem ? parseInt(dm[2], 10) : null;
      })
      .filter((n) => n !== null)
      .sort((a, b) => a - b);
    if (!peers.length) return "";
    const below = peers.filter((n) => n < num).pop();
    const above = peers.find((n) => n > num);
    return [below, above]
      .filter((n) => n !== undefined)
      .map((n) => `${stem}${n}`)
      .join(", ");
  };
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => ({ name, count, suggestion: suggest(name) }));
}

/**
 * realpath, or the path unchanged when it doesn't exist yet — the caller's
 * own existence check reports that. Paths are compared realpath-to-realpath
 * because a skill is commonly reached through a symlink
 * (.claude/skills/print -> the repo) while Node realpaths import.meta.url.
 */
export function realOrSelf(p) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}
