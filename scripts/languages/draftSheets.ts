// Has Claude draft one fact sheet per facts file, using ONLY those facts, and writes
// content/languages/drafts/<slug>.json (approved: false, any problems in `_problems`).
//   npm run languages:draft -- [--only "Latin,Old Norse"] [--limit 30]
// Reads ANTHROPIC_API_KEY from .env.local (tsx --env-file). Never prints the key.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { WORDS } from "../../lib/words";
import { buildSheetPrompt, parseDraftResponse } from "../../lib/languages/draftPrompt";
import { canonicalName, languageTargets, type LanguageFacts } from "../../lib/languages/facts";
import { AnthropicApiError, backoffDelayMs, shouldRetryStatus } from "../rewriteEtymology";
import { DRAFTS_DIR, FACTS_DIR, jsonFiles, limitValue, onlyList } from "./cli";

const MODEL = "claude-sonnet-5-5";
const MAX_TOKENS = 1200;

type Usage = { input_tokens: number; output_tokens: number };

async function callClaude(prompt: string): Promise<{ text: string; usage: Usage }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set — add it to .env.local.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // Sonnet 5.5 thinks adaptively by default, and thinking tokens share max_tokens
      // (the failure rewriteEtymology.ts hit at 1024). A short JSON sheet needs no
      // thinking; with no tools in the request, "between_tools" turns it off, so the
      // whole 1200-token budget goes to the visible answer.
      thinking: { type: "between_tools" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new AnthropicApiError(`Anthropic API request failed (${res.status}): ${await res.text()}`, res.status);
  }
  const data = (await res.json()) as {
    content: { type: string; text?: string }[];
    stop_reason?: string;
    usage?: Usage;
  };
  if (data.stop_reason === "max_tokens") throw new Error(`response hit max_tokens (${MAX_TOKENS})`);
  if (data.stop_reason === "refusal") throw new Error("the model declined this request");
  const text = data.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("response had no text block");
  return { text, usage: data.usage ?? { input_tokens: 0, output_tokens: 0 } };
}

async function callWithRetry(prompt: string, maxRetries = 3) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await callClaude(prompt);
    } catch (err) {
      const status = err instanceof AnthropicApiError ? err.status : undefined;
      if (status === undefined || !shouldRetryStatus(status, attempt, maxRetries)) throw err;
      await new Promise((r) => setTimeout(r, backoffDelayMs(attempt)));
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const only = onlyList(args);
  const limit = limitValue(args);
  if (!existsSync(FACTS_DIR)) throw new Error(`No ${FACTS_DIR} — run npm run languages:facts first.`);
  mkdirSync(DRAFTS_DIR, { recursive: true });

  const known = languageTargets(WORDS).map((t) => t.name);
  let todo = jsonFiles(FACTS_DIR, readdirSync(FACTS_DIR))
    .filter((f) => !existsSync(path.join(DRAFTS_DIR, path.basename(f))))
    .map((f) => ({ file: f, facts: JSON.parse(readFileSync(f, "utf-8")) as LanguageFacts }));
  if (only) {
    const wanted = new Set(only.map(canonicalName));
    todo = todo.filter((t) => wanted.has(t.facts.name));
  }
  if (limit) todo = todo.slice(0, limit);

  console.log(`Drafting ${todo.length} sheet(s) with ${MODEL} into ${DRAFTS_DIR}`);
  const total: Usage = { input_tokens: 0, output_tokens: 0 };
  let written = 0;
  let flagged = 0;
  let failed = 0;
  for (const { file, facts } of todo) {
    if (!facts.wikipedia) {
      failed++;
      console.log(`${facts.name}: skipped — no Wikipedia facts to draft from`);
      continue;
    }
    try {
      const { text, usage } = await callWithRetry(buildSheetPrompt(facts.name, facts, known));
      total.input_tokens += usage.input_tokens;
      total.output_tokens += usage.output_tokens;
      const res = parseDraftResponse(text, facts, known);
      if (!res.ok) throw new Error(res.error);
      writeFileSync(path.join(DRAFTS_DIR, path.basename(file)), JSON.stringify(res.draft, null, 2) + "\n");
      written++;
      const problems = res.draft._problems ?? [];
      if (problems.length > 0) flagged++;
      const status = problems.length > 0 ? `${problems.length} problem(s): ${problems.join("; ")}` : "valid";
      console.log(`${facts.name}: ${status} (${usage.input_tokens} in / ${usage.output_tokens} out)`);
    } catch (err) {
      failed++;
      console.log(`${facts.name}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(
    `Done. ${written} written (${flagged} with problems), ${failed} failed or skipped. ` +
      `Tokens used: ${total.input_tokens} input, ${total.output_tokens} output.`,
  );
  console.log("Next: npm run languages:review");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
