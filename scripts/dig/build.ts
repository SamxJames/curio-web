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
import { daysBetween, isEligible, pickDay, type HistoryDay } from "./assemble";
import { validateDay } from "./validate";
import { adjudicate } from "./adjudicate";
import { FileSink, RedisSink, type DigSink } from "./sink";

export type BuildStats = {
  themes: number; origins: number; letterVariants: number; built: number; retries: number; failedDates: number;
  bufferDays: number; poolThemes: number; poolOrigins: number;
  wikidata: Record<"fresh" | "cached" | "stale" | "missing" | "label-mismatch", number>;
  adjudication: { judged: number; accepted: number; amendedDays: number } | "failed";
};

const BUFFER_FLOOR = 30, MIN_POOL_THEMES = 20, MIN_POOL_ORIGINS = 6, HEARTBEAT_STALE_DAYS = 3, MAX_SALTS = 5;
const addDays = (d: string, n: number) => dayKey(new Date(dayStart(d).getTime() + n * DAY_MS));

/** Every date from today to today + target - 1 that is not built yet, earliest first. Holes
 * left by an earlier failed run are filled; a built date is never returned. */
export function datesToBuild(today: string, built: string[], target: number): string[] {
  const have = new Set(built);
  const out: string[] = [];
  for (let i = 0; i < target; i++) {
    const d = addDays(today, i);
    if (!have.has(d)) out.push(d);
  }
  return out;
}

/** The number of consecutive built days starting from today. A hole ends the buffer. */
export function bufferDaysFrom(today: string, built: string[]): number {
  const have = new Set(built);
  let n = 0;
  while (have.has(addDays(today, n))) n++;
  return n;
}

export function summaryLines(s: BuildStats): string[] {
  return [
    `Supply: ${s.themes} themes (${s.letterVariants} letter variants), ${s.origins} origin prompts pass the floor`,
    `Wikidata: ${s.wikidata.fresh} fresh, ${s.wikidata.cached} cached, ${s.wikidata.stale} stale, ${s.wikidata.missing} missing, ${s.wikidata["label-mismatch"]} label mismatches`,
    s.adjudication === "failed"
      ? "Adjudication: failed"
      : `Adjudication: ${s.adjudication.judged} judged, ${s.adjudication.accepted} accepted, ${s.adjudication.amendedDays} days amended`,
    `Built: ${s.built} days (${s.retries} retries, ${s.failedDates} dates failed)`,
    `Buffer: ${s.bufferDays} days. Spare pool: ${s.poolThemes} themes, ${s.poolOrigins} origins`,
  ];
}

const MIN_SEED_SALT_CHARS = 16;

/** The draw is seeded with a secret (DIG_SEED_SALT) so the public code and data cannot recompute
 * future days. Publishing refuses to start without one; local runs use a fixed dev string.
 * The message names the variable only, never its value. */
export function resolveSeedSalt(publish: boolean, value: string | undefined): string {
  if (value && (!publish || value.length >= MIN_SEED_SALT_CHARS)) return value;
  if (!publish) return "local-dev";
  throw new Error(`DIG_SEED_SALT is missing or shorter than ${MIN_SEED_SALT_CHARS} characters`);
}

/** Only messages built word-free are printed; anything else could quote content, so just its name. */
export function safeErrorText(err: unknown): string {
  const safe = err instanceof Error && /^(pageviews failed|adjudicate:|day |DIG_SEED_SALT )/.test(err.message);
  return safe ? (err as Error).message : err instanceof Error ? err.name : "unknown";
}

type AdjudicationResult = Awaited<ReturnType<typeof adjudicate>>;

/** Adjudication is a secondary feature: a failure in it must never stop days being built. */
export async function guardedAdjudication(run: () => Promise<AdjudicationResult>): Promise<{ ok: true; result: AdjudicationResult } | { ok: false; message: string }> {
  try {
    return { ok: true, result: await run() };
  } catch (err) {
    return { ok: false, message: safeErrorText(err) };
  }
}

/** The dig-health cron writes a heartbeat daily. A stale or unparseable one fails the run (fail
 * closed). A missing one fails only once the oldest built day is more than HEARTBEAT_STALE_DAYS
 * old, so the very first runs stay green. */
export function heartbeatProblem(heartbeat: string | null, builtDates: string[], today: string, nowMs: number): string | null {
  if (heartbeat) {
    const beat = Date.parse(heartbeat);
    return !Number.isFinite(beat) || nowMs - beat > HEARTBEAT_STALE_DAYS * DAY_MS ? "dig-health cron heartbeat is stale" : null;
  }
  const oldest = [...builtDates].sort()[0];
  return oldest && daysBetween(oldest, today) > HEARTBEAT_STALE_DAYS ? "dig-health cron heartbeat is missing" : null;
}

async function main() {
  const args = process.argv.slice(2);
  const data = flagValue(args, "--data") ?? "dig-data";
  const target = Number(flagValue(args, "--days") ?? 45);
  const today = flagValue(args, "--today") ?? dayKey();
  const publish = args.includes("--publish");
  // Resolved before any Redis client is built.
  const seedSalt = resolveSeedSalt(publish, process.env.DIG_SEED_SALT);
  const sink: DigSink = publish ? RedisSink.create() : new FileSink(flagValue(args, "--out") ?? ".dig-out");
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
  let extras = await sink.readExtras();
  const withExtras = (c: Candidate): Candidate => ({ ...c, accepted: [...new Set([...c.accepted, ...(extras[c.id] ?? [])])] });
  const fctx = { wn, index, zipf };
  const baseThemes = [...wordnetThemes(wn, index, zipf, cat), ...wikidataThemeCandidates(wdThemes, index, zipf)].map(withExtras);
  const letters = baseThemes.flatMap((t) => letterVariants(t, zipf)).map(withExtras);
  let themes = [...baseThemes, ...letters].filter((c) => floorProblems(c, fctx).length === 0);
  let origins = originCandidates(index, zipf, cat, curioLineage).map(withExtras).filter((c) => floorProblems(c, fctx).length === 0);
  const letterCount = letters.filter((c) => themes.includes(c)).length;
  const all = new Map([...themes, ...origins].map((c) => [c.id, c]));

  const failures: string[] = [];
  const judged = await guardedAdjudication(() => adjudicate(sink, all, { today, lexicon, usable, blocked, zipf }));
  if (!judged.ok) {
    // Counts only: the job still builds days, then exits 1 at the end.
    console.error(`dig:build: adjudication failed (${judged.message})`);
    failures.push("adjudication failed");
  }
  const adjudication: BuildStats["adjudication"] = judged.ok ? judged.result : "failed";
  // Adjudication may have just added extras: merge them again so days built in this run include them.
  try { extras = await sink.readExtras(); } catch { /* keep the extras read before adjudication */ }
  themes = themes.map(withExtras);
  origins = origins.map(withExtras);

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
    // Every written day is frozen: a day on disk that the manifest doesn't know about is never overwritten.
    if (await sink.readDay(date)) throw new Error(`day ${date} exists but is not in the manifest`);
    let done = false;
    for (let salt = 0; salt < MAX_SALTS && !done; salt++) {
      if (salt > 0) retries++;
      const picks = pickDay(date, { themes, origins }, history, zipf, seedSalt, salt);
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
      // Persist the manifest with every day, so a later failure never leaves a written day unrecorded.
      manifest.lastRun = new Date().toISOString();
      await sink.writeManifest(manifest);
      built++;
      done = true;
    }
    if (!done) failedDates++;
  }

  const bufferDays = bufferDaysFrom(today, Object.keys(manifest.days));
  const furthest = Object.keys(manifest.days).sort().at(-1);
  const after = addDays(furthest ?? today, 1);
  manifest.poolThemes = themes.filter((c) => isEligible(c, after, history)).length;
  manifest.poolOrigins = origins.filter((c) => isEligible(c, after, history)).length;
  manifest.lastRun = new Date().toISOString();
  await sink.writeManifest(manifest);

  const stats: BuildStats = { themes: themes.length, origins: origins.length, letterVariants: letterCount, built, retries, failedDates, bufferDays, poolThemes: manifest.poolThemes, poolOrigins: manifest.poolOrigins, wikidata, adjudication };
  const lines = summaryLines(stats);
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.map((l) => `- ${l}`).join("\n") + "\n");

  if (failedDates > 0) failures.push(`${failedDates} dates could not be built`);
  if (bufferDays < BUFFER_FLOOR) failures.push(`buffer ${bufferDays} days < ${BUFFER_FLOOR}`);
  if (manifest.poolThemes < MIN_POOL_THEMES || manifest.poolOrigins < MIN_POOL_ORIGINS) failures.push("spare pool below 20 themes / 6 origins");
  const heartbeat = await sink.readHeartbeat();
  const heartbeatIssue = heartbeatProblem(heartbeat, Object.keys(manifest.days), today, Date.now());
  if (heartbeatIssue) failures.push(heartbeatIssue);
  if (failures.length) { console.error(`dig:build failed: ${failures.join("; ")}`); process.exit(1); }
}

if (process.argv[1]?.endsWith("build.ts")) {
  main().catch((err) => {
    console.error(`dig:build failed: ${safeErrorText(err)}`);
    process.exit(1);
  });
}
