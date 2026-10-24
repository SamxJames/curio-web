# curio dig: content pipeline implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A weekly, fully automated job that builds, validates and stores curio dig days (seven prompts each) with
at least a 30-day buffer, plus the shared answer-matching code the game uses.

**Architecture:**
- Pure TypeScript modules in `lib/dig/` hold the contract and the matching logic. They're shared with the
  browser game.
- Node/tsx scripts in `scripts/dig/` read the free datasets, build answer sets that two sources agree on, tier
  them, pick fossils, assemble days, validate them and write them to a **sink**:
  - local files by default;
  - Upstash only inside GitHub Actions.
- A GitHub Actions workflow runs the job on Mondays and Thursdays.

**Tech stack:** TypeScript, tsx, Vitest, @upstash/redis, GitHub Actions. No new runtime dependencies.

**Specs:**
- `docs/rarity-game/pipeline-design.md` (the pipeline)
- `docs/rarity-game/architecture.md` (the contract, keys and costs)
- Prototype scripts: `docs/rarity-game/research/`

**Companion plan:** `docs/superpowers/plans/2026-10-24-dig-game.md` (the site and game). Its tasks consume
`lib/dig/*` from Tasks 1–3 and 12 here, so this plan's Tasks 1–3 must land first.

## Global constraints

- Node/TypeScript only. No Python, no new paid services.
- **Never write to production Redis from a local machine.** `RedisSink.create()` throws unless
  `process.env.GITHUB_ACTIONS === "true"`. Local runs use `FileSink` in `.dig-out/` (gitignored).
- **Public repo, public Actions logs:** scripts print counts only. Never print an answer, a fossil, a prompt for a
  future date, or a Redis value. No workflow uploads artifacts.
- Redis keys use the `curio:dig:` prefix only (`lib/dig/keys.ts`).
- Client-importable modules (`lib/dig/types.ts`, `score.ts`, `normalize.ts`, `match.ts`, `payload.ts`) must not
  import `lib/words.ts` or any Node built-in.
- Tiers and points: Common 10, Popular pick 15, Familiar 30, Uncommon 60, Rare 85, Fossil 100. Zipf cut-offs: Common
  ≥ 4.0, Familiar ≥ 3.0, Uncommon ≥ 2.3, Rare < 2.3 or missing.
- Publishing floor: core ≥ 40, easy (Zipf ≥ 3.5) ≥ 8, rare (Zipf < 2.3) ≥ 10, plus a fossil. Letter variants use
  25 / 3 / 5. Origins also need at most 300 Common answers.
- Day mix: 5 themes and 2 origins. Origins sit at positions 3 and 6 (indexes 2 and 5). Position 1 is the theme with
  the most easy answers; position 7 is the theme with the most rare answers.
- Cooldowns:
  - base theme 30 days;
  - exact prompt 90 days;
  - origin language 14 days;
  - a returning prompt always gets a different fossil.
- Overlap between any two prompts on a day: under 20% of the smaller core.
- Buffer target 45 days, floor 30 (the job fails below it).
- Fact lines are 1–140 characters. Accepted answers are capped at 1,200 per prompt. A day file is at most 400,000
  characters when stringified.
- Data credit lines required (on the attribution page, game plan Task 13):
  - wordfreq must be credited exactly as "Robyn Speer", with Google Books Ngram Viewer acknowledged;
  - Open English WordNet (CC BY 4.0);
  - LDNOOBW (CC BY 4.0);
  - Wikidata (CC0).
- Commands: `npx vitest run <path>`, `npm run lint`, `npx tsc --noEmit`.

## Changes to the specs made by this plan (record them in the docs in Task 15)

1. **Near misses allow one edit (Damerau) for answers of 4 letters or more**, rather than "two for 8+".
   - Precomputing two-edit real-word neighbours for about 500k keys is too slow for a weekly job.
   - One edit plus mandatory confirmation is safer anyway.
2. **The freak-match guard ships as a per-prompt `guard` list.** It holds the real English words that are one edit
   from an answer key. The browser therefore needs no dictionary.
3. **Every written day is frozen,** not only from 7 days out. The job only appends new days; adjudication only adds
   accepted-only answers.
4. **No `curio:dig:pool` key.** Spares are the remaining eligible pool, computed each run. The job fails if fewer
   than 20 themes or 6 origins remain eligible after building.
5. **Rejected-guess and claim keys use the prompt's index (0–6),** not its id: `curio:dig:rej:<date>:<index>`.
   Adjudication maps index → id from the stored day.
6. **The day-size cap is 400,000 characters,** replacing pipeline-design §10's 80 KB.
7. **The schedule is Mondays and Thursdays at 04:00 UTC.** The Actions cache evicts anything unused for 7 days, so a
   twice-weekly run keeps the 240 MB compact file warm.
8. **The obfuscation is a per-prompt letter rotation of the JSON.** It stays gzip-friendly, unlike XOR+base64.
   architecture.md §5 is updated to say so.

## File structure

| File | Responsibility |
|---|---|
| `lib/dig/types.ts` | Day/prompt/answer types: the pipeline ↔ site contract |
| `lib/dig/score.ts` | Tiers, points, Zipf → tier, depth, share emoji |
| `lib/dig/normalize.ts` | `normalizeKey`, `guessForms` |
| `lib/dig/match.ts` | `buildLookup`, `editDistance`, `checkGuess`, `oneEditVariants` |
| `lib/dig/payload.ts` | Encode/decode a prompt's secret; encode/decode a day |
| `lib/dig/keys.ts` | Redis key builders and the manifest type |
| `scripts/dig/sources/wordfreq.ts` | wordfreq cBpack decoder |
| `scripts/dig/sources/oewn.ts` | Open English WordNet loader and graph helpers |
| `scripts/dig/sources/compact.ts` | Wiktextract dump → compact JSONL, plus a reader |
| `scripts/dig/sources/wikidata.ts` | Cached SPARQL label sets |
| `scripts/dig/wiktionary.ts` | Index of compact entries: word info, categories, origin sets |
| `scripts/dig/lexicon.ts` | The real-word key set |
| `scripts/dig/catalogue.ts` + `content/dig/catalogue.json` | Overrides, blocklist, Wikidata themes, origin groups |
| `scripts/dig/themes.ts` | Theme candidates (WordNet anchoring with roll-up, Wikidata, letter variants) |
| `scripts/dig/origins.ts` | Origin candidates (single languages and groups) |
| `scripts/dig/answers.ts` | Floor counts, aliases, guard, fossil candidates |
| `scripts/dig/pageviews.ts` | Cached yearly Wiktionary views |
| `scripts/dig/fossil.ts` | Popular picks, fossil choice, fact line, secret assembly |
| `scripts/dig/assemble.ts` | Cooldowns, family and overlap checks, the seeded day pick, ordering |
| `scripts/dig/validate.ts` | Day validation |
| `scripts/dig/sink.ts` | `FileSink` and `RedisSink` |
| `scripts/dig/adjudicate.ts` | Rejected/claimed guess adjudication |
| `scripts/dig/fetchData.ts` | Download/refresh the datasets and compact the dump |
| `scripts/dig/build.ts` | The orchestrator CLI |
| `.github/workflows/dig-pipeline.yml` | The scheduled job |
| `scripts/dig/fixtures/*` | Tiny test fixtures |

---

### Task 1: Contract types and scoring

**Files:**
- Create: `lib/dig/types.ts`, `lib/dig/score.ts`
- Test: `lib/dig/score.test.ts`

**Interfaces:**
- Produces:
  - `Tier`, `TIERS`, `PromptKind`, `DigAnswer`, `DigFossil`, `PromptSecret`, `DigPromptPlain`, `DigPrompt`, `DigDay`,
    `DigDayPlain`;
  - `TIER_POINTS`, `TIER_LABEL`, `STRATUM`, `SHARE_EMOJI`, `MAX_SCORE`;
  - `tierFromZipf(z: number | undefined): Tier`, `scoreOf(tiers: (Tier | null)[]): number`,
    `formatDepth(score: number): string`, `shareRow(tiers: (Tier | null)[]): string`,
    `isValidScore(n: unknown): n is number`.

- [ ] **Step 1: Write the failing test** in `lib/dig/score.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MAX_SCORE, TIER_POINTS, formatDepth, isValidScore, scoreOf, shareRow, tierFromZipf } from "./score";

describe("tierFromZipf", () => {
  it("uses absolute cut-offs", () => {
    expect(tierFromZipf(4.01)).toBe("common");
    expect(tierFromZipf(4)).toBe("common");
    expect(tierFromZipf(3.19)).toBe("familiar");
    expect(tierFromZipf(2.83)).toBe("uncommon");
    expect(tierFromZipf(2.3)).toBe("uncommon");
    expect(tierFromZipf(1.99)).toBe("rare");
    expect(tierFromZipf(undefined)).toBe("rare");
  });
});

describe("scoring", () => {
  it("sums points and treats blanks as zero", () => {
    expect(scoreOf(["common", "fossil", null, "rare"])).toBe(10 + 100 + 0 + 85);
  });
  it("formats depth in metres to one decimal place", () => {
    expect(formatDepth(460)).toBe("4.6 m");
    expect(formatDepth(0)).toBe("0.0 m");
    expect(formatDepth(MAX_SCORE)).toBe("7.0 m");
  });
  it("builds the spoiler-free emoji row", () => {
    expect(shareRow(["common", "popular", "familiar", "uncommon", "rare", "fossil", null])).toBe("🌱🌱🟫🟧🪨🦴▫️");
  });
  it("accepts only real scores", () => {
    expect(isValidScore(395)).toBe(true);
    expect(isValidScore(0)).toBe(true);
    expect(isValidScore(700)).toBe(true);
    expect(isValidScore(701)).toBe(false);
    expect(isValidScore(12)).toBe(false);
    expect(isValidScore("100")).toBe(false);
    expect(isValidScore(-5)).toBe(false);
  });
  it("keeps the agreed points", () => {
    expect(TIER_POINTS).toEqual({ common: 10, popular: 15, familiar: 30, uncommon: 60, rare: 85, fossil: 100 });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run lib/dig/score.test.ts`. Expected: FAIL, because
  `./score` can't be resolved.

- [ ] **Step 3: Write `lib/dig/types.ts`:**

```ts
/** The contract between the dig pipeline (scripts/dig) and the site. Pure types:
 * safe to import from client components. See docs/rarity-game/architecture.md §4. */

export const TIERS = ["common", "popular", "familiar", "uncommon", "rare", "fossil"] as const;
export type Tier = (typeof TIERS)[number];
export type PromptKind = "theme" | "origin";

/** Display spelling, tier, and 1 if the answer is core (shown in reveals) or 0 if
 * accepted-only (it scores but is never shown). */
export type DigAnswer = [display: string, tier: Tier, core: 0 | 1];

export type DigFossil = { word: string; fact: string; story?: string };

/** The obfuscated part of a prompt (lib/dig/payload.ts). */
export type PromptSecret = {
  answers: DigAnswer[];
  /** Extra lookup keys, already normalised (irregular plurals, UK/US spellings,
   * alternative forms) → index into `answers`. */
  aliases: Record<string, number>;
  /** Real English words one edit from an answer key. A guess equal to one of these
   * is never offered as a near miss ("heel" never becomes "keel"). */
  guard: string[];
  fossil: DigFossil;
  /** Display spelling → Curio story slug, for every answer that has a story. */
  stories: Record<string, string>;
};

export type DigPromptPlain = { id: string; kind: PromptKind; text: string } & PromptSecret;
export type DigPrompt = { id: string; kind: PromptKind; text: string; payload: string };

export type DigDay = {
  v: 1;
  date: string;
  /** 0–1: the share of browsers that report rejected guesses. */
  rejSample: number;
  prompts: DigPrompt[];
};

export type DigDayPlain = Omit<DigDay, "prompts"> & { prompts: DigPromptPlain[] };
```

- [ ] **Step 4: Write `lib/dig/score.ts`:**

```ts
import type { Tier } from "./types";

export const TIER_POINTS: Record<Tier, number> = {
  common: 10,
  popular: 15,
  familiar: 30,
  uncommon: 60,
  rare: 85,
  fossil: 100,
};

export const TIER_LABEL: Record<Tier, string> = {
  common: "Common",
  popular: "Popular pick",
  familiar: "Familiar",
  uncommon: "Uncommon",
  rare: "Rare",
  fossil: "Fossil",
};

/** Which of the five strata an answer drops into (geology names, never language eras). */
export const STRATUM: Record<Tier, "topsoil" | "loam" | "clay" | "stone" | "bedrock"> = {
  common: "topsoil",
  popular: "topsoil",
  familiar: "loam",
  uncommon: "clay",
  rare: "stone",
  fossil: "bedrock",
};

export const SHARE_EMOJI: Record<Tier, string> = {
  common: "🌱",
  popular: "🌱",
  familiar: "🟫",
  uncommon: "🟧",
  rare: "🪨",
  fossil: "🦴",
};
const NO_ANSWER = "▫️";

export const PROMPTS_PER_DAY = 7;
export const MAX_SCORE = PROMPTS_PER_DAY * TIER_POINTS.fossil;

/** Absolute Zipf cut-offs, so a score means the same thing every day. A word missing
 * from wordfreq is rare. */
export function tierFromZipf(z: number | undefined): Tier {
  if (z === undefined) return "rare";
  if (z >= 4) return "common";
  if (z >= 3) return "familiar";
  if (z >= 2.3) return "uncommon";
  return "rare";
}

export function scoreOf(tiers: (Tier | null)[]): number {
  return tiers.reduce((sum, t) => sum + (t ? TIER_POINTS[t] : 0), 0);
}

/** Depth in metres is score ÷ 100: a perfect dig is 7.0 m. */
export function formatDepth(score: number): string {
  return `${(score / 100).toFixed(1)} m`;
}

export function shareRow(tiers: (Tier | null)[]): string {
  return tiers.map((t) => (t ? SHARE_EMOJI[t] : NO_ANSWER)).join("");
}

/** Every reachable score is a multiple of 5 between 0 and MAX_SCORE. */
export function isValidScore(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_SCORE && n % 5 === 0;
}
```

- [ ] **Step 5: Run the test.** Run `npx vitest run lib/dig/score.test.ts`. Expected: PASS.
- [ ] **Step 6: Commit.**

```bash
git add lib/dig/types.ts lib/dig/score.ts lib/dig/score.test.ts
git commit -m "feat(dig): contract types and scoring"
```

---

### Task 2: Normalising and matching guesses

**Files:**
- Create: `lib/dig/normalize.ts`, `lib/dig/match.ts`
- Test: `lib/dig/match.test.ts`

**Interfaces:**
- Consumes: `PromptSecret` (Task 1).
- Produces:
  - `normalizeKey(raw: string): string`, `guessForms(key: string): string[]`;
  - `type Lookup = { keys: Map<string, number>; guard: Set<string> }`;
  - `buildLookup(secret: Pick<PromptSecret, "answers" | "aliases" | "guard">): Lookup`;
  - `maxEdits(len: number): number`, `editDistance(a: string, b: string, limit: number): number`;
  - `type GuessResult = { kind: "match" | "near"; index: number } | { kind: "miss" } | { kind: "empty" }`;
  - `checkGuess(lookup: Lookup, raw: string): GuessResult`, `oneEditVariants(key: string): Set<string>`.

- [ ] **Step 1: Write the failing test** in `lib/dig/match.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { guessForms, normalizeKey } from "./normalize";
import { buildLookup, checkGuess, editDistance, oneEditVariants } from "./match";
import type { PromptSecret } from "./types";

const secret: Pick<PromptSecret, "answers" | "aliases" | "guard"> = {
  answers: [
    ["keel", "familiar", 1],
    ["halyard", "rare", 1],
    ["flotilla", "uncommon", 1],
    ["harbour", "common", 1],
    ["crème brûlée", "uncommon", 0],
    ["hurdy-gurdy", "rare", 1],
    ["cart", "common", 1],
    ["card", "common", 1],
  ],
  aliases: { harbor: 3 },
  guard: ["heel", "peel", "reel", "feel", "kneel", "keen"],
};
const lookup = buildLookup(secret);

describe("normalizeKey", () => {
  it("folds case, accents, ligatures, articles and separators", () => {
    expect(normalizeKey("  Crème Brûlée ")).toBe("cremebrulee");
    expect(normalizeKey("the Hurdy-Gurdy")).toBe("hurdygurdy");
    expect(normalizeKey("Æther")).toBe("aether");
    expect(normalizeKey("an o'clock")).toBe("oclock");
    expect(normalizeKey("123")).toBe("");
  });
  it("offers plural-stripped forms after the key itself", () => {
    expect(guessForms("berries")).toEqual(["berries", "berry", "berri", "berrie"]);
    expect(guessForms("keels")).toEqual(["keels", "keel"]);
    expect(guessForms("glass")).toEqual(["glass"]);
  });
});

describe("editDistance", () => {
  it("counts insert, delete, substitute and adjacent swap as one edit", () => {
    expect(editDistance("halyard", "halyrd", 1)).toBe(1);
    expect(editDistance("halyard", "hlayard", 1)).toBe(1);
    expect(editDistance("keel", "keep", 1)).toBe(1);
    expect(editDistance("keel", "kneel", 1)).toBe(1);
    expect(editDistance("keel", "kale", 1)).toBe(2);
  });
});

describe("checkGuess", () => {
  it("matches exact answers, plurals, aliases and separator variants", () => {
    expect(checkGuess(lookup, "Keel")).toEqual({ kind: "match", index: 0 });
    expect(checkGuess(lookup, "keels")).toEqual({ kind: "match", index: 0 });
    expect(checkGuess(lookup, "HARBOR")).toEqual({ kind: "match", index: 3 });
    expect(checkGuess(lookup, "the halyard")).toEqual({ kind: "match", index: 1 });
    expect(checkGuess(lookup, "creme brulee")).toEqual({ kind: "match", index: 4 });
    expect(checkGuess(lookup, "hurdy gurdy")).toEqual({ kind: "match", index: 5 });
  });
  it("offers a near miss only when it is unique and the guess is not a guarded real word", () => {
    expect(checkGuess(lookup, "halyrd")).toEqual({ kind: "near", index: 1 });
    expect(checkGuess(lookup, "flotila")).toEqual({ kind: "near", index: 2 });
    expect(checkGuess(lookup, "heel")).toEqual({ kind: "miss" });
    expect(checkGuess(lookup, "carx")).toEqual({ kind: "miss" });
    expect(checkGuess(lookup, "kel")).toEqual({ kind: "miss" });
  });
  it("reports empty input and plain misses", () => {
    expect(checkGuess(lookup, "  ")).toEqual({ kind: "empty" });
    expect(checkGuess(lookup, "zebra")).toEqual({ kind: "miss" });
  });
});

describe("oneEditVariants", () => {
  it("produces only strings exactly one edit away", () => {
    const vs = oneEditVariants("keel");
    expect(vs.has("heel")).toBe(true);
    expect(vs.has("kneel")).toBe(true);
    expect(vs.has("kele")).toBe(true);
    expect(vs.has("keel")).toBe(false);
    for (const v of vs) expect(editDistance("keel", v, 1)).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run lib/dig/match.test.ts`. Expected: FAIL (module not
  found).

- [ ] **Step 3: Write `lib/dig/normalize.ts`:**

```ts
/** How guesses and answers are compared. Shared by the browser game and the pipeline's
 * validator, so the validator tests exactly what players run. Pure: no Node APIs. */

const LIGATURES: Record<string, string> = { æ: "ae", œ: "oe", ß: "ss", ø: "o", ð: "d", þ: "th", ł: "l" };

/** Lowercase, fold ligatures and accents, drop a leading article, keep letters only.
 * "the Hurdy-Gurdy" → "hurdygurdy", "Crème brûlée" → "cremebrulee". */
export function normalizeKey(raw: string): string {
  let s = raw.toLowerCase().trim();
  s = s.replace(/[æœßøðþł]/g, (c) => LIGATURES[c]);
  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/^(a|an|the)\s+/, "");
  return s.replace(/[^a-z]/g, "");
}

/** The key itself, then plural-stripped forms (-ies → -y, then drop -es, then drop -s),
 * without duplicates. "berries" → berries, berry, berri, berrie: look-ups stop at the
 * first form that hits, so the extra forms are harmless. Irregular plurals come from the
 * pipeline as aliases instead. */
export function guessForms(key: string): string[] {
  const forms = [key];
  if (key.length > 4 && key.endsWith("ies")) forms.push(key.slice(0, -3) + "y");
  if (key.length > 3 && key.endsWith("es")) forms.push(key.slice(0, -2));
  if (key.length > 3 && key.endsWith("s") && !key.endsWith("ss")) forms.push(key.slice(0, -1));
  return [...new Set(forms)];
}
```

- [ ] **Step 4: Write `lib/dig/match.ts`:**

```ts
import { guessForms, normalizeKey } from "./normalize";
import type { PromptSecret } from "./types";

export type Lookup = { keys: Map<string, number>; guard: Set<string> };

export type GuessResult =
  | { kind: "match"; index: number }
  | { kind: "near"; index: number }
  | { kind: "miss" }
  | { kind: "empty" };

/** Every answer's own key, then its aliases. The first answer to claim a key keeps it
 * (the pipeline's validator rejects days where that would hide a different tier). */
export function buildLookup(secret: Pick<PromptSecret, "answers" | "aliases" | "guard">): Lookup {
  const keys = new Map<string, number>();
  secret.answers.forEach(([display], i) => {
    const k = normalizeKey(display);
    if (k && !keys.has(k)) keys.set(k, i);
  });
  for (const [k, i] of Object.entries(secret.aliases)) if (!keys.has(k)) keys.set(k, i);
  return { keys, guard: new Set(secret.guard) };
}

/** One edit for keys of 4+ letters; none for shorter ones (spec change 1 in the pipeline plan). */
export function maxEdits(len: number): number {
  return len >= 4 ? 1 : 0;
}

/** Optimal-string-alignment distance (insert, delete, substitute, adjacent swap), capped:
 * returns limit + 1 as soon as the result must exceed `limit`. */
export function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const n = b.length;
  let prev2: number[] = [];
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > limit) return limit + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[n] > limit ? limit + 1 : prev[n];
}

/** Exact (or plural/alias) match first. Otherwise a near miss, but only if exactly one
 * answer is one edit away and the guess isn't itself a guarded real word. Every near miss
 * is confirmed by the player, never scored silently. */
export function checkGuess(lookup: Lookup, raw: string): GuessResult {
  const key = normalizeKey(raw);
  if (!key) return { kind: "empty" };
  const forms = guessForms(key);
  for (const f of forms) {
    const i = lookup.keys.get(f);
    if (i !== undefined) return { kind: "match", index: i };
  }
  if (key.length < 4 || forms.some((f) => lookup.guard.has(f))) return { kind: "miss" };
  const hits = new Set<number>();
  for (const [k, i] of lookup.keys) {
    const limit = maxEdits(k.length);
    if (limit === 0 || Math.abs(k.length - key.length) > limit) continue;
    if (editDistance(key, k, limit) <= limit) {
      hits.add(i);
      if (hits.size > 1) return { kind: "miss" };
    }
  }
  return hits.size === 1 ? { kind: "near", index: [...hits][0] } : { kind: "miss" };
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** Every a–z string exactly one OSA edit from `key`. The pipeline intersects this with
 * the real-word lexicon to build each prompt's guard list. */
export function oneEditVariants(key: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i <= key.length; i++) {
    for (const c of LETTERS) out.add(key.slice(0, i) + c + key.slice(i));
    if (i < key.length) {
      out.add(key.slice(0, i) + key.slice(i + 1));
      for (const c of LETTERS) if (c !== key[i]) out.add(key.slice(0, i) + c + key.slice(i + 1));
      if (i + 1 < key.length && key[i] !== key[i + 1]) {
        out.add(key.slice(0, i) + key[i + 1] + key[i] + key.slice(i + 2));
      }
    }
  }
  out.delete(key);
  return out;
}
```

- [ ] **Step 5: Run the test.** Run `npx vitest run lib/dig/match.test.ts`. Expected: PASS. If the `guessForms`
  expectation fails, the test is the spec: make the push order match it.
- [ ] **Step 6: Commit.**

```bash
git add lib/dig/normalize.ts lib/dig/match.ts lib/dig/match.test.ts
git commit -m "feat(dig): guess normalising, matching and near-miss guard"
```

---

### Task 3: Payload obfuscation

**Files:**
- Create: `lib/dig/payload.ts`
- Test: `lib/dig/payload.test.ts`

**Interfaces:**
- Consumes: the Task 1 types.
- Produces:
  - `encodeSecret(secret: PromptSecret, date: string, id: string): string`;
  - `decodeSecret(payload: string, date: string, id: string): PromptSecret`;
  - `encodeDay(day: DigDayPlain): DigDay`, `decodeDay(day: DigDay): DigDayPlain`.

- [ ] **Step 1: Write the failing test** in `lib/dig/payload.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decodeDay, decodeSecret, encodeDay, encodeSecret } from "./payload";
import type { DigDayPlain, PromptSecret } from "./types";

const secret: PromptSecret = {
  answers: [["halyard", "rare", 1], ["Crème brûlée", "uncommon", 0]],
  aliases: { halyards: 0 },
  guard: ["mallard"],
  fossil: { word: "halyard", fact: 'From "haul" + "yard": the rope that hauls a sail up.' },
  stories: { halyard: "halyard" },
};

describe("payload", () => {
  it("round-trips a secret", () => {
    const p = encodeSecret(secret, "2026-12-01", "theme:sailing");
    expect(decodeSecret(p, "2026-12-01", "theme:sailing")).toEqual(secret);
  });
  it("hides answers from a casual look", () => {
    const p = encodeSecret(secret, "2026-12-01", "theme:sailing");
    expect(p).not.toContain("halyard");
    expect(p).not.toContain("answers");
  });
  it("varies by date and prompt", () => {
    expect(encodeSecret(secret, "2026-12-01", "theme:sailing")).not.toBe(encodeSecret(secret, "2026-12-02", "theme:sailing"));
  });
  it("round-trips a whole day", () => {
    const day: DigDayPlain = {
      v: 1,
      date: "2026-12-01",
      rejSample: 1,
      prompts: [{ id: "theme:sailing", kind: "theme", text: "Name a word from sailing", ...secret }],
    };
    const encoded = encodeDay(day);
    expect(encoded.prompts[0]).toEqual({ id: "theme:sailing", kind: "theme", text: "Name a word from sailing", payload: expect.any(String) });
    expect(decodeDay(JSON.parse(JSON.stringify(encoded)))).toEqual(day);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run lib/dig/payload.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write `lib/dig/payload.ts`:**

```ts
import type { DigDay, DigDayPlain, DigPrompt, DigPromptPlain, PromptSecret } from "./types";

/* A spoiler guard, not security (architecture.md §5): anyone who finishes a day sees its
 * answers, and future days never leave Redis. A letter rotation keeps the JSON
 * compressible, which XOR + base64 would not. */

function shiftFor(date: string, id: string): number {
  let h = 5381;
  const s = `${date}|${id}`;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return (h % 25) + 1;
}

function rotate(s: string, by: number): string {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + by) % 26) + base);
  });
}

export function encodeSecret(secret: PromptSecret, date: string, id: string): string {
  return rotate(JSON.stringify(secret), shiftFor(date, id));
}

export function decodeSecret(payload: string, date: string, id: string): PromptSecret {
  return JSON.parse(rotate(payload, 26 - shiftFor(date, id))) as PromptSecret;
}

export function encodeDay(day: DigDayPlain): DigDay {
  return {
    v: day.v,
    date: day.date,
    rejSample: day.rejSample,
    prompts: day.prompts.map((p): DigPrompt => {
      const { id, kind, text, ...secret } = p;
      return { id, kind, text, payload: encodeSecret(secret, day.date, id) };
    }),
  };
}

export function decodeDay(day: DigDay): DigDayPlain {
  return {
    v: day.v,
    date: day.date,
    rejSample: day.rejSample,
    prompts: day.prompts.map(
      (p): DigPromptPlain => ({ id: p.id, kind: p.kind, text: p.text, ...decodeSecret(p.payload, day.date, p.id) })
    ),
  };
}
```

- [ ] **Step 4: Run the test.** Run `npx vitest run lib/dig/payload.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add lib/dig/payload.ts lib/dig/payload.test.ts
git commit -m "feat(dig): spoiler-guard payload encoding"
```

---

### Task 4: Data loaders (wordfreq, WordNet, Wiktextract compaction, lexicon)

**Files:**
- Create: `scripts/dig/sources/wordfreq.ts`, `scripts/dig/sources/oewn.ts`, `scripts/dig/sources/compact.ts`,
  `scripts/dig/lexicon.ts`, `scripts/dig/fixtures/oewn-mini.xml`
- Test: `scripts/dig/sources/sources.test.ts`

**Interfaces:**
- Consumes: `normalizeKey` (Task 2).
- Produces:
  - `parseWordfreq(msgpack: Buffer): Map<string, number>`, `loadWordfreq(path: string): Map<string, number>`;
  - `type Wordnet = { synsets: Map<string, Synset>; synsetsOf: Map<string, string[]>; spellingVariants: Map<string, Set<string>>; byDomain?: Map<string, string[]> }`;
  - `type Synset = { members: string[]; pos: string; def: string; hyper: string[]; hypo: string[]; domain: string[] }`;
  - `parseOewn(xml: string): Wordnet`, `loadOewn(path: string): Wordnet`;
  - `hyponymSynsets(wn, rootIds: string[], maxDepth?: number): Set<string>`;
  - `hyponymLemmas(wn, rootIds: string[], maxDepth?: number): Set<string>`;
  - `domainSynsets(wn, domainRootIds: string[]): Set<string>`, `domainLemmas(wn, domainRootIds: string[]): Set<string>`;
  - `ancestors(wn, id: string, maxDepth?: number): Set<string>`;
  - `type CompactEntry = { w: string; pos: string; t: string[]; c: string[]; g: string[]; e: string[]; f: string[]; n: number; et: string }`;
  - `compactEntry(raw: unknown): CompactEntry | null`;
  - `compactDump(input: string, output: string): Promise<{ lines: number; kept: number }>`;
  - `readCompact(path: string): AsyncIterable<CompactEntry>`;
  - `buildLexicon(zipf: Map<string, number>, words: Iterable<string>): Set<string>`.

- [ ] **Step 1: Write the fixture** `scripts/dig/fixtures/oewn-mini.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<LexicalResource>
<Lexicon id="oewn" label="mini" language="en" email="x" license="CC BY 4.0" version="2025">
<LexicalEntry id="oewn-fruit-n"><Lemma writtenForm="fruit" partOfSpeech="n"/><Sense id="oewn-fruit__1" synset="oewn-fruit-n-1"/></LexicalEntry>
<LexicalEntry id="oewn-apple-n"><Lemma writtenForm="apple" partOfSpeech="n"/><Sense id="oewn-apple__1" synset="oewn-apple-n-1"/></LexicalEntry>
<LexicalEntry id="oewn-citrus_fruit-n"><Lemma writtenForm="citrus fruit" partOfSpeech="n"/><Sense id="oewn-citrus_fruit__1" synset="oewn-citrus-n-1"/></LexicalEntry>
<LexicalEntry id="oewn-lemon-n"><Lemma writtenForm="lemon" partOfSpeech="n"/><Sense id="oewn-lemon__1" synset="oewn-lemon-n-1"/></LexicalEntry>
<LexicalEntry id="oewn-colour-n"><Lemma writtenForm="colour" partOfSpeech="n"/><Sense id="oewn-colour__1" synset="oewn-colour-n-1"/></LexicalEntry>
<LexicalEntry id="oewn-color-n"><Lemma writtenForm="color" partOfSpeech="n"/><Sense id="oewn-color__1" synset="oewn-colour-n-1"/></LexicalEntry>
<LexicalEntry id="oewn-seafaring-n"><Lemma writtenForm="seafaring" partOfSpeech="n"/><Sense id="oewn-seafaring__1" synset="oewn-seafaring-n-1"/></LexicalEntry>
<LexicalEntry id="oewn-keel-n"><Lemma writtenForm="keel" partOfSpeech="n"/><Sense id="oewn-keel__1" synset="oewn-keel-n-1"/></LexicalEntry>
<Synset id="oewn-fruit-n-1" ili="i1" members="oewn-fruit-n" partOfSpeech="n" lexfile="noun.plant"><Definition>the ripened reproductive body of a seed plant</Definition><SynsetRelation relType="hyponym" target="oewn-apple-n-1"/><SynsetRelation relType="hyponym" target="oewn-citrus-n-1"/></Synset>
<Synset id="oewn-apple-n-1" ili="i2" members="oewn-apple-n" partOfSpeech="n" lexfile="noun.food"><Definition>fruit with red or yellow or green skin</Definition><SynsetRelation relType="hypernym" target="oewn-fruit-n-1"/></Synset>
<Synset id="oewn-citrus-n-1" ili="i3" members="oewn-citrus_fruit-n" partOfSpeech="n" lexfile="noun.food"><Definition>any of numerous fruits of the genus Citrus</Definition><SynsetRelation relType="hypernym" target="oewn-fruit-n-1"/><SynsetRelation relType="hyponym" target="oewn-lemon-n-1"/></Synset>
<Synset id="oewn-lemon-n-1" ili="i4" members="oewn-lemon-n" partOfSpeech="n" lexfile="noun.food"><Definition>yellow oval fruit with juicy acidic flesh</Definition><SynsetRelation relType="hypernym" target="oewn-citrus-n-1"/></Synset>
<Synset id="oewn-colour-n-1" ili="i5" members="oewn-colour-n oewn-color-n" partOfSpeech="n" lexfile="noun.attribute"><Definition>a visual attribute of things</Definition></Synset>
<Synset id="oewn-seafaring-n-1" ili="i6" members="oewn-seafaring-n" partOfSpeech="n" lexfile="noun.act"><Definition>the work of a sailor</Definition></Synset>
<Synset id="oewn-keel-n-1" ili="i7" members="oewn-keel-n" partOfSpeech="n" lexfile="noun.artifact"><Definition>one of the main longitudinal beams of the hull</Definition><SynsetRelation relType="domain_topic" target="oewn-seafaring-n-1"/></Synset>
</Lexicon>
</LexicalResource>
```

- [ ] **Step 2: Write the failing test** in `scripts/dig/sources/sources.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseWordfreq } from "./wordfreq";
import { ancestors, domainLemmas, hyponymLemmas, parseOewn } from "./oewn";
import { compactEntry } from "./compact";
import { buildLexicon } from "../lexicon";

// Minimal msgpack writer for the fixture: fixarray, fixmap, fixstr only.
const str = (s: string) => [0xa0 | Buffer.byteLength(s), ...Buffer.from(s)];
const arr = (items: number[][]) => [0x90 | items.length, ...items.flat()];

describe("parseWordfreq", () => {
  it("turns centibel buckets into Zipf values", () => {
    const header = [0x81, ...str("format"), ...str("cB")];
    const buf = Buffer.from(arr([header, arr([str("the")]), arr([]), arr([str("sail"), str("mast")])]));
    const z = parseWordfreq(buf);
    expect(z.get("the")).toBeCloseTo(9);
    expect(z.get("sail")).toBeCloseTo(8.98);
    expect(z.has("keel")).toBe(false);
  });
});

describe("parseOewn", () => {
  const wn = parseOewn(readFileSync(path.join(__dirname, "../fixtures/oewn-mini.xml"), "utf8"));
  it("walks kind-of trees", () => {
    expect([...hyponymLemmas(wn, ["oewn-fruit-n-1"])].sort()).toEqual(["apple", "citrus fruit", "fruit", "lemon"]);
  });
  it("collects topic domains", () => {
    expect(domainLemmas(wn, ["oewn-seafaring-n-1"]).has("keel")).toBe(true);
  });
  it("finds UK/US spelling pairs sharing a synset", () => {
    expect(wn.spellingVariants.get("colour")?.has("color")).toBe(true);
  });
  it("lists ancestors", () => {
    expect([...ancestors(wn, "oewn-lemon-n-1")]).toEqual(["oewn-citrus-n-1", "oewn-fruit-n-1"]);
  });
  it("keeps sense order per lemma", () => {
    expect(wn.synsetsOf.get("keel")).toEqual(["oewn-keel-n-1"]);
  });
});

describe("compactEntry", () => {
  it("keeps only the fields the pipeline needs", () => {
    const raw = {
      word: "halyard", lang_code: "en", pos: "noun",
      categories: ["en:Nautical", "English terms derived from Middle English", { name: "Pages with entries" }],
      senses: [{ topics: ["nautical"], tags: ["countable"], categories: [{ name: "en:Ropes" }] }],
      etymology_templates: [{ name: "inh", args: { "1": "en", "2": "enm" } }],
      forms: [{ form: "halyards", tags: ["plural"] }],
      etymology_text: "From Middle English halier, from halen (“to haul”).",
    };
    expect(compactEntry(raw)).toEqual({
      w: "halyard", pos: "noun", t: ["nautical"],
      c: ["en:Nautical", "English terms derived from Middle English", "en:Ropes"],
      g: [], e: ["inh:enm"], f: ["halyards"], n: 1,
      et: "From Middle English halier, from halen (“to haul”).",
    });
  });
  it("drops non-English entries", () => {
    expect(compactEntry({ word: "haar", lang_code: "nl", pos: "noun" })).toBeNull();
  });
});

describe("buildLexicon", () => {
  it("normalises real words from both sources", () => {
    const lex = buildLexicon(new Map([["Heel", 3]]), ["crème brûlée", "keel"]);
    expect([...lex].sort()).toEqual(["cremebrulee", "heel", "keel"]);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails.** Run `npx vitest run scripts/dig/sources/sources.test.ts`. Expected:
  FAIL.

- [ ] **Step 4: Write `scripts/dig/sources/wordfreq.ts`.** It ports `docs/rarity-game/research/wordfreq.mjs`:

```ts
// wordfreq's English "large" list (data CC BY-SA 4.0, credit exactly "Robyn Speer").
// Format: msgpack [header, bucket0, bucket1, ...]; bucket i holds words at -i centibels,
// so zipf = 9 - i/100. A 40-line decoder instead of a dependency.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

function decode(buf: Buffer): unknown {
  let p = 0;
  const u8 = () => buf[p++];
  const u16 = () => { const v = buf.readUInt16BE(p); p += 2; return v; };
  const u32 = () => { const v = buf.readUInt32BE(p); p += 4; return v; };
  const str = (n: number) => { const s = buf.toString("utf8", p, p + n); p += n; return s; };
  const arr = (n: number) => { const a: unknown[] = new Array(n); for (let i = 0; i < n; i++) a[i] = read(); return a; };
  const map = (n: number) => { const o: Record<string, unknown> = {}; for (let i = 0; i < n; i++) { const k = read() as string; o[k] = read(); } return o; };
  function read(): unknown {
    const b = u8();
    if (b <= 0x7f) return b;
    if (b <= 0x8f) return map(b & 0x0f);
    if (b <= 0x9f) return arr(b & 0x0f);
    if (b <= 0xbf) return str(b & 0x1f);
    if (b >= 0xe0) return b - 256;
    switch (b) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xd9: return str(u8());
      case 0xda: return str(u16());
      case 0xdb: return str(u32());
      case 0xdc: return arr(u16());
      case 0xdd: return arr(u32());
      case 0xde: return map(u16());
      case 0xdf: return map(u32());
      case 0xcc: return u8();
      case 0xcd: return u16();
      case 0xce: return u32();
      case 0xd0: return buf.readInt8(p++);
      case 0xd1: { const v = buf.readInt16BE(p); p += 2; return v; }
      case 0xd2: { const v = buf.readInt32BE(p); p += 4; return v; }
      default: throw new Error(`unsupported msgpack byte 0x${b.toString(16)}`);
    }
  }
  return read();
}

export function parseWordfreq(msgpack: Buffer): Map<string, number> {
  const [header, ...buckets] = decode(msgpack) as [{ format?: string }, ...string[][]];
  if (!header || header.format !== "cB") throw new Error("unexpected wordfreq header");
  const zipf = new Map<string, number>();
  buckets.forEach((words, i) => {
    for (const w of words) zipf.set(w, 9 - i / 100);
  });
  return zipf;
}

export function loadWordfreq(path: string): Map<string, number> {
  return parseWordfreq(gunzipSync(readFileSync(path)));
}
```

- [ ] **Step 5: Write `scripts/dig/sources/oewn.ts`.** It ports `research/oewn.mjs`, adding typing and synset-level
  helpers:

```ts
// Open English WordNet 2025 (WN-LMF XML, CC BY 4.0). Regex loader, no dependencies.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

export type Synset = { members: string[]; pos: string; def: string; hyper: string[]; hypo: string[]; domain: string[] };
export type Wordnet = {
  synsets: Map<string, Synset>;
  /** lowercase lemma → synset ids in sense order */
  synsetsOf: Map<string, string[]>;
  spellingVariants: Map<string, Set<string>>;
  byDomain?: Map<string, string[]>;
};

const decodeXml = (s: string) =>
  s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function isSpellingPair(a: string, b: string): boolean {
  const n = (x: string) =>
    x.replace(/our/g, "or").replace(/([^aeiou])re$/, "$1er").replace(/ise/g, "ize").replace(/yse/g, "yze")
      .replace(/ae/g, "e").replace(/oe/g, "e").replace(/ll/g, "l");
  return a.length > 3 && n(a) === n(b);
}

export function parseOewn(xml: string): Wordnet {
  const synsets = new Map<string, Synset>();
  const lemmaOf = new Map<string, string>();
  const synsetsOf = new Map<string, string[]>();
  const entryRe = /<LexicalEntry id="([^"]+)">\s*<Lemma writtenForm="([^"]+)" partOfSpeech="(\w)"([\s\S]*?)<\/LexicalEntry>/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml))) {
    const lemma = decodeXml(m[2]);
    lemmaOf.set(m[1], lemma);
    const key = lemma.toLowerCase();
    for (const s of m[4].matchAll(/<Sense id="[^"]+" synset="([^"]+)"/g)) {
      const list = synsetsOf.get(key) ?? [];
      if (!list.includes(s[1])) list.push(s[1]);
      synsetsOf.set(key, list);
    }
  }
  const synRe = /<Synset id="([^"]+)"[^>]*members="([^"]*)"[^>]*partOfSpeech="(\w)"[^>]*>([\s\S]*?)<\/Synset>/g;
  while ((m = synRe.exec(xml))) {
    const body = m[4];
    const rel = (t: string) => [...body.matchAll(new RegExp(`relType="${t}" target="([^"]+)"`, "g"))].map((x) => x[1]);
    synsets.set(m[1], {
      members: m[2].split(" ").map((e) => lemmaOf.get(e)).filter((x): x is string => !!x),
      pos: m[3],
      def: decodeXml((body.match(/<Definition>([\s\S]*?)<\/Definition>/) ?? [])[1] ?? ""),
      hyper: rel("hypernym"),
      hypo: rel("hyponym"),
      domain: rel("domain_topic"),
    });
  }
  const spellingVariants = new Map<string, Set<string>>();
  for (const s of synsets.values()) {
    for (const a of s.members) for (const b of s.members) {
      const la = a.toLowerCase(), lb = b.toLowerCase();
      if (la !== lb && isSpellingPair(la, lb)) {
        const set = spellingVariants.get(la) ?? new Set<string>();
        set.add(lb);
        spellingVariants.set(la, set);
      }
    }
  }
  return { synsets, synsetsOf, spellingVariants };
}

export function loadOewn(path: string): Wordnet {
  const raw = readFileSync(path);
  return parseOewn((path.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8"));
}

/** Synset ids under the roots via hyponym links (a "kind of" closure), roots included. */
export function hyponymSynsets(wn: Wordnet, rootIds: string[], maxDepth = 12): Set<string> {
  const seen = new Set<string>();
  const walk = (id: string, d: number) => {
    if (seen.has(id) || d > maxDepth || !wn.synsets.has(id)) return;
    seen.add(id);
    wn.synsets.get(id)!.hypo.forEach((h) => walk(h, d + 1));
  };
  rootIds.forEach((r) => walk(r, 0));
  return seen;
}

const lemmasOf = (wn: Wordnet, ids: Iterable<string>) => {
  const out = new Set<string>();
  for (const id of ids) wn.synsets.get(id)?.members.forEach((l) => out.add(l.toLowerCase()));
  return out;
};

export function hyponymLemmas(wn: Wordnet, rootIds: string[], maxDepth = 12): Set<string> {
  return lemmasOf(wn, hyponymSynsets(wn, rootIds, maxDepth));
}

/** Synsets tagged with a topic domain at or below the roots, plus their near hyponyms. */
export function domainSynsets(wn: Wordnet, domainRootIds: string[]): Set<string> {
  const domains = hyponymSynsets(wn, domainRootIds);
  if (!wn.byDomain) {
    wn.byDomain = new Map();
    for (const [id, s] of wn.synsets) for (const d of s.domain) {
      const list = wn.byDomain.get(d) ?? [];
      list.push(id);
      wn.byDomain.set(d, list);
    }
  }
  const out = new Set<string>();
  for (const d of domains) for (const id of wn.byDomain.get(d) ?? []) hyponymSynsets(wn, [id], 3).forEach((x) => out.add(x));
  return out;
}

export function domainLemmas(wn: Wordnet, domainRootIds: string[]): Set<string> {
  return lemmasOf(wn, domainSynsets(wn, domainRootIds));
}

/** Hypernym ancestors, nearest first, the synset itself excluded. */
export function ancestors(wn: Wordnet, id: string, maxDepth = 12): Set<string> {
  const out = new Set<string>();
  let frontier = [id];
  for (let d = 0; d < maxDepth && frontier.length; d++) {
    const next: string[] = [];
    for (const f of frontier) for (const h of wn.synsets.get(f)?.hyper ?? []) {
      if (!out.has(h) && h !== id) { out.add(h); next.push(h); }
    }
    frontier = next;
  }
  return out;
}
```

- [ ] **Step 6: Write `scripts/dig/sources/compact.ts`.** It ports `research/compact.mjs`, with `compactEntry` made
  pure:

```ts
// Streams the raw Wiktextract dump (gzipped JSONL, ~25 GB unpacked) into an English-only
// JSONL holding just the fields the dig pipeline needs (about 240 MB, about 2.5 minutes).
import { createReadStream, createWriteStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";

export type CompactEntry = { w: string; pos: string; t: string[]; c: string[]; g: string[]; e: string[]; f: string[]; n: number; et: string };

type RawCategory = string | { name?: string };
type RawEntry = {
  word?: string; lang_code?: string; pos?: string; categories?: RawCategory[];
  senses?: { topics?: string[]; tags?: string[]; categories?: RawCategory[] }[];
  etymology_templates?: { name: string; args?: Record<string, string> }[];
  forms?: { form?: string; tags?: string[] }[]; etymology_text?: string;
};

const catName = (c: RawCategory) => (typeof c === "string" ? c : c?.name) ?? "";
const keepCat = (n: string) =>
  /^en:/i.test(n) ||
  /^English terms (borrowed|derived|inherited) from /.test(n) ||
  /^English (learned|semi-learned|orthographic) borrowings from /.test(n);
const ETY = new Set(["bor", "bor+", "der", "der+", "lbor", "inh", "inh+", "slbor", "obor", "ubor", "calque", "cal", "translit", "lbor+"]);
const KEEP_TAGS = new Set(["obsolete", "archaic", "rare", "dialectal", "slang", "vulgar", "offensive", "derogatory", "proscribed", "misspelling", "alt-of", "form-of", "abbreviation", "initialism"]);

export function compactEntry(raw: unknown): CompactEntry | null {
  const e = raw as RawEntry;
  if (!e || e.lang_code !== "en" || !e.word) return null;
  const topics = new Set<string>(), cats = new Set<string>(), tags = new Set<string>();
  for (const c of e.categories ?? []) { const n = catName(c); if (keepCat(n)) cats.add(n); }
  for (const s of e.senses ?? []) {
    (s.topics ?? []).forEach((t) => topics.add(t));
    (s.tags ?? []).forEach((t) => tags.add(t));
    for (const c of s.categories ?? []) { const n = catName(c); if (keepCat(n)) cats.add(n); }
  }
  const ety: string[] = [];
  for (const t of e.etymology_templates ?? []) {
    if (ETY.has(t.name) && t.args?.["1"] === "en" && t.args["2"]) ety.push(`${t.name}:${t.args["2"]}`);
  }
  const forms = (e.forms ?? [])
    .filter((f) => f.form && f.tags?.some((t) => ["plural", "alternative", "standard-spelling"].includes(t)))
    .map((f) => f.form!)
    .slice(0, 6);
  return {
    w: e.word, pos: e.pos ?? "", t: [...topics], c: [...cats], g: [...tags].filter((x) => KEEP_TAGS.has(x)),
    e: ety, f: forms, n: (e.senses ?? []).length, et: (e.etymology_text ?? "").slice(0, 300),
  };
}

export async function compactDump(input: string, output: string): Promise<{ lines: number; kept: number }> {
  const out = createWriteStream(output);
  const gz = createGunzip();
  const rl = createInterface({ input: createReadStream(input).pipe(gz), crlfDelay: Infinity });
  let lines = 0, kept = 0;
  const failed = new Promise<never>((_, reject) => gz.on("error", reject));
  const done = (async () => {
    for await (const line of rl) {
      lines++;
      if (!line.includes('"lang_code": "en"') && !line.includes('"lang_code":"en"')) continue;
      let parsed: unknown;
      try { parsed = JSON.parse(line); } catch { continue; }
      const c = compactEntry(parsed);
      if (c) { out.write(JSON.stringify(c) + "\n"); kept++; }
    }
  })();
  await Promise.race([done, failed]);
  await new Promise<void>((resolve) => out.end(resolve));
  return { lines, kept };
}

export async function* readCompact(path: string): AsyncIterable<CompactEntry> {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) if (line) yield JSON.parse(line) as CompactEntry;
}
```

- [ ] **Step 7: Write `scripts/dig/lexicon.ts`:**

```ts
import { normalizeKey } from "../../lib/dig/normalize";

/** Every real English word key we know (wordfreq + Wiktionary English headwords). The
 * guard list is built from it: a guess that is a real word is never "corrected". */
export function buildLexicon(zipf: Map<string, number>, words: Iterable<string>): Set<string> {
  const out = new Set<string>();
  const add = (w: string) => {
    const k = normalizeKey(w);
    if (k.length >= 2) out.add(k);
  };
  for (const w of zipf.keys()) add(w);
  for (const w of words) add(w);
  return out;
}
```

- [ ] **Step 8: Run the test.** Run `npx vitest run scripts/dig/sources/sources.test.ts`. Expected: PASS.
- [ ] **Step 9: Commit.**

```bash
git add scripts/dig/sources scripts/dig/lexicon.ts scripts/dig/fixtures/oewn-mini.xml
git commit -m "feat(dig): wordfreq, WordNet and Wiktextract loaders"
```

---

### Task 5: Wiktionary index and the theme catalogue

**Files:**
- Create: `scripts/dig/wiktionary.ts`, `scripts/dig/catalogue.ts`, `content/dig/catalogue.json`, `scripts/dig/themes.ts`
- Test: `scripts/dig/themes.test.ts`

**Interfaces:**
- Consumes: Task 4's `CompactEntry`, `Wordnet` and helpers.
- Produces:
  - `type WordInfo = { ok: boolean; noun: boolean; offensive: boolean; obsolete: boolean; aliases: string[]; etymology: string }`;
  - `type WiktionaryIndex = { info: Map<string, WordInfo>; categories: Map<string, Set<string>>; originCategory: Map<string, Set<string>>; originTemplate: Map<string, Set<string>> }`;
  - `indexWiktionary(entries: AsyncIterable<CompactEntry> | Iterable<CompactEntry>, badWords: Set<string>): Promise<WiktionaryIndex>`;
  - `usableWord(index: WiktionaryIndex, zipf: Map<string, number>, w: string): boolean`;
  - `type Catalogue = { anchorOverrides: Record<string, string[]>; renames: Record<string, string>; blockPatterns: string[]; wikidataThemes: WikidataTheme[]; originGroups: OriginGroup[]; originExclude: string[]; langCodes: Record<string, string> }`;
  - `type WikidataTheme = { id: string; text: string; qid: string; label: string; wiktionary: string[] }`;
  - `type OriginGroup = { id: string; text: string; languages: string[] }`;
  - `loadCatalogue(path?: string): Catalogue`;
  - `type Candidate = { id: string; base: string; kind: "theme" | "origin"; text: string; core: string[]; accepted: string[]; sources: Set<string>[]; anchor: string; senseIds: Set<string> | null; ancestors: Set<string>; languages: string[] }`;
  - `wordnetThemes(wn: Wordnet, index: WiktionaryIndex, zipf: Map<string, number>, cat: Catalogue): Candidate[]`;
  - `letterVariants(theme: Candidate, zipf: Map<string, number>): Candidate[]`;
  - `slugify(s: string): string`, `themeText(name: string, via: "kind-of" | "domain", renames: Record<string, string>): string`.

`Candidate.sources` holds the separate source sets. Adjudication accepts a guess found in any one of them.
`senseIds` holds the synset ids of the theme sense, which the fossil's first-sense check uses.

- [ ] **Step 1: Write `content/dig/catalogue.json`.**
  - Copy `langCodes` exactly from `LANG_CODE` in `docs/rarity-game/research/measure.mts` (line 112).
  - Add `"Old Norse": "non"` (already present), `"Marathi": "mr"`, `"Malayalam": "ml"`, `"Tahitian": "ty"`,
    `"Samoan": "sm"`, `"Tongan": "to"`, `"Taino": "tnq"`, `"Xhosa": "xh"` and `"Yoruba": "yo"`.

```json
{
  "anchorOverrides": {
    "Nautical": ["seafaring", "navigation"],
    "Sailing": ["seafaring", "navigation"],
    "Weather": ["weather", "meteorology"],
    "Colors": ["chromatic color", "color"],
    "Spices": ["spice"],
    "Kitchenware": ["kitchen utensil"],
    "Cookware": ["kitchen utensil"],
    "Headwear": ["headdress"],
    "Gemstones": ["gem"],
    "Insects": ["insect"],
    "Cooking": ["cooking"]
  },
  "renames": {
    "Nautical": "Name a word from sailing",
    "Sailing": "Name a word from sailing",
    "Colors": "Name a colour",
    "Weather": "Name a word about the weather",
    "Cooking": "Name a word from the kitchen",
    "Headwear": "Name something you wear on your head"
  },
  "blockPatterns": [
    "chem", "compound", "pharma", "drug", "medic", "surg", "anatom", "disease", "genet", "biolog", "mathem", "statist",
    "physic", "comput", "grammar", "linguist", "philos", "psycho", "law", "legal", "sex", "taxonom", "botan", "zoolog",
    "geolog", "astronom", "unit", "mineral", "enzyme", "protein", "element", "acid", "software", "program", "internet",
    "religio", "death", "mytholog", "weapon", "military", "cell", "bacteri", "virus", "fung", "bone", "organ", "nerv",
    "muscle", "tissue", "matter", "substance", "object", "entity", "people", "person", "human", "occupation", "crime",
    "slur", "ethnic", "nationalit", "demonym", "plot device", "data struct", "hypothetical", "science",
    "communication", "construction", "swear", "insult", "profan", "slang"
  ],
  "wikidataThemes": [
    { "id": "theme:cheeses", "text": "Name a cheese", "qid": "Q10943", "label": "cheese", "wiktionary": ["Cheeses"] },
    { "id": "theme:pasta", "text": "Name a type of pasta", "qid": "Q178", "label": "pasta", "wiktionary": ["Pasta"] },
    { "id": "theme:cocktails", "text": "Name a cocktail", "qid": "Q134768", "label": "cocktail", "wiktionary": ["Cocktails"] },
    { "id": "theme:dog-breeds", "text": "Name a dog breed", "qid": "Q39367", "label": "dog breed", "wiktionary": ["Dog breeds", "Dogs"] },
    { "id": "theme:cat-breeds", "text": "Name a cat breed", "qid": "Q43577", "label": "cat breed", "wiktionary": ["Cat breeds", "Cats"] },
    { "id": "theme:breads", "text": "Name a bread", "qid": "Q7802", "label": "bread", "wiktionary": ["Breads"] },
    { "id": "theme:desserts", "text": "Name a dessert", "qid": "Q182940", "label": "dessert", "wiktionary": ["Desserts"] },
    { "id": "theme:dances", "text": "Name a dance", "qid": "Q11639", "label": "dance", "wiktionary": ["Dances"] }
  ],
  "originGroups": [
    { "id": "origin:group:scandinavian", "text": "Name a word that came to English from a Scandinavian language", "languages": ["Old Norse", "Norwegian", "Swedish", "Danish", "Icelandic"] },
    { "id": "origin:group:india", "text": "Name a word that came to English from a language of India", "languages": ["Hindi", "Sanskrit", "Tamil", "Bengali", "Urdu", "Marathi", "Malayalam"] },
    { "id": "origin:group:americas", "text": "Name a word that came to English from a language of the Americas", "languages": ["Nahuatl", "Classical Nahuatl", "Quechua", "Tupi", "Taino"] },
    { "id": "origin:group:africa", "text": "Name a word that came to English from an African language", "languages": ["Zulu", "Swahili", "Afrikaans", "Xhosa", "Yoruba"] },
    { "id": "origin:group:pacific", "text": "Name a word that came to English from a Pacific language", "languages": ["Maori", "Hawaiian", "Tahitian", "Samoan", "Tongan", "Malay", "Tagalog"] }
  ],
  "originExclude": ["Latin", "Old English", "Old French", "Middle English", "Middle French", "Anglo-Norman", "Proto-Germanic", "Proto-Indo-European", "Late Latin", "Medieval Latin", "New Latin"],
  "langCodes": { "Arabic": "ar" }
}
```

> **Two notes on this file:**
> - Replace the one-entry `langCodes` placeholder above with the full `LANG_CODE` object from `measure.mts`, plus
>   the nine additions listed. This is a copy step, not new content.
> - Wikidata QIDs are checked live in Task 6. An entry whose QID label doesn't match `label` is dropped with a
>   summary warning, so a wrong QID can never publish a wrong theme.

- [ ] **Step 2: Write the failing test** in `scripts/dig/themes.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOewn } from "./sources/oewn";
import type { CompactEntry } from "./sources/compact";
import { indexWiktionary, usableWord } from "./wiktionary";
import { letterVariants, slugify, themeText, wordnetThemes } from "./themes";
import type { Catalogue } from "./catalogue";

const wn = parseOewn(readFileSync(path.join(__dirname, "fixtures/oewn-mini.xml"), "utf8"));
const entry = (w: string, cats: string[], extra: Partial<CompactEntry> = {}): CompactEntry =>
  ({ w, pos: "noun", t: [], c: cats.map((c) => `en:${c}`), g: [], e: [], f: [], n: 1, et: "", ...extra });

const cat: Catalogue = {
  anchorOverrides: {}, renames: {}, blockPatterns: ["slur"], wikidataThemes: [], originGroups: [], originExclude: [], langCodes: {},
};

describe("indexWiktionary", () => {
  it("records filters and categories", async () => {
    const idx = await indexWiktionary(
      [entry("apple", ["Fruits"]), entry("rude", ["Fruits"], { g: ["vulgar"] }), entry("lemon", ["Citrus fruits"], { f: ["lemons"] })],
      new Set()
    );
    expect(idx.categories.get("Fruits")).toEqual(new Set(["apple", "rude"]));
    expect(idx.info.get("rude")?.offensive).toBe(true);
    expect(idx.info.get("lemon")?.aliases).toEqual(["lemons"]);
    expect(usableWord(idx, new Map(), "apple")).toBe(true);
    expect(usableWord(idx, new Map(), "rude")).toBe(false);
  });
});

describe("wording and ids", () => {
  it("phrases kind-of and domain themes", () => {
    expect(themeText("Fruits", "kind-of", {})).toBe("Name a fruit");
    expect(themeText("Musical instruments", "kind-of", {})).toBe("Name a musical instrument");
    expect(themeText("Insects", "kind-of", {})).toBe("Name an insect");
    expect(themeText("Nautical", "domain", {})).toBe("Name a nautical word");
    expect(themeText("Nautical", "domain", { Nautical: "Name a word from sailing" })).toBe("Name a word from sailing");
    expect(slugify("Citrus fruits")).toBe("citrus-fruits");
  });
});

describe("wordnetThemes", () => {
  it("anchors a sub-category to its own sense and rolls it up into the parent", async () => {
    const fruits = ["apple", "fig", "pear", "plum", "date"].map((w) => entry(w, ["Fruits"]));
    const citrus = ["lemon"].map((w) => entry(w, ["Citrus fruits"]));
    const idx = await indexWiktionary([...fruits, ...citrus], new Set());
    const themes = wordnetThemes(wn, idx, new Map(), cat, { minOwnWords: 1, minAnchor: 1 });
    const fruit = themes.find((t) => t.id === "theme:fruits")!;
    expect(fruit.core.sort()).toEqual(["apple", "lemon"]);
    expect(fruit.accepted).toEqual(expect.arrayContaining(["apple", "lemon", "fig", "pear", "plum", "date"]));
    const citrusTheme = themes.find((t) => t.id === "theme:citrus-fruits")!;
    expect(citrusTheme.anchor).toBe("oewn-citrus-n-1");
    expect(citrusTheme.ancestors.has("oewn-fruit-n-1")).toBe(true);
  });
});

describe("letterVariants", () => {
  it("splits a theme by first letter and keeps the base id", () => {
    const words = Array.from({ length: 30 }, (_, i) => `c${"abcdefghijklmnopqrstuvwxyz"[i % 26]}${i}x`.replace(/\d/g, "q"));
    const theme = {
      id: "theme:mammals", base: "theme:mammals", kind: "theme" as const, text: "Name a mammal", core: words, accepted: words,
      sources: [], anchor: "x", senseIds: null, ancestors: new Set<string>(), languages: [],
    };
    const [c] = letterVariants(theme, new Map(), { minCore: 25 });
    expect(c.id).toBe("theme:mammals:c");
    expect(c.base).toBe("theme:mammals");
    expect(c.text).toBe("Name a mammal beginning with C");
  });
});
```

- [ ] **Step 3: Run it and confirm it fails.** Run `npx vitest run scripts/dig/themes.test.ts`. Expected: FAIL.

- [ ] **Step 4: Write `scripts/dig/wiktionary.ts`:**

```ts
import type { CompactEntry } from "./sources/compact";

export type WordInfo = { ok: boolean; noun: boolean; offensive: boolean; obsolete: boolean; aliases: string[]; etymology: string };
export type WiktionaryIndex = {
  info: Map<string, WordInfo>;
  /** "Fruits" (from "en:Fruits") → words */
  categories: Map<string, Set<string>>;
  /** "Arabic" (from "English terms derived from Arabic") → words */
  originCategory: Map<string, Set<string>>;
  /** "ar" (from etymology templates) → words */
  originTemplate: Map<string, Set<string>>;
};

const SHAPE = /^[a-z][a-z' -]*[a-z]$/;
const OK_POS = new Set(["noun", "verb", "adj", "adv"]);
const BAD = new Set(["vulgar", "offensive", "derogatory"]);
const NOT_ANSWER = new Set(["misspelling", "abbreviation", "initialism", "form-of", "alt-of"]);

function add(map: Map<string, Set<string>>, key: string, w: string) {
  const set = map.get(key) ?? new Set<string>();
  set.add(w);
  map.set(key, set);
}

/** One pass over the compact dump. Only lowercase, 1–2 word, ≤ 24-character headwords are kept. */
export async function indexWiktionary(
  entries: AsyncIterable<CompactEntry> | Iterable<CompactEntry>,
  badWords: Set<string>
): Promise<WiktionaryIndex> {
  const idx: WiktionaryIndex = { info: new Map(), categories: new Map(), originCategory: new Map(), originTemplate: new Map() };
  for await (const e of entries as AsyncIterable<CompactEntry>) {
    const w = e.w;
    if (!SHAPE.test(w) || w.length > 24 || w.split(" ").length > 2) continue;
    const prev = idx.info.get(w);
    const passes = OK_POS.has(e.pos) && !e.g.some((t) => NOT_ANSWER.has(t));
    const obsolete = e.g.includes("obsolete") || e.g.includes("archaic");
    idx.info.set(w, {
      ok: (prev?.ok ?? false) || passes,
      noun: (prev?.noun ?? false) || (passes && e.pos === "noun"),
      offensive: (prev?.offensive ?? false) || e.g.some((t) => BAD.has(t)) || badWords.has(w),
      obsolete: prev ? prev.obsolete && obsolete : obsolete,
      aliases: [...new Set([...(prev?.aliases ?? []), ...e.f])].slice(0, 8),
      etymology: prev?.etymology || e.et,
    });
    for (const c of e.c) {
      if (c.startsWith("en:")) add(idx.categories, c.slice(3), w);
      const o = c.match(/^English terms (?:borrowed|derived) from (.+)$/);
      if (o) add(idx.originCategory, o[1], w);
    }
    for (const t of e.e) add(idx.originTemplate, t.split(":")[1], w);
  }
  return idx;
}

/** The pipeline-design §5 word filter. Obsolete words pass only if wordfreq knows them. */
export function usableWord(index: WiktionaryIndex, zipf: Map<string, number>, w: string): boolean {
  const i = index.info.get(w);
  return !!i && i.ok && !i.offensive && (!i.obsolete || zipf.has(w));
}
```

- [ ] **Step 5: Write `scripts/dig/catalogue.ts`:**

```ts
import { readFileSync } from "node:fs";
import path from "node:path";

export type WikidataTheme = { id: string; text: string; qid: string; label: string; wiktionary: string[] };
export type OriginGroup = { id: string; text: string; languages: string[] };
export type Catalogue = {
  anchorOverrides: Record<string, string[]>;
  renames: Record<string, string>;
  blockPatterns: string[];
  wikidataThemes: WikidataTheme[];
  originGroups: OriginGroup[];
  originExclude: string[];
  langCodes: Record<string, string>;
};

export const CATALOGUE_PATH = path.join("content", "dig", "catalogue.json");

export function loadCatalogue(file: string = CATALOGUE_PATH): Catalogue {
  return JSON.parse(readFileSync(file, "utf8")) as Catalogue;
}

export function isBlocked(cat: Catalogue, name: string): boolean {
  const lower = name.toLowerCase();
  return cat.blockPatterns.some((p) => lower.includes(p));
}
```

- [ ] **Step 6: Write `scripts/dig/themes.ts`:**

```ts
import { ancestors, domainLemmas, domainSynsets, hyponymLemmas, hyponymSynsets, type Wordnet } from "./sources/oewn";
import { isBlocked, type Catalogue } from "./catalogue";
import { usableWord, type WiktionaryIndex } from "./wiktionary";

export type Candidate = {
  id: string;
  /** Cooldown family root: a letter variant's base is its parent theme. */
  base: string;
  kind: "theme" | "origin";
  text: string;
  core: string[];
  accepted: string[];
  /** Each independent source's word set, for adjudication. */
  sources: Set<string>[];
  anchor: string;
  /** Synset ids that count as the theme sense (fossil first-sense check); null = no check. */
  senseIds: Set<string> | null;
  ancestors: Set<string>;
  languages: string[];
};

export const ACCEPTED_CAP = 1200;
const OVER_BROAD = 800;

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const singular = (s: string) => s.replace(/ies$/, "y").replace(/(ch|sh|x|ss)es$/, "$1").replace(/s$/, "");
const singularPhrase = (s: string) => {
  const parts = s.split(" ");
  parts[parts.length - 1] = singular(parts[parts.length - 1]);
  return parts.join(" ");
};

export function themeText(name: string, via: "kind-of" | "domain", renames: Record<string, string>): string {
  if (renames[name]) return renames[name];
  const lower = name.toLowerCase();
  if (via === "domain") return `Name ${/^[aeiou]/.test(lower) ? "an" : "a"} ${lower} word`;
  const s = singularPhrase(lower);
  return `Name ${/^[aeiou]/.test(s) ? "an" : "a"} ${s}`;
}

type Anchor = { id: string; via: "kind-of" | "domain"; size: number };

/** Own-sense anchoring (pipeline-design §3a fix 1): the most specific head form that
 * anchors at least `minAnchor` words wins, so "Citrus fruits" anchors at citrus fruit,
 * not at fruit. */
function anchorCategory(wn: Wordnet, name: string, words: Set<string>, overrides: Record<string, string[]>, minAnchor: number): Anchor | null {
  const lower = name.toLowerCase();
  const heads = overrides[name] ?? [singularPhrase(lower), lower, singular(lower.split(" ").slice(-1)[0])];
  let fallback: Anchor | null = null;
  for (const head of [...new Set(heads)]) {
    let best: Anchor | null = null;
    for (const id of wn.synsetsOf.get(head) ?? []) {
      if (wn.synsets.get(id)?.pos !== "n") continue;
      for (const [via, set] of [["kind-of", hyponymLemmas(wn, [id])], ["domain", domainLemmas(wn, [id])]] as const) {
        let size = 0;
        for (const w of words) if (set.has(w)) size++;
        if (!best || size > best.size) best = { id, via, size };
      }
    }
    if (best && best.size >= minAnchor) return best;
    if (best && (!fallback || best.size > fallback.size)) fallback = best;
  }
  return fallback && fallback.size >= 2 ? fallback : null;
}

function capAccepted(core: string[], others: Iterable<string>, zipf: Map<string, number>): string[] {
  const coreSet = new Set(core);
  const rest = [...new Set(others)].filter((w) => !coreSet.has(w)).sort((a, b) => (zipf.get(b) ?? 0) - (zipf.get(a) ?? 0));
  return [...core, ...rest].slice(0, Math.max(ACCEPTED_CAP, core.length));
}

export function wordnetThemes(
  wn: Wordnet,
  index: WiktionaryIndex,
  zipf: Map<string, number>,
  cat: Catalogue,
  opts: { minOwnWords?: number; minAnchor?: number } = {}
): Candidate[] {
  const minOwn = opts.minOwnWords ?? 25;
  const minAnchor = opts.minAnchor ?? 5;
  const usable = (w: string) => usableWord(index, zipf, w);
  const anchors = new Map<string, Anchor>();
  for (const [name, words] of index.categories) {
    if (words.size < Math.min(5, minOwn)) continue;
    const a = anchorCategory(wn, name, words, cat.anchorOverrides, minAnchor);
    if (a) anchors.set(name, a);
  }
  const out: Candidate[] = [];
  const byAnchor = new Map<string, Candidate>();
  for (const [name, a] of anchors) {
    const own = index.categories.get(name)!;
    if (own.size < minOwn || isBlocked(cat, name)) continue;
    const wiktionary = new Set(own);
    if (a.via === "kind-of") {
      const below = hyponymSynsets(wn, [a.id]);
      for (const [other, a2] of anchors) if (a2.via === "kind-of" && below.has(a2.id)) index.categories.get(other)!.forEach((w) => wiktionary.add(w));
    }
    const senseIds = a.via === "kind-of" ? hyponymSynsets(wn, [a.id]) : domainSynsets(wn, [a.id]);
    const wnSet = a.via === "kind-of" ? hyponymLemmas(wn, [a.id]) : domainLemmas(wn, [a.id]);
    const core = [...wiktionary].filter((w) => wnSet.has(w) && usable(w)).sort();
    if (core.length > OVER_BROAD) continue;
    const others = [...wiktionary, ...[...wnSet].filter((w) => index.info.has(w))].filter(usable);
    const c: Candidate = {
      id: `theme:${slugify(name)}`, base: `theme:${slugify(name)}`, kind: "theme",
      text: themeText(name, a.via, cat.renames), core, accepted: capAccepted(core, others, zipf),
      sources: [wiktionary, wnSet], anchor: a.id, senseIds, ancestors: ancestors(wn, a.id), languages: [],
    };
    const prev = byAnchor.get(a.id);
    if (!prev || prev.id.length > c.id.length) byAnchor.set(a.id, c);
  }
  out.push(...byAnchor.values());
  return out.sort((x, y) => x.id.localeCompare(y.id));
}

/** "Name a mammal beginning with C": each letter subset of an agreed core. */
export function letterVariants(theme: Candidate, zipf: Map<string, number>, opts: { minCore?: number } = {}): Candidate[] {
  const minCore = opts.minCore ?? 25;
  const byLetter = new Map<string, string[]>();
  for (const w of theme.core) byLetter.set(w[0], [...(byLetter.get(w[0]) ?? []), w]);
  const out: Candidate[] = [];
  for (const [letter, core] of [...byLetter].sort()) {
    if (core.length < minCore) continue;
    out.push({
      ...theme,
      id: `${theme.id}:${letter}`,
      base: theme.id,
      text: `${theme.text} beginning with ${letter.toUpperCase()}`,
      core,
      accepted: theme.accepted.filter((w) => w[0] === letter),
    });
  }
  return out;
}
```

- [ ] **Step 7: Run the test.** Run `npx vitest run scripts/dig/themes.test.ts`. Expected: PASS. If the roll-up test
  shows `lemon` missing from the fruit core, check that `Citrus fruits` anchored with `kind-of` at
  `oewn-citrus-n-1` (`minAnchor: 1` in the test).
- [ ] **Step 8: Commit.**

```bash
git add scripts/dig/wiktionary.ts scripts/dig/catalogue.ts content/dig/catalogue.json scripts/dig/themes.ts scripts/dig/themes.test.ts
git commit -m "feat(dig): Wiktionary index, catalogue and WordNet theme anchoring"
```

---

### Task 6: Wikidata as the second source for everyday themes

**Files:**
- Create: `scripts/dig/sources/wikidata.ts`
- Modify: `scripts/dig/themes.ts` (append `wikidataThemeCandidates`)
- Test: `scripts/dig/sources/wikidata.test.ts`

**Interfaces:**
- Consumes:
  - `FetchLike` and `createFetcher` from `scripts/demand/http.ts`;
  - `Catalogue` and `WikidataTheme` (Task 5);
  - `WiktionaryIndex` and `usableWord` (Task 5).
- Produces:
  - `DIG_USER_AGENT`;
  - `fetchWikidataLabels(theme: WikidataTheme, opts: { fetcher: FetchLike; cacheDir: string; now: Date }): Promise<{ labels: Set<string> | null; status: "fresh" | "cached" | "stale" | "missing" | "label-mismatch" }>`;
  - `wikidataThemeCandidates(themes: { theme: WikidataTheme; labels: Set<string> }[], index: WiktionaryIndex, zipf: Map<string, number>): Candidate[]`.

- [ ] **Step 1: Write the failing test** in `scripts/dig/sources/wikidata.test.ts`:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fetchWikidataLabels } from "./wikidata";
import { wikidataThemeCandidates } from "../themes";
import { indexWiktionary } from "../wiktionary";

const theme = { id: "theme:cheeses", text: "Name a cheese", qid: "Q10943", label: "cheese", wiktionary: ["Cheeses"] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const bindings = (labels: string[]) => ({ results: { bindings: labels.map((l) => ({ label: { value: l } })) } });

describe("fetchWikidataLabels", () => {
  it("verifies the QID label, then lowercases item labels and caches them", async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), "wd-"));
    const calls: string[] = [];
    const fetcher = async (url: string) => {
      calls.push(url);
      return calls.length === 1 ? json(bindings(["cheese"])) : json(bindings(["Brie", "Stilton", "Q123", "Red Leicester"]));
    };
    const now = new Date("2026-11-02T00:00:00Z");
    const first = await fetchWikidataLabels(theme, { fetcher, cacheDir, now });
    expect(first.status).toBe("fresh");
    expect([...first.labels!].sort()).toEqual(["brie", "red leicester", "stilton"]);
    const again = await fetchWikidataLabels(theme, { fetcher: async () => { throw new Error("offline"); }, cacheDir, now });
    expect(again.status).toBe("cached");
  });
  it("drops a theme whose QID label does not match", async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), "wd-"));
    const r = await fetchWikidataLabels(theme, { fetcher: async () => json(bindings(["pasta"])), cacheDir, now: new Date() });
    expect(r).toEqual({ labels: null, status: "label-mismatch" });
  });
  it("falls back to a stale cache when the query fails", async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), "wd-"));
    let n = 0;
    await fetchWikidataLabels(theme, { fetcher: async () => (n++ === 0 ? json(bindings(["cheese"])) : json(bindings(["Brie"]))), cacheDir, now: new Date("2026-01-01") });
    const r = await fetchWikidataLabels(theme, { fetcher: async () => json({}, 504), cacheDir, now: new Date("2026-03-01") });
    expect(r.status).toBe("stale");
    expect(r.labels?.has("brie")).toBe(true);
  });
});

describe("wikidataThemeCandidates", () => {
  it("keeps only labels that are usable Wiktionary nouns", async () => {
    const idx = await indexWiktionary(
      [
        { w: "brie", pos: "noun", t: [], c: ["en:Cheeses"], g: [], e: [], f: [], n: 1, et: "" },
        { w: "stilton", pos: "noun", t: [], c: [], g: [], e: [], f: [], n: 1, et: "" },
        { w: "feta", pos: "noun", t: [], c: ["en:Cheeses"], g: [], e: [], f: [], n: 1, et: "" },
      ],
      new Set()
    );
    const [c] = wikidataThemeCandidates([{ theme, labels: new Set(["brie", "stilton", "red leicester"]) }], idx, new Map());
    expect(c.core.sort()).toEqual(["brie", "stilton"]);
    expect(c.accepted).toEqual(expect.arrayContaining(["brie", "stilton", "feta"]));
    expect(c.senseIds).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run scripts/dig/sources/wikidata.test.ts`. Expected:
  FAIL.

- [ ] **Step 3: Write `scripts/dig/sources/wikidata.ts`:**

```ts
// Wikidata (CC0) as the alternative second source for everyday themes WordNet can't anchor.
// Queries are cached for 7 days; a failed query reuses the last cache (big classes time out).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FetchLike } from "../../demand/http";
import type { WikidataTheme } from "../catalogue";

export const DIG_USER_AGENT = "CurioDig/1.0 (https://curioword.com)";
const WDQS = "https://query.wikidata.org/sparql";
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const SHAPE = /^[a-z][a-z' -]*[a-z]$/;

type Cache = { fetchedAt: string; labels: string[] };

async function sparql(fetcher: FetchLike, query: string): Promise<string[]> {
  const url = `${WDQS}?format=json&query=${encodeURIComponent(query)}`;
  const res = await fetcher(url, { headers: { "User-Agent": DIG_USER_AGENT, Accept: "application/sparql-results+json" } });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
  const body = (await res.json()) as { results?: { bindings?: { label?: { value?: string } }[] } };
  return (body.results?.bindings ?? []).map((b) => b.label?.value ?? "").filter(Boolean);
}

const classLabel = (qid: string) => `SELECT ?label WHERE { wd:${qid} rdfs:label ?label . FILTER(LANG(?label) = "en") }`;
const memberLabels = (qid: string) =>
  `SELECT DISTINCT ?label WHERE { ?item wdt:P31/wdt:P279* wd:${qid} . ?item rdfs:label ?label . FILTER(LANG(?label) = "en") } LIMIT 20000`;

export async function fetchWikidataLabels(
  theme: WikidataTheme,
  opts: { fetcher: FetchLike; cacheDir: string; now: Date }
): Promise<{ labels: Set<string> | null; status: "fresh" | "cached" | "stale" | "missing" | "label-mismatch" }> {
  mkdirSync(opts.cacheDir, { recursive: true });
  const file = path.join(opts.cacheDir, `${theme.qid}.json`);
  const cache: Cache | null = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Cache) : null;
  if (cache && opts.now.getTime() - Date.parse(cache.fetchedAt) < FRESH_MS) {
    return { labels: new Set(cache.labels), status: "cached" };
  }
  try {
    const own = await sparql(opts.fetcher, classLabel(theme.qid));
    if (!own.some((l) => l.toLowerCase() === theme.label)) return { labels: null, status: "label-mismatch" };
    const labels = [...new Set((await sparql(opts.fetcher, memberLabels(theme.qid))).map((l) => l.toLowerCase()))].filter((l) => SHAPE.test(l));
    writeFileSync(file, JSON.stringify({ fetchedAt: opts.now.toISOString(), labels } satisfies Cache));
    return { labels: new Set(labels), status: "fresh" };
  } catch {
    return cache ? { labels: new Set(cache.labels), status: "stale" } : { labels: null, status: "missing" };
  }
}
```

- [ ] **Step 4: Append to `scripts/dig/themes.ts`** (and add `import type { WikidataTheme } from "./catalogue";`
  at the top):

```ts
/** Wikidata themes (pipeline-design §3a fix 2): core = Wikidata labels that are usable
 * Wiktionary nouns (which also strips proper names); accepted adds the Wiktionary
 * categories named in the catalogue. No WordNet sense, so no first-sense check. */
export function wikidataThemeCandidates(
  themes: { theme: WikidataTheme; labels: Set<string> }[],
  index: WiktionaryIndex,
  zipf: Map<string, number>
): Candidate[] {
  const usable = (w: string) => usableWord(index, zipf, w);
  return themes.map(({ theme, labels }) => {
    const wiktionary = new Set<string>();
    for (const name of theme.wiktionary) index.categories.get(name)?.forEach((w) => wiktionary.add(w));
    const core = [...labels].filter((w) => usable(w) && index.info.get(w)!.noun).sort();
    return {
      id: theme.id, base: theme.id, kind: "theme" as const, text: theme.text, core,
      accepted: capAccepted(core, [...wiktionary].filter(usable), zipf),
      sources: [labels, wiktionary], anchor: `wikidata:${theme.qid}`, senseIds: null, ancestors: new Set<string>(), languages: [],
    };
  });
}
```

- [ ] **Step 5: Run the tests.** Run `npx vitest run scripts/dig/sources/wikidata.test.ts scripts/dig/themes.test.ts`.
  Expected: PASS.
- [ ] **Step 6: Commit.**

```bash
git add scripts/dig/sources/wikidata.ts scripts/dig/sources/wikidata.test.ts scripts/dig/themes.ts
git commit -m "feat(dig): Wikidata second source with weekly cache"
```

---

### Task 7: Origin prompts (single languages and groups)

**Files:**
- Create: `scripts/dig/origins.ts`
- Test: `scripts/dig/origins.test.ts`

**Interfaces:**
- Consumes: `WiktionaryIndex`, `usableWord`, `Catalogue`, `Candidate`, `slugify`, `ACCEPTED_CAP`.
- Produces: `originCandidates(index: WiktionaryIndex, zipf: Map<string, number>, cat: Catalogue, curioLineage: Map<string, string[]>): Candidate[]`.

`curioLineage` maps a Curio word (lowercase) to its `lineage` array. A Curio word whose lineage names none of the
prompt's languages is dropped from that prompt's core, though it stays accepted.

- [ ] **Step 1: Write the failing test** in `scripts/dig/origins.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { indexWiktionary } from "./wiktionary";
import { originCandidates } from "./origins";
import type { Catalogue } from "./catalogue";
import type { CompactEntry } from "./sources/compact";

const e = (w: string, lang: string, code: string | null): CompactEntry => ({
  w, pos: "noun", t: [], c: [`English terms derived from ${lang}`], g: [], e: code ? [`der:${code}`] : [], f: [], n: 1, et: "",
});
const cat: Catalogue = {
  anchorOverrides: {}, renames: {}, blockPatterns: [], wikidataThemes: [],
  originGroups: [{ id: "origin:group:scandinavian", text: "Name a word that came to English from a Scandinavian language", languages: ["Old Norse", "Danish"] }],
  originExclude: ["Latin"], langCodes: { Arabic: "ar", "Old Norse": "non", Danish: "da", Latin: "la" },
};

describe("originCandidates", () => {
  it("needs both the category and the template, and respects exclusions and Curio lineage", async () => {
    const idx = await indexWiktionary(
      [e("algebra", "Arabic", "ar"), e("sofa", "Arabic", "ar"), e("zero", "Arabic", null), e("saffron", "Arabic", "ar"),
       e("sky", "Old Norse", "non"), e("smorgasbord", "Danish", "da"), e("via", "Latin", "la")],
      new Set()
    );
    const lineage = new Map([["saffron", ["Persian", "French", "English"]]]);
    const out = originCandidates(idx, new Map(), cat, lineage);
    const arabic = out.find((c) => c.id === "origin:arabic")!;
    expect(arabic.core.sort()).toEqual(["algebra", "sofa"]);
    expect(arabic.accepted).toEqual(expect.arrayContaining(["algebra", "sofa", "zero", "saffron"]));
    expect(arabic.text).toBe("Name a word that came to English from Arabic");
    expect(arabic.languages).toEqual(["Arabic"]);
    expect(out.some((c) => c.id === "origin:latin")).toBe(false);
    const group = out.find((c) => c.id === "origin:group:scandinavian")!;
    expect(group.core.sort()).toEqual(["sky", "smorgasbord"]);
    expect(group.languages).toEqual(["Old Norse", "Danish"]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run scripts/dig/origins.test.ts`. Expected: FAIL.

- [ ] **Step 3: Write `scripts/dig/origins.ts`:**

```ts
import type { Catalogue } from "./catalogue";
import { ACCEPTED_CAP, slugify, type Candidate } from "./themes";
import { usableWord, type WiktionaryIndex } from "./wiktionary";

type LangSets = { core: Set<string>; accepted: Set<string>; category: Set<string>; template: Set<string> };

/** Origin prompts (pipeline-design §4): core needs both Wiktionary's "derived from" category
 * and a structured etymology template naming the language. Grouped origins union their
 * members (fix 3). Common-tier caps are enforced by the floor in answers.ts. */
export function originCandidates(
  index: WiktionaryIndex,
  zipf: Map<string, number>,
  cat: Catalogue,
  curioLineage: Map<string, string[]>
): Candidate[] {
  const usable = (w: string) => usableWord(index, zipf, w);
  const exclude = new Set(cat.originExclude);
  const sets = new Map<string, LangSets>();
  for (const [lang, category] of index.originCategory) {
    const code = cat.langCodes[lang];
    if (!code) continue;
    const template = index.originTemplate.get(code) ?? new Set<string>();
    const core = new Set([...category].filter((w) => template.has(w) && usable(w)));
    const accepted = new Set([...category, ...template].filter(usable));
    sets.set(lang, { core, accepted, category, template });
  }
  const lineageAgrees = (w: string, languages: string[]) => {
    const l = curioLineage.get(w);
    return !l || languages.some((lang) => l.includes(lang));
  };
  const make = (id: string, text: string, languages: string[]): Candidate | null => {
    const members = languages.map((l) => sets.get(l)).filter((s): s is LangSets => !!s);
    if (!members.length) return null;
    const core = [...new Set(members.flatMap((m) => [...m.core]))].filter((w) => lineageAgrees(w, languages)).sort();
    const coreSet = new Set(core);
    const rest = [...new Set(members.flatMap((m) => [...m.accepted]))].filter((w) => !coreSet.has(w))
      .sort((a, b) => (zipf.get(b) ?? 0) - (zipf.get(a) ?? 0));
    return {
      id, base: id, kind: "origin", text, core,
      accepted: [...core, ...rest].slice(0, Math.max(ACCEPTED_CAP, core.length)),
      sources: members.flatMap((m) => [m.category, m.template]),
      anchor: id, senseIds: null, ancestors: new Set(), languages,
    };
  };
  const out: Candidate[] = [];
  for (const lang of [...sets.keys()].sort()) {
    if (exclude.has(lang)) continue;
    const c = make(`origin:${slugify(lang)}`, `Name a word that came to English from ${lang}`, [lang]);
    if (c) out.push(c);
  }
  for (const g of cat.originGroups) {
    const c = make(g.id, g.text, g.languages);
    if (c) out.push(c);
  }
  return out;
}
```

- [ ] **Step 4: Run the test.** Run `npx vitest run scripts/dig/origins.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add scripts/dig/origins.ts scripts/dig/origins.test.ts
git commit -m "feat(dig): origin prompts with grouped languages"
```

---

### Task 8: Floor, aliases, guard and fossil candidates

**Files:**
- Create: `scripts/dig/answers.ts`
- Test: `scripts/dig/answers.test.ts`

**Interfaces:**
- Consumes:
  - `Candidate`, `WiktionaryIndex`, `Wordnet`;
  - `normalizeKey`, `oneEditVariants`, `tierFromZipf`.
- Produces:
  - `type Counts = { core: number; easy: number; rare: number; common: number }`;
  - `counts(c: Candidate, zipf: Map<string, number>): Counts`;
  - `isLetterVariant(c: Candidate): boolean`;
  - `fossilCandidates(c: Candidate, ctx: { wn: Wordnet; index: WiktionaryIndex; zipf: Map<string, number> }): string[]`;
  - `floorProblems(c: Candidate, ctx: { wn; index; zipf }): string[]`;
  - `buildAliases(accepted: string[], index: WiktionaryIndex, wn: Wordnet): Record<string, number>`;
  - `buildGuard(accepted: string[], aliases: Record<string, number>, lexicon: Set<string>): string[]`.

- [ ] **Step 1: Write the failing test** in `scripts/dig/answers.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOewn } from "./sources/oewn";
import { indexWiktionary } from "./wiktionary";
import { buildAliases, buildGuard, counts, floorProblems, fossilCandidates } from "./answers";
import type { Candidate } from "./themes";

const wn = parseOewn(readFileSync(path.join(__dirname, "fixtures/oewn-mini.xml"), "utf8"));
const cand = (core: string[], over: Partial<Candidate> = {}): Candidate => ({
  id: "theme:fruits", base: "theme:fruits", kind: "theme", text: "Name a fruit", core, accepted: core,
  sources: [], anchor: "oewn-fruit-n-1", senseIds: new Set(["oewn-fruit-n-1", "oewn-apple-n-1", "oewn-citrus-n-1", "oewn-lemon-n-1"]),
  ancestors: new Set(), languages: [], ...over,
});

describe("counts and floor", () => {
  it("counts easy (Zipf ≥ 3.5) and rare (< 2.3 or missing) answers", () => {
    const zipf = new Map([["apple", 4.5], ["lemon", 3.6], ["quince", 2.0]]);
    expect(counts(cand(["apple", "lemon", "quince", "medlar"]), zipf)).toEqual({ core: 4, easy: 2, rare: 2, common: 1 });
  });
  it("explains why a small prompt fails", async () => {
    const index = await indexWiktionary([], new Set());
    const problems = floorProblems(cand(["apple"]), { wn, index, zipf: new Map() });
    expect(problems).toEqual(expect.arrayContaining(["core 1 < 40", "easy 0 < 8", "rare 1 < 10", "no fossil"]));
  });
});

describe("fossilCandidates", () => {
  it("needs a rare single word of 4–14 letters whose first sense is the theme sense", async () => {
    const index = await indexWiktionary(
      ["lemon", "apple", "keel"].map((w) => ({ w, pos: "noun", t: [], c: [], g: [], e: [], f: [], n: 1, et: "" })),
      new Set()
    );
    const zipf = new Map([["apple", 4.5], ["lemon", 2.0], ["keel", 1.9]]);
    expect(fossilCandidates(cand(["apple", "lemon", "keel"]), { wn, index, zipf })).toEqual(["lemon"]);
  });
});

describe("aliases and guard", () => {
  it("adds Wiktextract forms and WordNet UK/US variants as normalised keys", async () => {
    const index = await indexWiktionary(
      [{ w: "colour", pos: "noun", t: [], c: [], g: [], e: [], f: ["colours"], n: 1, et: "" }],
      new Set()
    );
    expect(buildAliases(["colour"], index, wn)).toEqual({ colours: 0, color: 0 });
  });
  it("guards real words one edit from any key, excluding the prompt's own keys", () => {
    const lexicon = new Set(["keel", "heel", "peel", "kneel", "zebra", "keels"]);
    expect(buildGuard(["keel"], { keels: 0 }, lexicon).sort()).toEqual(["heel", "kneel", "peel"]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run scripts/dig/answers.test.ts`. Expected: FAIL.

- [ ] **Step 3: Write `scripts/dig/answers.ts`:**

```ts
import { normalizeKey } from "../../lib/dig/normalize";
import { oneEditVariants } from "../../lib/dig/match";
import type { Wordnet } from "./sources/oewn";
import type { Candidate } from "./themes";
import type { WiktionaryIndex } from "./wiktionary";

export type Counts = { core: number; easy: number; rare: number; common: number };
type Ctx = { wn: Wordnet; index: WiktionaryIndex; zipf: Map<string, number> };

export const isLetterVariant = (c: Candidate) => c.id.split(":").length === 3 && c.kind === "theme";

export function counts(c: Candidate, zipf: Map<string, number>): Counts {
  let easy = 0, rare = 0, common = 0;
  for (const w of c.core) {
    const z = zipf.get(w);
    if (z !== undefined && z >= 3.5) easy++;
    if (z === undefined || z < 2.3) rare++;
    if (z !== undefined && z >= 4) common++;
  }
  return { core: c.core.length, easy, rare, common };
}

/** pipeline-design §7 step 1, minus the date-dependent and pageview rules (fossil.ts). */
export function fossilCandidates(c: Candidate, { wn, index, zipf }: Ctx): string[] {
  return c.core.filter((w) => {
    const z = zipf.get(w);
    if (z !== undefined && z >= 2.3) return false;
    if (!/^[a-z]{4,14}$/.test(w)) return false;
    const info = index.info.get(w);
    if (!info || info.obsolete || info.offensive) return false;
    if (c.senseIds) {
      const first = wn.synsetsOf.get(w)?.[0];
      if (!first || !c.senseIds.has(first)) return false;
    }
    return true;
  });
}

export function floorProblems(c: Candidate, ctx: Ctx): string[] {
  const n = counts(c, ctx.zipf);
  const [minCore, minEasy, minRare] = isLetterVariant(c) ? [25, 3, 5] : [40, 8, 10];
  const problems: string[] = [];
  if (n.core < minCore) problems.push(`core ${n.core} < ${minCore}`);
  if (n.easy < minEasy) problems.push(`easy ${n.easy} < ${minEasy}`);
  if (n.rare < minRare) problems.push(`rare ${n.rare} < ${minRare}`);
  if (c.kind === "origin" && n.common > 300) problems.push(`common ${n.common} > 300`);
  if (fossilCandidates(c, ctx).length === 0) problems.push("no fossil");
  return problems;
}

/** Irregular plurals, alternative forms and UK/US spellings → answer index. Regular plurals
 * are handled in the browser by guessForms. A key already owned by an answer is skipped. */
export function buildAliases(accepted: string[], index: WiktionaryIndex, wn: Wordnet): Record<string, number> {
  const own = new Set(accepted.map(normalizeKey));
  const aliases: Record<string, number> = {};
  accepted.forEach((w, i) => {
    const forms = [...(index.info.get(w)?.aliases ?? []), ...(wn.spellingVariants.get(w) ?? [])];
    for (const f of forms) {
      const k = normalizeKey(f);
      if (k && !own.has(k) && !(k in aliases)) aliases[k] = i;
    }
  });
  return aliases;
}

/** Real English words one edit from any answer or alias key (≥ 4 letters), minus the
 * prompt's own keys: the browser never offers these as near misses. */
export function buildGuard(accepted: string[], aliases: Record<string, number>, lexicon: Set<string>): string[] {
  const keys = new Set([...accepted.map(normalizeKey), ...Object.keys(aliases)]);
  const guard = new Set<string>();
  for (const k of keys) {
    if (k.length < 4) continue;
    for (const v of oneEditVariants(k)) if (lexicon.has(v) && !keys.has(v)) guard.add(v);
  }
  return [...guard].sort();
}
```

- [ ] **Step 4: Run the test.** Run `npx vitest run scripts/dig/answers.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add scripts/dig/answers.ts scripts/dig/answers.test.ts
git commit -m "feat(dig): publishing floor, aliases, guard and fossil candidates"
```

---

### Task 9: Pageviews, popular picks, fossil choice and the prompt secret

**Files:**
- Create: `scripts/dig/pageviews.ts`, `scripts/dig/fossil.ts`
- Test: `scripts/dig/fossil.test.ts`

**Interfaces:**
- Consumes:
  - `fetchMonthlyViews` and `lastCompleteMonths` (`scripts/demand/wiktionary.ts`), `FetchLike`;
  - `tierFromZipf`, `PromptSecret`, `DigPromptPlain`, `Tier`;
  - `Candidate`, `fossilCandidates`, `buildAliases`, `buildGuard`.
- Produces:
  - `yearlyViews(words: string[], opts: { fetcher: FetchLike; cachePath: string; now: Date }): Promise<Map<string, number>>`;
  - `assignTiers(c: Candidate, zipf: Map<string, number>, views: Map<string, number>): Map<string, Tier>`;
  - `etymologyFact(text: string): string | null`;
  - `chooseFossil(c: Candidate, ctx: FossilCtx): DigFossil | null`, where
    `FossilCtx = { candidates: string[]; tiers: Map<string, Tier>; views: Map<string, number>; curio: Map<string, { slug: string; teaser: string }>; definitions: Map<string, string>; etymology: (w: string) => string; exclude: Set<string> }`;
  - `toPlainPrompt(c: Candidate, tiers: Map<string, Tier>, fossil: DigFossil, aliases: Record<string, number>, guard: string[], curio: Map<string, { slug: string }>): DigPromptPlain`;
  - `viewWordsFor(c: Candidate, zipf: Map<string, number>, seed: number): string[]` (the words whose views matter).

- [ ] **Step 1: Write the failing test** in `scripts/dig/fossil.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assignTiers, chooseFossil, etymologyFact, toPlainPrompt } from "./fossil";
import type { Candidate } from "./themes";

const c: Candidate = {
  id: "theme:sailing", base: "theme:sailing", kind: "theme", text: "Name a word from sailing",
  core: ["sail", "keel", "halyard", "gunwale", "bowsprit", "petrichor"], accepted: ["sail", "keel", "halyard", "gunwale", "bowsprit", "petrichor", "boom"],
  sources: [], anchor: "x", senseIds: null, ancestors: new Set(), languages: [],
};
const zipf = new Map([["sail", 4.01], ["keel", 3.19], ["halyard", 1.99], ["gunwale", 1.65], ["bowsprit", 1.5], ["petrichor", 1.9], ["boom", 4.2]]);

describe("assignTiers", () => {
  it("promotes at most two famous rare words to Popular pick", () => {
    const views = new Map([["halyard", 1300], ["gunwale", 900], ["bowsprit", 2000], ["petrichor", 45000]]);
    const t = assignTiers(c, zipf, views);
    expect(t.get("sail")).toBe("common");
    expect(t.get("keel")).toBe("familiar");
    expect(t.get("petrichor")).toBe("popular");
    expect(t.get("halyard")).toBe("rare");
    expect(t.get("boom")).toBe("common");
  });
});

describe("etymologyFact", () => {
  it("keeps the first clause and caps at 140 characters", () => {
    expect(etymologyFact("From Middle English halier, from halen (“to haul”). Compare Dutch.")).toBe("From Middle English halier, from halen (“to haul”)");
    expect(etymologyFact("")).toBeNull();
    expect(etymologyFact("x ".repeat(100))!.length).toBeLessThanOrEqual(140);
  });
});

describe("chooseFossil", () => {
  const base = {
    candidates: ["halyard", "gunwale", "bowsprit"],
    tiers: new Map([["halyard", "rare" as const], ["gunwale", "rare" as const], ["bowsprit", "rare" as const]]),
    views: new Map([["halyard", 1300], ["gunwale", 900], ["bowsprit", 2000]]),
    definitions: new Map<string, string>(),
    etymology: (w: string) => (w === "bowsprit" ? "From Middle Low German bōchsprēt." : ""),
    exclude: new Set<string>(),
  };
  it("prefers a Curio story word, using its teaser", () => {
    const curio = new Map([["gunwale", { slug: "gunwale", teaser: "Once the plank that held the guns." }]]);
    expect(chooseFossil(c, { ...base, curio })).toEqual({ word: "gunwale", fact: "Once the plank that held the guns.", story: "gunwale" });
  });
  it("otherwise takes the most-viewed candidate with an etymology fact", () => {
    expect(chooseFossil(c, { ...base, curio: new Map() })).toEqual({ word: "bowsprit", fact: "From Middle Low German bōchsprēt" });
  });
  it("skips excluded words and returns null when nothing is left", () => {
    expect(chooseFossil(c, { ...base, curio: new Map(), exclude: new Set(["halyard", "gunwale", "bowsprit"]) })).toBeNull();
  });
});

describe("toPlainPrompt", () => {
  it("marks the fossil, core flags and story links", () => {
    const tiers = assignTiers(c, zipf, new Map());
    const p = toPlainPrompt(c, tiers, { word: "halyard", fact: "f" }, { halyards: 2 }, ["heel"], new Map([["keel", { slug: "keel" }]]));
    expect(p.answers.find((a) => a[0] === "halyard")).toEqual(["halyard", "fossil", 1]);
    expect(p.answers.find((a) => a[0] === "boom")).toEqual(["boom", "common", 0]);
    expect(p.stories).toEqual({ keel: "keel" });
    expect(p.aliases).toEqual({ halyards: 2 });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run scripts/dig/fossil.test.ts`. Expected: FAIL.

- [ ] **Step 3: Write `scripts/dig/pageviews.ts`:**

```ts
// Yearly Wiktionary pageviews per word: the "Popular pick" signal and the fossil tie-break.
// Cached for 180 days in one JSON file, so only new words cost a request.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FetchLike } from "../demand/http";
import { fetchMonthlyViews, lastCompleteMonths } from "../demand/wiktionary";

const STALE_MS = 180 * 24 * 60 * 60 * 1000;
type Cache = Record<string, { views: number; at: string }>;

export async function yearlyViews(words: string[], opts: { fetcher: FetchLike; cachePath: string; now: Date }): Promise<Map<string, number>> {
  const cache: Cache = existsSync(opts.cachePath) ? JSON.parse(readFileSync(opts.cachePath, "utf8")) : {};
  const months = lastCompleteMonths(opts.now, 12);
  const out = new Map<string, number>();
  let fetched = 0;
  for (const w of [...new Set(words)]) {
    const hit = cache[w];
    if (hit && opts.now.getTime() - Date.parse(hit.at) < STALE_MS) { out.set(w, hit.views); continue; }
    const views = (await fetchMonthlyViews(w, months, opts.fetcher)).reduce((a, b) => a + b, 0);
    cache[w] = { views, at: opts.now.toISOString() };
    out.set(w, views);
    if (++fetched % 500 === 0) writeFileSync(opts.cachePath, JSON.stringify(cache));
  }
  mkdirSync(path.dirname(opts.cachePath), { recursive: true });
  writeFileSync(opts.cachePath, JSON.stringify(cache));
  return out;
}
```

- [ ] **Step 4: Write `scripts/dig/fossil.ts`:**

```ts
import { tierFromZipf } from "../../lib/dig/score";
import type { DigFossil, DigPromptPlain, Tier } from "../../lib/dig/types";
import type { Candidate } from "./themes";

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The words whose pageviews we need: up to 60 rare core words for the median (seeded
 * sample) plus up to 150 Uncommon/Rare core words with Zipf ≥ 1.3, the plausible famous ones. */
export function viewWordsFor(c: Candidate, zipf: Map<string, number>, seed: number): string[] {
  const rare = c.core.filter((w) => (zipf.get(w) ?? 0) < 2.3);
  let s = seed >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const sample = [...rare].sort(() => rand() - 0.5).slice(0, 60);
  const famous = c.core.filter((w) => { const z = zipf.get(w) ?? 0; return z < 3 && z >= 1.3; })
    .sort((a, b) => (zipf.get(b) ?? 0) - (zipf.get(a) ?? 0)).slice(0, 150);
  return [...new Set([...sample, ...famous])];
}

/** pipeline-design §6: absolute Zipf tiers, then at most two Uncommon/Rare core words whose
 * views are ≥ 4× the median of the prompt's rare words become Popular picks. */
export function assignTiers(c: Candidate, zipf: Map<string, number>, views: Map<string, number>): Map<string, Tier> {
  const tiers = new Map<string, Tier>();
  for (const w of c.accepted) tiers.set(w, tierFromZipf(zipf.get(w)));
  const rareViews = c.core.filter((w) => tiers.get(w) === "rare" && views.has(w)).map((w) => views.get(w)!);
  const m = median(rareViews);
  if (m > 0) {
    c.core
      .filter((w) => (tiers.get(w) === "rare" || tiers.get(w) === "uncommon") && (views.get(w) ?? 0) >= 4 * m)
      .sort((a, b) => (views.get(b) ?? 0) - (views.get(a) ?? 0) || a.localeCompare(b))
      .slice(0, 2)
      .forEach((w) => tiers.set(w, "popular"));
  }
  return tiers;
}

const MAX_FACT = 140;

/** The first clause of a Wiktionary etymology, trimmed to 140 characters, or null. */
export function etymologyFact(text: string): string | null {
  const first = text.trim().split(/(?<=[.;])\s/)[0]?.replace(/[.;]\s*$/, "").trim() ?? "";
  if (!first) return null;
  if (first.length <= MAX_FACT) return first;
  const cut = first.slice(0, MAX_FACT - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : cut.length)}…`;
}

export type FossilCtx = {
  candidates: string[];
  tiers: Map<string, Tier>;
  views: Map<string, number>;
  curio: Map<string, { slug: string; teaser: string }>;
  definitions: Map<string, string>;
  etymology: (w: string) => string;
  /** Today's/tomorrow's daily word and /play answer, fossils already used today, and this
   * prompt's previous fossils. */
  exclude: Set<string>;
};

/** pipeline-design §7: a Curio story word if any candidate is one (its teaser is the fact),
 * else the most-viewed candidate that has a sourced fact. Ties go to the alphabetical first. */
export function chooseFossil(_c: Candidate, ctx: FossilCtx): DigFossil | null {
  const pool = ctx.candidates
    .filter((w) => !ctx.exclude.has(w) && ctx.tiers.get(w) !== "popular")
    .sort((a, b) => (ctx.views.get(b) ?? 0) - (ctx.views.get(a) ?? 0) || a.localeCompare(b));
  const curioPick = pool.find((w) => ctx.curio.has(w));
  if (curioPick) {
    const entry = ctx.curio.get(curioPick)!;
    return { word: curioPick, fact: entry.teaser.slice(0, MAX_FACT), story: entry.slug };
  }
  for (const w of pool) {
    const fact = etymologyFact(ctx.etymology(w)) ?? (ctx.definitions.get(w) ? etymologyFact(ctx.definitions.get(w)!) : null);
    if (fact) return { word: w, fact };
  }
  return null;
}

export function toPlainPrompt(
  c: Candidate,
  tiers: Map<string, Tier>,
  fossil: DigFossil,
  aliases: Record<string, number>,
  guard: string[],
  curio: Map<string, { slug: string }>
): DigPromptPlain {
  const core = new Set(c.core);
  const stories: Record<string, string> = {};
  for (const w of c.core) { const s = curio.get(w); if (s) stories[w] = s.slug; }
  return {
    id: c.id, kind: c.kind, text: c.text,
    answers: c.accepted.map((w) => [w, w === fossil.word ? "fossil" : tiers.get(w)!, core.has(w) ? 1 : 0]),
    aliases, guard, fossil, stories,
  };
}
```

- [ ] **Step 5: Run the test.** Run `npx vitest run scripts/dig/fossil.test.ts`. Expected: PASS.
- [ ] **Step 6: Commit.**

```bash
git add scripts/dig/pageviews.ts scripts/dig/fossil.ts scripts/dig/fossil.test.ts
git commit -m "feat(dig): popular picks, fossil choice and prompt assembly"
```

---

### Task 10: Day assembly (cooldowns, families, overlap, order)

**Files:**
- Create: `scripts/dig/assemble.ts`
- Test: `scripts/dig/assemble.test.ts`

**Interfaces:**
- Consumes: `Candidate`, `counts`; `hashSeed` and `mulberry32` from `lib/words.ts` (scripts may import it).
- Produces:
  - `type HistoryDay = { date: string; prompts: { id: string; base: string; fossil: string; languages?: string[] }[] }`;
  - `daysBetween(a: string, b: string): number`;
  - `isEligible(c: Candidate, date: string, history: HistoryDay[]): boolean`;
  - `overlapRatio(a: string[], b: string[]): number`;
  - `sameFamily(a: Candidate, b: Candidate): boolean`;
  - `pickDay(date: string, pools: { themes: Candidate[]; origins: Candidate[] }, history: HistoryDay[], zipf: Map<string, number>, salt?: number): Candidate[] | null` (returns the 7 prompts in play order).

- [ ] **Step 1: Write the failing test** in `scripts/dig/assemble.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { daysBetween, isEligible, overlapRatio, pickDay, sameFamily, type HistoryDay } from "./assemble";
import type { Candidate } from "./themes";

const mk = (id: string, kind: "theme" | "origin", core: string[], over: Partial<Candidate> = {}): Candidate => ({
  id, base: id, kind, text: id, core, accepted: core, sources: [], anchor: id, senseIds: null, ancestors: new Set(), languages: kind === "origin" ? [id] : [], ...over,
});
const words = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe("cooldowns", () => {
  const history: HistoryDay[] = [{ date: "2026-12-01", prompts: [{ id: "theme:birds:c", base: "theme:birds", fossil: "chough" }, { id: "origin:arabic", base: "origin:arabic", fossil: "alembic", languages: ["Arabic"] }] }];
  it("blocks an exact prompt for 90 days and its base theme for 30", () => {
    expect(daysBetween("2026-12-01", "2026-12-31")).toBe(30);
    expect(isEligible(mk("theme:birds:c", "theme", []), "2027-03-01", history)).toBe(true); // 90 days on
    expect(isEligible(mk("theme:birds:c", "theme", []), "2027-02-27", history)).toBe(false); // 88 days on
    expect(isEligible(mk("theme:birds", "theme", []), "2026-12-20", history)).toBe(false);
    expect(isEligible(mk("theme:birds", "theme", []), "2026-12-31", history)).toBe(true);
  });
  it("blocks an origin language for 14 days, including inside a group", () => {
    expect(isEligible(mk("origin:group:x", "origin", [], { languages: ["Persian", "Arabic"] }), "2026-12-10", history)).toBe(false);
    expect(isEligible(mk("origin:group:y", "origin", [], { languages: ["Arabic"] }), "2026-12-15", history)).toBe(true);
  });
});

describe("overlap and families", () => {
  it("measures overlap against the smaller core", () => {
    expect(overlapRatio(["a", "b", "c", "d"], ["a", "x"])).toBe(0.5);
  });
  it("treats ancestor anchors and shared bases as one family", () => {
    const fruit = mk("theme:fruits", "theme", [], { anchor: "fruit" });
    const citrus = mk("theme:citrus", "theme", [], { anchor: "citrus", ancestors: new Set(["fruit"]) });
    expect(sameFamily(fruit, citrus)).toBe(true);
    expect(sameFamily(mk("theme:birds:c", "theme", [], { base: "theme:birds" }), mk("theme:birds", "theme", []))).toBe(true);
    expect(sameFamily(fruit, mk("theme:fish", "theme", []))).toBe(false);
  });
});

describe("pickDay", () => {
  const zipf = new Map<string, number>();
  const themes = ["a", "b", "c", "d", "e", "f"].map((p, i) => {
    const core = words(p, 50);
    core.slice(0, 10 + i).forEach((w) => zipf.set(w, 4));
    return mk(`theme:${p}`, "theme", core);
  });
  const origins = ["x", "y", "z"].map((p) => mk(`origin:${p}`, "origin", words(p, 50)));
  it("picks 5 themes and 2 origins, origins at positions 3 and 6, easiest theme first", () => {
    const day = pickDay("2026-12-05", { themes, origins }, [], zipf)!;
    expect(day.map((c) => c.kind)).toEqual(["theme", "theme", "origin", "theme", "theme", "origin", "theme"]);
    const easy = (c: Candidate) => c.core.filter((w) => (zipf.get(w) ?? 0) >= 3.5).length;
    const themesOnDay = day.filter((c) => c.kind === "theme");
    expect(easy(day[0])).toBe(Math.max(...themesOnDay.map(easy)));
  });
  it("is deterministic and returns null when supply is too thin", () => {
    expect(pickDay("2026-12-05", { themes, origins }, [], zipf)!.map((c) => c.id)).toEqual(pickDay("2026-12-05", { themes, origins }, [], zipf)!.map((c) => c.id));
    expect(pickDay("2026-12-05", { themes: themes.slice(0, 4), origins }, [], zipf)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run scripts/dig/assemble.test.ts`. Expected: FAIL.

- [ ] **Step 3: Write `scripts/dig/assemble.ts`:**

```ts
import { hashSeed, mulberry32 } from "../../lib/words";
import type { Candidate } from "./themes";

export type HistoryDay = { date: string; prompts: { id: string; base: string; fossil: string; languages?: string[] }[] };

const DAY = 24 * 60 * 60 * 1000;
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

const EXACT_DAYS = 90, BASE_DAYS = 30, LANGUAGE_DAYS = 14, MAX_OVERLAP = 0.2;

/** pipeline-design §3a fix 4: exact prompt 90 days, base theme 30, origin language 14. */
export function isEligible(c: Candidate, date: string, history: HistoryDay[]): boolean {
  for (const h of history) {
    const gap = Math.abs(daysBetween(h.date, date));
    for (const p of h.prompts) {
      if (p.id === c.id && gap < EXACT_DAYS) return false;
      if (c.kind === "theme" && p.base === c.base && gap < BASE_DAYS) return false;
      if (c.kind === "origin" && gap < LANGUAGE_DAYS && (p.languages ?? []).some((l) => c.languages.includes(l))) return false;
    }
  }
  return true;
}

export function overlapRatio(a: string[], b: string[]): number {
  const small = a.length <= b.length ? a : b;
  const big = new Set(a.length <= b.length ? b : a);
  if (!small.length) return 0;
  return small.filter((w) => big.has(w)).length / small.length;
}

export function sameFamily(a: Candidate, b: Candidate): boolean {
  if (a.base === b.base) return true;
  return a.ancestors.has(b.anchor) || b.ancestors.has(a.anchor);
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A seeded greedy draw (same inputs, same day). The fossil is chosen later; a day whose
 * fossils can't all be distinct is retried by the caller with another salt. */
export function pickDay(
  date: string,
  pools: { themes: Candidate[]; origins: Candidate[] },
  history: HistoryDay[],
  zipf: Map<string, number>,
  salt = 0
): Candidate[] | null {
  const rand = mulberry32(hashSeed(`dig-${date}-${salt}`));
  const chosen: Candidate[] = [];
  const fits = (c: Candidate) =>
    chosen.every((o) => !sameFamily(o, c) && overlapRatio(o.core, c.core) < MAX_OVERLAP && !o.languages.some((l) => c.languages.includes(l)));
  for (const c of shuffle(pools.themes.filter((t) => isEligible(t, date, history)), rand)) {
    if (chosen.length === 5) break;
    if (fits(c)) chosen.push(c);
  }
  if (chosen.length < 5) return null;
  const origins: Candidate[] = [];
  for (const c of shuffle(pools.origins.filter((o) => isEligible(o, date, history)), rand)) {
    if (origins.length === 2) break;
    if (fits(c) && origins.every((o) => !o.languages.some((l) => c.languages.includes(l)))) origins.push(c);
  }
  if (origins.length < 2) return null;
  const easy = (c: Candidate) => c.core.filter((w) => (zipf.get(w) ?? 0) >= 3.5).length;
  const rare = (c: Candidate) => c.core.filter((w) => (zipf.get(w) ?? 0) < 2.3).length;
  const themes = [...chosen].sort((a, b) => easy(b) - easy(a) || a.id.localeCompare(b.id));
  const first = themes.shift()!;
  themes.sort((a, b) => rare(a) - rare(b) || a.id.localeCompare(b.id));
  const last = themes.pop()!;
  return [first, themes[0], origins[0], themes[1], themes[2], origins[1], last];
}
```

- [ ] **Step 4: Run the test.** Run `npx vitest run scripts/dig/assemble.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add scripts/dig/assemble.ts scripts/dig/assemble.test.ts
git commit -m "feat(dig): seeded day assembly with cooldowns and overlap rules"
```

---

### Task 11: Day validation

**Files:**
- Create: `scripts/dig/validate.ts`
- Test: `scripts/dig/validate.test.ts`

**Interfaces:**
- Consumes:
  - `DigDayPlain`, `encodeDay`, `buildLookup`, `checkGuess`, `normalizeKey`, `oneEditVariants`;
  - `HistoryDay`, `daysBetween`, `overlapRatio`.
- Produces:
  - `type ValidateCtx = { history: HistoryDay[]; storySlugs: Set<string>; dailyWords: Set<string>; blocked: Set<string> }`;
  - `validateDay(day: DigDayPlain, ctx: ValidateCtx): string[]` (an empty array means valid);
  - `MAX_DAY_CHARS = 400_000`.

- [ ] **Step 1: Write the failing test** in `scripts/dig/validate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateDay } from "./validate";
import type { DigDayPlain, DigPromptPlain, Tier } from "../../lib/dig/types";

function prompt(id: string, kind: "theme" | "origin", prefix: string): DigPromptPlain {
  const answers: [string, Tier, 0 | 1][] = Array.from({ length: 45 }, (_, i) => [`${prefix}${"abcdefghijklmnopqrstuvwxyz"[i % 26]}${"abcdefghijklmnopqrstuvwxyz"[Math.floor(i / 26)]}word`, i < 10 ? "common" : i < 25 ? "rare" : "uncommon", 1]);
  answers[30][1] = "fossil";
  return { id, kind, text: `Name ${id}`, answers, aliases: {}, guard: [], fossil: { word: answers[30][0], fact: "A fact." }, stories: {} };
}
const good = (): DigDayPlain => ({
  v: 1, date: "2026-12-05", rejSample: 1,
  prompts: [prompt("theme:a", "theme", "a"), prompt("theme:b", "theme", "b"), prompt("origin:x", "origin", "x"), prompt("theme:c", "theme", "c"), prompt("theme:d", "theme", "d"), prompt("origin:y", "origin", "y"), prompt("theme:e", "theme", "e")],
});
const ctx = { history: [], storySlugs: new Set<string>(), dailyWords: new Set<string>(), blocked: new Set<string>() };

describe("validateDay", () => {
  it("passes a well-formed day", () => {
    expect(validateDay(good(), ctx)).toEqual([]);
  });
  it("catches wrong mix and positions", () => {
    const d = good();
    [d.prompts[2], d.prompts[3]] = [d.prompts[3], d.prompts[2]];
    expect(validateDay(d, ctx)).toContain("origins must be at positions 3 and 6");
  });
  it("catches a bad fossil, an unknown story slug and a blocked word", () => {
    const d = good();
    d.prompts[0].fossil.fact = "";
    d.prompts[1].stories = { bawordx: "no-such-slug" };
    d.prompts[3].answers[0][0] = "badword";
    const problems = validateDay(d, { ...ctx, blocked: new Set(["badword"]) });
    expect(problems).toEqual(expect.arrayContaining([
      "theme:a: fossil fact must be 1–140 characters",
      "theme:b: unknown story slug no-such-slug",
      "theme:c: blocked word",
    ]));
  });
  it("catches overlap, duplicate fossils and daily-word clashes", () => {
    const d = good();
    d.prompts[1] = { ...prompt("theme:b", "theme", "a") };
    const problems = validateDay(d, { ...ctx, dailyWords: new Set([d.prompts[4].fossil.word]) });
    expect(problems).toEqual(expect.arrayContaining(["theme:a and theme:b overlap ≥ 20%", "fossils must all differ", "theme:d: fossil clashes with the daily word or /play"]));
  });
  it("catches an answer key that hides a different tier", () => {
    const d = good();
    d.prompts[0].answers.push(["Aa-aword", "rare", 1]);
    d.prompts[0].answers[0] = ["aaaword", "common", 1];
    expect(validateDay(d, ctx)).toContain("theme:a: key aaaword has two tiers");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run scripts/dig/validate.test.ts`. Expected: FAIL.

- [ ] **Step 3: Write `scripts/dig/validate.ts`:**

```ts
import { buildLookup, checkGuess, oneEditVariants } from "../../lib/dig/match";
import { normalizeKey } from "../../lib/dig/normalize";
import { encodeDay } from "../../lib/dig/payload";
import type { DigDayPlain } from "../../lib/dig/types";
import { daysBetween, overlapRatio, type HistoryDay } from "./assemble";

export const MAX_DAY_CHARS = 400_000;
export type ValidateCtx = { history: HistoryDay[]; storySlugs: Set<string>; dailyWords: Set<string>; blocked: Set<string> };

/** pipeline-design §10, run on every generated day. Returns human-readable problems
 * (counts and ids only, never answer text, because the job summary is public). */
export function validateDay(day: DigDayPlain, ctx: ValidateCtx): string[] {
  const problems: string[] = [];
  const ps = day.prompts;
  if (ps.length !== 7) problems.push("a day needs 7 prompts");
  if (ps.filter((p) => p.kind === "origin").length !== 2) problems.push("a day needs exactly 2 origin prompts");
  if (ps[2]?.kind !== "origin" || ps[5]?.kind !== "origin") problems.push("origins must be at positions 3 and 6");
  if (new Set(ps.map((p) => p.id)).size !== ps.length) problems.push("prompt ids must be unique");

  for (const p of ps) {
    const isLetter = p.id.split(":").length === 3 && p.kind === "theme";
    const core = p.answers.filter((a) => a[2] === 1);
    const easyish = core.filter((a) => a[1] === "common" || a[1] === "familiar").length;
    const rareish = core.filter((a) => a[1] === "rare" || a[1] === "popular" || a[1] === "fossil").length;
    const [minCore, minEasy, minRare] = isLetter ? [25, 3, 5] : [40, 8, 10];
    if (!p.text.trim()) problems.push(`${p.id}: empty prompt text`);
    if (core.length < minCore) problems.push(`${p.id}: core ${core.length} < ${minCore}`);
    if (easyish < minEasy) problems.push(`${p.id}: too few easy answers`);
    if (rareish < minRare) problems.push(`${p.id}: too few rare answers`);
    if (p.fossil.fact.length < 1 || p.fossil.fact.length > 140) problems.push(`${p.id}: fossil fact must be 1–140 characters`);
    const fossilIndex = p.answers.findIndex((a) => a[0] === p.fossil.word);
    if (fossilIndex < 0 || p.answers[fossilIndex][1] !== "fossil" || p.answers[fossilIndex][2] !== 1) problems.push(`${p.id}: fossil missing from core`);
    if (p.answers.filter((a) => a[1] === "fossil").length !== 1) problems.push(`${p.id}: exactly one fossil`);
    if (p.fossil.story && !ctx.storySlugs.has(p.fossil.story)) problems.push(`${p.id}: unknown story slug ${p.fossil.story}`);
    for (const slug of Object.values(p.stories)) if (!ctx.storySlugs.has(slug)) problems.push(`${p.id}: unknown story slug ${slug}`);
    if (p.answers.some((a) => ctx.blocked.has(a[0]) || ctx.blocked.has(normalizeKey(a[0])))) problems.push(`${p.id}: blocked word`);
    if (ctx.dailyWords.has(p.fossil.word)) problems.push(`${p.id}: fossil clashes with the daily word or /play`);

    // Matching self-test: every answer and alias finds itself; no key hides a second tier;
    // simulated fossil typos land on the fossil or nowhere.
    const lookup = buildLookup(p);
    const seen = new Map<string, number>();
    p.answers.forEach((a, i) => {
      const k = normalizeKey(a[0]);
      const prev = seen.get(k);
      if (prev !== undefined && p.answers[prev][1] !== a[1]) problems.push(`${p.id}: key ${k} has two tiers`);
      if (prev === undefined) seen.set(k, i);
      const r = checkGuess(lookup, a[0]);
      if (r.kind !== "match" || p.answers[r.index][1] !== a[1]) problems.push(`${p.id}: answer ${i} does not match itself`);
    });
    for (const [k, i] of Object.entries(p.aliases)) {
      const r = checkGuess(lookup, k);
      if (r.kind !== "match" || r.index !== lookup.keys.get(k)) problems.push(`${p.id}: alias ${i} does not match`);
    }
    if (fossilIndex >= 0) {
      const fk = normalizeKey(p.fossil.word);
      for (const v of [...oneEditVariants(fk)].slice(0, 60)) {
        const r = checkGuess(lookup, v);
        if ((r.kind === "near" || r.kind === "match") && p.answers[r.index][0] !== p.fossil.word && normalizeKey(p.answers[r.index][0]) !== v) {
          problems.push(`${p.id}: a fossil typo resolves to another answer`);
          break;
        }
      }
    }
  }

  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i].answers.filter((x) => x[2] === 1).map((x) => x[0]);
    const b = ps[j].answers.filter((x) => x[2] === 1).map((x) => x[0]);
    if (overlapRatio(a, b) >= 0.2) problems.push(`${ps[i].id} and ${ps[j].id} overlap ≥ 20%`);
  }
  if (new Set(ps.map((p) => p.fossil.word)).size !== ps.length) problems.push("fossils must all differ");
  for (const h of ctx.history) {
    const gap = Math.abs(daysBetween(h.date, day.date));
    for (const hp of h.prompts) for (const p of ps) {
      if (hp.id === p.id && gap < 90) problems.push(`${p.id}: repeats within 90 days`);
      if (hp.id === p.id && hp.fossil === p.fossil.word) problems.push(`${p.id}: repeats a previous fossil`);
    }
  }
  if (JSON.stringify(encodeDay(day)).length > MAX_DAY_CHARS) problems.push(`day is larger than ${MAX_DAY_CHARS} characters`);
  return problems;
}
```

- [ ] **Step 4: Run the test.** Run `npx vitest run scripts/dig/validate.test.ts`. Expected: PASS.
  - The fixture answers like `aabword` are distinct, so the near-miss self-test doesn't fire on them.
  - If it does, check that the fixture fossil's one-edit variants don't hit another fixture answer, and adjust
    the fixture's prefix letters rather than the validator.
- [ ] **Step 5: Commit.**

```bash
git add scripts/dig/validate.ts scripts/dig/validate.test.ts
git commit -m "feat(dig): day validation"
```

---

### Task 12: Redis keys, the manifest and the two sinks

**Files:**
- Create: `lib/dig/keys.ts`, `scripts/dig/sink.ts`
- Modify: `.gitignore` (add `.dig-out/` and `dig-data/`)
- Test: `scripts/dig/sink.test.ts`

**Interfaces:**
- Consumes: `DigDay`, `HistoryDay`.
- Produces:
  - `digKeys` (see the code);
  - `type DigManifest = { v: 1; lastRun: string; days: Record<string, HistoryDay["prompts"]>; poolThemes: number; poolOrigins: number }`;
  - `historyFromManifest(m: DigManifest | null): HistoryDay[]`;
  - `interface DigSink`, `class FileSink`, `class RedisSink` (`static create(): RedisSink`).

- [ ] **Step 1: Write the failing test** in `scripts/dig/sink.test.ts`:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileSink, RedisSink } from "./sink";
import { digKeys, historyFromManifest } from "../../lib/dig/keys";

describe("digKeys", () => {
  it("keeps every key under curio:dig:", () => {
    const keys = [digKeys.day("2026-12-01"), digKeys.manifest, digKeys.extras, digKeys.adjudicated, digKeys.scores("d"), digKeys.funnel("d"), digKeys.rejected("d", 3), digKeys.claims("d", 3), digKeys.heartbeat, digKeys.usageAlert("2026-12")];
    for (const k of keys) expect(k.startsWith("curio:dig:")).toBe(true);
    expect(digKeys.rejected("2026-12-01", 3)).toBe("curio:dig:rej:2026-12-01:3");
  });
});

describe("FileSink", () => {
  it("round-trips days, manifest, extras and logs", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dig-"));
    const sink = new FileSink(dir);
    expect(await sink.readManifest()).toBeNull();
    await sink.writeDay({ v: 1, date: "2026-12-01", rejSample: 1, prompts: [] });
    expect((await sink.readDay("2026-12-01"))?.date).toBe("2026-12-01");
    await sink.writeManifest({ v: 1, lastRun: "x", days: { "2026-12-01": [{ id: "theme:a", base: "theme:a", fossil: "f" }] }, poolThemes: 1, poolOrigins: 1 });
    expect(historyFromManifest(await sink.readManifest())).toEqual([{ date: "2026-12-01", prompts: [{ id: "theme:a", base: "theme:a", fossil: "f" }] }]);
    await sink.writeExtras({ "theme:a": ["x"] });
    expect(await sink.readExtras()).toEqual({ "theme:a": ["x"] });
    expect(await sink.readLog("rej", "2026-12-01", 0)).toEqual({});
  });
});

describe("RedisSink.create", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("refuses to run outside GitHub Actions", () => {
    vi.stubEnv("GITHUB_ACTIONS", "");
    expect(() => RedisSink.create()).toThrow(/only inside GitHub Actions/);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run scripts/dig/sink.test.ts`. Expected: FAIL.

- [ ] **Step 3: Write `lib/dig/keys.ts`:**

```ts
/** Every Redis key the dig game uses (architecture.md §8). Prefix curio:dig: only. */
export const digKeys = {
  day: (date: string) => `curio:dig:day:${date}`,
  manifest: "curio:dig:manifest",
  /** promptId → accepted-only words added by adjudication */
  extras: "curio:dig:extras",
  /** "promptId|word" decisions already made, so a guess is judged once */
  adjudicated: "curio:dig:adjudicated",
  scores: (date: string) => `curio:dig:scores:${date}`,
  funnel: (date: string) => `curio:dig:funnel:${date}`,
  rejected: (date: string, index: number) => `curio:dig:rej:${date}:${index}`,
  claims: (date: string, index: number) => `curio:dig:claim:${date}:${index}`,
  heartbeat: "curio:dig:health:last",
  /** highest usage alert threshold already sent this month (50 or 70) */
  usageAlert: (month: string) => `curio:dig:health:usage:${month}`,
} as const;

export type ManifestPrompt = { id: string; base: string; fossil: string; languages?: string[] };
export type DigManifest = {
  v: 1;
  lastRun: string;
  /** every built date → its prompts, for cooldowns and the past list */
  days: Record<string, ManifestPrompt[]>;
  poolThemes: number;
  poolOrigins: number;
};

export function historyFromManifest(m: DigManifest | null): { date: string; prompts: ManifestPrompt[] }[] {
  if (!m) return [];
  return Object.entries(m.days).sort(([a], [b]) => a.localeCompare(b)).map(([date, prompts]) => ({ date, prompts }));
}
```

- [ ] **Step 4: Write `scripts/dig/sink.ts`:**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import { digKeys, type DigManifest } from "../../lib/dig/keys";
import type { DigDay } from "../../lib/dig/types";

export interface DigSink {
  readonly name: string;
  readManifest(): Promise<DigManifest | null>;
  writeManifest(m: DigManifest): Promise<void>;
  readDay(date: string): Promise<DigDay | null>;
  writeDay(day: DigDay): Promise<void>;
  readExtras(): Promise<Record<string, string[]>>;
  writeExtras(e: Record<string, string[]>): Promise<void>;
  readAdjudicated(): Promise<string[]>;
  writeAdjudicated(list: string[]): Promise<void>;
  readLog(kind: "rej" | "claim", date: string, index: number): Promise<Record<string, number>>;
  readHeartbeat(): Promise<string | null>;
}

/** Local runs: JSON files under one folder (default .dig-out/, gitignored). The site's
 * dev mode reads days from <dir>/days/<date>.json. */
export class FileSink implements DigSink {
  readonly name = "file";
  constructor(private dir: string) { mkdirSync(path.join(dir, "days"), { recursive: true }); }
  private read<T>(rel: string, fallback: T): T {
    const f = path.join(this.dir, rel);
    return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as T) : fallback;
  }
  private write(rel: string, value: unknown) {
    const f = path.join(this.dir, rel);
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, JSON.stringify(value, null, 1));
  }
  async readManifest() { return this.read<DigManifest | null>("manifest.json", null); }
  async writeManifest(m: DigManifest) { this.write("manifest.json", m); }
  async readDay(date: string) { return this.read<DigDay | null>(`days/${date}.json`, null); }
  async writeDay(day: DigDay) { this.write(`days/${day.date}.json`, day); }
  async readExtras() { return this.read<Record<string, string[]>>("extras.json", {}); }
  async writeExtras(e: Record<string, string[]>) { this.write("extras.json", e); }
  async readAdjudicated() { return this.read<string[]>("adjudicated.json", []); }
  async writeAdjudicated(list: string[]) { this.write("adjudicated.json", list); }
  async readLog(kind: "rej" | "claim", date: string, index: number) { return this.read<Record<string, number>>(`logs/${kind}-${date}-${index}.json`, {}); }
  async readHeartbeat() { return this.read<string | null>("heartbeat.json", null); }
}

/** Production Upstash. Constructible only inside GitHub Actions, so a local run can
 * never write production Redis (Global constraints). */
export class RedisSink implements DigSink {
  readonly name = "redis";
  private constructor(private redis: Redis) {}
  static create(): RedisSink {
    if (process.env.GITHUB_ACTIONS !== "true") throw new Error("RedisSink runs only inside GitHub Actions");
    const url = process.env.DIG_REDIS_REST_URL, token = process.env.DIG_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error("DIG_REDIS_REST_URL / DIG_REDIS_REST_TOKEN are not set");
    return new RedisSink(new Redis({ url, token }));
  }
  async readManifest() { return (await this.redis.get<DigManifest>(digKeys.manifest)) ?? null; }
  async writeManifest(m: DigManifest) { await this.redis.set(digKeys.manifest, m); }
  async readDay(date: string) { return (await this.redis.get<DigDay>(digKeys.day(date))) ?? null; }
  async writeDay(day: DigDay) { await this.redis.set(digKeys.day(day.date), day); }
  async readExtras() { return (await this.redis.get<Record<string, string[]>>(digKeys.extras)) ?? {}; }
  async writeExtras(e: Record<string, string[]>) { await this.redis.set(digKeys.extras, e); }
  async readAdjudicated() { return (await this.redis.get<string[]>(digKeys.adjudicated)) ?? []; }
  async writeAdjudicated(list: string[]) { await this.redis.set(digKeys.adjudicated, list); }
  async readLog(kind: "rej" | "claim", date: string, index: number) {
    const key = kind === "rej" ? digKeys.rejected(date, index) : digKeys.claims(date, index);
    const h = (await this.redis.hgetall<Record<string, unknown>>(key)) ?? {};
    return Object.fromEntries(Object.entries(h).map(([k, v]) => [k, Number(v) || 0]));
  }
  async readHeartbeat() { return (await this.redis.get<string>(digKeys.heartbeat)) ?? null; }
}
```

- [ ] **Step 5: Add to `.gitignore`:**

```
# dig pipeline: local output and datasets (never committed: future answers, 3 GB dumps)
.dig-out/
dig-data/
```

- [ ] **Step 6: Run the test.** Run `npx vitest run scripts/dig/sink.test.ts`. Expected: PASS.
- [ ] **Step 7: Commit.**

```bash
git add lib/dig/keys.ts scripts/dig/sink.ts scripts/dig/sink.test.ts .gitignore
git commit -m "feat(dig): Redis keys, manifest and file/Redis sinks"
```

---

### Task 13: Weekly adjudication

**Files:**
- Create: `scripts/dig/adjudicate.ts`
- Test: `scripts/dig/adjudicate.test.ts`

**Interfaces:**
- Consumes:
  - `DigSink`, `FileSink`, `Candidate`;
  - `decodeDay`, `encodeDay`, `normalizeKey`, `tierFromZipf`, `daysBetween`.
- Produces:
  - `judge(guess: string, c: Candidate, ctx: { lexicon: Set<string>; usable: (w: string) => boolean; blocked: Set<string> }): string | null`
    (returns the accepted word in its canonical spelling, or null);
  - `adjudicate(sink: DigSink, candidates: Map<string, Candidate>, ctx: { today: string; lexicon: Set<string>; usable: (w: string) => boolean; blocked: Set<string>; zipf: Map<string, number> }): Promise<{ judged: number; accepted: number; amendedDays: number }>`.

- [ ] **Step 1: Write the failing test** in `scripts/dig/adjudicate.test.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adjudicate, judge } from "./adjudicate";
import { FileSink } from "./sink";
import { decodeDay, encodeDay } from "../../lib/dig/payload";
import type { Candidate } from "./themes";

const theme: Candidate = {
  id: "theme:sailing", base: "theme:sailing", kind: "theme", text: "Name a word from sailing", core: ["keel"], accepted: ["keel"],
  sources: [new Set(["keel", "jib", "cleat"]), new Set(["keel"])], anchor: "x", senseIds: null, ancestors: new Set(), languages: [],
};
const ctx = { lexicon: new Set(["jib", "cleat", "banana", "keel"]), usable: (w: string) => w !== "cleat", blocked: new Set<string>() };

describe("judge", () => {
  it("accepts a real word that any one source places in the prompt", () => {
    expect(judge("Jib", theme, ctx)).toBe("jib");
  });
  it("rejects unknown, unusable or off-theme words", () => {
    expect(judge("banana", theme, ctx)).toBeNull();
    expect(judge("cleat", theme, ctx)).toBeNull();
    expect(judge("zzzz", theme, ctx)).toBeNull();
  });
});

describe("adjudicate", () => {
  it("adds accepted words to extras and to stored days except today, as accepted-only", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "adj-"));
    const sink = new FileSink(dir);
    const plain = { v: 1 as const, date: "2026-12-01", rejSample: 1, prompts: [{ id: "theme:sailing", kind: "theme" as const, text: "t", answers: [["keel", "fossil", 1] as ["keel", "fossil", 1]], aliases: {}, guard: [], fossil: { word: "keel", fact: "f" }, stories: {} }] };
    await sink.writeDay(encodeDay(plain));
    await sink.writeDay(encodeDay({ ...plain, date: "2026-12-03" }));
    await sink.writeManifest({ v: 1, lastRun: "x", days: { "2026-12-01": [{ id: "theme:sailing", base: "theme:sailing", fossil: "keel" }], "2026-12-03": [{ id: "theme:sailing", base: "theme:sailing", fossil: "keel" }] }, poolThemes: 0, poolOrigins: 0 });
    mkdirSync(path.join(dir, "logs"), { recursive: true });
    writeFileSync(path.join(dir, "logs", "rej-2026-12-01-0.json"), JSON.stringify({ jib: 2, banana: 5, cleat: 1 }));
    const r = await adjudicate(sink, new Map([["theme:sailing", theme]]), { ...ctx, today: "2026-12-03", zipf: new Map([["jib", 2.5]]) });
    expect(r).toEqual({ judged: 2, accepted: 1, amendedDays: 1 });
    expect(await sink.readExtras()).toEqual({ "theme:sailing": ["jib"] });
    const past = decodeDay((await sink.readDay("2026-12-01"))!);
    expect(past.prompts[0].answers).toContainEqual(["jib", "uncommon", 0]);
    const todays = decodeDay((await sink.readDay("2026-12-03"))!);
    expect(todays.prompts[0].answers).toHaveLength(1);
    expect(await sink.readAdjudicated()).toEqual(expect.arrayContaining(["theme:sailing|jib", "theme:sailing|banana"]));
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run scripts/dig/adjudicate.test.ts`. Expected: FAIL.

- [ ] **Step 3: Write `scripts/dig/adjudicate.ts`:**

```ts
import { normalizeKey } from "../../lib/dig/normalize";
import { decodeDay, encodeDay } from "../../lib/dig/payload";
import { tierFromZipf } from "../../lib/dig/score";
import { historyFromManifest } from "../../lib/dig/keys";
import { daysBetween } from "./assemble";
import type { DigSink } from "./sink";
import type { Candidate } from "./themes";

type JudgeCtx = { lexicon: Set<string>; usable: (w: string) => boolean; blocked: Set<string> };

/** pipeline-design §11: a person proposed it, so one strong source is enough, but it must
 * be a real, usable, unblocked English word. Returns the source's spelling. */
export function judge(guess: string, c: Candidate, ctx: JudgeCtx): string | null {
  const key = normalizeKey(guess);
  if (!key || !ctx.lexicon.has(key) || ctx.blocked.has(key)) return null;
  for (const source of c.sources) for (const w of source) {
    if (normalizeKey(w) === key && ctx.usable(w) && !ctx.blocked.has(w)) return w;
  }
  return null;
}

const LOG_DAYS = 35;

export async function adjudicate(
  sink: DigSink,
  candidates: Map<string, Candidate>,
  ctx: JudgeCtx & { today: string; zipf: Map<string, number> }
): Promise<{ judged: number; accepted: number; amendedDays: number }> {
  const history = historyFromManifest(await sink.readManifest());
  const done = new Set(await sink.readAdjudicated());
  const extras = await sink.readExtras();
  // Aggregate rejected (count ≥ 2) and claimed (any) guesses per prompt id.
  const tallies = new Map<string, Map<string, { rej: number; claim: number }>>();
  for (const h of history) {
    const age = daysBetween(h.date, ctx.today);
    if (age <= 0 || age > LOG_DAYS) continue;
    for (const [index, p] of h.prompts.entries()) {
      for (const kind of ["rej", "claim"] as const) {
        for (const [guess, n] of Object.entries(await sink.readLog(kind, h.date, index))) {
          const byGuess = tallies.get(p.id) ?? new Map();
          const t = byGuess.get(guess) ?? { rej: 0, claim: 0 };
          t[kind] += n;
          byGuess.set(guess, t);
          tallies.set(p.id, byGuess);
        }
      }
    }
  }
  let judged = 0, accepted = 0;
  const newlyAccepted = new Map<string, string[]>();
  for (const [promptId, byGuess] of tallies) {
    const c = candidates.get(promptId);
    if (!c) continue;
    for (const [guess, t] of byGuess) {
      if (t.claim < 1 && t.rej < 2) continue;
      const mark = `${promptId}|${normalizeKey(guess)}`;
      if (done.has(mark)) continue;
      done.add(mark);
      judged++;
      const word = judge(guess, c, ctx);
      if (!word || (extras[promptId] ?? []).includes(word)) continue;
      extras[promptId] = [...(extras[promptId] ?? []), word];
      newlyAccepted.set(promptId, [...(newlyAccepted.get(promptId) ?? []), word]);
      accepted++;
    }
  }
  let amendedDays = 0;
  for (const h of history) {
    if (h.date === ctx.today) continue; // today's file is CDN-cached until rollover
    const ids = h.prompts.map((p) => p.id).filter((id) => newlyAccepted.has(id));
    if (!ids.length) continue;
    const stored = await sink.readDay(h.date);
    if (!stored) continue;
    const plain = decodeDay(stored);
    let changed = false;
    for (const p of plain.prompts) for (const w of newlyAccepted.get(p.id) ?? []) {
      if (p.answers.some((a) => normalizeKey(a[0]) === normalizeKey(w))) continue;
      p.answers.push([w, tierFromZipf(ctx.zipf.get(w)), 0]);
      changed = true;
    }
    if (changed) { await sink.writeDay(encodeDay(plain)); amendedDays++; }
  }
  await sink.writeExtras(extras);
  await sink.writeAdjudicated([...done]);
  return { judged, accepted, amendedDays };
}
```

- [ ] **Step 4: Run the test.** Run `npx vitest run scripts/dig/adjudicate.test.ts`. Expected: PASS.
  - The banana guess (count 5) is judged and rejected. Cleat (count 1, unclaimed) is skipped, which gives
    judged = 2.
- [ ] **Step 5: Commit.**

```bash
git add scripts/dig/adjudicate.ts scripts/dig/adjudicate.test.ts
git commit -m "feat(dig): weekly adjudication of rejected and claimed guesses"
```

---

### Task 14: Data fetching, the orchestrator and the workflow

**Files:**
- Create: `scripts/dig/fetchData.ts`, `scripts/dig/build.ts`, `scripts/dig/build.test.ts`,
  `.github/workflows/dig-pipeline.yml`
- Modify: `package.json` (scripts `dig:fetch` and `dig:build`)

**Interfaces:**
- Consumes: everything above; `WORDS`, `getWordForDate`, `getPuzzleForDate`, `dayKey`, `dayStart`, `DAY_MS`.
- Produces:
  - CLI `npm run dig:fetch -- --data <dir>` and
    `npm run dig:build -- --data <dir> [--out <dir>] [--publish] [--days 45] [--today YYYY-MM-DD]`;
  - `datesToBuild(today: string, built: string[], target: number): string[]` (exported for tests);
  - `summaryLines(stats: BuildStats): string[]` (counts only).

`build.ts` runs these steps in order:
1. Load the sources from `--data`. The layout comes from `fetchData` and matches the existing local data folder:
   - `wiktextract/raw-wiktextract-data.jsonl.gz`
   - `derived/en-compact.jsonl`
   - `oewn/english-wordnet-2025.xml.gz`
   - `wordfreq/large_en.msgpack.gz`
   - `ldnoobw/en.txt`
   - `cache/`
2. Index Wiktionary, then build the lexicon, themes (WordNet and Wikidata, plus letter variants) and origins.
3. Merge `extras` into each candidate's `accepted`.
4. Keep the candidates whose `floorProblems` is empty.
5. Run adjudication.
6. For each date to build, retry up to 5 salts:
   1. `pickDay`;
   2. pageviews for the chosen prompts;
   3. `assignTiers`;
   4. `chooseFossil`, with `exclude` holding the daily word or `/play` answer for D and D+1, fossils already used
      that day, and the previous fossils for the same prompt id;
   5. aliases and guard;
   6. `toPlainPrompt`;
   7. `validateDay`;
   8. on a pass: `encodeDay`, `writeDay`, and update the manifest.
7. Check the buffer is at least 30 days, the remaining eligible pool is at least 20 themes and 6 origins, and the
   heartbeat is no more than 3 days old (when it exists). Exit 1 otherwise.
8. Print `summaryLines` and append them to `$GITHUB_STEP_SUMMARY` when that is set.

- [ ] **Step 1: Write the failing test** in `scripts/dig/build.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { datesToBuild, summaryLines } from "./build";

describe("datesToBuild", () => {
  it("appends from the day after the last built date, never rebuilding, up to today + target", () => {
    expect(datesToBuild("2026-12-01", [], 3)).toEqual(["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"]);
    expect(datesToBuild("2026-12-01", ["2026-12-01", "2026-12-02"], 3)).toEqual(["2026-12-03", "2026-12-04"]);
    expect(datesToBuild("2026-12-10", ["2026-12-01"], 1)).toEqual(["2026-12-10", "2026-12-11"]);
  });
});

describe("summaryLines", () => {
  it("prints counts only", () => {
    const lines = summaryLines({ themes: 210, origins: 33, letterVariants: 40, built: 7, retries: 2, failedDates: 0, bufferDays: 45, poolThemes: 120, poolOrigins: 20, wikidata: { fresh: 6, cached: 1, stale: 0, missing: 1, "label-mismatch": 0 }, adjudication: { judged: 3, accepted: 1, amendedDays: 2 } });
    expect(lines.join("\n")).toMatch(/Buffer: 45 days/);
    expect(lines.join("\n")).not.toMatch(/[a-z]+:[a-z-]+:/);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run scripts/dig/build.test.ts`. Expected: FAIL.

- [ ] **Step 3: Write `scripts/dig/fetchData.ts`:**

```ts
// Downloads the dig datasets into --data, re-downloading the Wiktextract dump only when
// kaikki.org's Last-Modified changes, then compacts it. Counts-only logging.
//   npm run dig:fetch -- --data dig-data
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { flagValue } from "../languages/cli";
import { compactDump } from "./sources/compact";
import { DIG_USER_AGENT } from "./sources/wikidata";

const SOURCES = {
  dump: "https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz",
  oewn: "https://en-word.net/static/english-wordnet-2025.xml.gz",
  wordfreq: "https://raw.githubusercontent.com/rspeer/wordfreq/master/wordfreq/data/large_en.msgpack.gz",
  ldnoobw: "https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/en",
};

async function download(url: string, file: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  const res = await fetch(url, { headers: { "User-Agent": DIG_USER_AGENT } });
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file));
}

async function main() {
  const data = flagValue(process.argv.slice(2), "--data") ?? "dig-data";
  const dumpFile = path.join(data, "wiktextract", "raw-wiktextract-data.jsonl.gz");
  const compactFile = path.join(data, "derived", "en-compact.jsonl");
  const metaFile = path.join(data, "wiktextract", "meta.json");
  const head = await fetch(SOURCES.dump, { method: "HEAD", headers: { "User-Agent": DIG_USER_AGENT } });
  const lastModified = head.headers.get("last-modified") ?? "";
  const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : {};
  if (!existsSync(compactFile) || meta.lastModified !== lastModified) {
    console.log("Wiktextract dump changed: downloading");
    await download(SOURCES.dump, dumpFile);
    mkdirSync(path.dirname(compactFile), { recursive: true });
    const { lines, kept } = await compactDump(dumpFile, compactFile);
    console.log(`Compacted ${lines} lines to ${kept} English entries`);
    rmSync(dumpFile); // the cache keeps only the compact file
    writeFileSync(metaFile, JSON.stringify({ lastModified }));
  } else console.log("Wiktextract dump unchanged");
  const files: [keyof typeof SOURCES, string][] = [
    ["oewn", path.join(data, "oewn", "english-wordnet-2025.xml.gz")],
    ["wordfreq", path.join(data, "wordfreq", "large_en.msgpack.gz")],
    ["ldnoobw", path.join(data, "ldnoobw", "en.txt")],
  ];
  for (const [k, file] of files) if (!existsSync(file)) { await download(SOURCES[k], file); console.log(`Downloaded ${k}`); }
}

main().catch((err) => { console.error(`dig:fetch failed: ${err instanceof Error ? err.message : "unknown"}`); process.exit(1); });
```

> **Check before running:**
> - Confirm the OEWN URL with a HEAD request. The research download used `https://en-word.net/downloads/english-wordnet-2025.xml.gz`.
> - If the `static/` path 404s, use the `downloads/` URL the research used.
> - Note the working URL in a code comment.

- [ ] **Step 4: Write `scripts/dig/build.ts`.** All the logic below is wiring of the tested modules:

```ts
// The dig pipeline (docs/rarity-game/pipeline-design.md). Local by default (FileSink in
// .dig-out/); --publish writes to production Upstash and is refused outside GitHub Actions.
//   npm run dig:build -- --data <dir> [--out .dig-out] [--publish] [--days 45] [--today YYYY-MM-DD]
// Public logs: counts only. Never print answers, fossils or future prompts.
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { flagValue } from "../languages/cli";
import { DAY_MS, dayKey, dayStart } from "../../lib/day";
import { getPuzzleForDate } from "../../lib/puzzle";
import { WORDS, getWordForDate } from "../../lib/words";
import { encodeDay } from "../../lib/dig/payload";
import { historyFromManifest, type DigManifest } from "../../lib/dig/keys";
import type { DigDayPlain } from "../../lib/dig/types";
import { createFetcher } from "../demand/http";
import { loadWordfreq } from "./sources/wordfreq";
import { loadOewn } from "./sources/oewn";
import { readCompact } from "./sources/compact";
import { fetchWikidataLabels } from "./sources/wikidata";
import { indexWiktionary, usableWord } from "./wiktionary";
import { buildLexicon } from "./lexicon";
import { loadCatalogue } from "./catalogue";
import { letterVariants, wikidataThemeCandidates, wordnetThemes, type Candidate } from "./themes";
import { originCandidates } from "./origins";
import { buildAliases, buildGuard, floorProblems, fossilCandidates } from "./answers";
import { yearlyViews } from "./pageviews";
import { assignTiers, chooseFossil, toPlainPrompt, viewWordsFor } from "./fossil";
import { isEligible, pickDay, type HistoryDay } from "./assemble";
import { validateDay } from "./validate";
import { adjudicate } from "./adjudicate";
import { FileSink, RedisSink, type DigSink } from "./sink";

export type BuildStats = {
  themes: number; origins: number; letterVariants: number; built: number; retries: number; failedDates: number;
  bufferDays: number; poolThemes: number; poolOrigins: number;
  wikidata: Record<"fresh" | "cached" | "stale" | "missing" | "label-mismatch", number>;
  adjudication: { judged: number; accepted: number; amendedDays: number };
};

const BUFFER_FLOOR = 30, MIN_POOL_THEMES = 20, MIN_POOL_ORIGINS = 6, HEARTBEAT_STALE_DAYS = 3, MAX_SALTS = 5;
const addDays = (d: string, n: number) => dayKey(new Date(dayStart(d).getTime() + n * DAY_MS));

/** New dates only: from the day after the last built date (or today), up to today + target. */
export function datesToBuild(today: string, built: string[], target: number): string[] {
  const last = [...built].sort().at(-1);
  let d = last && last >= today ? addDays(last, 1) : today;
  const end = addDays(today, target);
  const out: string[] = [];
  while (d <= end) { out.push(d); d = addDays(d, 1); }
  return out;
}

export function summaryLines(s: BuildStats): string[] {
  return [
    `Supply: ${s.themes} themes (${s.letterVariants} letter variants), ${s.origins} origin prompts pass the floor`,
    `Wikidata: ${s.wikidata.fresh} fresh, ${s.wikidata.cached} cached, ${s.wikidata.stale} stale, ${s.wikidata.missing} missing, ${s.wikidata["label-mismatch"]} label mismatches`,
    `Adjudication: ${s.adjudication.judged} judged, ${s.adjudication.accepted} accepted, ${s.adjudication.amendedDays} days amended`,
    `Built: ${s.built} days (${s.retries} retries, ${s.failedDates} dates failed)`,
    `Buffer: ${s.bufferDays} days. Spare pool: ${s.poolThemes} themes, ${s.poolOrigins} origins`,
  ];
}

async function main() {
  const args = process.argv.slice(2);
  const data = flagValue(args, "--data") ?? "dig-data";
  const target = Number(flagValue(args, "--days") ?? 45);
  const today = flagValue(args, "--today") ?? dayKey();
  const sink: DigSink = args.includes("--publish") ? RedisSink.create() : new FileSink(flagValue(args, "--out") ?? ".dig-out");
  const cacheDir = path.join(data, "cache");

  const zipf = loadWordfreq(path.join(data, "wordfreq", "large_en.msgpack.gz"));
  const wn = loadOewn(path.join(data, "oewn", "english-wordnet-2025.xml.gz"));
  const blocked = new Set(readFileSync(path.join(data, "ldnoobw", "en.txt"), "utf8").split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter(Boolean));
  const index = await indexWiktionary(readCompact(path.join(data, "derived", "en-compact.jsonl")), blocked);
  const lexicon = buildLexicon(zipf, index.info.keys());
  const cat = loadCatalogue();
  const usable = (w: string) => usableWord(index, zipf, w);
  const curio = new Map(WORDS.map((w) => [w.word.toLowerCase(), { slug: w.slug, teaser: w.teaser }]));
  const curioLineage = new Map(WORDS.map((w) => [w.word.toLowerCase(), w.lineage]));
  const fetcher = createFetcher({ minGapMs: 25 });

  const wikidata: BuildStats["wikidata"] = { fresh: 0, cached: 0, stale: 0, missing: 0, "label-mismatch": 0 };
  const wdThemes: { theme: (typeof cat.wikidataThemes)[number]; labels: Set<string> }[] = [];
  for (const theme of cat.wikidataThemes) {
    const r = await fetchWikidataLabels(theme, { fetcher, cacheDir: path.join(cacheDir, "wikidata"), now: new Date() });
    wikidata[r.status]++;
    if (r.labels) wdThemes.push({ theme, labels: r.labels });
  }
  const extras = await sink.readExtras();
  const withExtras = (c: Candidate): Candidate => ({ ...c, accepted: [...new Set([...c.accepted, ...(extras[c.id] ?? [])])] });
  const fctx = { wn, index, zipf };
  const baseThemes = [...wordnetThemes(wn, index, zipf, cat), ...wikidataThemeCandidates(wdThemes, index, zipf)].map(withExtras);
  const letters = baseThemes.flatMap((t) => letterVariants(t, zipf)).map(withExtras);
  const themes = [...baseThemes, ...letters].filter((c) => floorProblems(c, fctx).length === 0);
  const origins = originCandidates(index, zipf, cat, curioLineage).map(withExtras).filter((c) => floorProblems(c, fctx).length === 0);
  const all = new Map([...themes, ...origins].map((c) => [c.id, c]));

  const adjudication = await adjudicate(sink, all, { today, lexicon, usable, blocked, zipf });

  const manifest: DigManifest = (await sink.readManifest()) ?? { v: 1, lastRun: "", days: {}, poolThemes: 0, poolOrigins: 0 };
  const history: HistoryDay[] = historyFromManifest(manifest);
  const storySlugs = new Set(WORDS.map((w) => w.slug));
  const definitions = new Map<string, string>();
  for (const [lemma, ids] of wn.synsetsOf) { const def = wn.synsets.get(ids[0])?.def; if (def) definitions.set(lemma, def); }
  const dailyWordsFor = (date: string) => {
    const out = new Set<string>();
    for (const d of [date, addDays(date, 1)]) {
      out.add(getWordForDate(dayStart(d)).word.toLowerCase());
      const p = getPuzzleForDate(dayStart(d));
      if (p) out.add(p.word.word.toLowerCase());
    }
    return out;
  };

  let built = 0, retries = 0, failedDates = 0;
  for (const date of datesToBuild(today, Object.keys(manifest.days), target)) {
    let done = false;
    for (let salt = 0; salt < MAX_SALTS && !done; salt++) {
      if (salt > 0) retries++;
      const picks = pickDay(date, { themes, origins }, history, zipf, salt);
      if (!picks) break;
      const views = await yearlyViews(picks.flatMap((c, i) => viewWordsFor(c, zipf, salt * 31 + i)), { fetcher, cachePath: path.join(cacheDir, "pageviews.json"), now: new Date() });
      const daily = dailyWordsFor(date);
      const usedToday = new Set<string>();
      const prompts = [];
      for (const c of picks) {
        const previous = new Set(history.flatMap((h) => h.prompts.filter((p) => p.id === c.id).map((p) => p.fossil)));
        const tiers = assignTiers(c, zipf, views);
        const fossil = chooseFossil(c, {
          candidates: fossilCandidates(c, fctx), tiers, views, curio, definitions,
          etymology: (w) => index.info.get(w)?.etymology ?? "",
          exclude: new Set([...daily, ...usedToday, ...previous]),
        });
        if (!fossil) break;
        usedToday.add(fossil.word);
        const aliases = buildAliases(c.accepted, index, wn);
        prompts.push(toPlainPrompt(c, tiers, fossil, aliases, buildGuard(c.accepted, aliases, lexicon), curio));
      }
      if (prompts.length !== 7) continue;
      const day: DigDayPlain = { v: 1, date, rejSample: 1, prompts };
      const problems = validateDay(day, { history, storySlugs, dailyWords: daily, blocked });
      if (problems.length) { console.log(`Date ${date} salt ${salt}: ${problems.length} validation problems`); continue; }
      await sink.writeDay(encodeDay(day));
      const entry = picks.map((c, i) => ({ id: c.id, base: c.base, fossil: prompts[i].fossil.word, ...(c.languages.length ? { languages: c.languages } : {}) }));
      manifest.days[date] = entry;
      history.push({ date, prompts: entry });
      built++;
      done = true;
    }
    if (!done) failedDates++;
  }

  const furthest = Object.keys(manifest.days).sort().at(-1);
  const bufferDays = furthest && furthest >= today ? Math.round((dayStart(furthest).getTime() - dayStart(today).getTime()) / DAY_MS) : 0;
  const after = addDays(furthest ?? today, 1);
  manifest.poolThemes = themes.filter((c) => isEligible(c, after, history)).length;
  manifest.poolOrigins = origins.filter((c) => isEligible(c, after, history)).length;
  manifest.lastRun = new Date().toISOString();
  await sink.writeManifest(manifest);

  const stats: BuildStats = { themes: themes.length, origins: origins.length, letterVariants: letters.filter((c) => themes.includes(c)).length, built, retries, failedDates, bufferDays, poolThemes: manifest.poolThemes, poolOrigins: manifest.poolOrigins, wikidata, adjudication };
  const lines = summaryLines(stats);
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.map((l) => `- ${l}`).join("\n") + "\n");

  const failures: string[] = [];
  if (bufferDays < BUFFER_FLOOR) failures.push(`buffer ${bufferDays} days < ${BUFFER_FLOOR}`);
  if (manifest.poolThemes < MIN_POOL_THEMES || manifest.poolOrigins < MIN_POOL_ORIGINS) failures.push("spare pool below 20 themes / 6 origins");
  const heartbeat = await sink.readHeartbeat();
  if (heartbeat && Date.now() - Date.parse(heartbeat) > HEARTBEAT_STALE_DAYS * DAY_MS) failures.push("dig-health cron heartbeat is stale");
  if (failures.length) { console.error(`dig:build failed: ${failures.join("; ")}`); process.exit(1); }
}

if (process.argv[1]?.endsWith("build.ts")) {
  main().catch((err) => { console.error(`dig:build failed: ${err instanceof Error ? err.name : "unknown"}`); process.exit(1); });
}
```

> **Two notes:**
> - `scripts/languages/cli.ts` already exports `flagValue(args, flag)`. `scripts/applyClues.ts` uses it.
> - The `letterVariants` stat counts letter variants that pass the floor.

- [ ] **Step 5: Add the npm scripts** to `package.json`:

```json
"dig:fetch": "tsx scripts/dig/fetchData.ts",
"dig:build": "tsx --max-old-space-size=8192 scripts/dig/build.ts",
```

If `tsx` rejects `--max-old-space-size`, use `"dig:build": "node --max-old-space-size=8192 --import tsx scripts/dig/build.ts"`.

- [ ] **Step 6: Write `.github/workflows/dig-pipeline.yml`:**

```yaml
# curio dig content pipeline: builds, validates and stores days in production Upstash
# (docs/rarity-game/pipeline-design.md). Public repo, public logs: the scripts print counts only.
# No artifacts are ever uploaded (they would expose future answers).
# Failure → GitHub's own failure email to Sam (watchdog 1 of 3).
name: Dig pipeline

on:
  schedule:
    - cron: "0 4 * * 1,4" # Mon + Thu 04:00 UTC: twice weekly keeps the Actions cache warm
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: dig-pipeline
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 120
    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Restore datasets
        uses: actions/cache@v4
        with:
          path: dig-data
          key: dig-data-${{ github.run_id }}
          restore-keys: dig-data-

      - name: Fetch datasets
        run: npm run dig:fetch -- --data dig-data

      - name: Build and publish days
        run: npm run dig:build -- --data dig-data --publish
        env:
          DIG_REDIS_REST_URL: ${{ secrets.DIG_REDIS_REST_URL }}
          DIG_REDIS_REST_TOKEN: ${{ secrets.DIG_REDIS_REST_TOKEN }}
```

- [ ] **Step 7: Run the unit tests and the type check.** Run `npx vitest run scripts/dig/build.test.ts`. Expected:
  PASS. Then run `npx tsc --noEmit`. Expected: no errors in `scripts/dig` or `lib/dig`.
- [ ] **Step 8: Commit.**

```bash
git add scripts/dig/fetchData.ts scripts/dig/build.ts scripts/dig/build.test.ts .github/workflows/dig-pipeline.yml package.json
git commit -m "feat(dig): data fetch, pipeline orchestrator and scheduled workflow"
```

---

### Task 15: Full local run, supply re-measure, and doc updates

**Files:**
- Modify:
  - `docs/rarity-game/pipeline-design.md` (§3a re-measure, §8 near-miss change, §10 size, §11 logging shape);
  - `docs/rarity-game/architecture.md` (§5 obfuscation wording, §8 key table: no pool key, index-based logs,
    extras/adjudicated/usage keys);
  - `docs/rarity-game/research/README.md` (point to `scripts/dig`).

This task runs the real pipeline on Sam's machine **with `FileSink` only**.

- [ ] **Step 1: Run the full build into the gitignored local folder.** Use the existing data folder. The compact
  file and the three small sources are already there; download LDNOOBW only if it's missing.

```bash
npm run dig:fetch -- --data "C:/Users/Sam/Documents/Claude/Projects/Curio/data"
```
```bash
npm run dig:build -- --data "C:/Users/Sam/Documents/Claude/Projects/Curio/data" --out .dig-out --days 45
```

Expected:
- the summary prints counts;
- `Buffer: 45 days`;
- the exit code is 0;
- `.dig-out/days/` holds 46 files.

If the buffer is short, the summary shows whether themes or origins ran out, and that decides which supply fix
needs tuning (anchor overrides or extra Wikidata themes in `catalogue.json`). Don't relax the floor.

- [ ] **Step 2: Spot-check three days by decoding them locally** (output stays on screen, never committed):

```bash
npx tsx -e "import {readFileSync} from 'node:fs'; import {decodeDay} from './lib/dig/payload'; const d=decodeDay(JSON.parse(readFileSync('.dig-out/days/'+process.argv[1]+'.json','utf8'))); for (const p of d.prompts) console.log(p.text, '|', p.answers.filter(a=>a[2]).length, 'core |', p.fossil.word, '-', p.fossil.fact)" 2026-11-05
```

Check by eye:
- the prompts read naturally;
- the fossils are rare-but-fair;
- the facts are sourced and under 140 characters;
- nothing offensive appears.

Fix any problems through `catalogue.json` (renames, blockPatterns), never by hand-editing a day.

- [ ] **Step 3: Update the docs:**
  - **`pipeline-design.md` §3a:** add a dated "Re-measured" line with the counts from the summary.
  - **§8:** change near misses to "one edit for 4+ letters", plus the guard list.
  - **§10:** set the size cap to 400,000 characters.
  - **§11:** logging is batched into the finish event, keyed by prompt index.
  - **`architecture.md` §5:** the rotation, not XOR.
  - **§8:** drop `curio:dig:pool`, add `extras`, `adjudicated` and `health:usage:<month>`, and change the log keys
    to `<index>`.
- [ ] **Step 4: Run the whole dig suite and lint.** Run `npx vitest run lib/dig scripts/dig` and `npm run lint`.
  Expected: all pass.
- [ ] **Step 5: Commit.**

```bash
git add docs/rarity-game
git commit -m "docs(dig): re-measured supply and plan-time spec changes"
```
