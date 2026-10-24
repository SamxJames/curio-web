// Phase 3 measurement: how many themes and origin prompts are viable, and how often
// a Curio story word can be the gem. Reads the compact Wiktextract file.
// Usage: npx tsx measure.ts <compact.jsonl> <out-dir>
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { loadWordfreq } from "./wordfreq.mjs";
import { loadOewn, hyponymLemmas, domainLemmas } from "./oewn.mjs";
import { WORDS } from "file:///C:/Users/Sam/Documents/Claude/Projects/Curio/curio-web/.claude/worktrees/rarity-game/lib/words.ts";

const DATA = "C:/Users/Sam/Documents/Claude/Projects/Curio/data";
const [, , compactPath, outDir] = process.argv;
const zipf = loadWordfreq(`${DATA}/wordfreq/large_en.msgpack.gz`);
const wn = loadOewn(`${DATA}/oewn/english-wordnet-2025.xml.gz`);
const curio = new Map(WORDS.map((w) => [w.slug, w]));

// Tier cut-offs on the Zipf scale (tested here, tuned in the design doc).
const tierOf = (z: number) => (z >= 4 ? "common" : z >= 3 ? "familiar" : z >= 2.3 ? "uncommon" : z >= 1 ? "rare" : "very-rare");

const BAD_TAGS = new Set(["vulgar", "offensive", "derogatory", "misspelling", "abbreviation", "initialism", "form-of", "alt-of"]);
const OK_POS = new Set(["noun", "verb", "adj", "adv", "name"]);
const catWords = new Map<string, Set<string>>();
const oriWords = new Map<string, Set<string>>();
const oriTpl = new Map<string, Set<string>>();
const meta = new Map<string, { obs: boolean }>();

const rl = createInterface({ input: createReadStream(compactPath), crlfDelay: Infinity });
let n = 0;
for await (const line of rl) {
  n++;
  const e = JSON.parse(line);
  const w: string = e.w;
  if (!/^[a-z][a-z' -]*[a-z]$/.test(w) || w.length > 24 || w.split(" ").length > 2) continue; // lowercase common words, max two words
  if (!OK_POS.has(e.pos) || e.pos === "name") continue;
  if (e.g.some((t: string) => BAD_TAGS.has(t))) continue;
  const obs = e.g.includes("obsolete") || e.g.includes("archaic");
  const m = meta.get(w);
  meta.set(w, { obs: m ? m.obs && obs : obs });
  for (const c of e.c as string[]) {
    if (c.startsWith("en:")) { const k = c.slice(3); if (!catWords.has(k)) catWords.set(k, new Set()); catWords.get(k)!.add(w); }
    const o = c.match(/^English terms (?:borrowed|derived) from (.+)$/);
    if (o) { if (!oriWords.has(o[1])) oriWords.set(o[1], new Set()); oriWords.get(o[1])!.add(w); }
  }
  for (const t of e.e as string[]) { const code = t.split(":")[1]; if (!oriTpl.has(code)) oriTpl.set(code, new Set()); oriTpl.get(code)!.add(w); }
}
console.error(`read ${n} compact entries; ${catWords.size} topical categories; ${oriWords.size} origin languages`);

// Auto-anchor each category to WordNet: head noun phrase -> best hyponym/domain set by overlap.
const singular = (s: string) => s.replace(/ies$/, "y").replace(/(ch|sh|x|ss)es$/, "$1").replace(/s$/, "");
function anchor(cat: string, words: Set<string>) {
  const name = cat.toLowerCase();
  const heads = [singular(name), name, singular(name.split(" ").slice(-1)[0])];
  let best = { core: new Set<string>(), via: "", synset: "" };
  for (const h of heads) {
    for (const id of wn.synsetsOf.get(h) || []) {
      const s = wn.synsets.get(id);
      if (!s || s.pos !== "n") continue;
      for (const [via, set] of [["kind-of", hyponymLemmas(wn, [id])], ["domain", domainLemmas(wn, [id])]] as const) {
        const core = new Set([...words].filter((w) => set.has(w)));
        if (core.size > best.core.size) best = { core, via, synset: `${h}: ${s.def.slice(0, 50)}` };
      }
    }
  }
  return best;
}

// Pass 1: anchor every category (>= 5 words) to its best WordNet synset.
const OVERRIDE: Record<string, string[]> = { Nautical: ["seafaring", "navigation"], Sailing: ["seafaring", "navigation"], Weather: ["weather", "meteorology"], Colors: ["chromatic color", "color"], Spices: ["spice"], Kitchenware: ["kitchen utensil"], Cookware: ["kitchen utensil"], Headwear: ["headdress"], Gemstones: ["gem"], Insects: ["insect"], Cooking: ["cooking"] };
const catAnchor = new Map<string, { synsetId: string; via: string }>();
function anchorId(cat: string, words: Set<string>) {
  const name = cat.toLowerCase();
  const heads = OVERRIDE[cat] || [singular(name), name, singular(name.split(" ").slice(-1)[0])];
  let best = { size: 0, id: "", via: "" };
  for (const h of heads) for (const id of wn.synsetsOf.get(h) || []) {
    const s = wn.synsets.get(id);
    if (!s || s.pos !== "n") continue;
    for (const [via, set] of [["kind-of", hyponymLemmas(wn, [id])], ["domain", domainLemmas(wn, [id])]] as const) {
      let k = 0; for (const w of words) if (set.has(w)) k++;
      if (k > best.size) best = { size: k, id, via };
    }
  }
  return best;
}
for (const [cat, words] of catWords) if (words.size >= 5) { const b = anchorId(cat, words); if (b.size >= 2) catAnchor.set(cat, { synsetId: b.id, via: b.via }); }
// Hyponym closure of synset ids (for rolling sub-categories up).
const closureIds = (root: string) => { const out = new Set<string>(); const walk = (id: string) => { if (out.has(id)) return; out.add(id); (wn.synsets.get(id)?.hypo || []).forEach(walk); }; walk(root); return out; };

const rows: any[] = [];
const big = [...catWords].filter(([c, s]) => s.size >= 25 && catAnchor.has(c)).sort((a, b) => b[1].size - a[1].size);
for (const [cat, ownWords] of big) {
  const anc = catAnchor.get(cat)!;
  // Roll up: words from every category anchored at or below this anchor (kind-of themes only).
  let words = new Set(ownWords);
  if (anc.via === "kind-of") {
    const below = closureIds(anc.synsetId);
    for (const [c2, a2] of catAnchor) if (a2.via === "kind-of" && below.has(a2.synsetId)) catWords.get(c2)!.forEach((w) => words.add(w));
  }
  const wnSet = anc.via === "kind-of" ? hyponymLemmas(wn, [anc.synsetId]) : domainLemmas(wn, [anc.synsetId]);
  const a = { core: new Set([...words].filter((w) => wnSet.has(w))), via: anc.via, synset: wn.synsets.get(anc.synsetId)!.def.slice(0, 50) };
  const core = [...a.core].filter((w) => !meta.get(w)?.obs);
  const tiers: Record<string, number> = {};
  core.forEach((w) => { const t = tierOf(zipf.get(w) ?? 0); tiers[t] = (tiers[t] || 0) + 1; });
  const curioIn = core.filter((w) => curio.has(w));
  const curioGem = curioIn.filter((w) => (zipf.get(w) ?? 0) < 2.3);
  const easy = core.filter((w) => (zipf.get(w) ?? 0) >= 3.5).length;
  const rareN = core.filter((w) => (zipf.get(w) ?? 0) < 2.3).length;
  const passes = core.length >= 40 && easy >= 8 && rareN >= 10;
  rows.push({ cat, passes, easy, rare: rareN, coreList: core, wiktionary: words.size, core: core.length, via: a.via, anchor: a.synset, tiers, curio: curioIn.length, curioGemCandidates: curioGem, sample: core.sort((x, y) => (zipf.get(y) ?? 0) - (zipf.get(x) ?? 0)).filter((_, i) => i % Math.max(1, Math.floor(core.length / 12)) === 0).slice(0, 12) });
}
rows.sort((a, b) => b.core - a.core);

// Origins: category membership AND a structured etymology template naming the same language.
const LANG_CODE: Record<string, string> = { Arabic: "ar", Persian: "fa", "Classical Persian": "fa-cls", French: "fr", "Middle French": "frm", "Old French": "fro", Latin: "la", "Ancient Greek": "grc", Italian: "it", Spanish: "es", Portuguese: "pt", Dutch: "nl", "Middle Dutch": "dum", German: "de", "Old Norse": "non", Hindi: "hi", Sanskrit: "sa", Japanese: "ja", Malay: "ms", Turkish: "tr", "Ottoman Turkish": "ota", Hebrew: "he", Yiddish: "yi", Chinese: "zh", "Cantonese": "yue", Tamil: "ta", Russian: "ru", Irish: "ga", "Scottish Gaelic": "gd", Welsh: "cy", Nahuatl: "nah", "Classical Nahuatl": "nci", Norwegian: "no", Swedish: "sv", Danish: "da", Icelandic: "is", Polish: "pl", Czech: "cs", Hungarian: "hu", Finnish: "fi", Afrikaans: "af", Zulu: "zu", Swahili: "sw", Maori: "mi", Hawaiian: "haw", Tupi: "tpw", Quechua: "qu", Bengali: "bn", Urdu: "ur", Tagalog: "tl", Korean: "ko", "Old English": "ang" };
const origins: any[] = [];
for (const [lang, words] of oriWords) {
  const code = LANG_CODE[lang];
  const tpl = code ? oriTpl.get(code) || new Set() : new Set<string>();
  const both = [...words].filter((w) => tpl.has(w) && !meta.get(w)?.obs);
  if (both.length < 20) continue;
  const tiers: Record<string, number> = {};
  both.forEach((w) => { const t = tierOf(zipf.get(w) ?? 0); tiers[t] = (tiers[t] || 0) + 1; });
  const curioIn = both.filter((w) => curio.has(w));
  const curioAgree = curioIn.filter((w) => curio.get(w)!.lineage.includes(lang));
  origins.push({ lang, categoryOnly: words.size, agreed: both.length, tiers, curio: curioIn.length, curioLineageAgrees: curioAgree.length, curioGemCandidates: curioIn.filter((w) => (zipf.get(w) ?? 0) < 2.3), easy: both.filter((w) => (zipf.get(w) ?? 0) >= 3.5).length, rare: both.filter((w) => (zipf.get(w) ?? 0) < 2.3).length });
}
origins.sort((a, b) => b.agreed - a.agreed);

// Distinct general-audience themes (one per WordNet anchor), and theme x origin crosses.
const TECH = /chem|compound|pharma|drug|medic|surg|anatom|disease|genet|biolog|mathem|statist|physic|comput|grammar|linguist|philos|psycho|law|legal|sex|taxonom|botan|zoolog|geolog|astronom|unit|mineral|enzyme|protein|element|acid|software|program|internet|religio|death|mytholog|weapon|military|cell|bacteri|virus|fung|bone|organ|nerv|muscle|tissue|matter|substance|object|entity|people|person|human|occupation|crime|slur|ethnic|nationalit|demonym|plot device|data struct|hypothetical|science|communication|construction/i;
const byAnchor = new Map<string, any>();
for (const r of rows) { if (!r.passes || r.core > 800 || TECH.test(r.cat)) continue; const prev = byAnchor.get(r.anchor); if (!prev || prev.cat.length > r.cat.length) byAnchor.set(r.anchor, r); }
const distinct = [...byAnchor.values()];
const oriAgreed = new Map<string, Set<string>>();
for (const [lang, words] of oriWords) { const code = LANG_CODE[lang]; const tpl = code ? oriTpl.get(code) : null; if (tpl) oriAgreed.set(lang, new Set([...words].filter((w) => tpl.has(w)))); }
const crosses: any[] = [];
for (const th of distinct) for (const [lang, set] of oriAgreed) {
  if (["Latin", "Old English", "Old French", "Middle English", "Proto-Germanic", "Proto-Indo-European"].includes(lang)) continue;
  const core = (th.coreList as string[]).filter((w) => set.has(w));
  const easy = core.filter((w) => (zipf.get(w) ?? 0) >= 3.5).length, rare = core.filter((w) => (zipf.get(w) ?? 0) < 2.3).length;
  if (core.length >= 25 && easy >= 3 && rare >= 5) crosses.push({ prompt: `${th.cat} from ${lang}`, core: core.length, easy, rare, curio: core.filter((w) => curio.has(w)) });
}
crosses.sort((a, b) => b.core - a.core);
writeFileSync(`${outDir}/crosses.json`, JSON.stringify(crosses, null, 1));
console.log(`\nDistinct general-audience themes: ${distinct.length} (with Curio fossil candidate: ${distinct.filter((r) => r.curioGemCandidates.length).length})`);
console.log(distinct.map((r) => `${r.cat}(${r.core})`).join(", "));
console.log(`\nTheme x origin crosses (core>=25, easy>=3, rare>=5): ${crosses.length}`);
console.log(crosses.slice(0, 40).map((c) => `${c.prompt}(${c.core}, curio ${c.curio.length})`).join("; "));

const viable = (min: number) => rows.filter((r) => r.core >= min).length;
const summary = {
  compactEntries: n, topicalCategories: catWords.size, categoriesWith25Plus: big.length,
  themesWithCore: { "30+": viable(30), "40+": viable(40), "60+": viable(60), "100+": viable(100) },
  themesPassingRules: rows.filter((r) => r.passes).length,
  themesPassingWithCurioGem: rows.filter((r) => r.passes && r.curioGemCandidates.length > 0).length,
  originsWithAgreed: { "30+": origins.filter((o) => o.agreed >= 30).length, "60+": origins.filter((o) => o.agreed >= 60).length },
  originsPassing: origins.filter((o) => o.agreed >= 40 && o.agreed <= 800 && o.easy >= 8 && o.rare >= 10).length,
  originsPassingWithCurioGem: origins.filter((o) => o.agreed >= 40 && o.agreed <= 800 && o.easy >= 8 && o.rare >= 10 && o.curioGemCandidates.length > 0).length,
};
writeFileSync(`${outDir}/themes.json`, JSON.stringify(rows, null, 1));
writeFileSync(`${outDir}/origins.json`, JSON.stringify(origins, null, 1));
writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
console.log("\nTop themes:");
for (const r of rows.slice(0, 40)) console.log(`${String(r.core).padStart(4)} core / ${String(r.wiktionary).padStart(5)}  ${r.cat.padEnd(28)} via ${r.via.padEnd(7)} curio ${r.curio} gem? ${r.curioGemCandidates.slice(0, 3).join(",")}  tiers ${JSON.stringify(r.tiers)}`);
console.log("\nOrigins:");
for (const o of origins.slice(0, 30)) console.log(`${String(o.agreed).padStart(5)} agreed / ${String(o.categoryOnly).padStart(5)}  ${o.lang.padEnd(18)} curio ${o.curio} (lineage agrees ${o.curioLineageAgrees}) gem? ${o.curioGemCandidates.slice(0, 3).join(",")} tiers ${JSON.stringify(o.tiers)}`);
