// Shared argument parsing and paths for the scripts/languages/* pipeline scripts.
import path from "node:path";

export const LANG_DIR = path.join("content", "languages");
export const FACTS_DIR = path.join(LANG_DIR, "facts");
export const DRAFTS_DIR = path.join(LANG_DIR, "drafts");
export const REVIEW_PAGE = path.join(LANG_DIR, "review.html");

/** Value after `flag`, e.g. --only "Latin,Old Norse". */
export function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

/** --only "Latin,Old Norse" → ["Latin", "Old Norse"]; undefined when absent. */
export function onlyList(args: string[]): string[] | undefined {
  const v = flagValue(args, "--only");
  return v === undefined
    ? undefined
    : v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

export function limitValue(args: string[]): number | undefined {
  const v = flagValue(args, "--limit");
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`--limit must be a positive integer, got "${v}"`);
  return n;
}

/** JSON files in a directory listing, sorted, skipping `_`-prefixed logs. */
export function jsonFiles(dir: string, names: string[]): string[] {
  return names
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => path.join(dir, f));
}
