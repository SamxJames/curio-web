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
};

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
