#!/usr/bin/env node
// One-command serve: Step 7's reuse / start sequence as a single invocation.
// Reuses a print-skill server already serving this project's directory;
// otherwise picks a free port from the OS itself and starts one detached (the
// server outlives this command), then reports the URL it bound.
//
// The port is chosen HERE, not by the server: a detached child with ignored
// stdio has no way to report back what it bound, so the parent has to already
// know. Binding :0, reading the port and closing the listener leaves a tiny
// window in which someone else can take it — that is what the retry loop at
// the foot of this file is for, and why failing on the first EADDRINUSE would
// be wrong.
//
// Reuse across runs therefore cannot be a fixed port range: a server started
// last week is on whatever port the OS handed out. Every server this command
// starts leaves a record in REGISTRY keyed by port, so a later run can find it
// wherever it landed. The legacy 4949-4958 range is still probed alongside
// those records, so servers started by hand or by older builds are reused too.
//
// A server that lands outside 4949-4958 is findable ONLY through its
// registry record — unlike the old fixed-range design, an unwritable
// registry here does not degrade gracefully, it makes the server permanently
// unfindable and every later run starts another one just as unfindable
// (unbounded orphans, worse than the ten-port cap this replaced). So when the
// registry cannot be written, spawning below deliberately keeps trying ports
// inside the legacy range instead of taking whatever the OS offers, and says
// so on stderr — a bounded, probeable fallback beats a silent unbounded one.
//
// Usage: node serve-cli.mjs [--dir <pages-dir>] [--help]
//   --dir defaults to <cwd>/out (resolved exactly as server.mjs resolves it).
// Prints the base URL on stdout. Exit 0 with a server up; 1 otherwise.
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveServeDir } from "./server.mjs";
import { takeValue, realOrSelf } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

// Servers this command has started, one JSON file per port. tmpdir is the
// right lifetime: both these records and the servers they describe die at
// reboot, so a cleared tmpdir cannot strand a record for a live server.
const REGISTRY = path.join(os.tmpdir(), "print-skill-servers");
// Tried first so a machine running one project keeps the familiar URL; any
// failure falls straight through to an OS-assigned port.
const PREFERRED_PORT = 4949;
// Probed for reuse alongside the registry — servers from older builds, and
// hand-started ones, still live in here.
const LEGACY_PORTS = Array.from({ length: 10 }, (_, i) => 4949 + i);
const START_TIMEOUT_MS = 8000;
const START_ATTEMPTS = 3;
// Past this, a record whose port answers nothing is dropped even if its pid
// still resolves — pids are recycled, and a pinned record never expires.
const MAX_RECORD_AGE_MS = 12 * 60 * 60 * 1000;

const USAGE = `usage: node serve-cli.mjs [--dir <pages-dir>] [--help]

Serves the generated pages over loopback and prints the base URL on stdout.
Reuses a print-skill server already serving the same directory, on whatever
port it bound; otherwise takes a free port from the OS and starts one
detached, so it outlives this command. Read the URL it prints — it is not a
fixed port.

  --dir <pages-dir>  directory of pages to serve. Give it as an ABSOLUTE
                     path. Default: <cwd>/out. A root inside the skill
                     directory is refused.
  --help             print this and exit 0.

Health route: GET /healthz -> {"ok":true,"name":"print-skill-server","dir":...}.
That "dir" is how reuse is decided, and how a server left behind by a deleted
project is spotted; such servers are reported on stderr, never killed.
Startup gets ${START_TIMEOUT_MS / 1000}s per attempt, ${START_ATTEMPTS} attempts if a chosen port is raced.
Exit: 0 with a server up and its URL printed; 1 otherwise.`;

if (args.includes("--help")) {
  console.log(USAGE);
  process.exit(0);
}
// Default is explicitly <cwd>/out — the assembly output directory — rather
// than resolveServeDir's cwd heuristic: authoring leaves channel files
// (content.html and friends) in the working directory, and a heuristic that
// looks for "any .html here" would serve those instead of the pages.
const dirFlag = takeValue(args, "--dir", null) ?? path.join(process.cwd(), "out");

let root;
try {
  ({ root } = resolveServeDir(dirFlag));
} catch (err) {
  console.error(`serve-cli: ${err.message}`);
  process.exit(1);
}
// Symlink-resolved, so a project reached through a symlinked path reuses the
// server started from its real one rather than starting a second.
const target = realOrSelf(root);

async function probe(port, timeoutMs = 500) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body && body.name === "print-skill-server" ? body : null;
  } catch {
    return null;
  }
}

function records() {
  let names;
  try {
    names = fs.readdirSync(REGISTRY);
  } catch {
    return []; // no registry yet — first run on this machine
  }
  const out = [];
  for (const name of names) {
    const file = path.join(REGISTRY, name);
    const port = Number(path.basename(name, ".json"));
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
    try {
      const rec = JSON.parse(fs.readFileSync(file, "utf-8"));
      const started = Date.parse(rec.started);
      out.push({
        port,
        pid: rec.pid ?? null,
        target: rec.target ?? null,
        stale: !(Number.isFinite(started) && Date.now() - started < MAX_RECORD_AGE_MS),
        file,
      });
    } catch {
      forget(file); // unparseable record would otherwise stay forever
    }
  }
  return out;
}

// Logged at most once per run: a broken registry produces one failed
// remember() per spawn attempt (and again on a legacy-probe reuse), and
// repeating the same explanation for each would just be noise.
let warnedRegistryFailure = false;

// Returns whether the write actually landed. A caller that ignores this
// return value is the exact bug this fix removes: a port outside
// 4949-4958 that fails to register can never be found again by anything,
// so the failure has to be visible and has to change what happens next
// (see registryIsWritable below), not just get swallowed.
function remember(port, pid) {
  try {
    fs.mkdirSync(REGISTRY, { recursive: true });
    fs.writeFileSync(path.join(REGISTRY, `${port}.json`),
      JSON.stringify({ dir: root, target, pid, started: new Date().toISOString() }));
    return true;
  } catch (err) {
    if (!warnedRegistryFailure) {
      console.error(
        `serve-cli: could not write the server registry (${REGISTRY}): ${err.message}\n` +
        `  The server on port ${port} was NOT recorded. Unless that port is inside ` +
        `4949-4958, no later invocation can ever find it again by probing — check ` +
        `it's cleaned up manually if it's no longer wanted, and fix permissions on ` +
        `the registry directory to restore normal reuse.`);
      warnedRegistryFailure = true;
    }
    return false;
  }
}

// Checked once, before choosing a port to spawn on: a broken registry means
// only a legacy-range port can be found by a later run, so the candidate
// selection below has to stay inside that range rather than accept whatever
// the OS hands back from claimPort(0).
function registryIsWritable() {
  try {
    fs.mkdirSync(REGISTRY, { recursive: true });
    const probeFile = path.join(REGISTRY, `.write-test-${process.pid}`);
    fs.writeFileSync(probeFile, "");
    fs.rmSync(probeFile, { force: true });
    return true;
  } catch {
    return false;
  }
}

function forget(file) {
  try { fs.rmSync(file, { force: true }); } catch { /* raced with another run */ }
}

function forgetPort(port) {
  forget(path.join(REGISTRY, `${port}.json`));
}

// Signal 0 tests for existence without delivering anything. EPERM means the
// pid exists and belongs to someone else — alive either way.
function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

// One failed probe is not enough to call a port dead: a live server that is
// briefly slow (GC pause, a heavy request) can miss a single 500ms probe,
// and pruning its record on that alone spawns a duplicate on a new port
// while the original quietly holds its own forever — the orphan-accumulation
// bug this rewrite exists to remove. Require a second, backed-off failure
// before treating the port as silent.
async function probeForSurvey(port) {
  const first = await probe(port);
  if (first) return first;
  await new Promise((r) => setTimeout(r, 200));
  return probe(port);
}

// Probes every port worth knowing about — registry records first, then the
// legacy range — and prunes records whose process is provably gone.
async function survey() {
  const all = records();
  const ports = [...new Set([...all.map((r) => r.port), ...LEGACY_PORTS])];
  const health = new Map(await Promise.all(ports.map(async (p) => [p, await probeForSurvey(p)])));
  // A record for a port nothing answers on (after retrying) is useless. Keep
  // it only while its process is provably alive and the record is young —
  // that covers a server still booting, without letting a recycled pid pin a
  // record forever.
  const known = all.filter((rec) => {
    if (health.get(rec.port) || (alive(rec.pid) && !rec.stale)) return true;
    console.error(
      `serve-cli: forgetting the registry record for port ${rec.port} — it did not ` +
      `answer after retrying${rec.stale ? " and the record was already stale" : ""}. ` +
      `If that server is actually alive, this run will start a duplicate.`);
    forget(rec.file);
    return false;
  });
  return { health, known };
}

function findOurs(health) {
  for (const [port, h] of health) {
    if (h && realOrSelf(h.dir) === target) return port;
  }
  return null;
}

// A server whose served tree has been deleted still holds its port. Report it
// so a human can reclaim it, but never kill it and never make it matter: this
// command routes around held ports, so the note needs no action at all.
function orphanNote(health) {
  const gone = [...health].filter(([, h]) => h && !fs.existsSync(h.dir)).map(([p]) => p);
  if (gone.length === 0) return null;
  return `serve-cli: note (no action needed) — print-skill server(s) from earlier ` +
    `runs still hold port ${gone.join(", ")} and serve directories that no longer ` +
    `exist. This server took a port of its own. Reclaim one only if you want it ` +
    `back: kill $(lsof -ti tcp:<port>)`;
}

// Bind, read what we got, release. `preferred` may be 0 for "any free port".
// Returns null when that port is taken, which is a fallback signal, not error.
function claimPort(preferred) {
  return new Promise((resolve) => {
    const probeSocket = net.createServer();
    probeSocket.once("error", () => resolve(null));
    probeSocket.listen(preferred, "127.0.0.1", () => {
      const { port } = probeSocket.address();
      probeSocket.close(() => resolve(port));
    });
  });
}

// Detached with ignored stdio: the server must outlive this command, and a
// pipe to an exited parent would EPIPE the server's own logging later. The
// exit handler is what makes a lost port race cheap — the child dies on
// EADDRINUSE in milliseconds, so we retry instead of waiting out the timeout.
// The error handler matters for the same reason: without it, a spawn failure
// (e.g. the node binary itself unreachable) is an uncaught exception instead
// of feeding back into that same retry path.
async function startOn(port) {
  const child = spawn(process.execPath,
    [path.join(HERE, "server.mjs"), "--dir", root, "--port", String(port)],
    { detached: true, stdio: "ignore" });
  child.unref();
  let done = false;
  child.once("exit", () => { done = true; });
  child.once("error", () => { done = true; });

  // Recorded now, before the health wait — not after it succeeds. Once
  // spawned, this process holds the port whether or not it ever answers
  // healthy; if serve-cli is interrupted (or simply times out) during the
  // wait below, a record written only on success would leave a live,
  // port-holding server with nothing that could ever find or reap it. The
  // registry's own prune rule (see survey()) already reclaims a record for a
  // server that never comes up, so recording early costs nothing on failure.
  remember(port, child.pid);

  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    const h = await probe(port);
    if (h && realOrSelf(h.dir) === target) return child.pid;
    if (done) break;
  }
  // Never came up (or failed to spawn at all): drop the record so nothing
  // treats it as reusable, and take the process down if it's still running —
  // it could bind later and confuse a future run otherwise.
  forgetPort(port);
  try { child.kill(); } catch { /* already gone, or never started */ }
  return null;
}

const { health, known } = await survey();
let port = findOurs(health);

if (port === null) {
  const note = orphanNote(health);
  if (note) console.error(note);

  // A server that lands outside 4949-4958 can only ever be found again
  // through its registry record (see remember()). When the registry cannot
  // be written, stay inside that legacy range instead — a probe can still
  // find those without any record at all — rather than accept an
  // OS-assigned port that would be unfindable and hence permanently orphaned.
  const canRegister = registryIsWritable();
  if (!canRegister) {
    console.error(
      `serve-cli: the server registry (${REGISTRY}) is not writable — ` +
      `staying inside the legacy 4949-4958 port range so this server can ` +
      `still be found by probing, since it cannot be recorded.`);
  }
  const legacyFallback = LEGACY_PORTS.filter((p) => p !== PREFERRED_PORT);

  let lastPort = null;
  for (let attempt = 0; attempt < START_ATTEMPTS && port === null; attempt++) {
    // Only the first attempt asks for 4949; after a race, take what we're
    // given — unless the registry is broken, in which case later attempts
    // keep working through the rest of the legacy range rather than accept
    // whatever unbounded, unrecordable port the OS offers next.
    let candidate = attempt === 0 ? await claimPort(PREFERRED_PORT) : null;
    while (candidate === null && !canRegister && legacyFallback.length > 0) {
      candidate = await claimPort(legacyFallback.shift());
    }
    candidate ??= await claimPort(0);
    if (candidate === null) continue;
    lastPort = candidate;
    const pid = await startOn(candidate);
    if (pid !== null) port = candidate; // startOn() already recorded it
  }
  if (port === null) {
    console.error(
      `serve-cli: server did not come up within ${START_TIMEOUT_MS / 1000}s ` +
      `(${START_ATTEMPTS} attempts) — run it in the foreground to see why:\n` +
      `  node ${path.join(HERE, "server.mjs")} --dir ${root} --port ${lastPort ?? PREFERRED_PORT}`);
    process.exit(1);
  }
} else if (!known.some((rec) => rec.port === port && rec.target === target)) {
  // Reused a server the registry did not know about — found through the legacy
  // probe, or started before this build. Record it so the next run finds it
  // wherever it sits. No pid: we did not start it, and a guessed one would only
  // hold the record open after the server is gone.
  remember(port, null);
}
console.log(`http://127.0.0.1:${port}`);
console.log(`serving ${root}`);
