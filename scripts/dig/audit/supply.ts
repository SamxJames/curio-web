// Dig supply measurement (docs/dig-word-audit.md, fix 3): how many days the prompt pool can fill if some
// prompts are paused. Draws days with the real picker and cooldowns (assemble.ts). It does not choose
// fossils, so it is an upper bound: it also reports how often a prompt would need a new fossil.
//   npx tsx --max-old-space-size=8192 scripts/dig/audit/supply.ts --data <dig-data> [--catalogue <file>] [--pause id,id] [--days 180] [--seeds 5]
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

  const run = (label: string, pool: Candidate[]) => {
    console.log(`\n${label}: ${pool.length} theme prompts (${pool.filter((c) => c.id === rootId(c)).length} base, ${pool.filter((c) => c.id !== rootId(c)).length} letter), ${origins.length} origin prompts`);
    for (let seed = 0; seed < seeds; seed++) {
      const history: HistoryDay[] = [];
      const uses = new Map<string, number>();
      const spare: number[] = [];
      let failed = 0, firstFail = 0, retries = 0;
      for (let i = 0; i < days; i++) {
        const date = addDays("2026-12-01", i);
        let picks: Candidate[] | null = null;
        for (let salt = 0; salt < MAX_SALTS && !picks; salt++) { picks = pickDay(date, { themes: pool, origins }, history, zipf, `supply-${seed}`, salt); if (!picks) retries++; }
        if (!picks) { failed++; firstFail ||= i + 1; continue; }
        history.push({ date, prompts: picks.map((c) => ({ id: c.id, base: c.base, fossil: `${c.id}#${uses.get(c.id) ?? 0}`, ...(c.languages.length ? { languages: c.languages } : {}) })) });
        for (const c of picks) uses.set(c.id, (uses.get(c.id) ?? 0) + 1);
        // The pipeline's own health rule: the day after the newest built day must still have 20 themes and 6 origins free.
        if (i >= BUFFER) spare.push(pool.filter((c) => isEligible(c, addDays(date, 1), history)).length);
      }
      const outOfFossils = [...uses].filter(([id, n]) => n > (fossils.get(id) ?? 0)).length;
      const sorted = [...spare].sort((a, b) => a - b);
      console.log(`  seed ${seed}: ${days - failed}/${days} days drawn${failed ? ` (first failure on day ${firstFail})` : ""}, ${retries} retries; spare themes after each day: min ${sorted[0]}, median ${sorted[Math.floor(sorted.length / 2)]}; most uses of one prompt ${Math.max(...uses.values())}; prompts needing more fossils than they have: ${outOfFossils}`);
    }
  };
  run("All prompts", themes);
  if (paused.size) {
    const gone = themes.filter((c) => paused.has(rootId(c)));
    console.log(`\nPausing ${[...paused].join(", ")} removes ${gone.length} prompts (${gone.filter((c) => c.id === rootId(c)).length} base, ${gone.filter((c) => c.id !== rootId(c)).length} letter): ${gone.map((c) => c.id).join(", ")}`);
    run("With those paused", themes.filter((c) => !paused.has(rootId(c))));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
