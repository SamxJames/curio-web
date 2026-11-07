import { formatDepth, PROMPTS_PER_DAY, scoreOf } from "./score";
import { TIERS, type Tier } from "./types";

/** A spoiler-free challenge code: "<day number>.<one char per prompt>", tier index 0–5 or "-". Nothing stored. */
export function encodeVs(n: number, tiers: (Tier | null)[]): string {
  return `${n}.${tiers.map((t) => (t ? String(TIERS.indexOf(t)) : "-")).join("")}`;
}

/** The friend's tiers, or null when the code is malformed or for a different day. */
export function parseVs(raw: string | null, n: number): (Tier | null)[] | null {
  const m = raw?.match(/^(\d{1,5})\.([0-5-]+)$/);
  if (!m || Number(m[1]) !== n || m[2].length !== PROMPTS_PER_DAY) return null;
  return [...m[2]].map((c) => (c === "-" ? null : TIERS[Number(c)]));
}

export function challengeLine(tiers: (Tier | null)[]): string {
  return `A friend dug ${formatDepth(scoreOf(tiers))} today. Can you go deeper?`;
}
