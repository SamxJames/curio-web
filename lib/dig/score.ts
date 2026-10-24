import type { Tier } from "./types";

export const TIER_POINTS: Record<Tier, number> = {
  common: 10,
  popular: 15,
  familiar: 30,
  uncommon: 60,
  rare: 85,
  fossil: 100,
};

export const TIER_LABEL: Record<Tier, string> = {
  common: "Common",
  popular: "Popular pick",
  familiar: "Familiar",
  uncommon: "Uncommon",
  rare: "Rare",
  fossil: "Fossil",
};

/** Which of the five strata an answer drops into (geology names, never language eras). */
export const STRATUM: Record<Tier, "topsoil" | "loam" | "clay" | "stone" | "bedrock"> = {
  common: "topsoil",
  popular: "topsoil",
  familiar: "loam",
  uncommon: "clay",
  rare: "stone",
  fossil: "bedrock",
};

export const SHARE_EMOJI: Record<Tier, string> = {
  common: "🌱",
  popular: "🌱",
  familiar: "🟫",
  uncommon: "🟧",
  rare: "🪨",
  fossil: "🦴",
};
const NO_ANSWER = "▫️";

export const PROMPTS_PER_DAY = 7;
export const MAX_SCORE = PROMPTS_PER_DAY * TIER_POINTS.fossil;

/** Absolute Zipf cut-offs, so a score means the same thing every day. A word missing
 * from wordfreq is rare. */
export function tierFromZipf(z: number | undefined): Tier {
  if (z === undefined) return "rare";
  if (z >= 4) return "common";
  if (z >= 3) return "familiar";
  if (z >= 2.3) return "uncommon";
  return "rare";
}

export function scoreOf(tiers: (Tier | null)[]): number {
  return tiers.reduce((sum, t) => sum + (t ? TIER_POINTS[t] : 0), 0);
}

/** Depth in metres is score ÷ 100: a perfect dig is 7.0 m. */
export function formatDepth(score: number): string {
  return `${(score / 100).toFixed(1)} m`;
}

export function shareRow(tiers: (Tier | null)[]): string {
  return tiers.map((t) => (t ? SHARE_EMOJI[t] : NO_ANSWER)).join("");
}

/** Every reachable score is a multiple of 5 between 0 and MAX_SCORE. */
export function isValidScore(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_SCORE && n % 5 === 0;
}
