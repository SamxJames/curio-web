import { normalizeKey } from "../../lib/dig/normalize";
import { oneEditVariants } from "../../lib/dig/match";
import type { Wordnet } from "./sources/oewn";
import { curatedAnswers, listFor, rootId, type Catalogue } from "./catalogue";
import type { Candidate } from "./themes";
import type { WiktionaryIndex } from "./wiktionary";

export type Counts = { core: number; easy: number; rare: number; common: number };
type Ctx = { wn: Wordnet; index: WiktionaryIndex; zipf: Map<string, number> };

/** True if the answer, its key, or any word inside it ("glans penis") is on the blocklist. */
export function hasBlockedWord(w: string, blocked: Set<string>): boolean {
  if (blocked.has(w) || blocked.has(normalizeKey(w))) return true;
  return w.toLowerCase().split(/[\s-]+/).some((t) => blocked.has(t) || blocked.has(normalizeKey(t)));
}

export function dropBlocked(c: Candidate, blocked: Set<string>): Candidate {
  const ok = (w: string) => !hasBlockedWord(w, blocked);
  return { ...c, core: c.core.filter(ok), accepted: c.accepted.filter(ok), ...(c.obvious ? { obvious: c.obvious.filter(ok) } : {}) };
}

/** One spelling per normalised key ("ice rink" / "ice-rink" would otherwise be two answers sharing a key, possibly
 * at different tiers, which the validator rejects). A core spelling beats a non-core one; otherwise the first wins. */
export function dedupeByKey(c: Candidate): Candidate {
  const core = new Set(c.core);
  const pick = new Map<string, string>();
  for (const w of c.accepted) {
    const k = normalizeKey(w), prev = pick.get(k);
    if (prev === undefined || (!core.has(prev) && core.has(w))) pick.set(k, w);
  }
  const kept = new Set(pick.values());
  const accepted = [...pick.values()];
  return { ...c, accepted, core: [...new Set(c.core.filter((w) => kept.has(w)))] };
}

/** At or above this Zipf, a preposition, pronoun, article or conjunction is one of the few hundred commonest
 * words of English. Typed into a prompt it is filler, not an answer ("to", "in", "on" as sailing words). */
export const FUNCTION_WORD_ZIPF = 5;

export type FinishCtx = {
  cat: Catalogue; blocked: Set<string>; index: WiktionaryIndex; zipf: Map<string, number>;
  /** Adjudication's accepted guesses, by prompt id. */
  extras?: Record<string, string[]>;
};

/** The one place a candidate's lists are completed. Every candidate passes through here, in the build and in the
 * audit: adjudication extras and hand-picked answers go in; the catalogue's excluded words and very common
 * function words come out of everything; hidden words leave the shown (core) list but stay accepted; then the
 * blocklist, and one spelling per key. Safe to run twice on the same candidate. */
export function finishCandidate(c: Candidate, ctx: FinishCtx): Candidate {
  const picked = [...(ctx.extras?.[c.id] ?? []), ...curatedAnswers(ctx.cat, { id: c.id, base: rootId(c) })];
  const keep = new Set(picked.map(normalizeKey));
  const core = new Set(c.core);
  // A second pass keeps what the first one took out (its function words are no longer in `accepted` to be found again).
  const excluded = new Set([...(c.excluded ?? []), ...listFor(ctx.cat.excludeAnswers, c).map(normalizeKey)]);
  for (const k of keep) excluded.delete(k);
  const accepted = [...new Set([...c.accepted, ...picked])];
  for (const w of accepted) {
    if (core.has(w) || keep.has(normalizeKey(w))) continue;
    if (ctx.index.info.get(w)?.functionWord && (ctx.zipf.get(w) ?? 0) >= FUNCTION_WORD_ZIPF) excluded.add(normalizeKey(w));
  }
  const hidden = new Set(listFor(ctx.cat.hiddenAnswers, c).map(normalizeKey));
  const allowed = (w: string) => !excluded.has(normalizeKey(w));
  const finished: Candidate = {
    ...c,
    core: c.core.filter((w) => allowed(w) && !hidden.has(normalizeKey(w))),
    accepted: accepted.filter(allowed),
    ...(c.obvious ? { obvious: c.obvious.filter(allowed) } : {}),
    excluded, hidden,
  };
  return dedupeByKey(dropBlocked(finished, ctx.blocked));
}

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
    if (!info || info.strictObsolete || info.strictOffensive) return false;
    if (c.senseIds) {
      const first = wn.synsetsOf.get(w)?.[0];
      if (!first || !c.senseIds.has(first)) return false;
    }
    return true;
  });
}

/** Publishing floor [core, easy, rare]. Sam's 2026-10-24 supply ruling loosened themes to 30 / 5 and
 * origins to 5 easy (the spec's 40 / 8 / 10 ran dry in about 8 days); letter variants keep 25 / 3 / 5. */
export function floorFor(kind: "theme" | "origin", letter: boolean): [number, number, number] {
  if (letter) return [25, 3, 5];
  return kind === "theme" ? [30, 5, 10] : [40, 5, 10];
}

export function floorProblems(c: Candidate, ctx: Ctx): string[] {
  const n = counts(c, ctx.zipf);
  const [minCore, minEasy, minRare] = floorFor(c.kind, isLetterVariant(c));
  const problems: string[] = [];
  if (n.core < minCore) problems.push(`core ${n.core} < ${minCore}`);
  if (n.easy < minEasy) problems.push(`easy ${n.easy} < ${minEasy}`);
  if (n.rare < minRare) problems.push(`rare ${n.rare} < ${minRare}`);
  if (c.kind === "origin" && n.common > 300) problems.push(`common ${n.common} > 300`);
  if (fossilCandidates(c, ctx).length === 0) problems.push("no fossil");
  // The answers people type first must count ("mother" for a family member). Counts only: words would name future answers.
  if (c.obvious?.length) {
    const keys = new Set(c.accepted.map(normalizeKey));
    const missing = c.obvious.filter((w) => !keys.has(normalizeKey(w))).length;
    if (missing) problems.push(`obvious ${missing} missing`);
  }
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
      if (k && !own.has(k) && !Object.hasOwn(aliases, k)) aliases[k] = i;
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
