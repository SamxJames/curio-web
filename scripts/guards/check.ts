// Walks app/, components/ and lib/ and applies scripts/guards/rules.ts.
//   npm run guard            -> prints violations, exit 1 if any
//   npm run guard -- --hook  -> Claude Code Stop-hook mode: reads the hook JSON
//                               on stdin, exits 2 (stderr fed back to Claude)
//                               on violations, never loops (stop_hook_active).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { formatViolations, scanSource, type Violation } from "./rules";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "lib"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".claude"]);

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walk(path.join(dir, e.name));
    } else if (/\.tsx?$/.test(e.name)) {
      yield path.join(dir, e.name);
    }
  }
}

function scanRepo(): Violation[] {
  const out: Violation[] = [];
  for (const d of SCAN_DIRS) {
    for (const f of walk(path.join(ROOT, d))) {
      out.push(...scanSource(path.relative(ROOT, f), readFileSync(f, "utf8")));
    }
  }
  return out;
}

async function readStdin(): Promise<string> {
  let s = "";
  for await (const c of process.stdin) s += c;
  return s;
}

async function main() {
  const hook = process.argv.includes("--hook");
  if (hook) {
    try {
      if (JSON.parse((await readStdin()) || "{}").stop_hook_active) return;
    } catch {
      // unreadable hook payload: fall through and just run the check
    }
  }
  const vs = scanRepo();
  if (vs.length === 0) {
    if (!hook) console.log("guard: ok");
    return;
  }
  const msg = `guard: ${vs.length} violation(s)\n${formatViolations(vs)}`;
  if (hook) {
    console.error(msg);
    process.exit(2);
  }
  console.error(msg);
  process.exit(1);
}

main();
