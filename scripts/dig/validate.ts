import { buildLookup, checkGuess, oneEditVariants, type Lookup } from "../../lib/dig/match";
import { normalizeKey } from "../../lib/dig/normalize";
import { encodeDay } from "../../lib/dig/payload";
import type { DigDayPlain, PromptSecret } from "../../lib/dig/types";
import { COOLDOWNS, daysBetween, overlapRatio, type HistoryDay } from "./assemble";
import { floorFor, hasBlockedWord } from "./answers";

export const MAX_DAY_CHARS = 400_000;
export type ValidateCtx = { history: HistoryDay[]; storySlugs: Set<string>; dailyWords: Set<string>; blocked: Set<string> };

/** "theme:weather:a" → "theme:weather" (a letter variant); any other id is its own base. */
function baseOf(id: string): string {
  return id.replace(/^(theme:[^:]+):[a-z]$/, "$1");
}

/** pipeline-design §10, run on every generated day. Returns human-readable problems
 * (counts and ids only, never answer text, because the job summary is public). */
export function validateDay(day: DigDayPlain, ctx: ValidateCtx): string[] {
  const problems: string[] = [];
  const ps = day.prompts;
  if (ps.length !== 7) problems.push("a day needs 7 prompts");
  if (ps.filter((p) => p.kind === "origin").length !== 2) problems.push("a day needs exactly 2 origin prompts");
  if (ps[2]?.kind !== "origin" || ps[5]?.kind !== "origin") problems.push("origins must be at positions 3 and 6");
  if (new Set(ps.map((p) => p.id)).size !== ps.length) problems.push("prompt ids must be unique");

  for (const p of ps) {
    const isLetter = p.id.split(":").length === 3 && p.kind === "theme";
    const core = p.answers.filter((a) => a[2] === 1);
    const easyish = core.filter((a) => a[1] === "common" || a[1] === "familiar").length;
    const rareish = core.filter((a) => a[1] === "rare" || a[1] === "popular" || a[1] === "fossil").length;
    const [minCore, minEasy, minRare] = floorFor(p.kind, isLetter);
    if (!p.text.trim()) problems.push(`${p.id}: empty prompt text`);
    if (core.length < minCore) problems.push(`${p.id}: core ${core.length} < ${minCore}`);
    if (easyish < minEasy) problems.push(`${p.id}: too few easy answers`);
    if (rareish < minRare) problems.push(`${p.id}: too few rare answers`);
    if (p.fossil.fact.length < 1 || p.fossil.fact.length > 140) problems.push(`${p.id}: fossil fact must be 1–140 characters`);
    const fossilIndex = p.answers.findIndex((a) => a[0] === p.fossil.word);
    if (fossilIndex < 0 || p.answers[fossilIndex][1] !== "fossil" || p.answers[fossilIndex][2] !== 1) problems.push(`${p.id}: fossil missing from core`);
    if (p.answers.filter((a) => a[1] === "fossil").length !== 1) problems.push(`${p.id}: exactly one fossil`);
    if (p.fossil.story && !ctx.storySlugs.has(p.fossil.story)) problems.push(`${p.id}: unknown fossil story slug`);
    const unknownSlugs = Object.values(p.stories).filter((slug) => !ctx.storySlugs.has(slug)).length;
    if (unknownSlugs > 0) problems.push(`${p.id}: ${unknownSlugs} unknown story slug(s)`);
    if (p.answers.some((a) => hasBlockedWord(a[0], ctx.blocked))) problems.push(`${p.id}: blocked word`);
    if (ctx.dailyWords.has(p.fossil.word)) problems.push(`${p.id}: fossil clashes with the daily word or /play`);

    // Matching self-test: every answer and alias finds itself; no key hides a second tier;
    // simulated fossil typos land on the fossil or nowhere.
    const lookup = buildLookup(p);
    const seen = new Map<string, number>();
    p.answers.forEach((a, i) => {
      const k = normalizeKey(a[0]);
      const prev = seen.get(k);
      if (prev !== undefined && p.answers[prev][1] !== a[1]) problems.push(`${p.id}: answer ${i} shares a key with answer ${prev} at a different tier`);
      if (prev === undefined) seen.set(k, i);
      const r = checkGuess(lookup, a[0]);
      if (r.kind !== "match" || p.answers[r.index][1] !== a[1]) problems.push(`${p.id}: answer ${i} does not match itself`);
    });
    for (const [k, i] of Object.entries(p.aliases)) {
      if (!Number.isInteger(i) || i < 0 || i >= p.answers.length) {
        problems.push(`${p.id}: alias target ${i} out of range`);
        continue;
      }
      const r = checkGuess(lookup, k);
      if (r.kind !== "match" || r.index !== i) problems.push(`${p.id}: alias ${i} does not match`);
    }
    if (fossilIndex >= 0) {
      if (fossilTypoCollides(p, p.fossil.word, lookup)) problems.push(`${p.id}: a fossil typo resolves to another answer`);
    }
  }

  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i].answers.filter((x) => x[2] === 1).map((x) => normalizeKey(x[0]));
    const b = ps[j].answers.filter((x) => x[2] === 1).map((x) => normalizeKey(x[0]));
    if (overlapRatio(a, b) >= 0.2) problems.push(`${ps[i].id} and ${ps[j].id} overlap ≥ 20%`);
  }
  if (new Set(ps.map((p) => p.fossil.word)).size !== ps.length) problems.push("fossils must all differ");
  for (const h of ctx.history) {
    const gap = Math.abs(daysBetween(h.date, day.date));
    for (const hp of h.prompts) for (const p of ps) {
      if (p.kind === "theme" && hp.id === p.id && gap < COOLDOWNS.exactDays) problems.push(`${p.id}: repeats within ${COOLDOWNS.exactDays} days`);
      if (hp.id === p.id && hp.fossil === p.fossil.word) problems.push(`${p.id}: repeats a previous fossil`);
      if (p.kind === "theme" && hp.id !== p.id && gap < COOLDOWNS.baseDays && (hp.base || baseOf(hp.id)) === baseOf(p.id)) problems.push(`${p.id}: shares a base theme within ${COOLDOWNS.baseDays} days`);
    }
  }
  if (JSON.stringify(encodeDay(day)).length > MAX_DAY_CHARS) problems.push(`day is larger than ${MAX_DAY_CHARS} characters`);
  return problems;
}

/** True if a one-edit typo of `fossil` would match, or be offered as a near miss of, a different answer.
 * Exported so the build can skip such fossils instead of failing the whole day. */
export function fossilTypoCollides(secret: Pick<PromptSecret, "answers" | "aliases" | "guard">, fossil: string, lookup: Lookup = buildLookup(secret)): boolean {
  for (const v of oneEditVariants(normalizeKey(fossil))) {
    const r = checkGuess(lookup, v);
    if ((r.kind === "near" || r.kind === "match") && r.index >= 0 && r.index < secret.answers.length && secret.answers[r.index][0] !== fossil && normalizeKey(secret.answers[r.index][0]) !== v) return true;
  }
  return false;
}
