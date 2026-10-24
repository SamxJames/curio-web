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
};

export const CATALOGUE_PATH = path.join("content", "dig", "catalogue.json");

export function loadCatalogue(file: string = CATALOGUE_PATH): Catalogue {
  return JSON.parse(readFileSync(file, "utf8")) as Catalogue;
}

export function isBlocked(cat: Catalogue, name: string): boolean {
  const lower = name.toLowerCase();
  return cat.blockPatterns.some((p) => lower.includes(p));
}
