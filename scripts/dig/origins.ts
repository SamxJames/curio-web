import type { Catalogue } from "./catalogue";
import { ACCEPTED_CAP, slugify, type Candidate } from "./themes";
import { usableWord, type WiktionaryIndex } from "./wiktionary";
import { etymologySentence, fold } from "./fossil";

export const ORIGIN_CORE_CAP = 2000;

type LangSets ={ core: Set<string>; accepted: Set<string>; category: Set<string>; template: Set<string> };

/** Origin prompts (pipeline-design §4): core needs both Wiktionary's "derived from" category
 * and a structured etymology template naming the language. Grouped origins union their
 * members (fix 3). Common-tier caps are enforced by the floor in answers.ts. */
export function originCandidates(
  index: WiktionaryIndex,
  zipf: Map<string, number>,
  cat: Catalogue,
  curioLineage: Map<string, string[]>
): Candidate[] {
  // A spelling's entries are merged, so a homograph's sense can carry the tag ("he": the Hebrew
  // letter). The word's main etymology sentence must name the language (its last word, so
  // "Old Norse" accepts "Norse"); a word with no etymology text keeps the category's word for it.
  const names = (w: string, lang: string) => {
    const s = fold(etymologySentence(index.info.get(w)?.etymology ?? ""));
    return !s || s.includes(fold(lang.split(" ").at(-1)!));
  };
  const usable = (w: string) => usableWord(index, zipf, w);
  const exclude = new Set(cat.originExclude);
  const sets = new Map<string, LangSets>();
  for (const [lang, category] of index.originCategory) {
    const code = cat.langCodes[lang];
    if (!code) continue;
    const template = index.originTemplate.get(code) ?? new Set<string>();
    const ok = (w: string) => usable(w) && names(w, lang);
    const core = new Set([...category].filter((w) => template.has(w) && ok(w)));
    const accepted = new Set([...category, ...template].filter(ok));
    sets.set(lang, { core, accepted, category, template });
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
    return {
      id, base: id, kind: "origin", text, core,
      accepted: [...core, ...rest].slice(0, Math.max(ACCEPTED_CAP, core.length)),
      sources: members.flatMap((m) => [m.category, m.template]),
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
