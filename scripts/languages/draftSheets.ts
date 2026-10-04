// Has Claude draft one fact sheet per facts file, using ONLY those facts, and writes
// content/languages/drafts/<slug>.json (approved: false, any problems in `_problems`).
//   npm run languages:draft -- [--only "Latin,Old Norse"] [--limit 30]
// Reads ANTHROPIC_API_KEY from .env.local (tsx --env-file). Never prints the key.
// The server-side refusal fallback is ON (anthropic-beta: server-side-fallback-2026-07-01,
// fallbacks: "default"): if claude-sonnet-5-5 declines a sheet, the API re-runs it on a
// fallback model in the same call. Only a refusal by the whole chain fails that language.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { WORDS } from "../../lib/words";
import {
  buildSheetPrompt,
  extractResponseText,
  parseDraftResponse,
  type MessageResponse,
} from "../../lib/languages/draftPrompt";
import { canonicalName, languageTargets, type LanguageFacts } from "../../lib/languages/facts";
import { AnthropicApiError, backoffDelayMs, shouldRetryStatus } from "../rewriteEtymology";
import { DRAFTS_DIR, FACTS_DIR, jsonFiles, limitValue, onlyList } from "./cli";

const MODEL = "claude-sonnet-5-5";
// Thinking stays on (adaptive, the model's default) and shares this ceiling with the answer.
const MAX_TOKENS = 8000;

type Usage = { input_tokens: number; output_tokens: number };

/** A fetch that failed below HTTP (DNS, reset, timeout): worth one retry. */
class NetworkError extends Error {}

/** One Messages API call. `onUsage` is called as soon as a response arrives — before any
 * stop_reason check can throw — so the run total counts every billed call. */
async function callClaude(prompt: string, onUsage: (u: Usage) => void): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set — add it to .env.local.");

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // Accuracy-sensitive (facts only, no invented numbers), so thinking stays on.
        output_config: { effort: "medium" },
        fallbacks: "default",
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (err) {
    throw new NetworkError(`network error calling the Anthropic API: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    throw new AnthropicApiError(`Anthropic API request failed (${res.status}): ${await res.text()}`, res.status);
  }
  const data = (await res.json()) as MessageResponse & { usage?: Usage };
  if (data.usage) onUsage(data.usage);
  return extractResponseText(data);
}

async function callWithRetry(prompt: string, onUsage: (u: Usage) => void, maxRetries = 3) {
  let networkRetried = false;
  for (let attempt = 0; ; attempt++) {
    try {
      return await callClaude(prompt, onUsage);
    } catch (err) {
      if (err instanceof NetworkError && !networkRetried) {
        networkRetried = true;
        await new Promise((r) => setTimeout(r, backoffDelayMs(0)));
        continue;
      }
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
    const usage: Usage = { input_tokens: 0, output_tokens: 0 };
    const addUsage = (u: Usage) => {
      for (const t of [usage, total]) {
        t.input_tokens += u.input_tokens;
        t.output_tokens += u.output_tokens;
      }
    };
    try {
      const text = await callWithRetry(buildSheetPrompt(facts.name, facts, known), addUsage);
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
      console.log(
        `${facts.name}: FAILED — ${err instanceof Error ? err.message : String(err)} ` +
          `(${usage.input_tokens} in / ${usage.output_tokens} out)`,
      );
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
