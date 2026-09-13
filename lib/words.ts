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
  /** Three STANDALONE clues for the /play puzzle (lib/puzzle.ts) — unlike
   * origin/journey/related, each must make sense read in isolation, since
   * only one is shown at a time. Ordered most-to-least oblique: clue[0]
   * must not name the word, its direct translation, or any word sharing a
   * visible stem with it; clue[2] may name cognates and get close to
   * giving the word away outright, but (like all three) must never contain
   * the word itself or its stem — see lib/words.test.ts's "WORDS clues"
   * block for the mechanical half of that check, and this comment for the
   * editorial half a test can't fully capture. */
  clues: [string, string, string];
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
    clues: [
      "A European port city once forced incoming ships to sit offshore for a set stretch of time before anyone could disembark.",
      "Venice imposed this on ships from plague-affected ports in the 1300s — specifically, a wait of exactly forty days.",
      "The Italian phrase behind it literally means “forty days”; quarter and quart are distant cousins, both from the Latin word for four.",
    ],
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
    clues: [
      "Roman soldiers' pay was once connected, in a roundabout way, to an everyday seasoning.",
      "That seasoning was salt — this word's Latin ancestor was built directly from the Latin word for it.",
      "The same Latin word for salt also gives English salad, sauce, and sausage — and lives on in the phrase “worth one's salt.”",
    ],
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
    clues: [
      "This word for a sudden catastrophe was once a literal verdict handed down by the position of the sky.",
      "Its two Italian building blocks mean “bad” and “star” — misfortune was once blamed directly on an unlucky alignment overhead.",
      "The “star” half also shows up in astronomy and astronaut; the “bad” half resurfaces in disgrace and discord.",
    ],
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
    clues: [
      "In an ancient Greek myth, a hero unwound a ball of thread behind him so he could find his way back out of a maze.",
      "That myth is where this word for a hint that helps you solve something comes from — it was originally the literal thread itself.",
      "It's spelled almost like its own ancestor, clew — today surviving only as a sailing term for the corner of a sail.",
    ],
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
    clues: [
      "To Roman anatomists, a flexing body part looked like a small animal moving just beneath the skin.",
      "That resemblance is Latin for “little mouse” — the nickname stuck so well it became the official word for it.",
      "The same Latin root for “mouse” gives us the small rodent itself, and much later, the computer accessory named after it.",
    ],
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
    clues: [
      "This word for a mechanical worker was invented for a 1920s stage play, not borrowed from everyday speech.",
      "Its Czech root means forced labor or drudgery, coined by the writer Karel Čapek.",
      "That root is related to an old Slavic word for slave — English has no native relatives for it at all, making this one of the few everyday words borrowed wholesale from Czech.",
    ],
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
    clues: [
      "This fruit's original name in Nahuatl referred to a rather personal part of the body — a nod to how it hangs in pairs from the tree.",
      "Spanish speakers reshaped that word, and a later mix-up with the Spanish word for lawyer helped push it toward its modern form — which is also why English once called it an “alligator pear.”",
      "Guacamole comes from the very same Nahuatl root, just combined with the word for sauce.",
    ],
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
    clues: [
      "This word for someone who's with you started as a description of a very specific shared activity.",
      "Literally, in Latin, it means “one who breaks bread with you” — together plus the word for bread.",
      "That same root for bread also gives us pantry, where it was kept, and — through French — company and accompany.",
    ],
  },
];

/** Anchor date for the deterministic daily rotation (UTC midnight). */
const START_DATE = Date.UTC(2026, 0, 1); // 2026-01-01
const DAY_MS = 24 * 60 * 60 * 1000;

export function daysSinceStart(date: Date): number {
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
export function hashSeed(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

/** Mulberry32 — a small, fast, deterministic PRNG for a given seed. */
export function mulberry32(seed: number): () => number {
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
 * account always gets the same order back.
 *
 * The word for `anchorDate` (a new account's join date) is pinned to slot 0
 * rather than falling wherever the shuffle happens to put it: without this,
 * someone who saw a word on Today, then signed in, would immediately see a
 * *different* word from their newly-started personal rotation — a jarring
 * swap for no visible reason. Pinning it means their first personalized day
 * carries on from what they already saw; every day after that is the normal
 * per-account shuffle. */
export function getPersonalOrder(userId: string, anchorDate: Date): WordEntry[] {
  const anchorWord = getWordForDate(anchorDate);
  const rand = mulberry32(hashSeed(userId));
  const rest = WORDS.filter((w) => w.slug !== anchorWord.slug);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [anchorWord, ...rest];
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
  const order = getPersonalOrder(userId, joinedAt);
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
  const order = getPersonalOrder(userId, joinedAt);
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
