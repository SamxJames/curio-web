// Dig supply measurement (docs/dig-word-audit.md, fix 3): how many days the prompt pool can fill if some
// prompts are paused. Draws days with the real picker and cooldowns (assemble.ts). It does not choose
// fossils, but a prompt drops out once it has run as many times as it has fossil candidates (each run needs a
// new one), so the count of candidates is an upper bound on how long it lasts.
//   npx tsx --max-old-space-size=8192 scripts/dig/audit/supply.ts --data <dig-data> [--catalogue <file>] [--pause id,id] [--days 180] [--seeds 5] [--runway]
// --runway compares options for making the pool last longer (fossils repeating, more letter variants, commoner fossils).
// A paused base prompt takes its letter variants with it. Prints counts and ids: keep the output out of public logs.
import { readFileSync } from "node:fs";
import path from "node:path";
import { WORDS } from "../../../lib/words";
import { createFetcher } from "../../demand/http";
import { loadWordfreq } from "../sources/wordfreq";
import { loadOewn } from "../sources/oewn";
import { readCompact } from "../sources/compact";
import { fetchWikidataLabels } from "../sources/wikidata";
import { indexWiktionary } from "../wiktionary";
import { loadCatalogue, rootId } from "../catalogue";
import { letterVariants, wikidataThemeCandidates, wordnetThemes, type Candidate } from "../themes";
import { originCandidates } from "../origins";
import { finishCandidate, floorProblems, fossilCandidates } from "../answers";
import { assignFamilies, isEligible, pickDay, type HistoryDay } from "../assemble";

const flag = (args: string[], name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const MAX_SALTS = 10, BUFFER = 30;

async function main() {
  const args = process.argv.slice(2);
  const data = flag(args, "--data")!;
  const days = Number(flag(args, "--days") ?? 180), seeds = Number(flag(args, "--seeds") ?? 5);
  const paused = new Set((flag(args, "--pause") ?? "").split(",").filter(Boolean));
  const zipf = loadWordfreq(path.join(data, "wordfreq", "large_en.msgpack.gz"));
  const wn = loadOewn(path.join(data, "oewn", "english-wordnet-2025.xml.gz"));
  const blocked = new Set(readFileSync(path.join(data, "ldnoobw", "en.txt"), "utf8").split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter(Boolean));
  const index = await indexWiktionary(readCompact(path.join(data, "derived", "en-compact.jsonl")), blocked);
  const cat = loadCatalogue(flag(args, "--catalogue"));
  const wd: { theme: (typeof cat.wikidataThemes)[number]; labels: Set<string> }[] = [];
  const fetcher = createFetcher({ minGapMs: 1000, attempts: 2 });
  for (const theme of cat.wikidataThemes) {
    try { const r = await fetchWikidataLabels(theme, { fetcher, cacheDir: path.join(data, "cache", "wikidata"), now: new Date() }); if (r.labels) wd.push({ theme, labels: r.labels }); } catch { /* skipped */ }
  }
  const finish = (c: Candidate) => finishCandidate(c, { cat, blocked });
  const fctx = { wn, index, zipf };
  const base = assignFamilies([...wordnetThemes(wn, index, zipf, cat), ...wikidataThemeCandidates(wd, index, zipf)].map(finish));
  const letters = base.flatMap((t) => letterVariants(t, zipf)).map(finish);
  const ok = (c: Candidate) => floorProblems(c, fctx).length === 0;
  const themes = [...base, ...letters].filter(ok);
  const origins = originCandidates(index, zipf, cat, new Map(WORDS.map((w) => [w.word.toLowerCase(), w.lineage]))).map(finish).filter(ok);
  const fossils = new Map([...themes, ...origins].map((c) => [c.id, fossilCandidates(c, fctx).length]));

  type Scenario = { label: string; pool: Candidate[]; fossils: Map<string, number>; repeatDays?: number };
  const only = flag(args, "--only");
  const run = ({ label, pool, fossils: have, repeatDays }: Scenario) => {
    if (only && !label.includes(only)) return;
    const firstFails: number[] = [], firstLows: number[] = [], drawn: number[] = [];
    for (let seed = 0; seed < seeds; seed++) {
      const history: HistoryDay[] = [];
      const used = new Map<string, number[]>(); // day numbers on which a prompt ran
      const spare: number[] = [];
      let failed = 0, firstFail = 0;
      for (let i = 0; i < days; i++) {
        const date = addDays("2026-12-01", i);
        // A prompt needs a fossil it has not used (or, with repeatDays, not used in that long).
        const left = (c: Candidate) => (used.get(c.id) ?? []).filter((d) => repeatDays === undefined || i - d < repeatDays).length < (have.get(c.id) ?? 0);
        const live = pool.filter(left), liveOrigins = origins.filter(left);
        let picks: Candidate[] | null = null;
        for (let salt = 0; salt < MAX_SALTS && !picks; salt++) picks = pickDay(date, { themes: live, origins: liveOrigins }, history, zipf, `supply-${seed}`, salt);
        if (!picks) { failed++; firstFail ||= i + 1; continue; }
        history.push({ date, prompts: picks.map((c) => ({ id: c.id, base: c.base, fossil: `${c.id}#${i}`, ...(c.languages.length ? { languages: c.languages } : {}) })) });
        for (const c of picks) used.set(c.id, [...(used.get(c.id) ?? []), i]);
        // The pipeline's own health rule: the day after the newest built day must still have 20 themes free.
        if (i >= BUFFER) spare.push(live.filter((c) => left(c) && isEligible(c, addDays(date, 1), history)).length);
      }
      const low = spare.findIndex((n) => n < 20);
      firstFails.push(firstFail); firstLows.push(low < 0 ? 0 : low + BUFFER + 1); drawn.push(days - failed);
    }
    const range = (xs: number[]) => (xs.every((x) => x === 0) ? `never in ${days} days` : xs.some((x) => x === 0) ? `day ${Math.min(...xs.filter(Boolean))} at the earliest, never in some runs` : `day ${Math.min(...xs)}–${Math.max(...xs)}`);
    console.log(`${label}: ${pool.length} theme prompts (${pool.filter((c) => c.id === rootId(c)).length} base, ${pool.filter((c) => c.id !== rootId(c)).length} letter), ${origins.length} origins | first day that cannot be filled: ${range(firstFails)} | under-20-spare alarm: ${range(firstLows)} | days filled: ${Math.min(...drawn)}–${Math.max(...drawn)} of ${days}`);
  };
  /** fossilCandidates (answers.ts) with the rarity ceiling as a parameter. 2.3 is today's rule. */
  const fossilCount = (c: Candidate, maxZipf: number, firstSense = true) => c.core.filter((w) => {
    const z = zipf.get(w);
    if (z !== undefined && z >= maxZipf) return false;
    if (!/^[a-z]{4,14}$/.test(w)) return false;
    const info = index.info.get(w);
    if (!info || info.strictObsolete || info.strictOffensive) return false;
    if (firstSense && c.senseIds) { const first = wn.synsetsOf.get(w)?.[0]; if (!first || !c.senseIds.has(first)) return false; }
    return true;
  }).length;
  const counts = (pool: Candidate[], maxZipf = 2.3, firstSense = true) => new Map([...pool, ...origins].map((c) => [c.id, fossilCount(c, maxZipf, firstSense)]));
  /** Letter variants with a smaller core floor than today's 25 (the easy, rare and fossil floors stay). */
  const withLetters = (minCore: number) => [...base, ...base.flatMap((t) => letterVariants(t, zipf, { minCore })).map(finish)]
    .filter((c) => floorProblems(c, fctx).every((p) => c.id !== rootId(c) && /^core \d+ < 25$/.test(p) && c.core.length >= minCore));

  if (args.includes("--runway")) {
    // Options for the supply runway (docs/dig-word-audit.md). Measure only: none of this is in the pipeline.
    const q = (xs: number[]) => { const v = [...xs].sort((a, b) => a - b); return `min ${v[0]}, quarter ${v[Math.floor(v.length / 4)]}, median ${v[Math.floor(v.length / 2)]}, max ${v.at(-1)}`; };
    console.log(`Fossil candidates per theme prompt: ${q(themes.map((c) => fossils.get(c.id) ?? 0))}; per origin prompt: ${q(origins.map((c) => fossils.get(c.id) ?? 0))}`);
    run({ label: "Today's rules", pool: themes, fossils });
    run({ label: "A3 fossils may repeat after 4 months", pool: themes, fossils, repeatDays: 122 });
    run({ label: "A4 fossils may repeat after 3 months", pool: themes, fossils, repeatDays: 91 });
    run({ label: "D fossils need not be the word's first WordNet sense", pool: themes, fossils: counts(themes, 2.3, false) });
    run({ label: "E repeat after 4 months + Zipf 2.8", pool: themes, fossils: counts(themes, 2.8), repeatDays: 122 });
    { const pool = withLetters(20); run({ label: "F repeat after 6 months + letters at 20 + Zipf 2.8", pool, fossils: counts(pool, 2.8), repeatDays: 182 }); }
    run({ label: "A1 fossils may repeat after 12 months", pool: themes, fossils, repeatDays: 365 });
    run({ label: "A2 fossils may repeat after 6 months", pool: themes, fossils, repeatDays: 182 });
    for (const n of [20, 15]) { const pool = withLetters(n); run({ label: `B letter variants need ${n} shown answers, not 25`, pool, fossils: counts(pool) }); }
    for (const zmax of [2.8, 3]) run({ label: `C fossils may be as common as Zipf ${zmax}, not 2.3`, pool: themes, fossils: counts(themes, zmax) });
    { const pool = withLetters(20); run({ label: "A1 + B(20) together", pool, fossils: counts(pool), repeatDays: 365 }); }
    return;
  }
  run({ label: "All prompts", pool: themes, fossils });
  if (paused.size) {
    const gone = themes.filter((c) => paused.has(rootId(c)));
    console.log(`Pausing ${[...paused].join(", ")} removes ${gone.length} prompts (${gone.filter((c) => c.id === rootId(c)).length} base, ${gone.filter((c) => c.id !== rootId(c)).length} letter): ${gone.map((c) => c.id).join(", ")}`);
    run({ label: "With those paused", pool: themes.filter((c) => !paused.has(rootId(c))), fossils });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
