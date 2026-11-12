import { normalizeKey } from "../../lib/dig/normalize";
import { buildLookup, checkGuess, editDistance } from "../../lib/dig/match";
import { decodeDay, encodeDay } from "../../lib/dig/payload";
import { tierFromZipf } from "../../lib/dig/score";
import type { DigPromptPlain } from "../../lib/dig/types";
import { buildGuard } from "./answers";
import type { DigSink } from "./sink";
import type { Candidate } from "./themes";
import { fossilTypoCollides, MAX_DAY_CHARS } from "./validate";

/** Brings built days in line with today's word lists (pipeline fixes, 2026-11-07).
 *
 * Days are frozen once built: never re-drawn, never re-tiered. A repair only appends accepted-only
 * answers (tiered by frequency, exactly as adjudication does) and, on days nobody has played yet,
 * takes out stray-sense words ("more" as a vegetable). Core answers and the fossil are never
 * touched, and today's day is left alone because it is CDN-cached until rollover. */

type PromptCtx = { zipf: Map<string, number>; guardLexicon: Set<string>; removeHomographs: boolean };

/** A typo of the fossil can only land on a word within a few edits of it (one typo, then one
 * more for a near miss, or a plural ending), so only those words need the full check. */
const NEAR_FOSSIL_EDITS = 3;

export function repairPrompt(original: DigPromptPlain, c: Candidate, ctx: PromptCtx): { prompt: DigPromptPlain; added: string[]; removed: string[] } {
  const p: DigPromptPlain = structuredClone(original);
  const removed: string[] = [];
  if (ctx.removeHomographs && c.homographs?.size) {
    const drop = new Set<number>();
    p.answers.forEach(([w, , core], i) => {
      if (core === 0 && w !== p.fossil.word && c.homographs!.has(w)) drop.add(i);
    });
    if (drop.size) {
      const remap = new Map<number, number>();
      const kept = p.answers.filter((a, i) => {
        if (drop.has(i)) { removed.push(a[0]); return false; }
        remap.set(i, remap.size);
        return true;
      });
      p.answers = kept;
      p.aliases = Object.fromEntries(Object.entries(p.aliases).flatMap(([k, i]) => (remap.has(i) ? [[k, remap.get(i)!]] : [])));
      p.stories = Object.fromEntries(Object.entries(p.stories).filter(([w]) => !removed.includes(w)));
    }
  }
  const added: string[] = [];
  const lookup = buildLookup(p);
  const fossilKey = normalizeKey(p.fossil.word);
  for (const w of c.accepted) {
    const key = normalizeKey(w);
    if (!key || checkGuess(lookup, w).kind === "match") continue;
    p.answers.push([w, tierFromZipf(ctx.zipf.get(w)), 0]);
    const fresh = !lookup.keys.has(key);
    if (fresh) lookup.keys.set(key, p.answers.length - 1);
    if (editDistance(key, fossilKey, NEAR_FOSSIL_EDITS) <= NEAR_FOSSIL_EDITS && fossilTypoCollides(p, p.fossil.word, lookup)) {
      p.answers.pop();
      if (fresh) lookup.keys.delete(key);
      continue;
    }
    added.push(w);
  }
  if (added.length || removed.length) p.guard = buildGuard(p.answers.map((a) => a[0]), p.aliases, ctx.guardLexicon);
  return { prompt: p, added, removed };
}

export async function repairDays(
  sink: DigSink,
  candidates: Map<string, Candidate>,
  ctx: { today: string; zipf: Map<string, number>; guardLexicon: Set<string>; maxDayChars?: number }
): Promise<{ amendedDays: number; added: number; removed: number; skippedOversize: number }> {
  const cap = ctx.maxDayChars ?? MAX_DAY_CHARS;
  const manifest = await sink.readManifest();
  let amendedDays = 0, added = 0, removed = 0, skippedOversize = 0;
  for (const date of Object.keys(manifest?.days ?? {}).sort()) {
    if (date === ctx.today) continue;
    const stored = await sink.readDay(date);
    if (!stored) continue;
    let plain;
    try { plain = decodeDay(stored); } catch { throw new Error(`repair: day ${date} unreadable`); }
    const additions: { prompt: number; word: string }[] = [];
    let removedHere = 0;
    plain.prompts = plain.prompts.map((p, i) => {
      const c = candidates.get(p.id);
      if (!c) return p;
      const r = repairPrompt(p, c, { zipf: ctx.zipf, guardLexicon: ctx.guardLexicon, removeHomographs: date > ctx.today });
      r.added.forEach((word) => additions.push({ prompt: i, word }));
      removedHere += r.removed.length;
      return r.prompt;
    });
    if (!additions.length && !removedHere) continue;
    // Over the cap: take out the rarest additions first (they sit at the end of their prompt's list).
    additions.sort((a, b) => (ctx.zipf.get(b.word) ?? 0) - (ctx.zipf.get(a.word) ?? 0));
    let encoded = encodeDay(plain);
    while (JSON.stringify(encoded).length > cap && additions.length) {
      const { prompt, word } = additions.pop()!;
      const p = plain.prompts[prompt];
      p.answers.splice(p.answers.findIndex((a) => a[0] === word && a[2] === 0), 1);
      p.guard = buildGuard(p.answers.map((a) => a[0]), p.aliases, ctx.guardLexicon);
      skippedOversize++;
      encoded = encodeDay(plain);
    }
    if (JSON.stringify(encoded).length > cap) { skippedOversize++; continue; }
    if (!additions.length && !removedHere) continue;
    await sink.writeDay(encoded);
    amendedDays++;
    added += additions.length;
    removed += removedHere;
  }
  return { amendedDays, added, removed, skippedOversize };
}
