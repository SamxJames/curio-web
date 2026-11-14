import { readFileSync } from "node:fs";
import path from "node:path";

export type WikidataTheme = { id: string; text: string; qid: string; label: string; wiktionary: string[] };
export type OriginGroup = { id: string; text: string; languages: string[] };
export type Catalogue = {
  anchorOverrides: Record<string, string[]>;
  renames: Record<string, string>;
  blockPatterns: string[];
  wikidataThemes: WikidataTheme[];
  originGroups: OriginGroup[];
  originExclude: string[];
  langCodes: Record<string, string>;
  /** Hand-picked answers neither source lists, by base prompt id ("water" is not a beverage in
   * WordNet or Wiktionary's category). Accepted like adjudication extras; the blocklist still applies. */
  extraAnswers?: Record<string, string[]>;
  /** Wiktionary sub-categories joined to a theme, by the theme's own category name: "Colors" takes the words of
   * "Blacks" and "Whites", which Wiktionary files apart and WordNet's tree does not connect. */
  extraCategories?: Record<string, string[]>;
  /** Words a prompt never accepts, by base prompt id, or "*" for every prompt. For stray senses ("more" is a
   * vegetable only as an obsolete word for a root) and source errors (WordNet files "hyena" under canine).
   * Wiktionary tags a category on the whole page, not on a sense, so no rule can find these. */
  excludeAnswers?: Record<string, string[]>;
  /** Words that are accepted but never shown in a reveal and never the fossil, by base prompt id or "*". */
  hiddenAnswers?: Record<string, string[]>;
  /** Filler: very common words ("to", "in", "on") that are never an accepted-only answer. A prompt keeps one
   * only where both sources agree on it (core) or it is hand-picked. Part of speech cannot pick these out:
   * Wiktionary calls "cross", "hit" and "man" prepositions or pronouns too. */
  fillerWords?: string[];
  /** Dialects and stages that count as the language for an origin prompt ("Neapolitan" for Italian). A variant
   * never gets a prompt of its own. Its code in langCodes is optional (the category alone is enough). */
  originVariants?: Record<string, string[]>;
};

/** The base prompt a candidate's catalogue lists are keyed by: a letter variant ("theme:x:w") uses its theme's.
 * Not `base`, which assignFamilies may point at a bigger theme's cooldown family. */
export function rootId(c: { id: string; kind: "theme" | "origin" }): string {
  return c.kind === "theme" ? c.id.split(":").slice(0, 2).join(":") : c.id;
}

/** A catalogue list for one prompt: its own entries plus the "*" entries. */
export function listFor(lists: Record<string, string[]> | undefined, c: { id: string; kind: "theme" | "origin" }): string[] {
  return [...(lists?.["*"] ?? []), ...(lists?.[rootId(c)] ?? [])];
}

/** A prompt's hand-picked answers. A letter variant ("theme:x:w") gets only its letter's words. */
export function curatedAnswers(cat: Pick<Catalogue, "extraAnswers">, c: { id: string; base: string }): string[] {
  const words = cat.extraAnswers?.[c.base] ?? [];
  const letter = c.id === c.base ? null : c.id.split(":").at(-1)!;
  return letter ? words.filter((w) => w[0] === letter) : words;
}

export const CATALOGUE_PATH = path.join("content", "dig", "catalogue.json");

export function loadCatalogue(file: string = CATALOGUE_PATH): Catalogue {
  return JSON.parse(readFileSync(file, "utf8")) as Catalogue;
}

export function isBlocked(cat: Catalogue, name: string): boolean {
  const lower = name.toLowerCase();
  return cat.blockPatterns.some((p) => lower.includes(p));
}
