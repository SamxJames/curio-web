import type { LanguageSheet, LanguageStatus } from "./types";

const SOURCE_PREFIX = "https://en.wikipedia.org/wiki/";

export const LANGUAGE_STATUSES: readonly LanguageStatus[] = [
  "living",
  "extinct",
  "historical",
  "reconstructed",
];

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Checks a nullable nested object: the key must be present, and the value null or an object
 * whose listed fields are numbers. Pushes a problem for anything else. */
function nullableObject(
  obj: Obj,
  key: string,
  numberFields: string[],
  problems: string[],
): void {
  if (!(key in obj) || obj[key] === undefined) {
    problems.push(`${key} is missing (use null when unknown)`);
    return;
  }
  const v = obj[key];
  if (v === null) return;
  if (!isObject(v)) {
    problems.push(`${key} must be an object or null`);
    return;
  }
  for (const f of numberFields) {
    if (!isNum(v[f])) problems.push(`${key}.${f} must be a number`);
  }
}

/**
 * Structural checks for untrusted input (e.g. LLM-written JSON). Empty means the value
 * has the exact shape of a LanguageSheet, so the semantic checks below can't throw.
 */
export function shapeProblems(raw: unknown): string[] {
  if (!isObject(raw)) return ["sheet must be a JSON object"];
  const problems: string[] = [];

  for (const f of ["name", "classification", "region", "origin", "sourceUrl"]) {
    if (typeof raw[f] !== "string") problems.push(`${f} must be a string`);
  }
  if (!Array.isArray(raw.aliases) || !raw.aliases.every((a) => typeof a === "string")) {
    problems.push("aliases must be an array of strings");
  }
  if (!LANGUAGE_STATUSES.includes(raw.status as LanguageStatus)) {
    problems.push(`status must be one of ${LANGUAGE_STATUSES.join(", ")}`);
  }

  nullableObject(raw, "map", ["lat", "lon", "radiusKm"], problems);

  nullableObject(raw, "era", ["from"], problems);
  if (isObject(raw.era)) {
    const { to, writtenUntil, approximate } = raw.era;
    if (!(to === null || isNum(to))) problems.push("era.to must be a number or null");
    if (!(writtenUntil === undefined || writtenUntil === null || isNum(writtenUntil))) {
      problems.push("era.writtenUntil must be a number, null or absent");
    }
    if (typeof approximate !== "boolean") problems.push("era.approximate must be a boolean");
  }

  nullableObject(raw, "peakSpeakers", ["count", "year"], problems);
  if (isObject(raw.peakSpeakers)) {
    const { note } = raw.peakSpeakers;
    if (!(note === undefined || typeof note === "string")) {
      problems.push("peakSpeakers.note must be a string or absent");
    }
  }

  if (!(raw.unknownSpeakersNote === null || typeof raw.unknownSpeakersNote === "string")) {
    problems.push("unknownSpeakersNote must be a string or null");
  }
  if (!(raw.parent === null || typeof raw.parent === "string")) {
    problems.push("parent must be a string or null");
  }
  if (typeof raw.approved !== "boolean") problems.push("approved must be a boolean");

  return problems;
}

/** Type guard: true when `raw` has the exact shape of a LanguageSheet. */
export function isLanguageSheet(raw: unknown): raw is LanguageSheet {
  return shapeProblems(raw).length === 0;
}

/**
 * Returns a list of human-readable problems; empty means the sheet is valid.
 * Accepts untrusted input and never throws: malformed shapes come back as problems.
 */
export function validateSheet(raw: unknown): string[] {
  const shape = shapeProblems(raw);
  if (shape.length > 0) return shape;
  const sheet = raw as LanguageSheet;
  const problems: string[] = [];

  if (sheet.name.trim() === "") problems.push("name is empty");

  const originLen = sheet.origin.length;
  if (originLen < 40) problems.push(`origin too short (${originLen} < 40)`);
  if (originLen > 600) problems.push(`origin too long (${originLen} > 600)`);

  if (!sheet.sourceUrl.startsWith(SOURCE_PREFIX)) {
    problems.push(`sourceUrl must start with ${SOURCE_PREFIX}`);
  }

  if (sheet.peakSpeakers === null) {
    if (!sheet.unknownSpeakersNote || sheet.unknownSpeakersNote.trim() === "") {
      problems.push("unknownSpeakersNote is required when peakSpeakers is null");
    }
  } else if (!Number.isInteger(sheet.peakSpeakers.count) || sheet.peakSpeakers.count <= 0) {
    problems.push("peakSpeakers.count must be a positive integer");
  }

  if (sheet.era && sheet.era.to !== null && sheet.era.to < sheet.era.from) {
    problems.push("era.to is before era.from");
  }

  if (sheet.map) {
    const { lat, lon, radiusKm } = sheet.map;
    if (!(lat >= -90 && lat <= 90)) problems.push("map.lat outside ±90");
    if (!(lon >= -180 && lon <= 180)) problems.push("map.lon outside ±180");
    if (!(radiusKm >= 1 && radiusKm <= 5000)) problems.push("map.radiusKm outside 1–5000");
  }

  if (sheet.name.startsWith("Proto-") && sheet.status !== "reconstructed") {
    problems.push("Proto- languages must have status reconstructed");
  }
  if (sheet.status === "reconstructed" && sheet.peakSpeakers !== null) {
    problems.push("a reconstructed language cannot have peakSpeakers");
  }

  return problems;
}
