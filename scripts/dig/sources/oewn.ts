// Open English WordNet 2025 (WN-LMF XML, CC BY 4.0). Regex loader, no dependencies.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

export type Synset = { members: string[]; pos: string; def: string; hyper: string[]; hypo: string[]; domain: string[] };
export type Wordnet = {
  synsets: Map<string, Synset>;
  /** lowercase lemma → synset ids in sense order */
  synsetsOf: Map<string, string[]>;
  spellingVariants: Map<string, Set<string>>;
  byDomain?: Map<string, string[]>;
};

const decodeXml = (s: string) =>
  s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function isSpellingPair(a: string, b: string): boolean {
  const n = (x: string) =>
    x.replace(/our/g, "or").replace(/([^aeiou])re$/, "$1er").replace(/ise/g, "ize").replace(/yse/g, "yze")
      .replace(/ae/g, "e").replace(/oe/g, "e").replace(/ll/g, "l");
  return a.length > 3 && n(a) === n(b);
}

export function parseOewn(xml: string): Wordnet {
  const synsets = new Map<string, Synset>();
  const lemmaOf = new Map<string, string>();
  const synsetsOf = new Map<string, string[]>();
  const entryRe = /<LexicalEntry id="([^"]+)">\s*<Lemma writtenForm="([^"]+)" partOfSpeech="(\w)"([\s\S]*?)<\/LexicalEntry>/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml))) {
    const lemma = decodeXml(m[2]);
    lemmaOf.set(m[1], lemma);
    const key = lemma.toLowerCase();
    for (const s of m[4].matchAll(/<Sense id="[^"]+" synset="([^"]+)"/g)) {
      const list = synsetsOf.get(key) ?? [];
      if (!list.includes(s[1])) list.push(s[1]);
      synsetsOf.set(key, list);
    }
  }
  const synRe = /<Synset id="([^"]+)"[^>]*members="([^"]*)"[^>]*partOfSpeech="(\w)"[^>]*>([\s\S]*?)<\/Synset>/g;
  while ((m = synRe.exec(xml))) {
    const body = m[4];
    const rel = (t: string) => [...body.matchAll(new RegExp(`relType="${t}" target="([^"]+)"`, "g"))].map((x) => x[1]);
    synsets.set(m[1], {
      members: m[2].split(" ").map((e) => lemmaOf.get(e)).filter((x): x is string => !!x),
      pos: m[3],
      def: decodeXml((body.match(/<Definition>([\s\S]*?)<\/Definition>/) ?? [])[1] ?? ""),
      hyper: rel("hypernym"),
      hypo: rel("hyponym"),
      domain: rel("domain_topic"),
    });
  }
  const spellingVariants = new Map<string, Set<string>>();
  for (const s of synsets.values()) {
    for (const a of s.members) for (const b of s.members) {
      const la = a.toLowerCase(), lb = b.toLowerCase();
      if (la !== lb && isSpellingPair(la, lb)) {
        const set = spellingVariants.get(la) ?? new Set<string>();
        set.add(lb);
        spellingVariants.set(la, set);
      }
    }
  }
  return { synsets, synsetsOf, spellingVariants };
}

export function loadOewn(path: string): Wordnet {
  const raw = readFileSync(path);
  return parseOewn((path.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8"));
}

/** Synset ids under the roots via hyponym links (a "kind of" closure), roots included. */
export function hyponymSynsets(wn: Wordnet, rootIds: string[], maxDepth = 12): Set<string> {
  const seen = new Set<string>();
  const walk = (id: string, d: number) => {
    if (seen.has(id) || d > maxDepth || !wn.synsets.has(id)) return;
    seen.add(id);
    wn.synsets.get(id)!.hypo.forEach((h) => walk(h, d + 1));
  };
  rootIds.forEach((r) => walk(r, 0));
  return seen;
}

const lemmasOf = (wn: Wordnet, ids: Iterable<string>) => {
  const out = new Set<string>();
  for (const id of ids) wn.synsets.get(id)?.members.forEach((l) => out.add(l.toLowerCase()));
  return out;
};

export function hyponymLemmas(wn: Wordnet, rootIds: string[], maxDepth = 12): Set<string> {
  return lemmasOf(wn, hyponymSynsets(wn, rootIds, maxDepth));
}

/** Synsets tagged with a topic domain at or below the roots, plus their near hyponyms. */
export function domainSynsets(wn: Wordnet, domainRootIds: string[]): Set<string> {
  const domains = hyponymSynsets(wn, domainRootIds);
  if (!wn.byDomain) {
    wn.byDomain = new Map();
    for (const [id, s] of wn.synsets) for (const d of s.domain) {
      const list = wn.byDomain.get(d) ?? [];
      list.push(id);
      wn.byDomain.set(d, list);
    }
  }
  const out = new Set<string>();
  for (const d of domains) for (const id of wn.byDomain.get(d) ?? []) hyponymSynsets(wn, [id], 3).forEach((x) => out.add(x));
  return out;
}

export function domainLemmas(wn: Wordnet, domainRootIds: string[]): Set<string> {
  return lemmasOf(wn, domainSynsets(wn, domainRootIds));
}

/** Hypernym ancestors, nearest first, the synset itself excluded. */
export function ancestors(wn: Wordnet, id: string, maxDepth = 12): Set<string> {
  const out = new Set<string>();
  let frontier = [id];
  for (let d = 0; d < maxDepth && frontier.length; d++) {
    const next: string[] = [];
    for (const f of frontier) for (const h of wn.synsets.get(f)?.hyper ?? []) {
      if (!out.has(h) && h !== id) { out.add(h); next.push(h); }
    }
    frontier = next;
  }
  return out;
}
