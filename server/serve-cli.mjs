#!/usr/bin/env node
// One-command serve: Step 7's probe / reuse / start sequence as a single
// invocation. Probes ports 4949–4958 for a print-skill server already serving
// this project's directory and reuses it; otherwise starts one detached (the
// server outlives this command) and reports the URL it bound.
//
// Usage: node serve-cli.mjs [--dir <pages-dir>] [--help]
//   --dir defaults to <cwd>/out (resolved exactly as server.mjs resolves it).
// Prints the base URL on stdout. Exit 0 with a server up; 1 otherwise.
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveServeDir } from "./server.mjs";
import { takeValue, realOrSelf } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

const USAGE = `usage: node serve-cli.mjs [--dir <pages-dir>] [--help]

Serves the generated pages over loopback and prints the base URL on stdout.
Reuses a print-skill server already serving the same directory on ports
4949-4958; otherwise starts one detached, so it outlives this command.

  --dir <pages-dir>  directory of pages to serve. Give it as an ABSOLUTE
                     path. Default: <cwd>/out. A root inside the skill
                     directory is refused.
  --help             print this and exit 0.

Health route: GET /healthz -> {"name":"print-skill-server","dir":...}.
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
const target = realOrSelf(root);

const PORTS = Array.from({ length: 10 }, (_, i) => 4949 + i);
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
async function findOurs() {
  const results = await Promise.all(PORTS.map(async (p) => ({ p, h: await probe(p) })));
  const hit = results.find((r) => r.h && realOrSelf(r.h.dir) === target);
  return hit ? hit.p : null;
}

let port = await findOurs();
if (port === null) {
  // Detached with ignored stdio: the server must outlive this command, and a
  // pipe to an exited parent would EPIPE the server's own logging later.
  const child = spawn(process.execPath,
    [path.join(HERE, "server.mjs"), "--dir", root, "--port", "4949", "--auto-port"],
    { detached: true, stdio: "ignore" });
  child.unref();
  const deadline = Date.now() + 8000;
  while (port === null && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    port = await findOurs();
  }
  if (port === null) {
    console.error(
      "serve-cli: server did not come up within 8s — run it in the foreground to see why:\n" +
      `  node ${path.join(HERE, "server.mjs")} --dir ${root} --port 4949 --auto-port`);
    process.exit(1);
  }
}
console.log(`http://127.0.0.1:${port}`);
console.log(`serving ${root}`);
