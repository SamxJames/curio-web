import type { LanguageFacts } from "./facts";
import { isLit } from "./mapGeometry";
import type { LanguageSheet } from "./types";
import { shapeProblems, validateSheet } from "./validate";

/** Every LanguageSheet field Claude writes, in order. `approved` is set by the pipeline. */
export const SHEET_FIELDS = [
  "name",
  "aliases",
  "status",
  "classification",
  "region",
  "map",
  "era",
  "peakSpeakers",
  "unknownSpeakersNote",
  "parent",
  "origin",
  "sourceUrl",
] as const satisfies readonly Exclude<keyof LanguageSheet, "approved">[];

const yearWords = (y: number) => (y < 0 ? `${-y} BCE` : `${y} CE`);

/** The fetched facts as plain lines — the only material the draft may use. */
export function factLines(facts: LanguageFacts): string[] {
  const lines: string[] = [];
  const wp = facts.wikipedia;
  if (wp) {
    lines.push(`Wikipedia article "${wp.title}" (${wp.url}) says: ${wp.extract}`);
    if (wp.description) lines.push(`Wikipedia short description: ${wp.description}`);
  }
  const wd = facts.wikidata;
  if (wd) {
    if (wd.coordinates) {
      lines.push(`Wikidata coordinates: lat ${wd.coordinates.lat}, lon ${wd.coordinates.lon}`);
    }
    if (wd.inception !== null) {
      lines.push(`Wikidata start date (inception): year ${wd.inception} (${yearWords(wd.inception)})`);
    }
    if (wd.dissolved !== null) {
      lines.push(`Wikidata end date (dissolved): year ${wd.dissolved} (${yearWords(wd.dissolved)})`);
    }
    if (wd.speakers) {
      const when = wd.speakers.year !== null ? `as of year ${wd.speakers.year}` : "no date given";
      lines.push(`Wikidata number of speakers: ${wd.speakers.count} (${when})`);
    }
    if (wd.instanceOf.length > 0) lines.push(`Wikidata "instance of": ${wd.instanceOf.join(", ")}`);
  }
  if (lines.length === 0) lines.push("(No facts could be fetched for this language.)");
  return lines;
}

/** The prompt sent to Claude. Like buildRewritePrompt in scripts/rewriteEtymology.ts, the
 * fetched facts are the ONLY allowed source; thin facts mean a short, honest sheet. */
export function buildSheetPrompt(
  name: string,
  facts: LanguageFacts,
  knownLanguages: string[] = [],
): string {
  const factsBlock = factLines(facts)
    .map((f, i) => `${i + 1}. ${f}`)
    .join("\n");
  const speakersRule = facts.wikidata?.speakers
    ? `There is a speaker-count fact above. Use exactly that count and its year in "peakSpeakers" ({"count", "year", "note"}); the note says plainly what the number counts and when (e.g. "Native speakers, Wikidata figure for <that year>"). If that fact has no year and the Wikipedia text gives none, set "peakSpeakers": null instead and write an "unknownSpeakersNote".`
    : `There is NO speaker-count fact above. You MUST set "peakSpeakers": null and write an honest "unknownSpeakersNote", e.g. "No census of its speakers exists." or, for a reconstructed language, "Reconstructed by scholars — never written down."`;
  const parentRule =
    knownLanguages.length > 0
      ? `"parent" is the language it descends from, ONLY if the facts name it AND it is exactly one of these names (otherwise null): ${knownLanguages.join(", ")}`
      : `"parent" is the language it descends from, only if the facts name it; otherwise null.`;

  return `You are writing one language fact sheet for Curio, a daily-word-etymology app. Its voice is warm, curious, and precise — never academic, never cute. No streaks, no "don't miss out", no urgency words.

The language is: "${name}"

Here are the ONLY facts you may use, fetched from Wikipedia and Wikidata:
${factsBlock}

Do NOT invent, guess, or pad any detail beyond what's given above — if the facts are thin, write a short, honest sheet rather than adding unsourced material.

Rules:
- Speakers: ${speakersRule} Never estimate, round or guess a speaker count. Whenever "peakSpeakers" is null, "unknownSpeakersNote" must be one honest line, e.g. "No census of its speakers exists." or "Reconstructed by scholars — never written down."
- Status: "living", "extinct", "historical" (an earlier stage of a language still spoken today, e.g. Old English) or "reconstructed". Every "Proto-" language is "reconstructed", and a reconstructed language always has "peakSpeakers": null.
- Map: give the approximate centre and spread of where it was spoken, from the coordinates or a region named in the facts. If no location is stated or implied by the facts, set "map": null.
- Era: years as numbers, negative for BCE. "to" is null if it is still spoken natively today. Set "era": null if the facts give no dates at all, and "approximate": true unless the facts give exact years.
- Parent: ${parentRule}

Write a JSON object (and nothing else — no markdown fences, no commentary) with exactly these fields:
{
  "name": ${JSON.stringify(name)},
  "aliases": [],
  "status": "living | extinct | historical | reconstructed",
  "classification": "one line, e.g. \\"Italic branch of the Indo-European family\\"",
  "region": "one line on where it was spoken, e.g. \\"Latium, central Italy → across the Roman Empire\\"",
  "map": { "lat": <number>, "lon": <number>, "radiusKm": <number> } or null,
  "era": { "from": <year, negative for BCE>, "to": <year, negative for BCE> or null, "writtenUntil": <year, negative for BCE> or null, "approximate": true } or null ("writtenUntil" only if the facts say it lived on in writing after native speech ended; null there means still written today),
  "peakSpeakers": { "count": <number>, "year": <year, negative for BCE>, "note": "..." } or null,
  "unknownSpeakersNote": "required when peakSpeakers is null, otherwise null",
  "parent": "a name from the allowed list, or null",
  "origin": "2-3 sentences (40-600 characters) on where the language came from, drawn only from the facts above",
  "sourceUrl": "the Wikipedia URL given in the facts"
}`;
}

export type DraftFile = Record<string, unknown> & {
  name: string;
  approved: boolean;
  _problems?: string[];
};

/** Strips a markdown fence wrapping the whole response (models sometimes add one anyway). */
function stripMarkdownFence(raw: string): string {
  const match = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(raw.trim());
  return match ? match[1] : raw;
}

/**
 * Turns Claude's raw text into a draft file. Never throws: unparseable text is an error,
 * and anything that fails validation or contradicts the facts is listed in `_problems`.
 * The name, aliases and source URL are mechanical, so they're taken from the facts.
 */
export function parseDraftResponse(
  raw: string,
  facts: LanguageFacts,
  knownLanguages: string[] = [],
): { ok: true; draft: DraftFile } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripMarkdownFence(raw));
  } catch {
    return { ok: false, error: `response was not valid JSON: ${raw.slice(0, 200)}` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "response JSON was not an object" };
  }

  const draft: DraftFile = {
    ...(parsed as Record<string, unknown>),
    name: facts.name,
    aliases: facts.aliases,
    ...(facts.wikipedia ? { sourceUrl: facts.wikipedia.url } : {}),
    approved: false,
  };
  delete draft._problems;

  // A reconstructed language was never spoken by a counted population: fixed copy, no number.
  if (draft.status === "reconstructed") {
    draft.peakSpeakers = null;
    draft.unknownSpeakersNote = RECONSTRUCTED_NOTE;
  }

  const problems = validateSheet(draft);
  if (shapeProblems(draft).length === 0) problems.push(...factProblems(draft as unknown as LanguageSheet, facts));
  if (knownLanguages.length > 0 && typeof draft.parent === "string" && !knownLanguages.includes(draft.parent)) {
    problems.push(`parent "${draft.parent}" is not one of our lineage languages`);
  }

  if (problems.length > 0) draft._problems = problems;
  return { ok: true, draft };
}

export const RECONSTRUCTED_NOTE = "Reconstructed by scholars — never written down.";
const ERA_TOLERANCE_YEARS = 50;
const MAP_TOLERANCE_KM = 1500;

/** Cross-checks a shape-valid sheet against the fetched facts: speakers, era and map. */
function factProblems(sheet: LanguageSheet, facts: LanguageFacts): string[] {
  const problems: string[] = [];
  const wd = facts.wikidata;

  const ps = sheet.peakSpeakers;
  const fact = wd?.speakers ?? null;
  if (ps) {
    if (!fact) problems.push("peakSpeakers is set but the facts have no speaker count");
    else {
      if (ps.count !== fact.count) {
        problems.push(`peakSpeakers.count ${ps.count} differs from the fact ${fact.count}`);
      }
      if (fact.year === null) problems.push("peakSpeakers is set but the speaker-count fact has no year");
      else if (ps.year !== fact.year) {
        problems.push(`peakSpeakers.year ${ps.year} differs from the fact ${fact.year}`);
      }
    }
  }

  if (sheet.era && wd) {
    if (wd.inception !== null && Math.abs(sheet.era.from - wd.inception) > ERA_TOLERANCE_YEARS) {
      problems.push(
        `era.from ${sheet.era.from} is more than ${ERA_TOLERANCE_YEARS} years from the fact ${wd.inception}`,
      );
    }
    if (wd.dissolved !== null) {
      if (sheet.era.to === null) {
        problems.push(`era.to is null (still spoken) but the facts give an end date of ${wd.dissolved}`);
      } else if (Math.abs(sheet.era.to - wd.dissolved) > ERA_TOLERANCE_YEARS) {
        problems.push(
          `era.to ${sheet.era.to} is more than ${ERA_TOLERANCE_YEARS} years from the fact ${wd.dissolved}`,
        );
      }
    }
  }

  const c = wd?.coordinates;
  if (sheet.map && c && !isLit([sheet.map.lon, sheet.map.lat], c, MAP_TOLERANCE_KM)) {
    problems.push(`map centre is more than ${MAP_TOLERANCE_KM} km from the fact coordinates (${c.lat}, ${c.lon})`);
  }
  return problems;
}

export type MessageResponse = {
  stop_reason?: string | null;
  content: ({ type: string; text?: string } & Record<string, unknown>)[];
};

/**
 * The draft text from a Messages API response. Skips thinking and fallback blocks (the
 * refusal fallback can add one) and takes the first text block. Throws when the response
 * was cut off at max_tokens or the whole fallback chain refused.
 */
export function extractResponseText(data: MessageResponse): string {
  if (data.stop_reason === "max_tokens") throw new Error("response hit max_tokens");
  if (data.stop_reason === "refusal") throw new Error("the model (and its fallback) declined this request");
  const text = data.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("response had no text block");
  return text;
}
