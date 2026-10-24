import { normalizeKey } from "../../lib/dig/normalize";

/** Every real English word key we know (wordfreq + Wiktionary English headwords). The
 * guard list is built from it: a guess that is a real word is never "corrected". */
export function buildLexicon(zipf: Map<string, number>, words: Iterable<string>): Set<string> {
  const out = new Set<string>();
  const add = (w: string) => {
    const k = normalizeKey(w);
    if (k.length >= 2) out.add(k);
  };
  for (const w of zipf.keys()) add(w);
  for (const w of words) add(w);
  return out;
}
