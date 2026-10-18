// Writes reviewed clues from content/clues/*.json into lib/words.ts.
//   npm run clues:apply -- [--keep "devil"] [--keep-today]
// --keep        slugs to leave untouched (comma-separated).
// --keep-today  also leaves today's and tomorrow's (UTC) puzzle words untouched, so a live puzzle
//               never changes mid-day; apply them in a later run.
// Refuses any file whose clues fail lib/clues.ts's checks or that is still marked tooHard.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { clueProblems, replaceCluesInSource } from "../lib/clues";
import { getPuzzleForDate } from "../lib/puzzle";
import { DAY_MS, dayKey, dayStart } from "../lib/day";
import { onlyList, flagValue } from "./languages/cli";
import { CLUES_DIR, type ClueRecord } from "./rewriteClues";

const WORDS_FILE = path.join("lib", "words.ts");

function main() {
  const args = process.argv.slice(2);
  const keep = new Set((flagValue(args, "--keep") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  if (args.includes("--keep-today")) {
    const today = dayStart(dayKey(new Date()));
    for (const d of [today, new Date(today.getTime() + DAY_MS)]) {
      const slug = getPuzzleForDate(d)?.word.slug;
      if (slug) keep.add(slug);
    }
  }
  const only = onlyList(args);

  let source = readFileSync(WORDS_FILE, "utf-8");
  let applied = 0;
  const refused: string[] = [];
  for (const name of readdirSync(CLUES_DIR).filter((f) => f.endsWith(".json")).sort()) {
    const record = JSON.parse(readFileSync(path.join(CLUES_DIR, name), "utf-8")) as ClueRecord;
    if (keep.has(record.slug) || (only && !only.includes(record.slug))) continue;
    const problems = clueProblems(record.clues, record.word);
    if (record.tooHard) problems.push("still marked tooHard");
    if (problems.length > 0) {
      refused.push(`${record.slug}: ${problems.join("; ")}`);
      continue;
    }
    source = replaceCluesInSource(source, record.slug, record.clues);
    applied++;
  }
  writeFileSync(WORDS_FILE, source);
  console.log(`Applied ${applied}. Kept as-is: ${[...keep].join(", ") || "none"}.`);
  for (const r of refused) console.log(`REFUSED ${r}`);
  if (refused.length > 0) process.exitCode = 1;
}

main();
