// serve-cli.mjs collapses Step 7's reuse / start sequence into one command.
// The contract: it serves <cwd>/out by default (never the cwd's own stray html
// files), reuses an existing server for the same directory instead of starting
// a duplicate, and the server it starts outlives the command.
//
// The hard case, and the reason serve-cli picks the port itself rather than
// asking server.mjs to walk 4949-4958: a machine whose whole legacy range is
// held — by other projects, or by servers left behind when their temp trees
// were deleted — must still get a working URL in one call. Reuse then cannot
// key on a fixed range either, since the port came from the OS, so the
// second-call tests below are what pin the registry that replaces it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "serve-cli.mjs");
const execFileP = promisify(execFile);
const LEGACY = Array.from({ length: 10 }, (_, i) => 4949 + i);
// serve-cli keeps its registry under os.tmpdir(), which honours TMPDIR — so
// every CLI this file spawns gets a throwaway TMPDIR of its own. Without that,
// these tests read and write the developer's REAL registry: shared with prior
// runs, with other test files in a parallel suite, and with the developer's
// own live servers. That shared state made the range-exhaustion test flake,
// and the unwritable-registry test chmod'd the real directory read-only —
// which a crash mid-test would have left that way.
const ISOLATED_TMP = mkdtempSync(path.join(tmpdir(), "serve-cli-tmp-"));
process.on("exit", () => rmSync(ISOLATED_TMP, { recursive: true, force: true }));
const ENV = { ...process.env, TMPDIR: ISOLATED_TMP };
const run = (bin, args, opts = {}) => execFileP(bin, args, { ...opts, env: ENV });
const REGISTRY = path.join(ISOLATED_TMP, "print-skill-servers");

async function project(prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  await fs.mkdir(path.join(dir, "out"));
  await fs.writeFile(path.join(dir, "out", "page.html"),
    "<!DOCTYPE html><html><head></head><body><div class='page' id='page'></div></body></html>");
  return dir;
}

// The servers under test are detached by design, so nothing here holds a
// handle on them; the command line they were started with is the only handle.
// It carries the REALPATH of the served root — on macOS tmpdir() is a symlink,
// so a pattern built from the path mkdtemp handed back matches nothing and the
// server leaks. Every stranded print-skill server on a dev machine got there
// this way, so realpath first, and take the pattern from a path that still
// exists (a test that deletes its tree must stop its server before it does).
async function stopServersFor(dir) {
  let real = dir;
  try { real = await fs.realpath(dir); } catch { /* already deleted; try as given */ }
  try { execSync(`pkill -f "server.mjs --dir ${real}" || true`); } catch { /* none left */ }
}

const firstLine = (stdout) => stdout.split("\n")[0].trim();
const portOf = (url) => Number(url.split(":")[2]);

// The registry file name is just the port, and PREFERRED_PORT (4949) is
// free between isolated test runs often enough that consecutive runs land
// on the very same file name — so a "new file appeared" check keyed on the
// name misses an update to a file that was already there from a previous
// run. Keyed on content instead: `dir` is the exact --dir this test passed,
// unique to this mkdtemp'd project every time, so a match can only be the
// record this invocation itself just wrote. `dir` must already be the
// REALPATH — serve-cli computes it from the spawned server's own
// process.cwd(), which (like fs.realpath, and unlike the mkdtemp path a
// test starts from) resolves the tmpdir() symlink on macOS, so a raw
// mkdtemp path never matches.
async function findRecordFor(realDir) {
  const names = await fs.readdir(REGISTRY).catch(() => []);
  for (const name of names) {
    try {
      const rec = JSON.parse(await fs.readFile(path.join(REGISTRY, name), "utf-8"));
      if (rec.dir === realDir) return name;
    } catch { /* mid-write or already gone; the next poll tries again */ }
  }
  return null;
}

test("serves out/ by default, reuses on the second call, survives exit", async (t) => {
  const dir = await project("serve-");
  // a stray channel file in cwd must NOT become the served root
  await fs.writeFile(path.join(dir, "content.html"), "<p>channel scratch</p>");

  const first = await run(process.execPath, [CLI], { cwd: dir });
  const url = firstLine(first.stdout);
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.ok(first.stdout.includes(path.join(dir, "out")), "served root is out/");
  t.after(async () => {
    await stopServersFor(dir);
    rmSync(dir, { recursive: true, force: true });
  });

  // the server outlives the CLI process
  const health = await fetch(`${url}/healthz`).then((r) => r.json());
  assert.equal(health.name, "print-skill-server");
  assert.ok((await fetch(`${url}/page.html`)).ok, "page served");

  // The health route is the only thing that identifies one of these servers,
  // and the traces show it being guessed three different ways. --help is where
  // it is documented, so --help and the live route are asserted together.
  const help = await run(process.execPath, [CLI, "--help"]);
  assert.ok(help.stdout.includes("GET /healthz"),
    "--help does not name the health route the server answers on");
  assert.ok(help.stdout.includes(`"name":"${health.name}"`),
    "--help's health-route example no longer matches what the route returns");

  // second invocation reuses rather than starting a second server
  const second = await run(process.execPath, [CLI], { cwd: dir });
  assert.equal(firstLine(second.stdout), url, "same URL on reuse");
});

test("binds outside 4949-4958 when the whole range is held, and finds it again",
  async (t) => {
    const dir = await project("serve-full-");
    // Hold whatever the machine is not already holding, so the range is full
    // at the moment serve-cli runs whether or not orphans are present.
    const held = [];
    for (const p of LEGACY) {
      // Destroys whatever connects: serve-cli's own probes (and survey()'s
      // retry) connect to every held port, and a bare net.createServer()
      // with no connection handler still accepts each one — leaving a
      // socket nothing ever closes. server.close() then waits forever for
      // it, hanging this test's own cleanup below. The short delay (rather
      // than destroying inline, synchronously, in the 'connection' handler)
      // avoids resolving every one of the ten probes on the same tick, which
      // was observed to starve serve-cli's own top-level await of the event
      // loop turn it needed and exit it early (code 13).
      const s = net.createServer((socket) => setTimeout(() => socket.destroy(), 20));
      const bound = await new Promise((r) => {
        s.once("error", () => r(false));
        s.listen(p, "127.0.0.1", () => r(true));
      });
      if (bound) held.push(s);
    }
    t.after(async () => {
      for (const s of held) await new Promise((r) => s.close(r));
      await stopServersFor(dir);
      rmSync(dir, { recursive: true, force: true });
    });

    const first = await run(process.execPath, [CLI], { cwd: dir });
    const url = firstLine(first.stdout);
    const port = portOf(url);
    assert.ok(!LEGACY.includes(port), `bound ${port}, which the range test held`);
    assert.ok((await fetch(`${url}/page.html`)).ok, "page served from the chosen port");

    // Reuse has to survive the port being one nothing could have guessed.
    const second = await run(process.execPath, [CLI], { cwd: dir });
    assert.equal(firstLine(second.stdout), url,
      "an OS-assigned port is rediscovered rather than duplicated");
  });

test("an unwritable registry still serves, warns on stderr, and stays inside the legacy range",
  async (t) => {
    const dir = await project("serve-noreg-");
    await fs.mkdir(REGISTRY, { recursive: true });
    const originalMode = (await fs.stat(REGISTRY)).mode & 0o777;
    t.after(async () => {
      await fs.chmod(REGISTRY, originalMode);
      await stopServersFor(dir);
      rmSync(dir, { recursive: true, force: true });
    });
    // Read + execute only: the directory itself can still be listed and its
    // existing entries read, but no new file can be created in it — the
    // exact shape of "registry unwritable" this fix has to survive.
    await fs.chmod(REGISTRY, 0o555);

    const first = await run(process.execPath, [CLI], { cwd: dir });
    const url = firstLine(first.stdout);
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/, "did not produce a working URL");
    assert.match(first.stderr, /registry/i, "no mention of the registry problem on stderr");
    assert.match(first.stderr, /not writable|could not write|not recorded|cannot be recorded/i,
      `stderr does not explain the registry write failure: ${first.stderr}`);
    assert.ok((await fetch(`${url}/healthz`)).ok, "server did not actually come up");
    // An OS-assigned port here would be unfindable by any later invocation
    // forever, since nothing could record it — that is the unbounded-orphan
    // bug this fix removes. Staying inside the legacy range instead means a
    // plain probe can still find it with no registry at all.
    assert.ok(LEGACY.includes(portOf(url)),
      `port ${portOf(url)} landed outside the legacy range while unregistered — unfindable`);
  });

test("the registry record exists while serve-cli is still waiting on health, not only after",
  async (t) => {
    const dir = await project("serve-early-");
    const realOutDir = await fs.realpath(path.join(dir, "out"));
    t.after(async () => {
      await stopServersFor(dir);
      rmSync(dir, { recursive: true, force: true });
    });
    await fs.mkdir(REGISTRY, { recursive: true });

    const pending = run(process.execPath, [CLI], { cwd: dir });
    let seenBeforeExit = false;
    let cliDone = false;
    pending.then(() => { cliDone = true; });
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !cliDone) {
      if (await findRecordFor(realOutDir)) { seenBeforeExit = true; break; }
      await new Promise((r) => setTimeout(r, 5));
    }
    const { stdout } = await pending;
    assert.ok(seenBeforeExit,
      "no registry record appeared before serve-cli finished — it is being written only on success");
    assert.match(firstLine(stdout), /^http:\/\/127\.0\.0\.1:\d+$/);
  });

test("a start that never becomes healthy leaves no registry record behind", async (t) => {
  // server.mjs itself is out of scope for this file, so the failure is
  // forced structurally instead of by timeout: once serve-cli's OWN record
  // for the server it just spawned appears (written immediately after
  // spawn(), before health is even polled — see the previous test), its
  // directory check has already passed and the grandchild is booting, so
  // deleting the served tree out from under it right then is not a guess
  // about timing. The grandchild's OWN startup re-validates --dir itself,
  // finds nothing there, and exits fast — never binding a port, never
  // answering healthy — well inside the record's appearance and the
  // grandchild reaching that check (importing server.mjs alone takes on the
  // order of a quarter second, measured separately).
  const dir = await project("serve-fail-");
  const outDir = path.join(dir, "out");
  const realOutDir = await fs.realpath(outDir);
  t.after(async () => {
    await stopServersFor(dir);
    rmSync(dir, { recursive: true, force: true });
  });
  await fs.mkdir(REGISTRY, { recursive: true });

  const pending = run(process.execPath, [CLI], { cwd: dir });
  const deadline = Date.now() + 5000;
  let spawnedRecord = null;
  while (Date.now() < deadline && !spawnedRecord) {
    spawnedRecord = await findRecordFor(realOutDir);
    if (!spawnedRecord) await new Promise((r) => setTimeout(r, 5));
  }
  assert.ok(spawnedRecord, "serve-cli never spawned a server to pull the tree out from under");
  rmSync(outDir, { recursive: true, force: true });

  await assert.rejects(pending,
    (e) => /did not come up/.test(e.stderr),
    "serve-cli did not fail once its target directory vanished mid-start");
  const after = await fs.readdir(REGISTRY).catch(() => []);
  assert.ok(!after.includes(spawnedRecord),
    `the record for the start that never came up (${spawnedRecord}) was left behind`);
});

test("a healthy server on another existing directory is left alone", async (t) => {
  const theirs = await project("serve-theirs-");
  const mine = await project("serve-mine-");
  t.after(async () => {
    for (const d of [theirs, mine]) {
      await stopServersFor(d);
      rmSync(d, { recursive: true, force: true });
    }
  });

  const theirUrl = firstLine((await run(process.execPath, [CLI], { cwd: theirs })).stdout);
  const myUrl = firstLine((await run(process.execPath, [CLI], { cwd: mine })).stdout);
  assert.notEqual(myUrl, theirUrl, "the neighbour's server was reused for another tree");

  const real = (d) => fs.realpath(path.join(d, "out"));
  const served = async (u) => fs.realpath((await fetch(`${u}/healthz`).then((r) => r.json())).dir);
  assert.equal(await served(myUrl), await real(mine));
  assert.equal(await served(theirUrl), await real(theirs),
    "the neighbour is still up and still serving its own tree");
});

test("a server whose directory is gone is reported on stderr, not killed", async (t) => {
  const doomed = await project("serve-doomed-");
  const orphanUrl = firstLine((await run(process.execPath, [CLI], { cwd: doomed })).stdout);
  const orphanPort = portOf(orphanUrl);
  const mine = await project("serve-after-");
  // Resolved before the tree goes, or there is nothing left to resolve against.
  const doomedReal = await fs.realpath(doomed);
  t.after(async () => {
    for (const d of [doomedReal, mine]) await stopServersFor(d);
    rmSync(mine, { recursive: true, force: true });
  });
  rmSync(doomed, { recursive: true, force: true });

  const started = await run(process.execPath, [CLI], { cwd: mine });
  assert.match(started.stderr, new RegExp(`no action needed[^\\n]*\\b${orphanPort}\\b`),
    `stderr does not name the orphan on ${orphanPort}: ${started.stderr}`);
  // Reclaiming a port means killing someone else's process; this command never
  // does that on its own, and routing around the orphan is why it need not.
  const still = await fetch(`${orphanUrl}/healthz`).then((r) => r.json());
  assert.equal(still.name, "print-skill-server", "the orphan was killed rather than reported");
  assert.notEqual(firstLine(started.stdout), orphanUrl, "the orphan's port was reused");
});

test("refuses a root inside the skill install", async () => {
  await assert.rejects(
    run(process.execPath, [CLI, "--dir", path.join(HERE, "..")]),
    (e) => /refusing to serve/.test(e.stderr),
  );
});
