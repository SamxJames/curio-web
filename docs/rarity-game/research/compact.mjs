// Streams the raw Wiktextract dump (gzipped JSONL, ~25 GB unpacked) and writes a compact
// English-only JSONL with just the fields the rarity pipeline needs.
// Usage: node compact.mjs <raw.jsonl.gz> <out.jsonl>
import { createReadStream, createWriteStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";

const [, , input, output] = process.argv;
const out = createWriteStream(output);
const gz = createGunzip();
gz.on("error", (err) => { console.error("gunzip stopped:", err.code); rl.close(); });
const rl = createInterface({ input: createReadStream(input).pipe(gz), crlfDelay: Infinity });

const catName = (c) => (typeof c === "string" ? c : c && c.name) || "";
const keepCat = (n) => /^en:/i.test(n) || /^English terms (borrowed|derived|inherited) from /.test(n) || /^English (learned|semi-learned|orthographic) borrowings from /.test(n);
const ETY = new Set(["bor", "bor+", "der", "der+", "lbor", "inh", "inh+", "slbor", "obor", "ubor", "calque", "cal", "translit", "lbor+"]);
let lines = 0, kept = 0;
const t0 = Date.now();

rl.on("line", (line) => {
  lines++;
  if (lines % 500000 === 0) console.error(`${lines} lines, ${kept} English, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  if (!line.includes('"lang_code": "en"') && !line.includes('"lang_code":"en"')) return;
  let e;
  try { e = JSON.parse(line); } catch { return; }
  if (e.lang_code !== "en" || !e.word) return;
  const topics = new Set(), cats = new Set(), tags = new Set();
  for (const c of e.categories || []) { const n = catName(c); if (keepCat(n)) cats.add(n); }
  for (const s of e.senses || []) {
    (s.topics || []).forEach((t) => topics.add(t));
    (s.tags || []).forEach((t) => tags.add(t));
    for (const c of s.categories || []) { const n = catName(c); if (keepCat(n)) cats.add(n); }
  }
  const ety = [];
  for (const t of e.etymology_templates || []) {
    if (ETY.has(t.name) && t.args && t.args["1"] === "en" && t.args["2"]) ety.push(`${t.name}:${t.args["2"]}`);
  }
  const forms = (e.forms || []).filter((f) => f.form && f.tags && f.tags.some((t) => ["plural", "alternative", "standard-spelling"].includes(t))).map((f) => f.form).slice(0, 6);
  const glossCount = (e.senses || []).length;
  out.write(JSON.stringify({ w: e.word, pos: e.pos, t: [...topics], c: [...cats], g: [...tags].filter((x) => ["obsolete", "archaic", "rare", "dialectal", "slang", "vulgar", "offensive", "derogatory", "proscribed", "misspelling", "alt-of", "form-of", "abbreviation", "initialism"].includes(x)), e: ety, f: forms, n: glossCount, et: (e.etymology_text || "").slice(0, 300) }) + "\n");
  kept++;
});
rl.on("close", () => { out.end(); console.error(`done: ${lines} lines, ${kept} English entries in ${((Date.now() - t0) / 60000).toFixed(1)} min`); });
