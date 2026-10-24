// The dig pipeline (docs/rarity-game/pipeline-design.md). Local by default (FileSink in
// .dig-out/); --publish writes to production Upstash and is refused outside GitHub Actions.
//   npm run dig:build -- --data <dir> [--out .dig-out] [--publish] [--days 45] [--today YYYY-MM-DD]
// Public logs: counts only. Never print answers, fossils or future prompts.
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { flagValue } from "../languages/cli";
import { DAY_MS, dayKey, dayStart } from "../../lib/day";
import { getPuzzleForDate } from "../../lib/puzzle";
import { WORDS, getWordForDate } from "../../lib/words";
import { encodeDay } from "../../lib/dig/payload";
import { historyFromManifest, type DigManifest } from "../../lib/dig/keys";
import type { DigDayPlain } from "../../lib/dig/types";
import { createFetcher } from "../demand/http";
import { loadWordfreq } from "./sources/wordfreq";
import { loadOewn } from "./sources/oewn";
import { readCompact } from "./sources/compact";
import { fetchWikidataLabels } from "./sources/wikidata";
import { indexWiktionary, usableWord } from "./wiktionary";
import { buildLexicon } from "./lexicon";
import { loadCatalogue } from "./catalogue";
import { letterVariants, wikidataThemeCandidates, wordnetThemes, type Candidate } from "./themes";
import { originCandidates } from "./origins";
import { buildAliases, buildGuard, floorProblems, fossilCandidates } from "./answers";
import { yearlyViews } from "./pageviews";
import { assignTiers, chooseFossil, toPlainPrompt, viewWordsFor } from "./fossil";
import { isEligible, pickDay, type HistoryDay } from "./assemble";
import { validateDay } from "./validate";
import { adjudicate } from "./adjudicate";
import { FileSink, RedisSink, type DigSink } from "./sink";

export type BuildStats = {
  themes: number; origins: number; letterVariants: number; built: number; retries: number; failedDates: number;
  bufferDays: number; poolThemes: number; poolOrigins: number;
  wikidata: Record<"fresh" | "cached" | "stale" | "missing" | "label-mismatch", number>;
  adjudication: { judged: number; accepted: number; amendedDays: number };
};

const BUFFER_FLOOR = 30, MIN_POOL_THEMES = 20, MIN_POOL_ORIGINS = 6, HEARTBEAT_STALE_DAYS = 3, MAX_SALTS = 5;
const addDays = (d: string, n: number) => dayKey(new Date(dayStart(d).getTime() + n * DAY_MS));

/** New dates only: from the day after the last built date (or today), up to today + target. */
export function datesToBuild(today: string, built: string[], target: number): string[] {
  const last = [...built].sort().at(-1);
  let d = last && last >= today ? addDays(last, 1) : today;
  const end = addDays(today, target);
  const out: string[] = [];
  while (d <= end) { out.push(d); d = addDays(d, 1); }
  return out;
}

export function summaryLines(s: BuildStats): string[] {
  return [
    `Supply: ${s.themes} themes (${s.letterVariants} letter variants), ${s.origins} origin prompts pass the floor`,
    `Wikidata: ${s.wikidata.fresh} fresh, ${s.wikidata.cached} cached, ${s.wikidata.stale} stale, ${s.wikidata.missing} missing, ${s.wikidata["label-mismatch"]} label mismatches`,
    `Adjudication: ${s.adjudication.judged} judged, ${s.adjudication.accepted} accepted, ${s.adjudication.amendedDays} days amended`,
    `Built: ${s.built} days (${s.retries} retries, ${s.failedDates} dates failed)`,
    `Buffer: ${s.bufferDays} days. Spare pool: ${s.poolThemes} themes, ${s.poolOrigins} origins`,
  ];
}

async function main() {
  const args = process.argv.slice(2);
  const data = flagValue(args, "--data") ?? "dig-data";
  const target = Number(flagValue(args, "--days") ?? 45);
  const today = flagValue(args, "--today") ?? dayKey();
  const sink: DigSink = args.includes("--publish") ? RedisSink.create() : new FileSink(flagValue(args, "--out") ?? ".dig-out");
  const cacheDir = path.join(data, "cache");

  const zipf = loadWordfreq(path.join(data, "wordfreq", "large_en.msgpack.gz"));
  const wn = loadOewn(path.join(data, "oewn", "english-wordnet-2025.xml.gz"));
  const blocked = new Set(readFileSync(path.join(data, "ldnoobw", "en.txt"), "utf8").split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter(Boolean));
  const index = await indexWiktionary(readCompact(path.join(data, "derived", "en-compact.jsonl")), blocked);
  const lexicon = buildLexicon(zipf, index.info.keys());
  const cat = loadCatalogue();
  const usable = (w: string) => usableWord(index, zipf, w);
  const curio = new Map(WORDS.map((w) => [w.word.toLowerCase(), { slug: w.slug, teaser: w.teaser }]));
  const curioLineage = new Map(WORDS.map((w) => [w.word.toLowerCase(), w.lineage]));
  const fetcher = createFetcher({ minGapMs: 25 });
  // WDQS rate-limits per client, and retrying a 60-second query timeout 5 times wastes the run:
  // Wikidata gets its own slow fetcher with a single retry.
  const wikidataFetcher = createFetcher({ minGapMs: 1000, attempts: 2 });

  const wikidata: BuildStats["wikidata"] = { fresh: 0, cached: 0, stale: 0, missing: 0, "label-mismatch": 0 };
  const wdThemes: { theme: (typeof cat.wikidataThemes)[number]; labels: Set<string> }[] = [];
  for (const theme of cat.wikidataThemes) {
    const r = await fetchWikidataLabels(theme, { fetcher: wikidataFetcher, cacheDir: path.join(cacheDir, "wikidata"), now: new Date() });
    wikidata[r.status]++;
    if (r.labels) wdThemes.push({ theme, labels: r.labels });
  }
  const extras = await sink.readExtras();
  const withExtras = (c: Candidate): Candidate => ({ ...c, accepted: [...new Set([...c.accepted, ...(extras[c.id] ?? [])])] });
  const fctx = { wn, index, zipf };
  const baseThemes = [...wordnetThemes(wn, index, zipf, cat), ...wikidataThemeCandidates(wdThemes, index, zipf)].map(withExtras);
  const letters = baseThemes.flatMap((t) => letterVariants(t, zipf)).map(withExtras);
  const themes = [...baseThemes, ...letters].filter((c) => floorProblems(c, fctx).length === 0);
  const origins = originCandidates(index, zipf, cat, curioLineage).map(withExtras).filter((c) => floorProblems(c, fctx).length === 0);
  const all = new Map([...themes, ...origins].map((c) => [c.id, c]));

  const adjudication = await adjudicate(sink, all, { today, lexicon, usable, blocked, zipf });

  const manifest: DigManifest = (await sink.readManifest()) ?? { v: 1, lastRun: "", days: {}, poolThemes: 0, poolOrigins: 0 };
  const history: HistoryDay[] = historyFromManifest(manifest);
  const storySlugs = new Set(WORDS.map((w) => w.slug));
  const definitions = new Map<string, string>();
  for (const [lemma, ids] of wn.synsetsOf) { const def = wn.synsets.get(ids[0])?.def; if (def) definitions.set(lemma, def); }
  const dailyWordsFor = (date: string) => {
    const out = new Set<string>();
    for (const d of [date, addDays(date, 1)]) {
      out.add(getWordForDate(dayStart(d)).word.toLowerCase());
      const p = getPuzzleForDate(dayStart(d));
      if (p) out.add(p.word.word.toLowerCase());
    }
    return out;
  };

  let built = 0, retries = 0, failedDates = 0;
  for (const date of datesToBuild(today, Object.keys(manifest.days), target)) {
    let done = false;
    for (let salt = 0; salt < MAX_SALTS && !done; salt++) {
      if (salt > 0) retries++;
      const picks = pickDay(date, { themes, origins }, history, zipf, salt);
      if (!picks) break;
      const views = await yearlyViews(picks.flatMap((c, i) => viewWordsFor(c, zipf, salt * 31 + i)), { fetcher, cachePath: path.join(cacheDir, "pageviews.json"), now: new Date() });
      const daily = dailyWordsFor(date);
      const usedToday = new Set<string>();
      const prompts: DigDayPlain["prompts"] = [];
      for (const c of picks) {
        const previous = new Set(history.flatMap((h) => h.prompts.filter((p) => p.id === c.id).map((p) => p.fossil)));
        const tiers = assignTiers(c, zipf, views);
        const fossil = chooseFossil(c, {
          candidates: fossilCandidates(c, fctx), tiers, views, curio, definitions,
          etymology: (w) => index.info.get(w)?.etymology ?? "",
          exclude: new Set([...daily, ...usedToday, ...previous]),
        });
        if (!fossil) break;
        usedToday.add(fossil.word);
        const aliases = buildAliases(c.accepted, index, wn);
        prompts.push(toPlainPrompt(c, tiers, fossil, aliases, buildGuard(c.accepted, aliases, lexicon), curio));
      }
      if (prompts.length !== 7) continue;
      const day: DigDayPlain = { v: 1, date, rejSample: 1, prompts };
      const problems = validateDay(day, { history, storySlugs, dailyWords: daily, blocked });
      if (problems.length) { console.log(`Date ${date} salt ${salt}: ${problems.length} validation problems`); continue; }
      await sink.writeDay(encodeDay(day));
      const entry = picks.map((c, i) => ({ id: c.id, base: c.base, fossil: prompts[i].fossil.word, ...(c.languages.length ? { languages: c.languages } : {}) }));
      manifest.days[date] = entry;
      history.push({ date, prompts: entry });
      built++;
      done = true;
    }
    if (!done) failedDates++;
  }

  const furthest = Object.keys(manifest.days).sort().at(-1);
  const bufferDays = furthest && furthest >= today ? Math.round((dayStart(furthest).getTime() - dayStart(today).getTime()) / DAY_MS) : 0;
  const after = addDays(furthest ?? today, 1);
  manifest.poolThemes = themes.filter((c) => isEligible(c, after, history)).length;
  manifest.poolOrigins = origins.filter((c) => isEligible(c, after, history)).length;
  manifest.lastRun = new Date().toISOString();
  await sink.writeManifest(manifest);

  const stats: BuildStats = { themes: themes.length, origins: origins.length, letterVariants: letters.filter((c) => themes.includes(c)).length, built, retries, failedDates, bufferDays, poolThemes: manifest.poolThemes, poolOrigins: manifest.poolOrigins, wikidata, adjudication };
  const lines = summaryLines(stats);
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.map((l) => `- ${l}`).join("\n") + "\n");

  const failures: string[] = [];
  if (bufferDays < BUFFER_FLOOR) failures.push(`buffer ${bufferDays} days < ${BUFFER_FLOOR}`);
  if (manifest.poolThemes < MIN_POOL_THEMES || manifest.poolOrigins < MIN_POOL_ORIGINS) failures.push("spare pool below 20 themes / 6 origins");
  const heartbeat = await sink.readHeartbeat();
  if (heartbeat && Date.now() - Date.parse(heartbeat) > HEARTBEAT_STALE_DAYS * DAY_MS) failures.push("dig-health cron heartbeat is stale");
  if (failures.length) { console.error(`dig:build failed: ${failures.join("; ")}`); process.exit(1); }
}

if (process.argv[1]?.endsWith("build.ts")) {
  main().catch((err) => { console.error(`dig:build failed: ${err instanceof Error ? err.name : "unknown"}`); process.exit(1); });
}
