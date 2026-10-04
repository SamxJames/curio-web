// Pure helpers for the language fact pipeline (scripts/languages/fetchFacts.ts).
// Nothing here touches the network: the script fetches, these functions parse.

/** Lineage spellings that mean the same language, mapped to the canonical name. */
export const ALIASES: Record<string, string> = {
  Lombardic: "Lombard",
  Kiswahili: "Swahili",
  Ottoman: "Ottoman Turkish",
  "Old Provençal": "Old Occitan",
};

/** Lineage names that never get a sheet: English itself, non-languages and English varieties. */
export const SKIP = [
  "English",
  "Translingual",
  "Phrygian or Anatolian",
  "Indian English",
  "Late Middle English",
];

export const canonicalName = (name: string): string => ALIASES[name] ?? name;

type HasLineage = { lineage: string[] };

function countWordsPerLanguage(words: HasLineage[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const w of words) {
    for (const name of new Set(w.lineage)) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

const byCountThenName = ([a, ca]: [string, number], [b, cb]: [string, number]) =>
  cb - ca || (a < b ? -1 : a > b ? 1 : 0);

/** Unique lineage names minus English and Translingual, by number of words using them (desc). */
export function collectLineageLanguages(words: HasLineage[]): string[] {
  const counts = countWordsPerLanguage(words);
  counts.delete("English");
  counts.delete("Translingual");
  return [...counts.entries()].sort(byCountThenName).map(([name]) => name);
}

export type LanguageTarget = { name: string; aliases: string[] };

/** The languages to fetch facts for: SKIP removed, aliases merged under their canonical name. */
export function languageTargets(words: HasLineage[]): LanguageTarget[] {
  const counts = countWordsPerLanguage(words);
  const merged = new Map<string, { count: number; aliases: Set<string> }>();
  for (const [name, count] of counts) {
    if (SKIP.includes(name)) continue;
    const canonical = canonicalName(name);
    const entry = merged.get(canonical) ?? { count: 0, aliases: new Set<string>() };
    entry.count += count;
    if (canonical !== name) entry.aliases.add(name);
    merged.set(canonical, entry);
  }
  return [...merged.entries()]
    .map(([name, e]) => [name, e.count] as [string, number])
    .sort(byCountThenName)
    .map(([name]) => ({ name, aliases: [...merged.get(name)!.aliases].sort() }));
}

/** File-name slug: "Old Provençal" → "old-provencal". */
export function languageSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SUMMARY_BASE = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const titlePath = (title: string) => encodeURIComponent(title.replace(/ /g, "_"));

const isProto = (name: string) => /^proto-/i.test(name);

/** Page titles to try in order: "Proto-*" names bare first, every other name "{Name} language" first. */
export function wikipediaTitleCandidates(name: string): string[] {
  return isProto(name) ? [name, `${name} language`] : [`${name} language`, name];
}

/** Summary URLs to try in order (see wikipediaTitleCandidates). */
export function wikipediaSummaryUrls(name: string): string[] {
  return wikipediaTitleCandidates(name).map((t) => `${SUMMARY_BASE}${titlePath(t)}`);
}

/** The action API URL for a page's plain-text lead section. */
export function wikipediaLeadUrl(title: string): string {
  return `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&format=json&formatversion=2&titles=${titlePath(title)}`;
}

export function wikidataEntityUrl(qid: string): string {
  return `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`;
}

export function wikidataLabelsUrl(ids: string[]): string {
  return `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids
    .map(encodeURIComponent)
    .join("|")}&props=labels&languages=en&format=json`;
}

/** Retry once on rate limiting or a server error; anything else won't change on retry. */
export const shouldRetryStatus = (status: number): boolean =>
  status === 429 || (status >= 500 && status < 600);

const RETRY_AFTER_CAP_MS = 30_000;
const RETRY_DEFAULT_MS = 2_000;

/** Wait before the retry: the Retry-After header (seconds or HTTP date), capped at 30 s; 2 s if absent. */
export function retryAfterMs(header: string | null, now: number = Date.now()): number {
  if (header === null) return RETRY_DEFAULT_MS;
  const trimmed = header.trim();
  let ms: number;
  if (/^\d+$/.test(trimmed)) ms = Number(trimmed) * 1000;
  else {
    const at = Date.parse(trimmed);
    if (Number.isNaN(at)) return RETRY_DEFAULT_MS;
    ms = at - now;
  }
  return Math.min(Math.max(ms, 0), RETRY_AFTER_CAP_MS);
}

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export type WikipediaSummary = {
  title: string;
  extract: string;
  lead?: string; // plain-text lead section, added by fetchFacts
  titleMatched?: boolean; // false = fallback page that failed acceptSummary; absent in old files
  url: string; // content_urls.desktop.page
  description: string | null;
  wikibaseItem: string | null;
  type: string | null;
};

export function parseWikipediaSummary(json: unknown): WikipediaSummary | null {
  if (!isObject(json)) return null;
  const title = str(json.title);
  const extract = str(json.extract);
  const desktop = isObject(json.content_urls) ? json.content_urls.desktop : undefined;
  const url = isObject(desktop) ? str(desktop.page) : null;
  if (!title || !extract || !url) return null;
  return {
    title,
    extract,
    url,
    description: str(json.description),
    wikibaseItem: str(json.wikibase_item),
    type: str(json.type),
  };
}

/** A disambiguation page is never kept: it counts as no Wikipedia facts. */
export function usableSummary(summary: WikipediaSummary | null): WikipediaSummary | null {
  return summary && summary.type !== "disambiguation" ? summary : null;
}

/** True when a summary looks like it is about a language, not a people, place or list. */
export function isAboutLanguage(summary: WikipediaSummary): boolean {
  if (summary.type === "disambiguation") return false;
  const text = `${summary.title} ${summary.description ?? ""} ${summary.extract.slice(0, 300)}`;
  return /\b(language|languages|dialect|dialects|tongue)\b/i.test(text);
}

export const LEAD_CAP = 4000;

/** Cuts text to LEAD_CAP characters at the last sentence end before the cap (hard cut if none). */
export function capLead(text: string): string {
  if (text.length <= LEAD_CAP) return text;
  const head = text.slice(0, LEAD_CAP);
  const ends = [...head.matchAll(/[.!?][")\]']?(?=\s|$)/g)];
  const last = ends[ends.length - 1];
  return last ? head.slice(0, last.index + last[0].length) : head;
}

/** Plain-text lead section from the extracts API response; null if the page or extract is missing. */
export function parseWikipediaLead(json: unknown): string | null {
  if (!isObject(json) || !isObject(json.query) || !Array.isArray(json.query.pages)) return null;
  const page = json.query.pages[0];
  const extract = isObject(page) ? str(page.extract)?.trim() : null;
  return extract ? capLead(extract) : null;
}

const normaliseTitle = (s: string) =>
  s.toLowerCase().replace(/\s+/g, " ").trim().replace(/ languages?$/, "");

/** A summary is kept only if it is about a language AND its normalised title equals the requested name. */
export function acceptSummary(name: string, summary: WikipediaSummary): boolean {
  return isAboutLanguage(summary) && normaliseTitle(summary.title) === normaliseTitle(name);
}

export type WikidataFacts = {
  qid: string;
  coordinates: { lat: number; lon: number } | null;
  inception: number | null; // year, negative = BCE
  dissolved: number | null;
  speakers: { count: number; year: number | null } | null;
  instanceOf: string[]; // English labels where known, else the Q-id
  subclassOf?: string[]; // P279 Q-ids (non-deprecated)
  indigenousTo?: string[]; // P2341 Q-ids
  parentLabels?: string[]; // English labels of subclassOf, added by fetchFacts
  regionLabels?: string[]; // English labels of indigenousTo, added by fetchFacts
};

/** "+1066-00-00T00:00:00Z" → 1066; "-0700-…" → -700. */
function yearOf(time: unknown): number | null {
  const m = typeof time === "string" ? /^([+-])(\d+)-/.exec(time) : null;
  if (!m) return null;
  const y = Number(m[2]);
  return m[1] === "-" ? -y : y;
}

function firstEntity(json: unknown): Obj | null {
  if (!isObject(json) || !isObject(json.entities)) return null;
  const first = Object.values(json.entities)[0];
  return isObject(first) ? first : null;
}

/** Statement values (datavalue.value) for a property, skipping deprecated and no-value snaks. */
function claimValues(entity: Obj, prop: string): { value: unknown; statement: Obj }[] {
  const claims = isObject(entity.claims) ? entity.claims[prop] : undefined;
  if (!Array.isArray(claims)) return [];
  const out: { value: unknown; statement: Obj }[] = [];
  for (const st of claims) {
    if (!isObject(st) || st.rank === "deprecated" || !isObject(st.mainsnak)) continue;
    const dv = st.mainsnak.datavalue;
    if (isObject(dv) && dv.value !== undefined) out.push({ value: dv.value, statement: st });
  }
  return out;
}

function entityIds(entity: Obj, prop: string): string[] {
  return claimValues(entity, prop)
    .map(({ value }) => (isObject(value) ? str(value.id) : null))
    .filter((id): id is string => id !== null);
}

export function instanceOfIds(entityJson: unknown): string[] {
  const entity = firstEntity(entityJson);
  return entity ? entityIds(entity, "P31") : [];
}

/** Q-ids whose English labels fetchFacts needs: instance-of, subclass-of and indigenous-to. */
export function labelIds(entityJson: unknown): string[] {
  const facts = parseWikidataClaims(entityJson);
  const entity = firstEntity(entityJson);
  if (!facts || !entity) return [];
  return [...new Set([...entityIds(entity, "P31"), ...(facts.subclassOf ?? []), ...(facts.indigenousTo ?? [])])];
}

/** wbgetentities labels response → { Qid: English label }. */
export function parseWikidataLabels(json: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isObject(json) || !isObject(json.entities)) return out;
  for (const [id, e] of Object.entries(json.entities)) {
    const en = isObject(e) && isObject(e.labels) ? e.labels.en : undefined;
    const label = isObject(en) ? str(en.value) : null;
    if (label) out[id] = label;
  }
  return out;
}

export function parseWikidataClaims(
  entityJson: unknown,
  labels: Record<string, string> = {},
): WikidataFacts | null {
  const entity = firstEntity(entityJson);
  const qid = entity ? str(entity.id) : null;
  if (!entity || !qid) return null;

  const coord = claimValues(entity, "P625")[0]?.value;
  const coordinates =
    isObject(coord) && typeof coord.latitude === "number" && typeof coord.longitude === "number"
      ? { lat: coord.latitude, lon: coord.longitude }
      : null;

  const timeYear = (prop: string) => {
    const v = claimValues(entity, prop)[0]?.value;
    return isObject(v) ? yearOf(v.time) : null;
  };

  let speakers: WikidataFacts["speakers"] = null;
  for (const { value, statement } of claimValues(entity, "P1098")) {
    const count = isObject(value) ? Number(value.amount) : NaN;
    if (!Number.isFinite(count)) continue;
    if (speakers && count <= speakers.count) continue;
    const quals = isObject(statement.qualifiers) ? statement.qualifiers.P585 : undefined;
    const q = Array.isArray(quals) && isObject(quals[0]) ? quals[0].datavalue : undefined;
    const year = isObject(q) && isObject(q.value) ? yearOf(q.value.time) : null;
    speakers = { count, year };
  }

  return {
    qid,
    coordinates,
    inception: timeYear("P571"),
    dissolved: timeYear("P576"),
    speakers,
    instanceOf: instanceOfIds(entityJson).map((id) => labels[id] ?? id),
    subclassOf: entityIds(entity, "P279"),
    indigenousTo: entityIds(entity, "P2341"),
  };
}

/** What fetchFacts writes to content/languages/facts/<slug>.json. */
export type LanguageFacts = {
  name: string;
  aliases: string[];
  wikipedia: WikipediaSummary | null;
  wikidata: WikidataFacts | null;
  fetchedAt: string;
};
