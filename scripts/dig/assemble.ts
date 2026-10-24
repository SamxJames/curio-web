import { hashSeed, mulberry32 } from "../../lib/words";
import type { Candidate } from "./themes";

export type HistoryDay = { date: string; prompts: { id: string; base: string; fossil: string; languages?: string[] }[] };

const DAY = 24 * 60 * 60 * 1000;
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

const EXACT_DAYS = 90, BASE_DAYS = 30, LANGUAGE_DAYS = 14, MAX_OVERLAP = 0.2;

/** pipeline-design §3a fix 4: exact prompt 90 days, base theme 30, origin language 14. */
export function isEligible(c: Candidate, date: string, history: HistoryDay[]): boolean {
  for (const h of history) {
    const gap = Math.abs(daysBetween(h.date, date));
    for (const p of h.prompts) {
      if (p.id === c.id && gap < EXACT_DAYS) return false;
      if (c.kind === "theme" && p.base === c.base && gap < BASE_DAYS) return false;
      if (c.kind === "origin" && gap < LANGUAGE_DAYS && (p.languages ?? []).some((l) => c.languages.includes(l))) return false;
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
 * fossils can't all be distinct is retried by the caller with another salt. */
export function pickDay(
  date: string,
  pools: { themes: Candidate[]; origins: Candidate[] },
  history: HistoryDay[],
  zipf: Map<string, number>,
  salt = 0
): Candidate[] | null {
  const rand = mulberry32(hashSeed(`dig-${date}-${salt}`));
  const chosen: Candidate[] = [];
  const fits = (c: Candidate) =>
    chosen.every((o) => !sameFamily(o, c) && overlapRatio(o.core, c.core) < MAX_OVERLAP && !o.languages.some((l) => c.languages.includes(l)));
  for (const c of shuffle(pools.themes.filter((t) => isEligible(t, date, history)), rand)) {
    if (chosen.length === 5) break;
    if (fits(c)) chosen.push(c);
  }
  if (chosen.length < 5) return null;
  const origins: Candidate[] = [];
  for (const c of shuffle(pools.origins.filter((o) => isEligible(o, date, history)), rand)) {
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
