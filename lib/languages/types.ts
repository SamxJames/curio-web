export type LanguageStatus = "living" | "extinct" | "historical" | "reconstructed";
// historical = an earlier stage of a language still spoken today (Old English, Middle French…)

export type LanguageSheet = {
  name: string; // canonical display name, exactly as in word lineages (e.g. "Latin")
  aliases: string[]; // other lineage spellings that mean the same language (e.g. ["Lombardic"])
  status: LanguageStatus;
  classification: string; // one line, e.g. "Italic branch of the Indo-European family"
  region: string; // one line, e.g. "Latium, central Italy → across the Roman Empire"
  map: { lat: number; lon: number; radiusKm: number } | null; // centre + rough spread; null if no location is known
  era: {
    from: number; // year, negative = BCE (e.g. -700)
    to: number | null; // null = still spoken natively today
    writtenUntil?: number | null; // optional faint tail: still used in writing (null = to now)
    approximate: boolean;
  } | null; // null = dates unknown
  // Holds the recorded figure (Wikidata P1098, a count as of a date), not necessarily a peak.
  peakSpeakers: { count: number; year: number; note?: string } | null;
  unknownSpeakersNote: string | null; // required when peakSpeakers is null
  parent: string | null; // canonical name of the language it descends from, if in our data
  origin: string; // 2–3 sentences, only from the fetched facts
  sourceUrl: string; // https://en.wikipedia.org/wiki/...
  approved: boolean;
};
