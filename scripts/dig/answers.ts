import { normalizeKey } from "../../lib/dig/normalize";
import { oneEditVariants } from "../../lib/dig/match";
import type { Wordnet } from "./sources/oewn";
import type { Candidate } from "./themes";
import type { WiktionaryIndex } from "./wiktionary";

export type Counts = { core: number; easy: number; rare: number; common: number };
type Ctx = { wn: Wordnet; index: WiktionaryIndex; zipf: Map<string, number> };

export const isLetterVariant = (c: Candidate) => c.id.split(":").length === 3 && c.kind === "theme";

export function counts(c: Candidate, zipf: Map<string, number>): Counts {
  let easy = 0, rare = 0, common = 0;
  for (const w of c.core) {
    const z = zipf.get(w);
    if (z !== undefined && z >= 3.5) easy++;
    if (z === undefined || z < 2.3) rare++;
    if (z !== undefined && z >= 4) common++;
  }
  return { core: c.core.length, easy, rare, common };
}

/** pipeline-design §7 step 1, minus the date-dependent and pageview rules (fossil.ts). */
export function fossilCandidates(c: Candidate, { wn, index, zipf }: Ctx): string[] {
  return c.core.filter((w) => {
    const z = zipf.get(w);
    if (z !== undefined && z >= 2.3) return false;
    if (!/^[a-z]{4,14}$/.test(w)) return false;
    const info = index.info.get(w);
    if (!info || info.obsolete || info.offensive) return false;
    if (c.senseIds) {
      const first = wn.synsetsOf.get(w)?.[0];
      if (!first || !c.senseIds.has(first)) return false;
    }
    return true;
  });
}

export function floorProblems(c: Candidate, ctx: Ctx): string[] {
  const n = counts(c, ctx.zipf);
  const [minCore, minEasy, minRare] = isLetterVariant(c) ? [25, 3, 5] : [40, 8, 10];
  const problems: string[] = [];
  if (n.core < minCore) problems.push(`core ${n.core} < ${minCore}`);
  if (n.easy < minEasy) problems.push(`easy ${n.easy} < ${minEasy}`);
  if (n.rare < minRare) problems.push(`rare ${n.rare} < ${minRare}`);
  if (c.kind === "origin" && n.common > 300) problems.push(`common ${n.common} > 300`);
  if (fossilCandidates(c, ctx).length === 0) problems.push("no fossil");
  return problems;
}

/** Irregular plurals, alternative forms and UK/US spellings → answer index. Regular plurals
 * are handled in the browser by guessForms. A key already owned by an answer is skipped. */
export function buildAliases(accepted: string[], index: WiktionaryIndex, wn: Wordnet): Record<string, number> {
  const own = new Set(accepted.map(normalizeKey));
  const aliases: Record<string, number> = {};
  accepted.forEach((w, i) => {
    const forms = [...(index.info.get(w)?.aliases ?? []), ...(wn.spellingVariants.get(w) ?? [])];
    for (const f of forms) {
      const k = normalizeKey(f);
      if (k && !own.has(k) && !(k in aliases)) aliases[k] = i;
    }
  });
  return aliases;
}

/** Real English words one edit from any answer or alias key (≥ 4 letters), minus the
 * prompt's own keys: the browser never offers these as near misses. */
export function buildGuard(accepted: string[], aliases: Record<string, number>, lexicon: Set<string>): string[] {
  const keys = new Set([...accepted.map(normalizeKey), ...Object.keys(aliases)]);
  const guard = new Set<string>();
  for (const k of keys) {
    if (k.length < 4) continue;
    for (const v of oneEditVariants(k)) if (lexicon.has(v) && !keys.has(v)) guard.add(v);
  }
  return [...guard].sort();
}
