import type { Catalogue } from "./catalogue";
import { ACCEPTED_CAP, slugify, type Candidate } from "./themes";
import { usableWord, type WiktionaryIndex } from "./wiktionary";
import { etymologySentence, fold } from "./fossil";

export const ORIGIN_CORE_CAP = 2000;
/** A big language's core alone passes ACCEPTED_CAP, which used to cut every accepted-only word ("opera" and
 * "violin" for Italian). Up to this many everyday ones (Zipf ≥ ORIGIN_EVERYDAY_ZIPF) are kept past the cap.
 * A ceiling, because a day file has a size limit (MAX_DAY_CHARS). */
export const ORIGIN_EVERYDAY_EXTRA = 250;
export const ORIGIN_EVERYDAY_ZIPF = 3;

type LangSets = { core: Set<string>; accepted: Set<string>; sources: Set<string>[] };

/** Origin prompts (pipeline-design §4). Core, the shown list, needs both Wiktionary's "derived from" category
 * and a structured etymology template naming the language, and a main etymology whose first sentence names it.
 * Accepted-only takes a word either source derives from the language when its main etymology names the
 * language anywhere, whatever route the word took: Sam's 2026-11-14 ruling is that a word counts if the
 * language is its immediate or its original source ("sugar" is from Arabic though it reached English through
 * French), and Wiktionary's data cannot tell a middle step from the first one.
 * Dialects and stages listed in the catalogue's originVariants count as their language ("pizza" is tagged
 * Neapolitan, "taco" Mexican Spanish, "amen" Biblical Hebrew), as do its root categories ("the Arabic root …").
 * Grouped origins union their members (fix 3). Common-tier caps are enforced by the floor in answers.ts. */
export function originCandidates(
  index: WiktionaryIndex,
  zipf: Map<string, number>,
  cat: Catalogue,
  curioLineage: Map<string, string[]>
): Candidate[] {
  // A spelling's entries are merged, so a homograph's sense can carry the tag ("he": the Hebrew
  // letter). For core, the word's main etymology sentence must name the language (its last word, so
  // "Old Norse" accepts "Norse"); a word with no etymology text keeps the category's word for it.
  const names = (w: string, lang: string) => {
    const s = fold(etymologySentence(index.info.get(w)?.etymology ?? ""));
    return !s || s.includes(fold(lang.split(" ").at(-1)!));
  };
  // For accepted-only the language (or the dialect label that tagged the word) may be named anywhere in the
  // main etymology, not just first: "sugar" names French first and Arabic later. A homograph still fails:
  // the main etymology of "tell" never mentions Arabic, though its archaeology sense is tagged with it.
  const lastWord = (label: string) => fold(label.split(" ").at(-1)!);
  const mentions = (w: string, labels: string[]) => {
    const text = fold(index.info.get(w)?.etymology ?? "");
    return !text || labels.some((l) => text.includes(lastWord(l)));
  };
  const usable = (w: string) => usableWord(index, zipf, w);
  const exclude = new Set(cat.originExclude);
  const variantOf = new Set(Object.values(cat.originVariants ?? {}).flat());
  const none = new Set<string>();
  const sets = new Map<string, LangSets>();
  for (const lang of index.originCategory.keys()) {
    const code = cat.langCodes[lang];
    if (!code || variantOf.has(lang)) continue;
    const labels = [lang, ...(cat.originVariants?.[lang] ?? [])];
    // "English terms derived from the Arabic root ك ح ل" belongs to Arabic.
    const roots = [...index.originCategory.keys()].filter((k) => labels.some((l) => k.startsWith(`the ${l} root `)));
    const core = new Set<string>(), accepted = new Set<string>(), sources: Set<string>[] = [];
    for (const label of [...labels, ...roots]) {
      const category = index.originCategory.get(label) ?? none;
      const labelCode = cat.langCodes[label];
      const template = (labelCode && index.originTemplate.get(labelCode)) || none;
      sources.push(category, template);
      for (const w of [...category, ...template]) if (usable(w) && mentions(w, [lang, label])) accepted.add(w);
      if (label === lang) for (const w of category) if (template.has(w) && usable(w) && names(w, lang)) core.add(w);
    }
    sets.set(lang, { core, accepted, sources });
  }
  const lineageAgrees = (w: string, languages: string[]) => {
    const l = curioLineage.get(w);
    return !l || languages.some((lang) => l.includes(lang));
  };
  const make = (id: string, text: string, languages: string[]): Candidate | null => {
    const members = languages.map((l) => sets.get(l)).filter((s): s is LangSets => !!s);
    if (!members.length) return null;
    const core = [...new Set(members.flatMap((m) => [...m.core]))].filter((w) => lineageAgrees(w, languages)).sort();
    // Too broad to play, and too big for a day file (pipeline-design §10's size cap). The spec's
    // big languages (Japanese 1,576, Spanish 1,523) fit under it; French and Greek don't.
    if (core.length > ORIGIN_CORE_CAP) return null;
    const coreSet = new Set(core);
    const rest = [...new Set(members.flatMap((m) => [...m.accepted]))].filter((w) => !coreSet.has(w))
      .sort((a, b) => (zipf.get(b) ?? 0) - (zipf.get(a) ?? 0));
    const everyday = rest.filter((w) => (zipf.get(w) ?? 0) >= ORIGIN_EVERYDAY_ZIPF).length;
    const room = Math.max(ACCEPTED_CAP - core.length, Math.min(ORIGIN_EVERYDAY_EXTRA, everyday));
    return {
      id, base: id, kind: "origin", text, core,
      accepted: [...core, ...rest.slice(0, room)],
      sources: members.flatMap((m) => m.sources),
      anchor: id, senseIds: null, ancestors: new Set(), languages,
    };
  };
  const out: Candidate[] = [];
  for (const lang of [...sets.keys()].sort()) {
    if (exclude.has(lang)) continue;
    const c = make(`origin:${slugify(lang)}`, `Name a word that came to English from ${lang}`, [lang]);
    if (c) out.push(c);
  }
  for (const g of cat.originGroups) {
    const c = make(g.id, g.text, g.languages);
    if (c) out.push(c);
  }
  return out;
}
