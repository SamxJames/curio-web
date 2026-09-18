export type DraftEntry = {
  slug: string;
  word: string;
  respelling: string;
  partOfSpeech: string;
  teaser: string;
  origin: string;
  journey: string;
  related: string;
  lineage: string[];
  clues: [string, string, string];
};

/** The prompt sent to Claude — the source facts are the *only* thing it's
 * allowed to draw on. Explicit "do not invent" language plus "even if the
 * facts are thin" covers both failure modes item 4 of the spec called
 * out: padding an etymology with unsourced detail, and silently skipping
 * an entry because there wasn't much to say. */
export function buildRewritePrompt(word: string, facts: string[]): string {
  const factsBlock = facts.map((f, i) => `${i + 1}. ${f}`).join("\n");
  return `You are writing one entry for Curio, a daily-word-etymology app. Its voice is warm, curious, and precise — never academic, never cute.

The word is: "${word}"

Here are the ONLY facts you may use, extracted from Wiktionary/Wiktextract:
${factsBlock}

Do NOT invent, guess, or pad any etymological detail beyond what's given above — if the facts are thin, write a short, honest entry rather than adding unsourced material. Do not skip the word even if the facts are sparse.

Write a JSON object (and nothing else — no markdown fences, no commentary) with exactly these fields:
{
  "respelling": "a phonetic respelling in Curio's house style, e.g. \\"KWOR-uhn-teen\\"",
  "partOfSpeech": "noun | verb | adjective | etc.",
  "teaser": "one sentence, the hook shown on the homepage — must NOT be identical to origin",
  "origin": "1-3 sentences, the full origin explanation, drawn only from the facts above",
  "journey": "1-3 sentences on how the meaning or use of the word changed over time, drawn only from the facts above (if the facts don't support a journey, write the honest shorter version rather than inventing a shift)",
  "related": "1-2 sentences connecting this word to a cognate or related English word, drawn only from the facts above (if none is supported by the facts, say so plainly rather than inventing one)",
  "lineage": ["array of language names, oldest first, always ending with \\"English\\" — only languages actually named in the facts above, in the order they appear in the word's history"],
  "clues": [
    "clue 1 (most oblique): must NOT contain the word \\"${word}\\" itself, its direct translation, or any word sharing a visible stem with it — describe the underlying fact obliquely instead",
    "clue 2 (more revealing): may state the direct translation or an additional fact from above, but still must not contain \\"${word}\\" itself",
    "clue 3 (nearly a giveaway): may name a cognate or related word, but must still never contain \\"${word}\\" itself"
  ]
}`;
}

/** Validates and shapes Claude's raw text response into a DraftEntry,
 * enforcing the same invariants lib/words.test.ts checks for the real
 * WORDS array — a draft that fails these should never reach a review
 * file at all. */
export function parseRewriteResponse(raw: string, word: string): DraftEntry {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Claude's response was not valid JSON for "${word}": ${raw.slice(0, 200)}`);
  }

  const requiredStringFields = ["respelling", "partOfSpeech", "teaser", "origin", "journey", "related"] as const;
  for (const field of requiredStringFields) {
    if (typeof parsed[field] !== "string" || !(parsed[field] as string).trim()) {
      throw new Error(`Draft for "${word}" is missing a non-empty "${field}" field.`);
    }
  }

  if (!Array.isArray(parsed.lineage) || parsed.lineage.length === 0 || !parsed.lineage.every((l) => typeof l === "string")) {
    throw new Error(`Draft for "${word}" has an invalid "lineage" field (must be a non-empty string array).`);
  }
  const lineage = parsed.lineage as string[];
  if (lineage[lineage.length - 1] !== "English") {
    throw new Error(`Draft for "${word}" has a "lineage" that doesn't end in "English": ${JSON.stringify(lineage)}`);
  }

  const teaser = parsed.teaser as string;
  const origin = parsed.origin as string;
  if (teaser === origin) {
    throw new Error(`Draft for "${word}" has a "teaser" identical to its "origin" — they must differ.`);
  }

  if (!Array.isArray(parsed.clues) || parsed.clues.length !== 3 || !parsed.clues.every((c) => typeof c === "string" && c.trim())) {
    throw new Error(`Draft for "${word}" has an invalid "clues" field (must be exactly 3 non-empty strings).`);
  }
  const clues = parsed.clues as [string, string, string];
  const lowerWord = word.toLowerCase();
  const stem = lowerWord.replace(/(ing|tion|ed|es|s|y)$/i, "");
  for (const [i, clue] of clues.entries()) {
    const lowerClue = clue.toLowerCase();
    if (lowerClue.includes(lowerWord) || lowerClue.includes(stem)) {
      throw new Error(`Draft for "${word}" has a clue (index ${i}) containing the answer word or its stem: "${clue}"`);
    }
  }

  return {
    slug: word,
    word,
    respelling: parsed.respelling as string,
    partOfSpeech: parsed.partOfSpeech as string,
    teaser,
    origin,
    journey: parsed.journey as string,
    related: parsed.related as string,
    lineage,
    clues,
  };
}

/** Carries the HTTP status alongside the message so callClaudeWithRetry can
 * decide whether a given failure is worth retrying (see shouldRetryStatus)
 * without re-parsing the error text. */
export class AnthropicApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "AnthropicApiError";
  }
}

async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. This script has no fallback mode — set it in .env.local before running content:rewrite."
    );
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      // Sonnet 5 runs adaptive thinking by default (omitting `thinking`
      // doesn't turn it off), and thinking tokens count against the same
      // max_tokens ceiling as the visible response. The original 1024 cap
      // left no headroom for that: a real Phase-2 dry run against live
      // Wiktextract facts (2026-09-15) truncated or fully swallowed 14/20
      // responses this way — some cut off mid-JSON, others left with zero
      // tokens for any text block at all. `effort: "low"` keeps thinking
      // spend down for what's a formulaic rewrite task, not a hard
      // reasoning problem; 4096 leaves real headroom either way.
      max_tokens: 4096,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AnthropicApiError(`Anthropic API request failed (${res.status}): ${body}`, res.status);
  }

  const data = (await res.json()) as {
    content: { type: string; text?: string }[];
    usage?: { input_tokens: number; output_tokens: number };
  };
  const textBlock = data.content.find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error("Anthropic API response had no text content block.");
  }
  // Logged (not returned) so a batch run's real cost can be tallied from its
  // output without changing this function's signature or rewriteBatch's
  // injectable callClaude contract — see this plan's Phase 2 cost report.
  if (data.usage) {
    console.error(
      `[curio:rewrite:usage] input_tokens=${data.usage.input_tokens} output_tokens=${data.usage.output_tokens}`
    );
  }
  return textBlock.text;
}

/** Whether a failed Anthropic call is worth retrying: rate limiting (429)
 * and any 5xx are transient and worth a retry; anything else (a bad API
 * key, a malformed request) will just fail the same way again, so retrying
 * only wastes an attempt. Pure so it's testable without a real failing
 * fetch — see callClaudeWithRetry for where this actually drives a retry
 * loop. */
export function shouldRetryStatus(status: number, attempt: number, maxRetries: number): boolean {
  if (attempt >= maxRetries) return false;
  return status === 429 || (status >= 500 && status < 600);
}

/** Exponential backoff: attempt 0 waits `baseDelayMs`, attempt 1 waits
 * double that, and so on. Pure — the actual `setTimeout` wait lives in
 * callClaudeWithRetry, injectable there for tests. */
export function backoffDelayMs(attempt: number, baseDelayMs: number = 1000): number {
  return baseDelayMs * 2 ** attempt;
}

/** Wraps callClaude with retry-on-transient-failure, for a batch run where
 * hitting a real rate limit or a transient 5xx shouldn't fail the whole
 * word rather than just that one call. Not unit-tested itself — like
 * callClaude, it's the actual network call, and this codebase's existing
 * convention (lib/bluesky.ts's postDailyWordToBluesky) is to test the pure
 * decision logic (shouldRetryStatus, backoffDelayMs) and leave the network
 * boundary itself untested. rewriteBatch takes an injectable `callClaude`
 * for exactly this reason — its tests exercise the orchestration logic
 * without ever calling this function. */
export async function callClaudeWithRetry(
  prompt: string,
  options: { maxRetries?: number; baseDelayMs?: number } = {}
): Promise<string> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;

  let attempt = 0;
  for (;;) {
    try {
      return await callClaude(prompt);
    } catch (err) {
      const status = err instanceof AnthropicApiError ? err.status : undefined;
      if (status === undefined || !shouldRetryStatus(status, attempt, maxRetries)) throw err;
      await new Promise((resolve) => setTimeout(resolve, backoffDelayMs(attempt, baseDelayMs)));
      attempt++;
    }
  }
}

/** True if `word` already has an entry in lib/words.ts's real source text —
 * a plain substring check against the exact literal appendDraftToWordsFile
 * (scripts/approveDraft.ts) writes (`slug: "word"`), matching this
 * codebase's existing convention of treating lib/words.ts as text for this
 * kind of check rather than parsing it as an AST. Used by rewriteBatch for
 * resumability: an interrupted batch run can be re-invoked without
 * re-calling the API for words that were already approved in an earlier
 * run. */
export function isWordAlreadyApproved(word: string, wordsFileSource: string): boolean {
  return wordsFileSource.includes(`slug: ${JSON.stringify(word)}`);
}

export type RewriteBatchResult = {
  written: string[];
  skipped: { word: string; reason: string }[];
  failed: { word: string; reason: string }[];
};

/** Runs the rewrite step over many words at once. Every word is handled
 * independently — one bad API response or unparseable draft goes to
 * `failed` with its reason instead of aborting the run, so a batch of
 * hundreds doesn't die on the first problem word (see this codebase's
 * content-pipeline conversation: "A failure log (word + reason) rather
 * than aborting the batch on the first bad API response").
 *
 * Resumable by construction: a word already present in `wordsFilePath`
 * (already approved in a prior run) or already holding a draft file in
 * `draftsDir` (rewritten but not yet approved) is skipped without an API
 * call, so re-invoking this on an interrupted run never re-spends money on
 * words that already have a result.
 *
 * `callClaude` is injectable (defaults to callClaudeWithRetry) purely so
 * this orchestration logic — the skip/fail/write decisions — is testable
 * without a real network call, matching every other test in this codebase
 * that separates pure/injectable logic from an untested I/O boundary. */
export async function rewriteBatch(
  factsByWord: Record<string, string[]>,
  options: {
    draftsDir: string;
    wordsFilePath: string;
    callClaude?: (prompt: string) => Promise<string>;
  }
): Promise<RewriteBatchResult> {
  const { existsSync, readFileSync, writeFileSync } = await import("fs");
  const path = await import("path");
  const call = options.callClaude ?? callClaudeWithRetry;

  const wordsFileSource = existsSync(options.wordsFilePath)
    ? readFileSync(options.wordsFilePath, "utf-8")
    : "";

  const result: RewriteBatchResult = { written: [], skipped: [], failed: [] };

  for (const [word, facts] of Object.entries(factsByWord)) {
    const draftPath = path.join(options.draftsDir, `${word}.json`);

    if (isWordAlreadyApproved(word, wordsFileSource)) {
      result.skipped.push({ word, reason: "already approved in WORDS" });
      continue;
    }
    if (existsSync(draftPath)) {
      result.skipped.push({ word, reason: "draft already exists" });
      continue;
    }
    if (facts.length === 0) {
      result.failed.push({ word, reason: "no etymology facts extracted" });
      continue;
    }

    try {
      const prompt = buildRewritePrompt(word, facts);
      const raw = await call(prompt);
      const draft = parseRewriteResponse(raw, word);
      writeFileSync(draftPath, JSON.stringify(draft, null, 2) + "\n");
      result.written.push(word);
    } catch (err) {
      result.failed.push({ word, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}

/** CLI entry point: `npm run content:rewrite -- <word> <facts-json-path>`,
 * where <facts-json-path> is the file `content:extract` was redirected
 * into (`npm run content:extract -- <dump> <word> > /tmp/facts.json`).
 * Writes content/drafts/<word>.json for human review — nothing reads that
 * file automatically; scripts/approveDraft.ts (Task 9) is the only thing
 * that ever moves a draft into lib/words.ts, and only when explicitly
 * told to.
 *
 * Batch mode: `npm run content:rewrite -- --batch <facts-json-path>`, where
 * <facts-json-path> is the `{word: facts[]}` file `content:extract --batch`
 * writes. Runs rewriteBatch over every word in it and writes a log of what
 * happened (written/skipped/failed, with reasons) to
 * content/drafts/_batch-log.json — nothing here ever touches lib/words.ts;
 * that's still content:approve's job alone. */
async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--batch") {
    const [, factsJsonPath] = args;
    if (!factsJsonPath) {
      console.error("Usage: npm run content:rewrite -- --batch <facts-json-path>");
      process.exit(1);
    }
    const { readFileSync, writeFileSync } = await import("fs");
    const path = await import("path");

    const factsByWord = JSON.parse(readFileSync(factsJsonPath, "utf-8")) as Record<string, string[]>;
    const draftsDir = path.join("content", "drafts");
    const result = await rewriteBatch(factsByWord, { draftsDir, wordsFilePath: "lib/words.ts" });

    const logPath = path.join(draftsDir, "_batch-log.json");
    writeFileSync(logPath, JSON.stringify(result, null, 2) + "\n");
    console.log(
      `Batch rewrite done: ${result.written.length} written, ${result.skipped.length} skipped, ${result.failed.length} failed. Log: ${logPath}`
    );
    return;
  }

  const [word, factsPath] = args;
  if (!word || !factsPath) {
    console.error(
      "Usage: npm run content:rewrite -- <word> <facts-json-path>\n   or: npm run content:rewrite -- --batch <facts-json-path>"
    );
    process.exit(1);
  }

  const { readFileSync, writeFileSync } = await import("fs");
  const path = await import("path");

  const extracted = JSON.parse(readFileSync(factsPath, "utf-8")) as { word: string; facts: string[] };
  if (extracted.facts.length === 0) {
    console.error(`No etymology facts found for "${word}" in ${factsPath} — nothing to rewrite.`);
    process.exit(1);
  }

  const prompt = buildRewritePrompt(word, extracted.facts);
  const raw = await callClaude(prompt);
  const draft = parseRewriteResponse(raw, word);

  const outPath = path.join("content", "drafts", `${word}.json`);
  writeFileSync(outPath, JSON.stringify(draft, null, 2) + "\n");
  console.log(`Wrote ${outPath} — review it, then run: npm run content:approve -- ${outPath}`);
}

if (require.main === module) {
  main();
}
