import { hashSeed, mulberry32 } from "../../lib/words";
import { normalizeKey } from "../../lib/dig/normalize";
import type { Candidate } from "./themes";

export type HistoryDay = { date: string; prompts: { id: string; base: string; fossil: string; languages?: string[] }[] };

const DAY = 24 * 60 * 60 * 1000;
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

// Sam's 2026-10-24 supply ruling (the spec's 90 / 30 / 14 ran dry in about 8 days).
const EXACT_DAYS = 14, BASE_DAYS = 5, LANGUAGE_DAYS = 4, MAX_OVERLAP = 0.2;

/** pipeline-design §3a fix 4, at Sam's 2026-10-24 values. Origins return on their language cooldown alone;
 * the exact-prompt rule is for themes. */
export type Cooldowns = { exactDays: number; baseDays: number; languageDays: number };
export const COOLDOWNS: Cooldowns = { exactDays: EXACT_DAYS, baseDays: BASE_DAYS, languageDays: LANGUAGE_DAYS };

export function isEligible(c: Candidate, date: string, history: HistoryDay[], cd: Cooldowns = COOLDOWNS): boolean {
  for (const h of history) {
    const gap = Math.abs(daysBetween(h.date, date));
    for (const p of h.prompts) {
      if (c.kind === "theme" && p.id === c.id && gap < cd.exactDays) return false;
      if (c.kind === "theme" && p.base === c.base && gap < cd.baseDays) return false;
      if (c.kind === "origin" && gap < cd.languageDays && (p.languages ?? []).some((l) => c.languages.includes(l))) return false;
    }
  }
  return true;
}

export function overlapRatio(a: string[], b: string[]): number {
  const small = a.length <= b.length ? a : b;
  const big = new Set(a.length <= b.length ? b : a);
  if (!small.length) return 0;
  return small.filter((w) => big.has(w)).length / small.length;
}

const FAMILY_OVERLAP = 0.5;

/** Base themes whose core mostly repeats a bigger theme's ("Beverages" inside "Liquids") join that
 * theme's cooldown family, so the two (and their letter variants) never run within 30 days of each
 * other. Order is preserved; the biggest theme of a family is its root. */
export function assignFamilies(themes: Candidate[]): Candidate[] {
  const roots: Candidate[] = [];
  const base = new Map<string, string>();
  for (const c of [...themes].sort((a, b) => b.core.length - a.core.length || a.id.localeCompare(b.id))) {
    const keys = c.core.map(normalizeKey);
    const root = roots.find((r) => overlapRatio(keys, r.core.map(normalizeKey)) >= FAMILY_OVERLAP);
    if (root) base.set(c.id, base.get(root.id)!);
    else { roots.push(c); base.set(c.id, c.id); }
  }
  return themes.map((c) => ({ ...c, base: base.get(c.id)! }));
}

export function sameFamily(a: Candidate, b: Candidate): boolean {
  if (a.base === b.base) return true;
  return a.ancestors.has(b.anchor) || b.ancestors.has(a.anchor);
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A seeded greedy draw (same inputs, same day). The fossil is chosen later; a day whose
 * fossils can't all be distinct is retried by the caller with another salt. `seedSalt` is a
 * secret (DIG_SEED_SALT) so the public code and data cannot recompute future days; assemble.ts
 * stays pure and takes it as a parameter. */
export function pickDay(
  date: string,
  pools: { themes: Candidate[]; origins: Candidate[] },
  history: HistoryDay[],
  zipf: Map<string, number>,
  seedSalt: string,
  salt = 0,
  cd: Cooldowns = COOLDOWNS
): Candidate[] | null {
  const rand = mulberry32(hashSeed(`dig-${seedSalt}-${date}-${salt}`));
  const chosen: Candidate[] = [];
  const fits = (c: Candidate) =>
    chosen.every((o) => !sameFamily(o, c) && overlapRatio(o.core, c.core) < MAX_OVERLAP && !o.languages.some((l) => c.languages.includes(l)));
  for (const c of shuffle(pools.themes.filter((t) => isEligible(t, date, history, cd)), rand)) {
    if (chosen.length === 5) break;
    if (fits(c)) chosen.push(c);
  }
  if (chosen.length < 5) return null;
  const origins: Candidate[] = [];
  for (const c of shuffle(pools.origins.filter((o) => isEligible(o, date, history, cd)), rand)) {
    if (origins.length === 2) break;
    if (fits(c) && origins.every((o) => !sameFamily(o, c) && overlapRatio(o.core, c.core) < MAX_OVERLAP && !o.languages.some((l) => c.languages.includes(l)))) origins.push(c);
  }
  if (origins.length < 2) return null;
  const easy = (c: Candidate) => c.core.filter((w) => (zipf.get(w) ?? 0) >= 3.5).length;
  const rare = (c: Candidate) => c.core.filter((w) => (zipf.get(w) ?? 0) < 2.3).length;
  const themes = [...chosen].sort((a, b) => easy(b) - easy(a) || a.id.localeCompare(b.id));
  const first = themes.shift()!;
  themes.sort((a, b) => rare(a) - rare(b) || a.id.localeCompare(b.id));
  const last = themes.pop()!;
  return [first, themes[0], origins[0], themes[1], themes[2], origins[1], last];
}
