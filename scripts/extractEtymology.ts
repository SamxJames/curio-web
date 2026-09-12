import { createReadStream } from "fs";
import { createInterface } from "readline";

type WiktextractLine = {
  word?: string;
  lang_code?: string;
  etymology_text?: string;
};

/** Reads a Wiktextract JSONL dump line by line (dumps run into the
 * gigabytes — this never loads the whole file into memory) and collects
 * every distinct, non-empty `etymology_text` for the given word's English
 * entries. A word can appear multiple times (once per part of speech, or
 * per `etymology_number` for true homographs like "bank"); duplicates
 * across those repeats are collapsed, but genuinely different etymology
 * sections are both kept — the rewrite pass (scripts/rewriteEtymology.ts)
 * decides what to do with more than one. */
export async function extractEtymologyFacts(
  dumpPath: string,
  targetWord: string
): Promise<string[]> {
  const seen = new Set<string>();
  const facts: string[] = [];

  const rl = createInterface({
    input: createReadStream(dumpPath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let entry: WiktextractLine;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // a real dump can have stray malformed lines; skip rather than abort
    }
    if (entry.word !== targetWord || entry.lang_code !== "en") continue;
    const text = entry.etymology_text?.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    facts.push(text);
  }

  return facts;
}

/** CLI entry point: `npm run content:extract -- <dump-path> <word>` — prints
 * the extracted facts as JSON to stdout, so `content:rewrite` (Task 8) can
 * pipe them in without either script needing to know the other's internals. */
async function main() {
  const [dumpPath, word] = process.argv.slice(2);
  if (!dumpPath || !word) {
    console.error("Usage: npm run content:extract -- <dump-path> <word>");
    process.exit(1);
  }
  const facts = await extractEtymologyFacts(dumpPath, word);
  console.log(JSON.stringify({ word, facts }, null, 2));
}

// Only run the CLI when this file is executed directly (`tsx
// scripts/extractEtymology.ts ...`), not when its functions are imported
// by the test file or by another script.
if (require.main === module) {
  main();
}
