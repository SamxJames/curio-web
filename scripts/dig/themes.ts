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
const singular = (s: string) => s.replace(/ies$/, "y").replace(/(ch|sh|x|ss)es$/, "$1").replace(/s$/, "");
const singularPhrase = (s: string) => {
  const parts = s.split(" ");
  parts[parts.length - 1] = singular(parts[parts.length - 1]);
  return parts.join(" ");
};

export function themeText(name: string, via: "kind-of" | "domain", renames: Record<string, string>): string {
  if (renames[name]) return renames[name];
  const lower = name.toLowerCase();
  const article = (s: string) => (/^[aeiou]/.test(s) ? "an" : "a");
  if (via === "domain") return `Name ${article(lower)} ${lower} word`;
  // "Buildings and structures" → "a building or structure"
  if (lower.includes(" and ")) {
    const s = lower.split(" and ").map(singularPhrase).join(" or ");
    return `Name ${article(s)} ${s}`;
  }
  // A mass noun ("Clothing", "Glass") has no singular to name: "a type of clothing".
  const last = lower.split(" ").at(-1)!;
  if (!/s$/.test(last) || /(ss|us|is)$/.test(last)) return `Name a type of ${lower}`;
  const s = singularPhrase(lower);
  return `Name ${article(s)} ${s}`;
}

type Anchor = { id: string; via: "kind-of" | "domain"; size: number };

/** Own-sense anchoring (pipeline-design §3a fix 1): the most specific head form that
 * anchors at least `minAnchor` words wins, so "Citrus fruits" anchors at citrus fruit,
 * not at fruit. */
function anchorCategory(wn: Wordnet, name: string, words: Set<string>, overrides: Record<string, string[]>, minAnchor: number): Anchor | null {
  const lower = name.toLowerCase();
  const heads = overrides[name] ?? [singularPhrase(lower), lower, singular(lower.split(" ").slice(-1)[0])];
  let fallback: Anchor | null = null;
  for (const head of [...new Set(heads)]) {
    let best: Anchor | null = null;
    for (const id of wn.synsetsOf.get(head) ?? []) {
      if (wn.synsets.get(id)?.pos !== "n") continue;
      for (const [via, set] of [["kind-of", hyponymLemmas(wn, [id])], ["domain", domainLemmas(wn, [id])]] as const) {
        let size = 0;
        for (const w of words) if (set.has(w)) size++;
        if (!best || size > best.size) best = { id, via, size };
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
    if (a.via === "kind-of") {
      const below = hyponymSynsets(wn, [a.id]);
      for (const [other, a2] of anchors) if (a2.via === "kind-of" && below.has(a2.id)) index.categories.get(other)!.forEach((w) => wiktionary.add(w));
    }
    const senseIds = a.via === "kind-of" ? hyponymSynsets(wn, [a.id]) : domainSynsets(wn, [a.id]);
    const wnSet = a.via === "kind-of" ? hyponymLemmas(wn, [a.id]) : domainLemmas(wn, [a.id]);
    const core = [...wiktionary].filter((w) => wnSet.has(w) && usable(w)).sort();
    if (core.length > OVER_BROAD) continue;
    const others = [...wiktionary, ...[...wnSet].filter((w) => index.info.has(w))].filter(usable);
    const c: Candidate = {
      id: `theme:${slugify(name)}`, base: `theme:${slugify(name)}`, kind: "theme",
      text: themeText(name, a.via, cat.renames), core, accepted: capAccepted(core, others, zipf),
      sources: [wiktionary, wnSet], anchor: a.id, senseIds, ancestors: ancestors(wn, a.id), languages: [],
    };
    const prev = byAnchor.get(a.id);
    if (!prev || prev.id.length > c.id.length) byAnchor.set(a.id, c);
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
