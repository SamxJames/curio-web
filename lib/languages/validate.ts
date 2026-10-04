import type { LanguageSheet } from "./types";

const SOURCE_PREFIX = "https://en.wikipedia.org/wiki/";

/** Returns a list of human-readable problems; empty means the sheet is valid. */
export function validateSheet(sheet: LanguageSheet): string[] {
  const problems: string[] = [];

  if (!sheet.name || sheet.name.trim() === "") problems.push("name is empty");

  const originLen = (sheet.origin ?? "").length;
  if (originLen < 40) problems.push(`origin too short (${originLen} < 40)`);
  if (originLen > 600) problems.push(`origin too long (${originLen} > 600)`);

  if (!sheet.sourceUrl || !sheet.sourceUrl.startsWith(SOURCE_PREFIX)) {
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

  if (sheet.name?.startsWith("Proto-") && sheet.status !== "reconstructed") {
    problems.push("Proto- languages must have status reconstructed");
  }
  if (sheet.status === "reconstructed" && sheet.peakSpeakers !== null) {
    problems.push("a reconstructed language cannot have peakSpeakers");
  }

  return problems;
}
