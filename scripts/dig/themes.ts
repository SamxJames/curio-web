import { ancestors, domainLemmas, domainSynsets, hyponymLemmas, hyponymSynsets, type Wordnet } from "./sources/oewn";
import { isBlocked, type Catalogue, type WikidataTheme } from "./catalogue";
import { usableWord, type WiktionaryIndex } from "./wiktionary";

export type Candidate = {
  id: string;
  /** Cooldown family root: a letter variant's base is its parent theme. */
  base: string;
  kind: "theme" | "origin";
  text: string;
  core: string[];
  accepted: string[];
  /** Each independent source's word set, for adjudication. */
  sources: Set<string>[];
  anchor: string;
  /** Synset ids that count as the theme sense (fossil first-sense check); null = no check. */
  senseIds: Set<string> | null;
  ancestors: Set<string>;
  languages: string[];
};

export const ACCEPTED_CAP = 1200;
const OVER_BROAD = 800;

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const IRREGULAR: Record<string, string> = {
  teeth: "tooth", geese: "goose", mice: "mouse", lice: "louse", feet: "foot", men: "man", women: "woman",
  children: "child", cacti: "cactus", fungi: "fungus", knives: "knife", wolves: "wolf", leaves: "leaf", loaves: "loaf",
  shelves: "shelf", halves: "half", calves: "calf", scarves: "scarf", potatoes: "potato", tomatoes: "tomato", heroes: "hero",
};
const singular = (s: string) => {
  if (IRREGULAR[s]) return IRREGULAR[s];
  if (/ies$/.test(s)) return s.replace(/ies$/, "y");
  if (/(ch|sh|x|ss)es$/.test(s)) return s.replace(/es$/, "");
  return /ss$/.test(s) ? s : s.replace(/s$/, "");
};
const singularPhrase = (s: string) => {
  const parts = s.split(" ");
  parts[parts.length - 1] = singular(parts[parts.length - 1]);
  return parts.join(" ");
};

export function themeText(name: string, via: "kind-of" | "domain", renames: Record<string, string>): string {
  if (renames[name]) return renames[name];
  const lower = name.toLowerCase();
  // "a utensil", "a uniform", "a eucalyptus", "a one-man band": vowels that sound like a consonant.
  const article = (s: string) => (/^[aeiou]/.test(s) && !/^(u(ni|s[aeiou]|t[aeiou]|r[aeiou]|k|v)|eu|ewe|one)/.test(s) ? "an" : "a");
  const plural = (word: string) => !!IRREGULAR[word] || (/s$/.test(word) && !/(ss|us|is|ics)$/.test(word) && word !== "clothes"); // "Clothes", "Mathematics": no singular
  if (via === "domain") return `Name ${article(lower)} ${lower} word`;
  // "Buildings and structures" → "a building or structure"
  if (lower.includes(" and ")) {
    const parts = lower.split(" and ");
    if (!parts.every((p) => plural(p.split(" ").at(-1)!))) return `Name a type of ${parts.join(" or ")}`;
    const s = parts.map(singularPhrase).join(" or ");
    return `Name ${article(s)} ${s}`;
  }
  // "Birds of prey" → "a bird of prey": the head is the noun before "of".
  if (lower.includes(" of ")) {
    const [head, ...rest] = lower.split(" of ");
    if (plural(head.split(" ").at(-1)!)) {
      const s = `${singularPhrase(head)} of ${rest.join(" of ")}`;
      return `Name ${article(s)} ${s}`;
    }
  }
  // A mass noun ("Clothing", "Glass") has no singular to name: "a type of clothing".
  const last = lower.split(" ").at(-1)!;
  if (!plural(last)) return `Name a type of ${lower}`;
  const s = singularPhrase(lower);
  return `Name ${article(s)} ${s}`;
}

type Anchor = { id: string; via: "kind-of" | "domain"; size: number; broad: boolean };

/** Own-sense anchoring (pipeline-design §3a fix 1): the most specific head form that
 * anchors at least `minAnchor` words wins, so "Citrus fruits" anchors at citrus fruit,
 * not at fruit. */
export function anchorCategory(wn: Wordnet, name: string, words: Set<string>, overrides: Record<string, string[]>, minAnchor: number): Anchor | null {
  const lower = name.toLowerCase();
  const heads = overrides[name] ?? [singularPhrase(lower), lower, singular(lower.split(" ").slice(-1)[0])];
  let fallback: Anchor | null = null;
  // A multi-word name anchored only by its last word ("Baby animals" at animal) is "broad".
  // "Buildings and structures" names two kinds, not a subset: its last word is its own head.
  const broadHead = !overrides[name] && lower.includes(" ") && !lower.includes(" and ") ? singular(lower.split(" ").slice(-1)[0]) : null;
  for (const head of [...new Set(heads)]) {
    let best: Anchor | null = null;
    for (const id of wn.synsetsOf.get(head) ?? []) {
      if (wn.synsets.get(id)?.pos !== "n") continue;
      for (const [via, set] of [["kind-of", hyponymLemmas(wn, [id])], ["domain", domainLemmas(wn, [id])]] as const) {
        let size = 0;
        for (const w of words) if (set.has(w)) size++;
        if (!best || size > best.size) best = { id, via, size, broad: head === broadHead };
      }
    }
    if (best && best.size >= minAnchor) return best;
    if (best && (!fallback || best.size > fallback.size)) fallback = best;
  }
  return fallback && fallback.size >= 2 ? fallback : null;
}

function capAccepted(core: string[], others: Iterable<string>, zipf: Map<string, number>): string[] {
  const coreSet = new Set(core);
  const rest = [...new Set(others)].filter((w) => !coreSet.has(w)).sort((a, b) => (zipf.get(b) ?? 0) - (zipf.get(a) ?? 0));
  return [...core, ...rest].slice(0, Math.max(ACCEPTED_CAP, core.length));
}

export function wordnetThemes(
  wn: Wordnet,
  index: WiktionaryIndex,
  zipf: Map<string, number>,
  cat: Catalogue,
  opts: { minOwnWords?: number; minAnchor?: number } = {}
): Candidate[] {
  const minOwn = opts.minOwnWords ?? 25;
  const minAnchor = opts.minAnchor ?? 5;
  const usable = (w: string) => usableWord(index, zipf, w);
  const anchors = new Map<string, Anchor>();
  for (const [name, words] of index.categories) {
    if (words.size < Math.min(5, minOwn)) continue;
    const a = anchorCategory(wn, name, words, cat.anchorOverrides, minAnchor);
    if (a) anchors.set(name, a);
  }
  const out: Candidate[] = [];
  const byAnchor = new Map<string, Candidate>();
  for (const [name, a] of anchors) {
    const own = index.categories.get(name)!;
    if (own.size < minOwn || isBlocked(cat, name)) continue;
    const wiktionary = new Set(own);
    // A broad anchor's subtree is the parent theme, not this one: keep the category's own words.
    if (a.via === "kind-of" && !a.broad) {
      const below = hyponymSynsets(wn, [a.id]);
      for (const [other, a2] of anchors) if (a2.via === "kind-of" && below.has(a2.id)) index.categories.get(other)!.forEach((w) => wiktionary.add(w));
    }
    const senseIds = a.via === "kind-of" ? hyponymSynsets(wn, [a.id]) : domainSynsets(wn, [a.id]);
    const wnSet = a.via === "kind-of" ? hyponymLemmas(wn, [a.id]) : domainLemmas(wn, [a.id]);
    const core = [...wiktionary].filter((w) => wnSet.has(w) && usable(w)).sort();
    if (core.length > OVER_BROAD) continue;
    // Every animal is not a baby animal: a broad theme accepts only its category's words.
    const others = [...wiktionary, ...(a.broad ? [] : [...wnSet].filter((w) => index.info.has(w)))].filter(usable);
    const c: Candidate = {
      id: `theme:${slugify(name)}`, base: `theme:${slugify(name)}`, kind: "theme",
      text: themeText(name, a.via, cat.renames), core, accepted: capAccepted(core, others, zipf),
      sources: [wiktionary, wnSet], anchor: a.id, senseIds, ancestors: ancestors(wn, a.id), languages: [],
    };
    // Two names for one sense ("Fish" and "Fishes") keep the shorter; a broad-anchored subset
    // is its own theme, and assignFamilies keeps it apart from its parent.
    const key = a.broad ? c.id : a.id;
    const prev = byAnchor.get(key);
    if (!prev || prev.id.length > c.id.length) byAnchor.set(key, c);
  }
  out.push(...byAnchor.values());
  return out.sort((x, y) => x.id.localeCompare(y.id));
}

/** "Name a mammal beginning with C": each letter subset of an agreed core. */
export function letterVariants(theme: Candidate, zipf: Map<string, number>, opts: { minCore?: number } = {}): Candidate[] {
  const minCore = opts.minCore ?? 25;
  const byLetter = new Map<string, string[]>();
  for (const w of theme.core) byLetter.set(w[0], [...(byLetter.get(w[0]) ?? []), w]);
  const out: Candidate[] = [];
  for (const [letter, core] of [...byLetter].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (core.length < minCore) continue;
    const inLetter = (w: string) => w[0] === letter;
    out.push({
      ...theme,
      id: `${theme.id}:${letter}`,
      base: theme.base,
      text: `${theme.text} beginning with ${letter.toUpperCase()}`,
      core,
      accepted: theme.accepted.filter(inLetter),
      sources: theme.sources.map((s) => new Set([...s].filter(inLetter))),
    });
  }
  return out;
}

/** Wikidata themes (pipeline-design §3a fix 2): core = Wikidata labels that are usable
 * Wiktionary nouns (which also strips proper names); accepted adds the Wiktionary
 * categories named in the catalogue. No WordNet sense, so no first-sense check. */
export function wikidataThemeCandidates(
  themes: { theme: WikidataTheme; labels: Set<string> }[],
  index: WiktionaryIndex,
  zipf: Map<string, number>
): Candidate[] {
  const usable = (w: string) => usableWord(index, zipf, w);
  return themes.map(({ theme, labels }) => {
    const wiktionary = new Set<string>();
    for (const name of theme.wiktionary) index.categories.get(name)?.forEach((w) => wiktionary.add(w));
    const core = [...labels].filter((w) => usable(w) && index.info.get(w)!.noun).sort();
    return {
      id: theme.id, base: theme.id, kind: "theme" as const, text: theme.text, core,
      accepted: capAccepted(core, [...wiktionary].filter(usable), zipf),
      sources: [labels, wiktionary], anchor: `wikidata:${theme.qid}`, senseIds: null, ancestors: new Set<string>(), languages: [],
    };
  });
}
