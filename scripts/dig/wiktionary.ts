import { BAD_TAGS, NOT_ANSWER_TAGS, type CompactEntry } from "./sources/compact";

/** `offensive` and `obsolete` judge the word by its senses (answers): a word is offensive if it is
 * blocklisted or at least as many senses are offensive as are usable, and obsolete if no usable
 * sense is current. The strict pair (fossils, shown to every player) is the older rule: any
 * entry with an offensive sense, and every entry carrying an obsolete tag. */
export type WordInfo = {
  ok: boolean; noun: boolean; offensive: boolean; obsolete: boolean;
  strictOffensive: boolean; strictObsolete: boolean; aliases: string[]; etymology: string;
  /** Some entry is a preposition, pronoun, article, determiner, conjunction or particle ("to", "he", "an"). */
  functionWord?: boolean;
};
export type WiktionaryIndex = {
  info: Map<string, WordInfo>;
  /** "Fruits" (from "en:Fruits") → words */
  categories: Map<string, Set<string>>;
  /** "Arabic" (from "English terms derived from Arabic") → words */
  originCategory: Map<string, Set<string>>;
  /** "ar" (from etymology templates) → words */
  originTemplate: Map<string, Set<string>>;
};

const SHAPE = /^[a-z][a-z' -]*[a-z]$/;
const OK_POS = new Set(["noun", "verb", "adj", "adv"]);
const FUNCTION_POS = new Set(["prep", "pron", "det", "article", "conj", "particle", "postp"]);
const BAD = BAD_TAGS;
const NOT_ANSWER = NOT_ANSWER_TAGS;

function add(map: Map<string, Set<string>>, key: string, w: string) {
  const set = map.get(key) ?? new Set<string>();
  set.add(w);
  map.set(key, set);
}

/** One pass over the compact dump. Only lowercase, 1–2 word, ≤ 24-character headwords are kept. */
export async function indexWiktionary(
  entries: AsyncIterable<CompactEntry> | Iterable<CompactEntry>,
  badWords: Set<string>
): Promise<WiktionaryIndex> {
  const idx: WiktionaryIndex = { info: new Map(), categories: new Map(), originCategory: new Map(), originTemplate: new Map() };
  // Sense counts summed over a word's entries (format 2 compact files only).
  const senses = new Map<string, { usable: number; bad: number; live: number }>();
  for await (const e of entries as AsyncIterable<CompactEntry>) {
    const w = e.w;
    if (!SHAPE.test(w) || w.length > 24 || w.split(" ").length > 2) continue;
    const prev = idx.info.get(w);
    const counted = e.k !== undefined;
    const strictPasses = OK_POS.has(e.pos) && !e.g.some((t) => NOT_ANSWER.has(t));
    const passes = counted ? OK_POS.has(e.pos) && e.k! > 0 : strictPasses;
    const obsoleteEntry = e.g.includes("obsolete") || e.g.includes("archaic");
    const strictOffensive = (prev?.strictOffensive ?? false) || e.g.some((t) => BAD.has(t)) || badWords.has(w);
    const strictObsolete = prev ? prev.strictObsolete && obsoleteEntry : obsoleteEntry;
    let offensive = strictOffensive, obsolete = strictObsolete;
    if (counted) {
      const s = senses.get(w) ?? { usable: 0, bad: 0, live: 0 };
      if (OK_POS.has(e.pos)) { s.usable += e.k!; s.live += e.l ?? 0; }
      s.bad += e.b ?? 0;
      senses.set(w, s);
      offensive = badWords.has(w) || (s.bad > 0 && s.bad >= s.usable);
      obsolete = s.live === 0;
    }
    idx.info.set(w, {
      ok: (prev?.ok ?? false) || passes,
      noun: (prev?.noun ?? false) || (passes && e.pos === "noun"),
      offensive, obsolete, strictOffensive, strictObsolete,
      aliases: [...new Set([...(prev?.aliases ?? []), ...e.f])].slice(0, 8),
      etymology: prev?.etymology || e.et,
      ...(prev?.functionWord || FUNCTION_POS.has(e.pos) ? { functionWord: true } : {}),
    });
    for (const c of e.c) {
      if (c.startsWith("en:")) add(idx.categories, c.slice(3), w);
      const o = c.match(/^English terms (?:borrowed|derived) from (.+)$/);
      if (o) add(idx.originCategory, o[1], w);
    }
    for (const t of e.e) add(idx.originTemplate, t.split(":")[1], w);
  }
  return idx;
}

/** The pipeline-design §5 word filter. Obsolete words pass only if wordfreq knows them. */
export function usableWord(index: WiktionaryIndex, zipf: Map<string, number>, w: string): boolean {
  const i = index.info.get(w);
  return !!i && i.ok && !i.offensive && (!i.obsolete || zipf.has(w));
}
