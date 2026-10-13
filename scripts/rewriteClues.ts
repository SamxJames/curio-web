// Rewrites puzzle clues and blind-tests them. One JSON file per word in content/clues/<slug>.json;
// nothing here touches lib/words.ts (scripts/applyClues.ts does that).
//   npm run clues:rewrite -- [--only "devil,tulip"] [--limit 25] [--with-old] [--resolve]
// --with-old  also blind-solves the word's current clues, for a before/after comparison.
// --resolve   re-runs only the blind solver on existing files (after a reviewer edits clues).
// Writer: claude-opus-5-5 (effort medium) with the server-side refusal fallback on.
// Solver: claude-haiku-5-5 (effort low). Reads ANTHROPIC_API_KEY from .env.local; never prints it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { WORDS, type WordEntry } from "../lib/words";
import { buildLetterHint, isCorrectGuess } from "../lib/puzzle";
import {
  buildCluePrompt,
  buildSolverPrompt,
  parseClueResponse,
  parseSolverGuess,
  type ClueSet,
} from "../lib/clues";
import { extractResponseText, type MessageResponse } from "../lib/languages/draftPrompt";
import { AnthropicApiError, backoffDelayMs, shouldRetryStatus } from "./rewriteEtymology";
import { limitValue, onlyList } from "./languages/cli";

export const CLUES_DIR = path.join("content", "clues");
const WRITER = "claude-opus-5-5";
const SOLVER = "claude-haiku-5-5";
const CONCURRENCY = 6;
const MAX_ATTEMPTS = 3;

export type SolveResult = { guesses: string[]; solvedAt: 1 | 2 | 3 | null };
export type ClueRecord = {
  slug: string;
  word: string;
  old: ClueSet;
  clues: ClueSet;
  attempts: number;
  solve: SolveResult;
  oldSolve?: SolveResult;
  tooHard: boolean;
  /** Set by a reviewer: what they changed and why. */
  reviewNote?: string;
};

type Usage = { input_tokens: number; output_tokens: number };
const totals: Record<string, Usage> = { [WRITER]: { input_tokens: 0, output_tokens: 0 }, [SOLVER]: { input_tokens: 0, output_tokens: 0 } };

class NetworkError extends Error {}

async function call(model: string, prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set — add it to .env.local.");
  const writer = model === WRITER;
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        ...(writer ? { "anthropic-beta": "server-side-fallback-2026-07-01" } : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: writer ? 16000 : 4000,
        output_config: { effort: writer ? "medium" : "low" },
        ...(writer ? { fallbacks: "default" } : {}),
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (err) {
    throw new NetworkError(`network error: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) throw new AnthropicApiError(`Anthropic API request failed (${res.status}): ${await res.text()}`, res.status);
  const data = (await res.json()) as MessageResponse & { usage?: Usage };
  if (data.usage) {
    totals[model].input_tokens += data.usage.input_tokens;
    totals[model].output_tokens += data.usage.output_tokens;
  }
  return extractResponseText(data);
}

async function callWithRetry(model: string, prompt: string, maxRetries = 4): Promise<string> {
  let networkRetried = false;
  for (let attempt = 0; ; attempt++) {
    try {
      return await call(model, prompt);
    } catch (err) {
      if (err instanceof NetworkError && !networkRetried) {
        networkRetried = true;
        await new Promise((r) => setTimeout(r, backoffDelayMs(0)));
        continue;
      }
      const status = err instanceof AnthropicApiError ? err.status : undefined;
      if (status === undefined || !shouldRetryStatus(status, attempt, maxRetries)) throw err;
      await new Promise((r) => setTimeout(r, backoffDelayMs(attempt, 2000)));
    }
  }
}

async function writeClues(entry: WordEntry): Promise<{ clues: ClueSet; attempts: number }> {
  let feedback: string[] | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const parsed = parseClueResponse(await callWithRetry(WRITER, buildCluePrompt(entry, feedback)), entry.word);
    if (parsed.ok) return { clues: parsed.clues, attempts: attempt };
    feedback = parsed.problems;
  }
  throw new Error(`no valid clues after ${MAX_ATTEMPTS} attempts: ${feedback?.join("; ")}`);
}

/** Plays the puzzle like a person would: stops at the first correct guess. */
export async function blindSolve(clues: ClueSet, word: string): Promise<SolveResult> {
  const guesses: string[] = [];
  for (const stage of [1, 2, 3] as const) {
    const guess = parseSolverGuess(await callWithRetry(SOLVER, buildSolverPrompt(clues, stage, buildLetterHint(word)))) ?? "";
    guesses.push(guess);
    if (isCorrectGuess(guess, word)) return { guesses, solvedAt: stage };
  }
  return { guesses, solvedAt: null };
}

async function pool<T>(items: T[], worker: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]);
    }),
  );
}

async function main() {
  const args = process.argv.slice(2);
  const only = onlyList(args);
  const limit = limitValue(args);
  const withOld = args.includes("--with-old");
  const resolve = args.includes("--resolve");
  mkdirSync(CLUES_DIR, { recursive: true });

  const file = (slug: string) => path.join(CLUES_DIR, `${slug}.json`);
  let todo = WORDS.filter((w) => (only ? only.includes(w.slug) : true));
  todo = resolve ? todo.filter((w) => existsSync(file(w.slug))) : todo.filter((w) => !existsSync(file(w.slug)));
  if (limit) todo = todo.slice(0, limit);
  console.log(`${resolve ? "Re-solving" : "Rewriting"} ${todo.length} word(s)…`);

  const tally = { done: 0, failed: 0, solved: [0, 0, 0, 0] };
  await pool(todo, async (entry) => {
    try {
      let record: ClueRecord;
      if (resolve) {
        record = JSON.parse(readFileSync(file(entry.slug), "utf-8")) as ClueRecord;
        record.solve = await blindSolve(record.clues, entry.word);
      } else {
        const { clues, attempts } = await writeClues(entry);
        record = {
          slug: entry.slug,
          word: entry.word,
          old: entry.clues,
          clues,
          attempts,
          solve: await blindSolve(clues, entry.word),
          ...(withOld ? { oldSolve: await blindSolve(entry.clues, entry.word) } : {}),
          tooHard: false,
        };
      }
      record.tooHard = record.solve.solvedAt === null;
      writeFileSync(file(entry.slug), JSON.stringify(record, null, 2) + "\n");
      tally.done++;
      tally.solved[(record.solve.solvedAt ?? 4) - 1]++;
      const old = record.oldSolve ? ` (old clues: ${record.oldSolve.solvedAt ?? "failed"})` : "";
      console.log(`${entry.word}: solved at ${record.solve.solvedAt ?? "FAILED"}${old}`);
    } catch (err) {
      tally.failed++;
      console.log(`${entry.word}: ERROR ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  const [s1, s2, s3, f] = tally.solved;
  console.log(`Done. ${tally.done} written, ${tally.failed} errors. Blind solver: clue1 ${s1}, clue2 ${s2}, clue3 ${s3}, failed ${f}.`);
  for (const [model, u] of Object.entries(totals)) console.log(`${model}: ${u.input_tokens} in / ${u.output_tokens} out`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
