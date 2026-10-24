import { formatDepth, shareRow } from "./score";
import type { Tier } from "./types";

/** The agreed spoiler-free share text (architecture §10). */
export function shareText(n: number, score: number, tiers: (Tier | null)[]): string {
  return [`curio dig, day ${n}`, `${formatDepth(score)} down`, shareRow(tiers), "curioword.com/dig"].join("\n");
}

const MIN_FINISHERS = 50;

/** "Deeper than 72% of today's diggers": the share of finishers in a lower score bucket.
 * Nothing below 50 finishers, and nothing when nobody is shallower: never a ranking. */
export function percentileLine(spread: Record<string, number> | undefined, score: number): string | null {
  if (!spread) return null;
  const total = Object.values(spread).reduce((a, b) => a + b, 0);
  if (total < MIN_FINISHERS) return null;
  const mine = Math.floor(score / 10);
  const below = Object.entries(spread).reduce((a, [b, n]) => (Number(b) < mine ? a + n : a), 0);
  const pct = Math.floor((below / total) * 100);
  return pct >= 1 ? `Deeper than ${pct}% of today's diggers` : null;
}
