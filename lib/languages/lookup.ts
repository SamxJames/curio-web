import { LANGUAGE_SHEETS } from "./data";
import type { LanguageSheet } from "./types";

/** Approved sheet whose name or alias matches; unapproved sheets are invisible. */
export function findSheet(
  name: string,
  sheets: LanguageSheet[] = LANGUAGE_SHEETS,
): LanguageSheet | undefined {
  return sheets.find((s) => s.approved && (s.name === name || s.aliases.includes(name)));
}

/**
 * Ancestors up to the root, oldest first, ending with `name`. Only approved sheets
 * are followed (unapproved sheets are invisible, as in `findSheet`), and every entry
 * is the sheet's canonical name, so an alias resolves to the name it means. A
 * missing or unapproved parent, or a cycle, ends the walk.
 */
export function familyPath(name: string, sheets: LanguageSheet[] = LANGUAGE_SHEETS): string[] {
  const start = findSheet(name, sheets);
  const self = start?.name ?? name;
  const path: string[] = [self];
  const seen = new Set<string>([self]);
  let parent = start?.parent ?? null;
  while (parent !== null) {
    const sheet = findSheet(parent, sheets);
    if (!sheet || seen.has(sheet.name)) break;
    seen.add(sheet.name);
    path.unshift(sheet.name);
    parent = sheet.parent;
  }
  return path;
}

/** Unique languages that directly follow `name` in the given lineages, in first-seen order. */
export function nextLanguages(name: string, lineages: string[][]): string[] {
  const out: string[] = [];
  for (const lineage of lineages) {
    const i = lineage.indexOf(name);
    if (i >= 0 && i + 1 < lineage.length) {
      const next = lineage[i + 1];
      if (!out.includes(next)) out.push(next);
    }
  }
  return out;
}
