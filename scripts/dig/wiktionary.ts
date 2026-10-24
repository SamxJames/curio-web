import type { CompactEntry } from "./sources/compact";

export type WordInfo = { ok: boolean; noun: boolean; offensive: boolean; obsolete: boolean; aliases: string[]; etymology: string };
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
const BAD = new Set(["vulgar", "offensive", "derogatory"]);
const NOT_ANSWER = new Set(["misspelling", "abbreviation", "initialism", "form-of", "alt-of"]);

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
  for await (const e of entries as AsyncIterable<CompactEntry>) {
    const w = e.w;
    if (!SHAPE.test(w) || w.length > 24 || w.split(" ").length > 2) continue;
    const prev = idx.info.get(w);
    const passes = OK_POS.has(e.pos) && !e.g.some((t) => NOT_ANSWER.has(t));
    const obsolete = e.g.includes("obsolete") || e.g.includes("archaic");
    idx.info.set(w, {
      ok: (prev?.ok ?? false) || passes,
      noun: (prev?.noun ?? false) || (passes && e.pos === "noun"),
      offensive: (prev?.offensive ?? false) || e.g.some((t) => BAD.has(t)) || badWords.has(w),
      obsolete: prev ? prev.obsolete && obsolete : obsolete,
      aliases: [...new Set([...(prev?.aliases ?? []), ...e.f])].slice(0, 8),
      etymology: prev?.etymology || e.et,
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
