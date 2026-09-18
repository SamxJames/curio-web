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

/** Batch variant of extractEtymologyFacts: a bulk content run against ~1,000
 * candidate words can't afford one full streaming pass over a multi-gigabyte
 * dump per word (extractEtymologyFacts's approach, correct for one word at a
 * time). This does exactly one pass, checking each line's word against a Set
 * of every target instead of a single string — so the cost is one dump read
 * total, not one per word. Every targetWord always gets a key in the result
 * (an empty array if nothing was found), so callers can see the full
 * attrition picture rather than just the survivors. */
export async function extractEtymologyFactsForWords(
  dumpPath: string,
  targetWords: string[]
): Promise<Record<string, string[]>> {
  const targets = new Set(targetWords);
  const seenByWord = new Map<string, Set<string>>();
  const result: Record<string, string[]> = {};
  for (const w of targetWords) result[w] = [];

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
      continue;
    }
    if (!entry.word || !targets.has(entry.word) || entry.lang_code !== "en") continue;
    const text = entry.etymology_text?.trim();
    if (!text) continue;

    let seen = seenByWord.get(entry.word);
    if (!seen) {
      seen = new Set();
      seenByWord.set(entry.word, seen);
    }
    if (seen.has(text)) continue;
    seen.add(text);
    result[entry.word].push(text);
  }

  return result;
}

/** CLI entry point: `npm run content:extract -- <dump-path> <word>` — prints
 * the extracted facts as JSON to stdout, so `content:rewrite` (Task 8) can
 * pipe them in without either script needing to know the other's internals.
 *
 * Batch mode: `npm run content:extract -- --batch <dump-path> <word-list-file>
 * <output-json-path>` — <word-list-file> is one word per line (blank lines
 * and lines starting with "#" are ignored, matching curio-word-candidates.txt's
 * own format); writes a single `{word: facts[]}` JSON file covering every
 * word in the list, so `content:rewrite --batch` (scripts/rewriteEtymology.ts)
 * can consume it without a second dump pass. */
async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--batch") {
    const [, dumpPath, wordListPath, outPath] = args;
    if (!dumpPath || !wordListPath || !outPath) {
      console.error(
        "Usage: npm run content:extract -- --batch <dump-path> <word-list-file> <output-json-path>"
      );
      process.exit(1);
    }
    const { readFileSync, writeFileSync } = await import("fs");
    const words = readFileSync(wordListPath, "utf-8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    const facts = await extractEtymologyFactsForWords(dumpPath, words);
    writeFileSync(outPath, JSON.stringify(facts, null, 2) + "\n");

    const withFacts = Object.values(facts).filter((f) => f.length > 0).length;
    console.log(`Extracted facts for ${withFacts}/${words.length} words -> ${outPath}`);
    return;
  }

  const [dumpPath, word] = args;
  if (!dumpPath || !word) {
    console.error(
      "Usage: npm run content:extract -- <dump-path> <word>\n   or: npm run content:extract -- --batch <dump-path> <word-list-file> <output-json-path>"
    );
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
