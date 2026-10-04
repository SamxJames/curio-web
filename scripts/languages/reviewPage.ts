// Writes content/languages/review.html (git-ignored): one plain-text card per draft, with the
// fetched facts it was drafted from (content/languages/facts/<slug>.json) shown beside it.
//   npm run languages:review
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { LanguageFacts } from "../../lib/languages/facts";
import { renderReviewPage } from "../../lib/languages/reviewHtml";
import { DRAFTS_DIR, FACTS_DIR, REVIEW_PAGE, jsonFiles } from "./cli";

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return undefined;
  }
}

function main() {
  if (!existsSync(DRAFTS_DIR)) throw new Error(`No ${DRAFTS_DIR} — run npm run languages:draft first.`);
  const facts: Record<string, LanguageFacts> = {};
  const drafts = jsonFiles(DRAFTS_DIR, readdirSync(DRAFTS_DIR)).map((f): unknown => {
    const draft = readJson(f);
    if (draft === undefined) return { name: path.basename(f), _problems: ["file is not valid JSON"] };
    // Drafts share their facts file's slug (draftSheets.ts writes the same basename).
    const fact = readJson(path.join(FACTS_DIR, path.basename(f))) as LanguageFacts | undefined;
    const name = (draft as { name?: unknown }).name;
    if (fact && typeof name === "string") facts[name] = fact;
    return draft;
  });
  writeFileSync(REVIEW_PAGE, renderReviewPage(drafts, facts));
  console.log(`Wrote ${drafts.length} card(s) to ${REVIEW_PAGE} — open it in a browser.`);
}

main();
