import type { DigAnswer, DigDayPlain, DigPromptPlain, PromptKind } from "./types";

/** A small fake day so /dig works locally without the pipeline or Redis. Same shape as a
 * real day; deliberately tiny (a real prompt has hundreds of answers). */
type Seed = [kind: PromptKind, text: string, common: string[], familiar: string[], uncommon: string[], rare: string[], fossil: string, fact: string];

const SEEDS: Seed[] = [
  ["theme", "Name a fruit", ["apple", "banana", "orange", "grape"], ["plum", "apricot"], ["quince", "persimmon"], ["medlar", "loquat", "sapodilla"], "pawpaw", "Its name likely comes from Spanish papaya, borrowed from Carib."],
  ["theme", "Name a word from sailing", ["boat", "sail", "anchor", "deck"], ["keel", "mast"], ["jib", "rudder"], ["gunwale", "bowsprit", "cleat"], "halyard", "From haul + yard: the rope that hauls a sail up to its yard."],
  ["origin", "Name a word that came to English from Arabic", ["coffee", "sugar", "cotton", "magazine"], ["algebra", "sofa"], ["alcove", "mattress"], ["alembic", "carafe", "nadir"], "zenith", "From Arabic samt ar-ra's, \"the path over the head\", miscopied in Latin."],
  ["theme", "Name a bird", ["eagle", "robin", "owl", "duck"], ["heron", "wren"], ["curlew", "plover"], ["dunlin", "shrike", "linnet"], "chough", "A crow of sea cliffs; its name copies its call."],
  ["theme", "Name a cheese", ["cheddar", "brie", "feta", "mozzarella"], ["stilton", "gouda"], ["halloumi", "emmental"], ["taleggio", "caciocavallo", "mimolette"], "stinking bishop", "Named after the pear variety whose perry washes its rind."],
  ["origin", "Name a word that came to English from Hindi", ["shampoo", "jungle", "pyjamas", "bungalow"], ["bandana", "chutney"], ["dungaree", "cushy"], ["juggernaut", "dekko", "pukka"], "loot", "From Hindi lut, \"plunder\", taken into English in the 1780s."],
  ["theme", "Name a tool", ["hammer", "saw", "drill", "spanner"], ["chisel", "pliers"], ["awl", "plane"], ["froe", "adze", "spokeshave"], "gimlet", "A small boring tool; the cocktail may be named after it."],
];

export function devDay(date: string): DigDayPlain {
  const prompts: DigPromptPlain[] = SEEDS.map(([kind, text, common, familiar, uncommon, rare, fossil, fact], i) => {
    const answers: DigAnswer[] = [
      ...common.map((w): DigAnswer => [w, "common", 1]),
      ...familiar.map((w): DigAnswer => [w, "familiar", 1]),
      ...uncommon.map((w): DigAnswer => [w, "uncommon", 1]),
      ...rare.map((w, j): DigAnswer => [w, j === 0 ? "popular" : "rare", 1]),
      [fossil, "fossil", 1],
    ];
    return { id: `dev:${i}`, kind, text, answers, aliases: {}, guard: [], fossil: { word: fossil, fact }, stories: {} };
  });
  return { v: 1, date, rejSample: 1, prompts };
}
