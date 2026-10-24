// Minimal Open English WordNet (WN-LMF XML) loader. No dependencies.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

export function loadOewn(path) {
  const xml = gunzipSync(readFileSync(path)).toString("utf8");
  const synsets = new Map(); // id -> { members:[lemma], pos, hyper:[], hypo:[], domain:[], inDomain:[], def }
  const lemmaOf = new Map(); // entry id -> lemma
  const synsetsOf = new Map(); // lemma(lower) -> Set(synset id)
  const spellingVariants = new Map(); // lemma -> Set(other spelling lemmas sharing a synset with british/american markers)

  const entryRe = /<LexicalEntry id="([^"]+)">\s*<Lemma writtenForm="([^"]+)" partOfSpeech="(\w)"([\s\S]*?)<\/LexicalEntry>/g;
  let m;
  while ((m = entryRe.exec(xml))) {
    const [, id, lemma, , body] = m;
    const l = decodeXml(lemma);
    lemmaOf.set(id, l);
    for (const s of body.matchAll(/<Sense id="[^"]+" synset="([^"]+)"/g)) {
      const k = l.toLowerCase();
      if (!synsetsOf.has(k)) synsetsOf.set(k, new Set());
      synsetsOf.get(k).add(s[1]);
    }
  }
  const synRe = /<Synset id="([^"]+)"[^>]*members="([^"]*)"[^>]*partOfSpeech="(\w)"[^>]*>([\s\S]*?)<\/Synset>/g;
  while ((m = synRe.exec(xml))) {
    const [, id, members, pos, body] = m;
    const def = (body.match(/<Definition>([\s\S]*?)<\/Definition>/) || [])[1] || "";
    const rel = (t) => [...body.matchAll(new RegExp(`relType="${t}" target="([^"]+)"`, "g"))].map((x) => x[1]);
    synsets.set(id, {
      members: members.split(" ").map((e) => lemmaOf.get(e)).filter(Boolean),
      pos, def: decodeXml(def), hyper: rel("hypernym"), hypo: rel("hyponym"),
      domain: rel("domain_topic"), inDomain: rel("has_domain_topic"),
    });
  }
  // Spelling variants: lemmas in the same synset that differ only by known UK/US patterns.
  for (const s of synsets.values()) {
    if (s.members.length < 2) continue;
    for (const a of s.members) for (const b of s.members) {
      if (a !== b && isSpellingPair(a.toLowerCase(), b.toLowerCase())) {
        if (!spellingVariants.has(a.toLowerCase())) spellingVariants.set(a.toLowerCase(), new Set());
        spellingVariants.get(a.toLowerCase()).add(b.toLowerCase());
      }
    }
  }
  return { synsets, synsetsOf, spellingVariants };
}

function decodeXml(s) { return s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"); }
function isSpellingPair(a, b) {
  const n = (x) => x.replace(/our/g, "or").replace(/([^aeiou])re$/, "$1er").replace(/ise/g, "ize").replace(/yse/g, "yze").replace(/ae/g, "e").replace(/oe/g, "e").replace(/ll/g, "l");
  return a.length > 3 && n(a) === n(b);
}

/* All lemmas under a synset via hyponym links (a "kind of" closure). */
export function hyponymLemmas(wn, rootIds, maxDepth = 12) {
  const out = new Set(), seen = new Set();
  const walk = (id, d) => {
    if (seen.has(id) || d > maxDepth) return;
    seen.add(id);
    const s = wn.synsets.get(id);
    if (!s) return;
    s.members.forEach((l) => out.add(l.toLowerCase()));
    s.hypo.forEach((h) => walk(h, d + 1));
  };
  rootIds.forEach((r) => walk(r, 0));
  return out;
}

/* Lemmas whose synsets point at a topic domain (or a hyponym of it), plus their hyponyms. */
export function domainLemmas(wn, domainRootIds) {
  const domains = new Set();
  const collect = (id) => { if (domains.has(id)) return; domains.add(id); (wn.synsets.get(id)?.hypo || []).forEach(collect); };
  domainRootIds.forEach(collect);
  if (!wn.byDomain) {
    wn.byDomain = new Map();
    for (const [id, s] of wn.synsets) for (const d of s.domain) { if (!wn.byDomain.has(d)) wn.byDomain.set(d, []); wn.byDomain.get(d).push(id); }
  }
  const out = new Set();
  for (const d of domains) for (const id of wn.byDomain.get(d) || []) hyponymLemmas(wn, [id], 3).forEach((l) => out.add(l));
  return out;
}

export function findSynsets(wn, lemma, defIncludes = "") {
  return [...(wn.synsetsOf.get(lemma.toLowerCase()) || [])].map((id) => ({ id, ...wn.synsets.get(id) })).filter((s) => s.def.includes(defIncludes));
}
