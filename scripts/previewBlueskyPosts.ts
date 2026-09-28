// Prints the Bluesky posts the daily cron will make over the next N days,
// so the owner can read them before they go out. Read-only: no network, no
// Redis, no posting. Usage: npm run bluesky:preview -- [days=7] [from=YYYY-MM-DD]
import { buildBlueskyPreview } from "../lib/blueskyPreview";

const days = Number(process.argv[2] ?? 7);
const from = process.argv[3] ? new Date(`${process.argv[3]}T00:00:00Z`) : new Date();
if (!Number.isInteger(days) || days < 1 || Number.isNaN(from.getTime())) {
  console.error("Usage: npm run bluesky:preview -- [days=7] [from=YYYY-MM-DD]");
  process.exit(1);
}

for (const row of buildBlueskyPreview(from, days)) {
  console.log(`── ${row.day} · ${row.word} · ${row.graphemes}/300 graphemes`);
  console.log(row.text);
  console.log(`[card] ${row.card.title}`);
  console.log(`       ${row.card.description}`);
  console.log(`       ${row.card.uri}`);
  console.log("");
}
console.log(
  "Words come from the calendar formula. A day's word locks the first time it's shown, so these are what will post unless WORDS or LAUNCH_OPENERS change before then."
);
