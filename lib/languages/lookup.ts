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
 * Ancestors up to the root, oldest first, ending with `name`. Only ancestors that
 * have a sheet are included; a missing parent or a cycle ends the walk.
 */
export function familyPath(name: string, sheets: LanguageSheet[] = LANGUAGE_SHEETS): string[] {
  const find = (n: string) => sheets.find((s) => s.name === n || s.aliases.includes(n));
  const path: string[] = [name];
  const seen = new Set<string>([name]);
  let parent = find(name)?.parent ?? null;
  while (parent !== null && !seen.has(parent)) {
    const sheet = find(parent);
    if (!sheet) break;
    seen.add(parent);
    path.unshift(parent);
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
