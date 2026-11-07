import type { PromptResult } from "./game";
import { normalizeKey } from "./normalize";
import { TIERS } from "./types";
import type { PromptSecret, Tier } from "./types";

/** Reveal wording (spec 2.2). Each line starts with its layer name so the band vocabulary is
 * taught on every reveal, and describes the word or the player's own dig, never other players.
 * The nth hit on a layer in one run uses variant n mod 3. TIER_LABEL and friends are not
 * touched: share text, share image and OG image stay as they are. Fossil is null: the fossil
 * moment (Reveal) replaces the layer line. */
const LINES: Record<Exclude<Tier, "fossil">, readonly [string, string, string]> = {
  common: ["Topsoil. Right on the surface.", "Topsoil. The first place to look.", "Topsoil. A word close to the surface."],
  popular: ["Topsoil. A well-worn answer.", "Topsoil. A word English uses often.", "Topsoil. Just under the grass, and a good one."],
  familiar: ["Loam. Familiar, and a little below the surface.", "Loam. A word you know, one layer down.", "Loam. Solid ground, one layer down."],
  uncommon: ["Clay. A word you have to go looking for.", "Clay. Past the first words that come to mind.", "Clay. Heavier digging. This one took thought."],
  rare: ["Stone. A hard one to find.", "Stone. Few words that fit sit this low.", "Stone. A proper find."],
};

export function layerLine(tier: Tier, priorSameTier: number): string | null {
  if (tier === "fossil") return null;
  return LINES[tier][((priorSameTier % 3) + 3) % 3];
}

/** How many earlier results share this result's tier: derived from `results`, so a refresh
 * gives the same line. */
export function priorSameTier(results: PromptResult[], index: number): number {
  const tier = results[index]?.tier;
  if (!tier) return 0;
  return results.slice(0, index).filter((r) => r.tier === tier).length;
}

/** "Name a word English took from Russian" -> "Russian". Only a single named language: a
 * region phrase ("from a language of India") returns null, so no fact is shown. */
export function originLanguage(promptText: string): string | null {
  return /(?:took|came to English) from ([A-Z][A-Za-z' -]*?)\s*$/.exec(promptText)?.[1] ?? null;
}

export type RevealFact =
  | { kind: "text"; text: string }
  | { kind: "story"; text: string; slug: string; linkText: string };

const idx = (t: Tier) => TIERS.indexOf(t);

/** At most one fact per reveal, from data already in the payload (spec 2.3). Never on a miss,
 * never for a fossil-tier answer. */
export function revealFact(args: {
  answer: string;
  tier: Tier;
  kind: "theme" | "origin";
  promptText: string;
  secret: Pick<PromptSecret, "answers" | "stories">;
}): RevealFact | null {
  const { answer, tier, kind, promptText, secret } = args;
  if (tier === "fossil") return null;

  // 1. Rarer than the median of the answers players are shown (core === 1 only).
  if (idx(tier) >= idx("uncommon")) {
    const shown = secret.answers.filter((a) => a[2] === 1).map((a) => idx(a[1])).sort((a, b) => a - b);
    if (shown.length && idx(tier) > shown[Math.floor(shown.length / 2)]) {
      return { kind: "text", text: "Rarer than most words that fit this prompt." };
    }
  }
  // 2. A Curio story exists (map keyed by the normalised answer; the display spelling also works).
  const slug = secret.stories[normalizeKey(answer)] ?? secret.stories[answer];
  if (slug) return { kind: "story", text: `Curio has the story of ${answer}.`, slug, linkText: `Read the story of ${answer}` };
  // 3. Origin confirmation.
  if (kind === "origin") {
    const lang = originLanguage(promptText);
    if (lang) return { kind: "text", text: `English took ${answer} from ${lang}.` };
  }
  return null;
}
