/** The contract between the dig pipeline (scripts/dig) and the site. Shared types and constants.
 * Client-safe: importable from client components. See docs/rarity-game/architecture.md §4. */

export const TIERS = ["common", "popular", "familiar", "uncommon", "rare", "fossil"] as const;
export type Tier = (typeof TIERS)[number];
export type PromptKind = "theme" | "origin";

/** Display spelling, tier, and 1 if the answer is core (shown in reveals) or 0 if
 * accepted-only (it scores but is never shown). */
export type DigAnswer = [display: string, tier: Tier, core: 0 | 1];

export type DigFossil = { word: string; fact: string; story?: string };

/** The obfuscated part of a prompt (lib/dig/payload.ts). */
export type PromptSecret = {
  answers: DigAnswer[];
  /** Extra lookup keys, already normalised (irregular plurals, UK/US spellings,
   * alternative forms) → index into `answers`. */
  aliases: Record<string, number>;
  /** Real English words one edit from an answer key. A guess equal to one of these
   * is never offered as a near miss ("heel" never becomes "keel"). */
  guard: string[];
  fossil: DigFossil;
  /** Display spelling → Curio story slug, for every answer that has a story. */
  stories: Record<string, string>;
};

export type DigPromptPlain = { id: string; kind: PromptKind; text: string } & PromptSecret;
export type DigPrompt = { id: string; kind: PromptKind; text: string; payload: string };

export type DigDay = {
  v: 1;
  date: string;
  /** 0–1: the share of browsers that report rejected guesses. */
  rejSample: number;
  prompts: DigPrompt[];
};

export type DigDayPlain = Omit<DigDay, "prompts"> & { prompts: DigPromptPlain[] };
