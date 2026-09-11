export type WordEntry = {
  slug: string;
  word: string;
  respelling: string;
  partOfSpeech: string;
  /** A one-sentence hook shown on the Today page — distinct from `origin`
   * (the full explanation shown on the story page) so clicking through
   * reveals new text rather than repeating what was just read. Written from
   * the same facts as origin/journey/related, just condensed and rephrased,
   * never introducing anything not already established there. */
  teaser: string;
  origin: string;
  journey: string;
  related: string;
  /** The languages this word passed through, oldest first, ending in
   * "English" — only languages explicitly named in this entry's own
   * origin/journey/related text, in the order they're introduced. Powers
   * the etymology lineage breadcrumb (components/EtymologyLineage.tsx). */
  lineage: string[];
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
    teaser:
      "Venice once made incoming ships wait offshore for exactly forty days — no more, no less.",
    origin:
      "From Italian quaranta giorni, \u201cforty days\u201d — the wait Venice imposed on ships arriving from plague-affected ports in the 14th century before anyone could come ashore.",
    journey:
      "The word stayed tied to that exact span for centuries: forty days, no more, no less. Only in modern use did it loosen from the number itself, coming to mean any isolation period imposed to stop disease from spreading — regardless of how long it actually lasts.",
    related:
      "Quarantine's root, quaranta, traces back to Latin quadraginta (forty), which makes it a distant cousin of quarter and quart — all ultimately from quattuor, four.",
    lineage: ["Latin", "Italian", "English"],
  },
  {
    slug: "salary",
    word: "salary",
    respelling: "SAL-uh-ree",
    partOfSpeech: "noun",
    teaser: "A Roman soldier's stipend, tied to an unlikely ingredient: salt.",
    origin:
      "From Latin salarium, a stipend paid to Roman soldiers, traditionally connected to sal, salt — a commodity valuable enough that it may once have been part of a soldier's pay.",
    journey:
      "The word drifted from a specific soldier's allowance to any regular payment for work at all, shedding its connection to salt so completely that no English speaker today thinks of seasoning when they mention a salary.",
    related:
      "The same Latin sal gives English salad, sauce, and sausage, and lives on in the phrase \u201cworth one's salt.\u201d",
    lineage: ["Latin", "English"],
  },
  {
    slug: "disaster",
    word: "disaster",
    respelling: "dih-ZAS-ter",
    partOfSpeech: "noun",
    teaser: "Once a literal verdict from the stars — being “ill-starred” in the most direct sense.",
    origin:
      "From Italian disastro, built from dis- (bad) and astro (star) — reflecting the old belief that misfortune arrived by way of an unfavorable alignment of the stars.",
    journey:
      "What began as a literal astrological verdict — \u201cill-starred\u201d — broadened over time into any sudden catastrophe, with the stargazing entirely forgotten.",
    related:
      "The astro- root resurfaces in astronomy and astronaut; the dis- prefix shows up again in disgrace and discord.",
    lineage: ["Italian", "English"],
  },
  {
    slug: "clue",
    word: "clue",
    respelling: "KLOO",
    partOfSpeech: "noun",
    teaser: "A ball of thread that became, through a Greek myth, the word for finding your way.",
    origin:
      "A variant spelling of clew, meaning a ball of thread, from Old English cliewen.",
    journey:
      "The meaning shifted through the myth of Theseus, who used a thread to retrace his steps out of the Minotaur's labyrinth. From there, clue came to mean anything that helps you find your way through a problem — the thread itself dropped out of everyday use entirely.",
    related:
      "Clew survives today only as a sailing term for the corner of a sail; clue and clew are, at root, the very same word.",
    lineage: ["Old English", "English"],
  },
  {
    slug: "muscle",
    word: "muscle",
    respelling: "MUSS-uhl",
    partOfSpeech: "noun",
    teaser: "Named for a little mouse — because that's what a flexing bicep looked like to the Romans.",
    origin:
      "From Latin musculus, literally \u201clittle mouse\u201d — a flexing bicep was thought to look like a small mouse moving under the skin.",
    journey:
      "The nickname stuck so thoroughly that it became the standard anatomical term, while the image of a mouse under the skin faded out of how people actually think about the word.",
    related:
      "Musculus is a diminutive of mus (mouse) — the same root behind mouse itself, and, much later, the computer mouse.",
    lineage: ["Latin", "English"],
  },
  {
    slug: "robot",
    word: "robot",
    respelling: "ROH-bot",
    partOfSpeech: "noun",
    teaser: "Invented for a 1920s stage play, from a Slavic word for forced labor.",
    origin:
      "Coined by Czech writer Karel \u010Capek for his 1920 play R.U.R., from robota, a Czech and Slavic word for forced labor or drudgery.",
    journey:
      "The word entered English almost as soon as the play was translated and quickly outgrew the stage, moving from \u201cartificial forced laborer\u201d to any mechanical or programmable machine.",
    related:
      "Robota is related to rab, an old Slavic word for slave. English has no native cognates for it, making robot one of the few everyday English words borrowed wholesale from Czech.",
    lineage: ["Slavic", "Czech", "English"],
  },
  {
    slug: "avocado",
    word: "avocado",
    respelling: "av-uh-KAH-doh",
    partOfSpeech: "noun",
    teaser: "A Nahuatl word for testicle, reshaped by Spanish into something entirely different.",
    origin:
      "From Nahuatl \u0101huacatl, which also meant \u201ctesticle,\u201d likely describing how the fruit hangs from the tree in pairs.",
    journey:
      "Spanish reshaped the unfamiliar Nahuatl word into aguacate, and a later folk-etymological twist produced avocado — nudged along by the unrelated Spanish word abogado (lawyer). That detour is also why avocados were once called \u201calligator pears\u201d in English.",
    related:
      "Guacamole comes from the same Nahuatl root, combining \u0101huacatl with molli (sauce).",
    lineage: ["Nahuatl", "Spanish", "English"],
  },
  {
    slug: "companion",
    word: "companion",
    respelling: "kuhm-PAN-yuhn",
    partOfSpeech: "noun",
    teaser: "Literally: someone you break bread with.",
    origin:
      "From Latin com- (together) and panis (bread), by way of Old French compaignon — literally \u201cone who breaks bread with you.\u201d",
    journey:
      "The concrete image of a shared meal broadened into the general sense of anyone who accompanies you, with no bread — or food at all — required anymore.",
    related:
      "The same panis gives English pantry (where bread was kept), and, through French, company and accompany.",
    lineage: ["Latin", "Old French", "English"],
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

/** Every word that's appeared so far, once each, tagged with the date it was
 * most recently featured — most-recently-seen first. Once the calendar
 * rotation has run for more days than WORDS.length, getHistory() starts
 * repeating (the same handful of words over and over), which is a
 * meaningless way to "browse the vocabulary": it's the same ~10 rows
 * copy-pasted dozens of times. This collapses that down to one row per word,
 * which is what "browse everything" actually means with a rotation this
 * short. */
export function getUniqueWordsMostRecent(today: Date = new Date()): HistoryDay[] {
  const seen = new Set<string>();
  const unique: HistoryDay[] = [];
  for (const day of getHistory(today)) {
    if (seen.has(day.word.slug)) continue;
    seen.add(day.word.slug);
    unique.push(day);
    if (unique.length === WORDS.length) break;
  }
  return unique;
}

/** Simple deterministic string hash (djb2 variant) → 32-bit unsigned int.
 * Doesn't need to be cryptographically strong, just a stable per-user seed
 * so the same account always gets the same shuffle back. */
function hashSeed(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

/** Mulberry32 — a small, fast, deterministic PRNG for a given seed. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic per-account shuffle of WORDS (Fisher-Yates driven by a
 * seeded PRNG) — every account gets its own fixed order, and the same
 * account always gets the same order back. */
export function getPersonalOrder(userId: string): WordEntry[] {
  const rand = mulberry32(hashSeed(userId));
  const order = [...WORDS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function daysBetweenUtcMidnights(start: Date, end: Date): number {
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.floor((endUtc - startUtc) / DAY_MS);
}

/** Personalized word-of-the-day for a signed-in account: same rotation
 * length as the shared list, shuffled per account, anchored to their join
 * date instead of the global calendar anchor used by getWordForDate. */
export function getWordForUser(userId: string, joinedAt: Date, today: Date = new Date()): WordEntry {
  const order = getPersonalOrder(userId);
  const dayIndex = daysBetweenUtcMidnights(joinedAt, today);
  const idx = ((dayIndex % order.length) + order.length) % order.length;
  return order[idx];
}

/** Every day from a user's join date through today, most recent first,
 * using their personal word order instead of the shared calendar mapping. */
export function getHistoryForUser(
  userId: string,
  joinedAt: Date,
  today: Date = new Date()
): HistoryDay[] {
  const order = getPersonalOrder(userId);
  const totalDays = daysBetweenUtcMidnights(joinedAt, today);
  const joinedUtcMidnight = Date.UTC(
    joinedAt.getUTCFullYear(),
    joinedAt.getUTCMonth(),
    joinedAt.getUTCDate()
  );
  const days: HistoryDay[] = [];
  for (let i = totalDays; i >= 0; i--) {
    const d = new Date(joinedUtcMidnight + i * DAY_MS);
    const idx = ((i % order.length) + order.length) % order.length;
    days.push({ date: d.toISOString().slice(0, 10), word: order[idx] });
  }
  return days;
}
