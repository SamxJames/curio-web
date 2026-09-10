export type WordEntry = {
  slug: string;
  word: string;
  respelling: string;
  partOfSpeech: string;
  origin: string;
  journey: string;
  related: string;
};

// Seed content. Each entry is written from general etymological knowledge
// (Wiktextract-style facts, rewritten in Curio's voice) — swap this array
// for the output of the offline content pipeline described in the brief
// once it's ported over from the mobile app.
export const WORDS: WordEntry[] = [
  {
    slug: "quarantine",
    word: "quarantine",
    respelling: "KWOR-uhn-teen",
    partOfSpeech: "noun",
    origin:
      "From Italian quaranta giorni, \u201cforty days\u201d — the wait Venice imposed on ships arriving from plague-affected ports in the 14th century before anyone could come ashore.",
    journey:
      "The word stayed tied to that exact span for centuries: forty days, no more, no less. Only in modern use did it loosen from the number itself, coming to mean any isolation period imposed to stop disease from spreading — regardless of how long it actually lasts.",
    related:
      "Quarantine's root, quaranta, traces back to Latin quadraginta (forty), which makes it a distant cousin of quarter and quart — all ultimately from quattuor, four.",
  },
  {
    slug: "salary",
    word: "salary",
    respelling: "SAL-uh-ree",
    partOfSpeech: "noun",
    origin:
      "From Latin salarium, a stipend paid to Roman soldiers, traditionally connected to sal, salt — a commodity valuable enough that it may once have been part of a soldier's pay.",
    journey:
      "The word drifted from a specific soldier's allowance to any regular payment for work at all, shedding its connection to salt so completely that no English speaker today thinks of seasoning when they mention a salary.",
    related:
      "The same Latin sal gives English salad, sauce, and sausage, and lives on in the phrase \u201cworth one's salt.\u201d",
  },
  {
    slug: "disaster",
    word: "disaster",
    respelling: "dih-ZAS-ter",
    partOfSpeech: "noun",
    origin:
      "From Italian disastro, built from dis- (bad) and astro (star) — reflecting the old belief that misfortune arrived by way of an unfavorable alignment of the stars.",
    journey:
      "What began as a literal astrological verdict — \u201cill-starred\u201d — broadened over time into any sudden catastrophe, with the stargazing entirely forgotten.",
    related:
      "The astro- root resurfaces in astronomy and astronaut; the dis- prefix shows up again in disgrace and discord.",
  },
  {
    slug: "clue",
    word: "clue",
    respelling: "KLOO",
    partOfSpeech: "noun",
    origin:
      "A variant spelling of clew, meaning a ball of thread, from Old English cliewen.",
    journey:
      "The meaning shifted through the myth of Theseus, who used a thread to retrace his steps out of the Minotaur's labyrinth. From there, clue came to mean anything that helps you find your way through a problem — the thread itself dropped out of everyday use entirely.",
    related:
      "Clew survives today only as a sailing term for the corner of a sail; clue and clew are, at root, the very same word.",
  },
  {
    slug: "muscle",
    word: "muscle",
    respelling: "MUSS-uhl",
    partOfSpeech: "noun",
    origin:
      "From Latin musculus, literally \u201clittle mouse\u201d — a flexing bicep was thought to look like a small mouse moving under the skin.",
    journey:
      "The nickname stuck so thoroughly that it became the standard anatomical term, while the image of a mouse under the skin faded out of how people actually think about the word.",
    related:
      "Musculus is a diminutive of mus (mouse) — the same root behind mouse itself, and, much later, the computer mouse.",
  },
  {
    slug: "robot",
    word: "robot",
    respelling: "ROH-bot",
    partOfSpeech: "noun",
    origin:
      "Coined by Czech writer Karel \u010Capek for his 1920 play R.U.R., from robota, a Czech and Slavic word for forced labor or drudgery.",
    journey:
      "The word entered English almost as soon as the play was translated and quickly outgrew the stage, moving from \u201cartificial forced laborer\u201d to any mechanical or programmable machine.",
    related:
      "Robota is related to rab, an old Slavic word for slave. English has no native cognates for it, making robot one of the few everyday English words borrowed wholesale from Czech.",
  },
  {
    slug: "avocado",
    word: "avocado",
    respelling: "av-uh-KAH-doh",
    partOfSpeech: "noun",
    origin:
      "From Nahuatl \u0101huacatl, which also meant \u201ctesticle,\u201d likely describing how the fruit hangs from the tree in pairs.",
    journey:
      "Spanish reshaped the unfamiliar Nahuatl word into aguacate, and a later folk-etymological twist produced avocado — nudged along by the unrelated Spanish word abogado (lawyer). That detour is also why avocados were once called \u201calligator pears\u201d in English.",
    related:
      "Guacamole comes from the same Nahuatl root, combining \u0101huacatl with molli (sauce).",
  },
  {
    slug: "companion",
    word: "companion",
    respelling: "kuhm-PAN-yuhn",
    partOfSpeech: "noun",
    origin:
      "From Latin com- (together) and panis (bread), by way of Old French compaignon — literally \u201cone who breaks bread with you.\u201d",
    journey:
      "The concrete image of a shared meal broadened into the general sense of anyone who accompanies you, with no bread — or food at all — required anymore.",
    related:
      "The same panis gives English pantry (where bread was kept), and, through French, company and accompany.",
  },
];

/** Anchor date for the deterministic daily rotation (UTC midnight). */
const START_DATE = Date.UTC(2026, 0, 1); // 2026-01-01
const DAY_MS = 24 * 60 * 60 * 1000;

function daysSinceStart(date: Date): number {
  const utcMidnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  return Math.floor((utcMidnight - START_DATE) / DAY_MS);
}

/** Deterministic word-of-the-day: same date always maps to the same word,
 *  for every visitor and in every emailed digest, with no server-side
 *  scheduling beyond the hourly send job. */
export function getWordForDate(date: Date): WordEntry {
  const index =
    ((daysSinceStart(date) % WORDS.length) + WORDS.length) % WORDS.length;
  return WORDS[index];
}

export function getTodayWord(): WordEntry {
  return getWordForDate(new Date());
}

export function getWordBySlug(slug: string): WordEntry | undefined {
  return WORDS.find((w) => w.slug === slug);
}

export type HistoryDay = { date: string; word: WordEntry };

/** Every day from START_DATE through today, most recent first. */
export function getHistory(today: Date = new Date()): HistoryDay[] {
  const days: HistoryDay[] = [];
  const totalDays = daysSinceStart(today);
  for (let i = totalDays; i >= 0; i--) {
    const d = new Date(START_DATE + i * DAY_MS);
    days.push({
      date: d.toISOString().slice(0, 10),
      word: getWordForDate(d),
    });
  }
  return days;
}
