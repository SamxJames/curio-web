// Pure core of scripts/languages/approveSheets.ts: choose drafts, refuse anything invalid,
// merge aliases, and render lib/languages/data.ts.
import { factProblems } from "./draftPrompt";
import { canonicalName, type LanguageFacts } from "./facts";
import type { LanguageSheet } from "./types";
import { validateSheet } from "./validate";

export type ApproveSelection = { allValid: true } | { only: string[] };

export type ApproveResult = {
  sheets: LanguageSheet[]; // full, canonical-sorted contents for data.ts
  approved: string[];
  refused: { name: string; reasons: string[] }[];
  missing: string[]; // --only names with no draft
};

const byName = (a: LanguageSheet, b: LanguageSheet) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const uniqSorted = (xs: string[], exclude: string) =>
  [...new Set(xs)].filter((x) => x !== exclude).sort();

/** A LanguageSheet with only its own fields, in a fixed order (stable output). */
export function toSheet(s: LanguageSheet | Record<string, unknown>): LanguageSheet {
  const v = s as LanguageSheet;
  return {
    name: v.name,
    aliases: v.aliases,
    status: v.status,
    classification: v.classification,
    region: v.region,
    map: v.map === null ? null : { lat: v.map.lat, lon: v.map.lon, radiusKm: v.map.radiusKm },
    era:
      v.era === null
        ? null
        : {
            from: v.era.from,
            to: v.era.to,
            ...(v.era.writtenUntil !== undefined ? { writtenUntil: v.era.writtenUntil } : {}),
            approximate: v.era.approximate,
          },
    peakSpeakers:
      v.peakSpeakers === null
        ? null
        : {
            count: v.peakSpeakers.count,
            year: v.peakSpeakers.year,
            ...(v.peakSpeakers.note !== undefined ? { note: v.peakSpeakers.note } : {}),
          },
    unknownSpeakersNote: v.unknownSpeakersNote,
    parent: v.parent,
    origin: v.origin,
    sourceUrl: v.sourceUrl,
    approved: v.approved,
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function approveSheets(
  drafts: unknown[],
  existing: LanguageSheet[],
  select: ApproveSelection,
  /** Facts by draft name. When given, every draft is re-checked against its facts; a draft
   * with no entry is checked against empty facts, so any speaker count it carries fails. */
  facts?: Record<string, LanguageFacts>,
): ApproveResult {
  const wanted = "only" in select ? new Set(select.only.map(canonicalName)) : null;
  const result: ApproveResult = { sheets: [], approved: [], refused: [], missing: [] };
  const batch = new Map<string, { sheet: LanguageSheet; fromCanonical: boolean }>();
  const seen = new Set<string>();

  drafts.forEach((raw, i) => {
    const rawName = isRecord(raw) && typeof raw.name === "string" ? raw.name : null;
    const label = rawName ?? `(unnamed draft ${i + 1})`;
    const canonical = rawName ? canonicalName(rawName) : null;
    if (canonical) seen.add(canonical);
    if (wanted && (!canonical || !wanted.has(canonical))) return;

    if (isRecord(raw) && Array.isArray(raw._problems) && raw._problems.length > 0) {
      result.refused.push({ name: label, reasons: raw._problems.map(String) });
      return;
    }
    let candidate: unknown = raw;
    if (isRecord(raw)) {
      const copy: Record<string, unknown> = { ...raw, approved: true };
      delete copy._problems;
      candidate = copy;
    }
    const problems = validateSheet(candidate);
    if (problems.length > 0 || !canonical) {
      result.refused.push({ name: label, reasons: problems });
      return;
    }

    if (facts && isRecord(raw)) {
      // The owner can accept a known mismatch by writing a reason in `_override`.
      const overridden = typeof raw._override === "string" && raw._override.trim() !== "";
      const own = facts[label] ?? { name: label, aliases: [], wikipedia: null, wikidata: null, fetchedAt: "" };
      const mismatches = factProblems(candidate as LanguageSheet, own);
      if (mismatches.length > 0 && !overridden) {
        result.refused.push({
          name: label,
          reasons: [...mismatches, "(add a non-empty \"_override\" reason to the draft to accept this)"],
        });
        return;
      }
    }

    const sheet = toSheet(candidate as LanguageSheet);
    const fromCanonical = rawName === canonical;
    sheet.name = canonical;
    sheet.aliases = uniqSorted([...sheet.aliases, ...(fromCanonical ? [] : [rawName!])], canonical);

    const prior = batch.get(canonical);
    if (prior) {
      const aliases = uniqSorted([...prior.sheet.aliases, ...sheet.aliases], canonical);
      const winner = prior.fromCanonical && !fromCanonical ? prior : { sheet, fromCanonical };
      winner.sheet.aliases = aliases;
      batch.set(canonical, winner);
    } else {
      batch.set(canonical, { sheet, fromCanonical });
      result.approved.push(canonical);
    }
  });

  if (wanted) result.missing = [...wanted].filter((n) => !seen.has(n));

  const merged = new Map(existing.map((s) => [s.name, toSheet(s)]));
  for (const [name, { sheet }] of batch) {
    const old = merged.get(name);
    if (old) sheet.aliases = uniqSorted([...old.aliases, ...sheet.aliases], name);
    merged.set(name, sheet);
  }
  result.sheets = [...merged.values()].sort(byName);
  return result;
}

/** The full text of lib/languages/data.ts. */
export function renderDataModule(sheets: LanguageSheet[]): string {
  const sorted = sheets.map(toSheet).sort(byName);
  const body = sorted.length === 0 ? "[]" : JSON.stringify(sorted, null, 2);
  return `// written by scripts/languages/approveSheets.ts — edit drafts, not this file.
// Facts from Wikipedia and Wikidata (CC BY-SA), drafted by Claude, reviewed and approved by the owner.
import type { LanguageSheet } from "./types";

export const LANGUAGE_SHEETS: LanguageSheet[] = ${body} satisfies LanguageSheet[];
`;
}

/** Every approved canonical name and alias → canonical name. Unapproved sheets are left
 * out; a canonical name always maps to itself, even if another sheet lists it as an alias. */
export function buildSheetIndex(sheets: LanguageSheet[]): Record<string, string> {
  const approved = sheets.filter((s) => s.approved);
  const map = new Map<string, string>();
  for (const s of approved) for (const a of s.aliases) map.set(a, s.name);
  for (const s of approved) map.set(s.name, s.name);
  const sorted = [...map.keys()].sort();
  return Object.fromEntries(sorted.map((k) => [k, map.get(k)!]));
}

/** The full text of lib/languages/sheetIndex.ts: a tiny name index Collection can load
 * up front without pulling in the sheets themselves (data.ts loads with the panel). */
export function renderSheetIndexModule(sheets: LanguageSheet[]): string {
  const index = buildSheetIndex(sheets);
  const body = Object.keys(index).length === 0 ? "{}" : JSON.stringify(index, null, 2);
  return `// GENERATED by scripts/languages/approveSheets.ts alongside data.ts — do not edit.
// Approved language names and aliases → canonical name, for Collection's "About" link.
export const SHEET_NAMES: Record<string, string> = ${body};
`;
}
