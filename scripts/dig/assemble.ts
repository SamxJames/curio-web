import { hashSeed, mulberry32 } from "../../lib/words";
import { normalizeKey } from "../../lib/dig/normalize";
import type { Candidate } from "./themes";

export type HistoryDay = { date: string; prompts: { id: string; base: string; fossil: string; languages?: string[] }[] };

const DAY = 24 * 60 * 60 * 1000;
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

// Sam's 2026-10-24 supply ruling (the spec's 90 / 30 / 14 ran dry in about 8 days).
const EXACT_DAYS = 14, BASE_DAYS = 5, LANGUAGE_DAYS = 4, MAX_OVERLAP = 0.2;
// Sam's 2026-11-15 ruling: a prompt may reuse a fossil after four months. Never reusing one emptied the pool
// in about four and a half months (half the theme prompts have 11 fossil candidates or fewer), and a wait of
// six months or more comes back too late to stop that (docs/dig-word-audit.md, "Supply runway").
const FOSSIL_DAYS = 122;

/** pipeline-design §3a fix 4, at Sam's 2026-10-24 values. Origins return on their language cooldown alone;
 * the exact-prompt rule is for themes. */
export type Cooldowns = { exactDays: number; baseDays: number; languageDays: number; fossilDays: number };
export const COOLDOWNS: Cooldowns = { exactDays: EXACT_DAYS, baseDays: BASE_DAYS, languageDays: LANGUAGE_DAYS, fossilDays: FOSSIL_DAYS };

/** Each fossil a prompt has used, with the latest date it used it. */
export function lastFossilUse(promptId: string, history: HistoryDay[]): Map<string, string> {
  const last = new Map<string, string>();
  for (const h of history) for (const p of h.prompts) {
    if (p.id === promptId && (last.get(p.fossil) ?? "") < h.date) last.set(p.fossil, h.date);
  }
  return last;
}

/** The fossils a prompt may not use on `date`: those it used within fossilDays, before or after
 * (a hole in the buffer can be filled after later days were built). */
export function fossilsResting(lastUsed: Map<string, string>, date: string, cd: Cooldowns = COOLDOWNS): Set<string> {
  return new Set([...lastUsed].filter(([, used]) => Math.abs(daysBetween(used, date)) < cd.fossilDays).map(([w]) => w));
}

/** Free to run on `date`: off its cooldowns, and with at least one fossil that is not resting. The caller
 * passes the fossils the prompt could really use (build.ts counts candidates that have a fact to show).
 * The spare-pool alarm counts these. Cooldowns alone used to count a prompt with no fossil left as spare. */
export function isFree(c: Candidate, date: string, history: HistoryDay[], fossilCandidates: string[], cd: Cooldowns = COOLDOWNS): boolean {
  return isEligible(c, date, history, cd) && hasFossilFree(c, date, history, fossilCandidates, cd);
}

/** True when at least one of the prompt's fossils is not resting on `date`. */
export function hasFossilFree(c: Candidate, date: string, history: HistoryDay[], fossilCandidates: string[], cd: Cooldowns = COOLDOWNS): boolean {
  const resting = fossilsResting(lastFossilUse(c.id, history), date, cd);
  return fossilCandidates.some((w) => !resting.has(w));
}

/** The prompts a day on `date` may be drawn from: those with a fossil that is not resting, less any the
 * builder has already found unusable for this date (`skip`). pickDay applies the cooldowns itself.
 * Until 2026-11-15 the draw was offered every prompt, and each drawn prompt with no fossil left wasted a salt;
 * once about a fifth of the themes were spent, all ten salts could be wasted and the date failed. */
export function drawablePools(
  pools: { themes: Candidate[]; origins: Candidate[] },
  date: string,
  history: HistoryDay[],
  fossilsOf: (c: Candidate) => string[],
  skip: ReadonlySet<string> = new Set(),
  cd: Cooldowns = COOLDOWNS
): { themes: Candidate[]; origins: Candidate[] } {
  const ok = (c: Candidate) => !skip.has(c.id) && hasFossilFree(c, date, history, fossilsOf(c), cd);
  return { themes: pools.themes.filter(ok), origins: pools.origins.filter(ok) };
}

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
 * theme's cooldown family, so the two (and their letter variants) never run within COOLDOWNS.baseDays of each
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

export type SupplyForecast = { days: number; unfilled: number; fewestFreeThemes: number };

/** Draws the `days` days from `from` the way the builder does (drawablePools, then pickDay with up to
 * `salts` salts), a few times over with throwaway seeds, and reports the worst run: how many days could not be
 * drawn, and the fewest theme prompts that were free (off cooldown, with a fossil not resting) on any day.
 * It spends fossils as the builder does (never-used first, then the one used longest ago) but does not check
 * page views or typos, so it is slightly generous. The real draw uses a secret seed, so this is a forecast of
 * supply, not of the days themselves. */
export function forecastSupply(
  pools: { themes: Candidate[]; origins: Candidate[] },
  history: HistoryDay[],
  fossilsOf: (c: Candidate) => string[],
  zipf: Map<string, number>,
  opts: { from: string; days: number; runs?: number; salts?: number },
  cd: Cooldowns = COOLDOWNS
): SupplyForecast {
  const DAY = 86_400_000;
  const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
  let unfilled = 0, fewestFreeThemes = Infinity;
  for (let run = 0; run < (opts.runs ?? 3); run++) {
    const h = [...history];
    let missed = 0;
    for (let i = 0; i < opts.days; i++) {
      const date = addDays(opts.from, i);
      const live = drawablePools(pools, date, h, fossilsOf, undefined, cd);
      fewestFreeThemes = Math.min(fewestFreeThemes, live.themes.filter((c) => isEligible(c, date, h, cd)).length);
      let picks: Candidate[] | null = null;
      for (let salt = 0; salt < (opts.salts ?? 10) && !picks; salt++) picks = pickDay(date, live, h, zipf, `forecast-${run}`, salt, cd);
      if (!picks) { missed++; continue; }
      h.push({ date, prompts: picks.map((c) => {
        const last = lastFossilUse(c.id, h), resting = fossilsResting(last, date, cd);
        const free = fossilsOf(c).filter((w) => !resting.has(w));
        const fossil = free.find((w) => !last.has(w)) ?? [...free].sort((a, b) => last.get(a)!.localeCompare(last.get(b)!))[0];
        return { id: c.id, base: c.base, fossil, ...(c.languages.length ? { languages: c.languages } : {}) };
      }) });
    }
    unfilled = Math.max(unfilled, missed);
  }
  return { days: opts.days, unfilled, fewestFreeThemes: Number.isFinite(fewestFreeThemes) ? fewestFreeThemes : 0 };
}
