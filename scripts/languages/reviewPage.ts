// Writes content/languages/review.html (git-ignored): one plain-text card per draft.
//   npm run languages:review
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderReviewPage } from "../../lib/languages/reviewHtml";
import { DRAFTS_DIR, REVIEW_PAGE, jsonFiles } from "./cli";

function main() {
  if (!existsSync(DRAFTS_DIR)) throw new Error(`No ${DRAFTS_DIR} — run npm run languages:draft first.`);
  const drafts = jsonFiles(DRAFTS_DIR, readdirSync(DRAFTS_DIR)).map((f): unknown => {
    try {
      return JSON.parse(readFileSync(f, "utf-8"));
    } catch {
      return { name: path.basename(f), _problems: ["file is not valid JSON"] };
    }
  });
  writeFileSync(REVIEW_PAGE, renderReviewPage(drafts));
  console.log(`Wrote ${drafts.length} card(s) to ${REVIEW_PAGE} — open it in a browser.`);
}

main();
