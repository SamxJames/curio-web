import { formatDepth, shareRow } from "./score";
import { encodeVs } from "./challenge";
import type { Tier } from "./types";

/** The agreed spoiler-free share text (architecture §10). */
export function shareText(n: number, score: number, tiers: (Tier | null)[], challenge = true): string {
  const link = challenge ? `curioword.com/dig?vs=${encodeVs(n, tiers)}&utm_source=challenge` : "curioword.com/dig";
  return [`curio dig, day ${n}`, `${formatDepth(score)} down`, shareRow(tiers), link].join("\n");
}

const MIN_FINISHERS = 100;

/** "Deeper than 72% of today's diggers": the share of finishers in a lower score bucket.
 * Nothing below 100 finishers, and nothing when nobody is shallower: never a ranking. */
export function percentileLine(spread: Record<string, number> | undefined, score: number): string | null {
  if (!spread) return null;
  const total = Object.values(spread).reduce((a, b) => a + b, 0);
  if (total < MIN_FINISHERS) return null;
  const mine = Math.floor(score / 10);
  const below = Object.entries(spread).reduce((a, [b, n]) => (Number(b) < mine ? a + n : a), 0);
  const pct = Math.floor((below / total) * 100);
  return pct >= 1 ? `Deeper than ${pct}% of today's diggers` : null;
}
