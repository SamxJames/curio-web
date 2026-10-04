// Fetches Wikipedia summaries and Wikidata claims for every lineage language and writes
// content/languages/facts/<slug>.json. Public APIs only — no key needed.
//   npm run languages:facts -- [--only "Latin,Old Norse"] [--limit 30] [--refresh]
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { WORDS } from "../../lib/words";
import {
  canonicalName,
  instanceOfIds,
  isAboutLanguage,
  languageSlug,
  languageTargets,
  parseWikidataClaims,
  parseWikidataLabels,
  parseWikipediaSummary,
  retryAfterMs,
  shouldRetryStatus,
  usableSummary,
  wikidataEntityUrl,
  wikidataLabelsUrl,
  wikipediaSummaryUrls,
  type LanguageFacts,
  type WikipediaSummary,
} from "../../lib/languages/facts";
import { FACTS_DIR, limitValue, onlyList } from "./cli";

const USER_AGENT = "CurioLanguageFacts/1.0 (curioword.com; hello@curioword.com)";
const GAP_MS = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastRequestAt = 0;

/**
 * GET JSON politely: 300 ms between requests, one retry on 429/5xx (honouring Retry-After,
 * capped at 30 s). Returns null ONLY on a 404. A persistent 429/5xx, any other error status
 * or a network error throws, so main() logs that language as FAILED and writes no file —
 * a re-run then tries it again instead of keeping a false "no facts" file.
 */
async function getJson(url: string): Promise<unknown | null> {
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequestAt + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    if (attempt === 0 && shouldRetryStatus(res.status)) {
      await sleep(retryAfterMs(res.headers.get("retry-after")));
      continue;
    }
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
}

/** "{Name}_language" first; fall back to "{Name}" on a 404 or a page that isn't about a language. */
async function fetchWikipedia(name: string): Promise<WikipediaSummary | null> {
  let fallback: WikipediaSummary | null = null;
  for (const url of wikipediaSummaryUrls(name)) {
    const summary = usableSummary(parseWikipediaSummary(await getJson(url)));
    if (!summary) continue;
    if (isAboutLanguage(summary)) return summary;
    fallback ??= summary;
  }
  return fallback;
}

async function main() {
  const args = process.argv.slice(2);
  const refresh = args.includes("--refresh");
  const only = onlyList(args);
  const limit = limitValue(args);

  let targets = languageTargets(WORDS);
  if (only) {
    const wanted = new Set(only.map(canonicalName));
    const unknown = [...wanted].filter((n) => !targets.some((t) => t.name === n));
    if (unknown.length > 0) console.warn(`Not a lineage language (ignored): ${unknown.join(", ")}`);
    targets = targets.filter((t) => wanted.has(t.name));
  }
  mkdirSync(FACTS_DIR, { recursive: true });
  const outPath = (name: string) => path.join(FACTS_DIR, `${languageSlug(name)}.json`);
  if (!refresh) targets = targets.filter((t) => !existsSync(outPath(t.name)));
  if (limit) targets = targets.slice(0, limit);

  console.log(`Fetching facts for ${targets.length} language(s) into ${FACTS_DIR}`);
  let failed = 0;
  for (const { name, aliases } of targets) {
    try {
      const wikipedia = await fetchWikipedia(name);
      let wikidata: LanguageFacts["wikidata"] = null;
      if (wikipedia?.wikibaseItem) {
        const entity = await getJson(wikidataEntityUrl(wikipedia.wikibaseItem));
        const ids = instanceOfIds(entity).slice(0, 50);
        const labels = ids.length > 0 ? parseWikidataLabels(await getJson(wikidataLabelsUrl(ids))) : {};
        wikidata = parseWikidataClaims(entity, labels);
      }
      const facts: LanguageFacts = { name, aliases, wikipedia, wikidata, fetchedAt: new Date().toISOString() };
      writeFileSync(outPath(name), JSON.stringify(facts, null, 2) + "\n");
      const notes = [
        wikipedia
          ? `wikipedia "${wikipedia.title}"${isAboutLanguage(wikipedia) ? "" : " (not a language page?)"}`
          : "NO wikipedia",
        wikidata ? `wikidata ${wikidata.qid}` : "no wikidata",
        wikidata?.speakers ? "speakers" : "no speakers",
      ];
      console.log(`${name}: ${notes.join(" | ")}`);
    } catch (err) {
      failed++;
      console.error(`${name}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`Done. ${targets.length - failed} written, ${failed} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
