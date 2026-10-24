import { guessForms, normalizeKey } from "./normalize";
import type { PromptSecret } from "./types";

export type Lookup = { keys: Map<string, number>; guard: Set<string> };

export type GuessResult =
  | { kind: "match"; index: number }
  | { kind: "near"; index: number }
  | { kind: "miss" }
  | { kind: "empty" };

/** Every answer's own key, then its aliases. The first answer to claim a key keeps it
 * (the pipeline's validator rejects days where that would hide a different tier). */
export function buildLookup(secret: Pick<PromptSecret, "answers" | "aliases" | "guard">): Lookup {
  const keys = new Map<string, number>();
  secret.answers.forEach(([display], i) => {
    const k = normalizeKey(display);
    if (k && !keys.has(k)) keys.set(k, i);
  });
  for (const [k, i] of Object.entries(secret.aliases)) if (!keys.has(k)) keys.set(k, i);
  return { keys, guard: new Set(secret.guard) };
}

/** One edit for keys of 4+ letters; none for shorter ones (spec change 1 in the pipeline plan).
 * Guesses under 4 letters never get a near miss either (the length guard in checkGuess). */
export function maxEdits(len: number): number {
  return len >= 4 ? 1 : 0;
}

/** Optimal-string-alignment distance (insert, delete, substitute, adjacent swap), capped:
 * returns limit + 1 as soon as the result must exceed `limit`. */
export function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const n = b.length;
  let prev2: number[] = [];
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > limit) return limit + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[n] > limit ? limit + 1 : prev[n];
}

/** Exact (or plural/alias) match first. Otherwise a near miss, but only if exactly one
 * answer is one edit away and the guess isn't itself a guarded real word. Every near miss
 * is confirmed by the player, never scored silently. */
export function checkGuess(lookup: Lookup, raw: string): GuessResult {
  const key = normalizeKey(raw);
  if (!key) return { kind: "empty" };
  const forms = guessForms(key);
  for (const f of forms) {
    const i = lookup.keys.get(f);
    if (i !== undefined) return { kind: "match", index: i };
  }
  if (key.length < 4 || forms.some((f) => lookup.guard.has(f))) return { kind: "miss" };
  const hits = new Set<number>();
  for (const [k, i] of lookup.keys) {
    const limit = maxEdits(k.length);
    if (limit === 0 || Math.abs(k.length - key.length) > limit) continue;
    if (editDistance(key, k, limit) <= limit) {
      hits.add(i);
      if (hits.size > 1) return { kind: "miss" };
    }
  }
  return hits.size === 1 ? { kind: "near", index: [...hits][0] } : { kind: "miss" };
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** Every a–z string exactly one OSA edit from `key`. The pipeline intersects this with
 * the real-word lexicon to build each prompt's guard list. */
export function oneEditVariants(key: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i <= key.length; i++) {
    for (const c of LETTERS) out.add(key.slice(0, i) + c + key.slice(i));
    if (i < key.length) {
      out.add(key.slice(0, i) + key.slice(i + 1));
      for (const c of LETTERS) if (c !== key[i]) out.add(key.slice(0, i) + c + key.slice(i + 1));
      if (i + 1 < key.length && key[i] !== key[i + 1]) {
        out.add(key.slice(0, i) + key[i + 1] + key[i] + key.slice(i + 2));
      }
    }
  }
  out.delete(key);
  return out;
}
