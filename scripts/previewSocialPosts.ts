// Prints the Threads posts and Instagram carousels the daily cron will make
// over the next N days, so the owner can read them before they go out.
// Read-only: no network, no Redis, no tokens, no posting.
// Usage: npm run social:preview -- [days=7] [from=YYYY-MM-DD]
import { buildSocialPreview } from "../lib/socialPreview";

const days = Number(process.argv[2] ?? 7);
const from = process.argv[3] ? new Date(`${process.argv[3]}T00:00:00Z`) : new Date();
if (!Number.isInteger(days) || days < 1 || Number.isNaN(from.getTime())) {
  console.error("Usage: npm run social:preview -- [days=7] [from=YYYY-MM-DD]");
  process.exit(1);
}

const PAD = " ".repeat("[instagram] ".length);

for (const row of buildSocialPreview(from, days)) {
  console.log(`── ${row.day} · ${row.word}`);
  console.log(`[threads] ${row.threads}`);
  console.log(`${PAD}link: ${row.threadsLink}`);
  console.log(`[instagram] ${row.caption}`);
  row.slides.forEach((s, i) => {
    const label = `${s.n} ${s.kind}`.padEnd(8);
    console.log(`${PAD}${i === 0 ? "slides: " : "        "}${label} ${s.url}`);
  });
  console.log("");
}
console.log(
  "Words come from the calendar formula. A day's word locks the first time it's shown, so these are what will post unless WORDS or LAUNCH_OPENERS change before then."
);
