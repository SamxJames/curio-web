// How many "Name a <theme> beginning with <letter>" prompts pass a floor, from distinct themes.
import { readFileSync } from "node:fs";
import { loadWordfreq } from "./wordfreq.mjs";
const T = JSON.parse(readFileSync(new URL("../out/themes.json", import.meta.url)));
const z = loadWordfreq("C:/Users/Sam/Documents/Claude/Projects/Curio/data/wordfreq/large_en.msgpack.gz");
const TECH = /chem|compound|pharma|drug|medic|surg|anatom|disease|genet|biolog|mathem|statist|physic|comput|grammar|linguist|philos|psycho|law|legal|sex|taxonom|botan|zoolog|geolog|astronom|unit|mineral|enzyme|protein|element|acid|software|program|internet|religio|death|mytholog|weapon|military|cell|bacteri|virus|fung|bone|organ|nerv|muscle|tissue|matter|substance|object|entity|people|person|human|occupation|crime|slur|ethnic|nationalit|demonym|plot device|data struct|hypothetical|science|communication|construction/i;
const byAnchor = new Map();
for (const r of T) { if (!r.passes || r.core > 800 || TECH.test(r.cat)) continue; const p = byAnchor.get(r.anchor); if (!p || p.cat.length > r.cat.length) byAnchor.set(r.anchor, r); }
let total = 0; const per = [];
for (const r of byAnchor.values()) {
  const by = {};
  for (const w of r.coreList) { const l = w[0]; (by[l] ||= []).push(w); }
  const ok = Object.entries(by).filter(([, ws]) => ws.length >= 25 && ws.filter((w) => (z.get(w) ?? 0) >= 3.5).length >= 3 && ws.filter((w) => (z.get(w) ?? 0) < 2.3).length >= 5).map(([l]) => l);
  if (ok.length) { per.push(`${r.cat}: ${ok.join("")}`); total += ok.length; }
}
console.log("letter-variant prompts passing (core>=25, easy>=3, rare>=5):", total);
console.log(per.join("\n"));
