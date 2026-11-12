// Source guards for rules that used to live only in AGENTS.md prose.
// Pure functions: check.ts walks the repo, tests call these directly.
//
// 1. design-token: no arbitrary Tailwind type/colour values (text-[13px],
//    tracking-[0.1em], bg-[#fff]); use the @theme tokens in app/globals.css.
// 2. raw-control: no hand-rolled <button>/<input>/<textarea>/<select> outside
//    components/ui/.
// 3. backlog-copy: "archive, never backlog" — no streak / "you missed" /
//    unseen-count copy in anything a reader can see.

export type RuleId = "design-token" | "raw-control" | "backlog-copy";

export interface Violation {
  rule: RuleId;
  file: string; // repo-relative, forward slashes
  line: number;
  match: string;
  fix: string;
}

// Deliberate exceptions, named in AGENTS.md and docs/design-system.md.
const UI_EXEMPT = [
  /^app\/admin\//,
  /^components\/AdminDashboard\.tsx$/,
  /^components\/dig\/DigFunnelTable\.tsx$/,
];

// Not reader-facing: tests, the content corpus, and files whose job is to
// state or enforce the banned phrases.
const COPY_EXEMPT = [
  ...UI_EXEMPT,
  /\.test\.tsx?$/,
  /^app\/api\//,
  /^lib\/words\.ts$/,
  /^lib\/dig\/copyAudit\.ts$/,
  /^lib\/languages\/draftPrompt\.ts$/,
];

// Phrases that state the principle rather than break it.
const COPY_ALLOW = [/no backlog to catch up on/gi];

const ARBITRARY_TOKEN =
  /(?<![\w-])(?:(?:text|tracking|leading)-\[[^\]\s]+\]|(?:bg|border|fill|stroke|ring|outline|decoration)-\[(?:#|rgb|hsl)[^\]\s]*\])/g;

const RAW_CONTROL = /<(button|input|textarea|select)(?=[\s>/]|$)/g;

const BACKLOG: RegExp[] = [
  /\byou(?:'ve|’ve| have)? missed\b/gi,
  /\bstreaks?\b/gi,
  /\bunread\b/gi,
  /\bunplayed\b/gi,
  /\bcatch(?:ing)? up\b/gi,
  /\bin a row\b/gi,
  /\bdon['’]t (?:miss|break)\b/gi,
  /\b(?:haven['’]t|have not) (?:seen|read|played)\b/gi,
  /\bleft to (?:read|see|play|discover)\b/gi,
  /\bof 1,?147\b/gi,
  /\b\d[\d,]* of \d[\d,]* (?:words|stories|digs|days)\b/gi,
  /\b\d+ ?% (?:complete|done|finished)\b/gi,
];

const norm = (p: string) => p.replace(/\\/g, "/");
const matchesAny = (file: string, res: RegExp[]) => res.some((r) => r.test(file));

/** Drop comments so a rule can be *explained* in code without tripping. */
function stripComments(line: string, inBlock: boolean): [string, boolean] {
  let out = "";
  let i = 0;
  let block = inBlock;
  while (i < line.length) {
    if (block) {
      const end = line.indexOf("*/", i);
      if (end === -1) return [out, true];
      i = end + 2;
      block = false;
    } else if (line.startsWith("/*", i)) {
      block = true;
      i += 2;
    } else if (line.startsWith("//", i) && (i === 0 || /\s/.test(line[i - 1]!))) {
      break;
    } else {
      out += line[i++];
    }
  }
  return [out, block];
}

export function scanSource(rawFile: string, text: string): Violation[] {
  const file = norm(rawFile);
  if (!/\.tsx?$/.test(file)) return [];
  const isTest = /\.test\.tsx?$/.test(file);
  const checkUi = !matchesAny(file, UI_EXEMPT) && !isTest;
  const checkCopy = !matchesAny(file, COPY_EXEMPT);
  const isUiPrimitive = file.startsWith("components/ui/");
  const out: Violation[] = [];

  let block = false;
  text.split(/\r?\n/).forEach((raw, idx) => {
    const [line, nowBlock] = stripComments(raw, block);
    block = nowBlock;
    const at = idx + 1;

    if (checkUi) {
      for (const m of line.matchAll(ARBITRARY_TOKEN)) {
        out.push({
          rule: "design-token", file, line: at, match: m[0],
          fix: "Use a token class from app/globals.css @theme (text-micro, text-display, tracking-*, leading-*, bg-paper, ...). If none fits, add a token and document it in docs/design-system.md.",
        });
      }
      if (!isUiPrimitive && file.endsWith(".tsx")) {
        for (const m of line.matchAll(RAW_CONTROL)) {
          out.push({
            rule: "raw-control", file, line: at, match: `<${m[1]}`,
            fix: "Use Button / IconButton / TextField / SegmentedControl from components/ui/ (see docs/design-system.md), or extend the primitive.",
          });
        }
      }
    }

    if (checkCopy) {
      let scan = line;
      for (const allow of COPY_ALLOW) scan = scan.replace(allow, " ");
      for (const re of BACKLOG) {
        for (const m of scan.matchAll(re)) {
          out.push({
            rule: "backlog-copy", file, line: at, match: m[0],
            fix: "Curio pulls, never pushes: no streaks, 'you missed', unseen counts or completion percentages. Reword, or if this is not reader-facing add the file to COPY_EXEMPT in scripts/guards/rules.ts.",
          });
        }
      }
    }
  });
  return out;
}

export function formatViolations(vs: Violation[]): string {
  return vs
    .map((v) => `${v.file}:${v.line}  [${v.rule}]  "${v.match}"\n    -> ${v.fix}`)
    .join("\n");
}
