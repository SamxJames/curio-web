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
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API request failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { content: { type: string; text?: string }[] };
  const textBlock = data.content.find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error("Anthropic API response had no text content block.");
  }
  return textBlock.text;
}

/** CLI entry point: `npm run content:rewrite -- <word> <facts-json-path>`,
 * where <facts-json-path> is the file `content:extract` was redirected
 * into (`npm run content:extract -- <dump> <word> > /tmp/facts.json`).
 * Writes content/drafts/<word>.json for human review — nothing reads that
 * file automatically; scripts/approveDraft.ts (Task 9) is the only thing
 * that ever moves a draft into lib/words.ts, and only when explicitly
 * told to. */
async function main() {
  const [word, factsPath] = process.argv.slice(2);
  if (!word || !factsPath) {
    console.error("Usage: npm run content:rewrite -- <word> <facts-json-path>");
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
