import { tierFromZipf } from "../../lib/dig/score";
import type { DigFossil, DigPromptPlain, Tier } from "../../lib/dig/types";
import type { Candidate } from "./themes";

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The words whose pageviews we need: up to 60 rare core words for the median (seeded
 * sample) plus up to 150 Uncommon/Rare core words with Zipf ≥ 1.3, the plausible famous ones. */
export function viewWordsFor(c: Candidate, zipf: Map<string, number>, seed: number): string[] {
  const rare = c.core.filter((w) => (zipf.get(w) ?? 0) < 2.3);
  let s = seed >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const sample = [...rare].sort(() => rand() - 0.5).slice(0, 60);
  const famous = c.core.filter((w) => { const z = zipf.get(w) ?? 0; return z < 3 && z >= 1.3; })
    .sort((a, b) => (zipf.get(b) ?? 0) - (zipf.get(a) ?? 0)).slice(0, 150);
  return [...new Set([...sample, ...famous])];
}

/** pipeline-design §6: absolute Zipf tiers, then at most two Uncommon/Rare core words whose
 * views are ≥ 4× the median of the prompt's rare words become Popular picks. */
export function assignTiers(c: Candidate, zipf: Map<string, number>, views: Map<string, number>): Map<string, Tier> {
  const tiers = new Map<string, Tier>();
  for (const w of c.accepted) tiers.set(w, tierFromZipf(zipf.get(w)));
  const rareViews = c.core.filter((w) => tiers.get(w) === "rare" && views.has(w)).map((w) => views.get(w)!);
  const m = median(rareViews);
  if (m > 0) {
    c.core
      .filter((w) => (tiers.get(w) === "rare" || tiers.get(w) === "uncommon") && (views.get(w) ?? 0) >= 4 * m)
      .sort((a, b) => (views.get(b) ?? 0) - (views.get(a) ?? 0) || a.localeCompare(b))
      .slice(0, 2)
      .forEach((w) => tiers.set(w, "popular"));
  }
  return tiers;
}

const MAX_FACT = 140;

/** The first clause of a Wiktionary etymology, trimmed to 140 characters, or null. */
export function etymologyFact(text: string): string | null {
  const first = text.trim().split(/(?<=[.;])\s/)[0]?.replace(/[.;]\s*$/, "").trim() ?? "";
  if (!first) return null;
  if (first.length <= MAX_FACT) return first;
  const cut = first.slice(0, MAX_FACT - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : cut.length)}…`;
}

export type FossilCtx = {
  candidates: string[];
  tiers: Map<string, Tier>;
  views: Map<string, number>;
  curio: Map<string, { slug: string; teaser: string }>;
  definitions: Map<string, string>;
  etymology: (w: string) => string;
  /** Today's/tomorrow's daily word and /play answer, fossils already used today, and this
   * prompt's previous fossils. */
  exclude: Set<string>;
};

/** pipeline-design §7: a Curio story word if any candidate is one (its teaser is the fact),
 * else the most-viewed candidate that has a sourced fact. Ties go to the alphabetical first. */
export function chooseFossil(_c: Candidate, ctx: FossilCtx): DigFossil | null {
  const pool = ctx.candidates
    .filter((w) => !ctx.exclude.has(w) && ctx.tiers.get(w) !== "popular")
    .sort((a, b) => (ctx.views.get(b) ?? 0) - (ctx.views.get(a) ?? 0) || a.localeCompare(b));
  const curioPick = pool.find((w) => ctx.curio.has(w));
  if (curioPick) {
    const entry = ctx.curio.get(curioPick)!;
    return { word: curioPick, fact: entry.teaser.slice(0, MAX_FACT), story: entry.slug };
  }
  for (const w of pool) {
    const fact = etymologyFact(ctx.etymology(w)) ?? (ctx.definitions.get(w) ? etymologyFact(ctx.definitions.get(w)!) : null);
    if (fact) return { word: w, fact };
  }
  return null;
}

export function toPlainPrompt(
  c: Candidate,
  tiers: Map<string, Tier>,
  fossil: DigFossil,
  aliases: Record<string, number>,
  guard: string[],
  curio: Map<string, { slug: string }>
): DigPromptPlain {
  const core = new Set(c.core);
  const stories: Record<string, string> = {};
  for (const w of c.core) { const s = curio.get(w); if (s) stories[w] = s.slug; }
  return {
    id: c.id, kind: c.kind, text: c.text,
    answers: c.accepted.map((w) => [w, w === fossil.word ? "fossil" : tiers.get(w)!, core.has(w) ? 1 : 0]),
    aliases, guard, fossil, stories,
  };
}
