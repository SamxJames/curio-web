// TEST-ONLY fixture sheets. Values are plausible but are NOT sourced or reviewed facts.
// Never import this from app/ or components/ (a test in panel.test.ts enforces that),
// and never copy it into data.ts — real sheets come only from `languages:approve`.
import type { LanguageSheet } from "../types";

export const LATIN_FIXTURE: LanguageSheet = {
  name: "Latin",
  aliases: ["Classical Latin"],
  status: "extinct",
  classification: "Test fixture: Italic branch of the Indo-European family",
  region: "Test fixture: Latium, central Italy → across the Roman Empire",
  map: { lat: 41.9, lon: 12.5, radiusKm: 600 },
  era: { from: -700, to: 600, writtenUntil: new Date().getUTCFullYear(), approximate: true },
  peakSpeakers: { count: 4_500_000, year: 100, note: "Test fixture value, not a sourced figure." },
  unknownSpeakersNote: null,
  parent: "Proto-Italic",
  origin:
    "Test fixture origin text. It stands in for two or three sentences drawn from fetched facts. It is not a fact sheet.",
  sourceUrl: "https://en.wikipedia.org/wiki/Latin",
  approved: true,
};

export const PROTO_ITALIC_FIXTURE: LanguageSheet = {
  name: "Proto-Italic",
  aliases: [],
  status: "reconstructed",
  classification: "Test fixture: reconstructed ancestor of the Italic languages",
  region: "Test fixture: the Italian peninsula",
  map: null,
  era: null,
  peakSpeakers: null,
  unknownSpeakersNote: "Test fixture: no reliable count exists for a reconstructed language.",
  parent: "Proto-Indo-European",
  origin:
    "Test fixture origin text for a reconstructed language. It is not a fact sheet and must never ship.",
  sourceUrl: "https://en.wikipedia.org/wiki/Proto-Italic_language",
  approved: true,
};

export const PROTO_INDO_EUROPEAN_FIXTURE: LanguageSheet = {
  ...PROTO_ITALIC_FIXTURE,
  name: "Proto-Indo-European",
  classification: "Test fixture: reconstructed root of the Indo-European family",
  region: "Test fixture: the Pontic–Caspian steppe",
  era: { from: -4500, to: -2500, approximate: true },
  parent: null,
  sourceUrl: "https://en.wikipedia.org/wiki/Proto-Indo-European_language",
};

export const FIXTURE_SHEETS: LanguageSheet[] = [
  PROTO_INDO_EUROPEAN_FIXTURE,
  PROTO_ITALIC_FIXTURE,
  LATIN_FIXTURE,
];
