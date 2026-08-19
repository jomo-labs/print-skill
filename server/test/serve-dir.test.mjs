// The server's root is the PROJECT's out/ — but the shell a model drives the
// skill from carries its cwd between commands, so the process that starts the
// server routinely inherits a cwd from an earlier step (an `npm install` in
// <skill-dir>/server, most of all). A bare `node server.mjs`, or a relative
// `--dir out`, then resolved against the skill: healthy server, wrong tree,
// every page a 404 with nothing on screen to explain it.
//
// resolveServeDir() is what stops that, and these are the cases it has to get
// right: name the project root and mean its out/, name the skill and be told
// so, name nothing that exists and be told that too.
//
//   node --test server/test/serve-dir.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveServeDir } from "../server.mjs";

const SERVER_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SKILL_DIR = path.resolve(SERVER_DIR, "..");

async function project() {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "print-skill-root-")));
  await fs.mkdir(path.join(dir, "out"));
  await fs.writeFile(path.join(dir, "out", "page.html"), "<html></html>");
  return dir;
}

test("no --dir: the project's out/ is found from its cwd", async () => {
  const dir = await project();
  assert.equal(resolveServeDir(null, dir).root, path.join(dir, "out"));
});

test("--dir naming the project root still serves its out/", async () => {
  const dir = await project();
  assert.equal(resolveServeDir(dir, dir).root, path.join(dir, "out"));
  assert.equal(resolveServeDir(".", dir).root, path.join(dir, "out"));
});

test("--dir naming the out/ itself is taken as given", async () => {
  const dir = await project();
  const out = path.join(dir, "out");
  assert.equal(resolveServeDir(out, dir).root, out);
  // Relative to the cwd it was typed from, not to anything else.
  assert.equal(resolveServeDir("out", dir).root, out);
});

test("a directory holding pages of its own is served as-is", async () => {
  const dir = await project();
  await fs.writeFile(path.join(dir, "loose.html"), "<html></html>");
  assert.equal(resolveServeDir(null, dir).root, dir);
});

test("a cwd inherited from the skill is refused, not served", async () => {
  for (const cwd of [SERVER_DIR, SKILL_DIR, path.join(SKILL_DIR, "assets")]) {
    assert.throws(() => resolveServeDir(null, cwd), /inside the print skill itself/);
  }
  // The same mistake with a relative flag: "out" under the skill, not a project's.
  assert.throws(() => resolveServeDir("out", SERVER_DIR), /inside the print skill itself/);
});

test("the skill's own out/ is a project like any other", async () => {
  const out = path.join(SKILL_DIR, "out");
  await fs.mkdir(out, { recursive: true });
  try {
    assert.equal(resolveServeDir(out, SKILL_DIR).root, out);
    assert.equal(resolveServeDir(null, SKILL_DIR).root, out);
  } finally {
    await fs.rm(out, { recursive: true, force: true });
  }
});

test("a root that does not exist is refused rather than served empty", async () => {
  const dir = await project();
  assert.throws(() => resolveServeDir(path.join(dir, "nope"), dir), /no such directory/);
});
