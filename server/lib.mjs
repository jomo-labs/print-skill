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
