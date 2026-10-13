// Pure core of the puzzle-clue rewrite (scripts/rewriteClues.ts): the writer and blind-solver
// prompts, and the checks every new clue set must pass before it can reach lib/words.ts.
// Rules and reasoning: docs/superpowers/plans/2026-10-13-clue-rewrite.md.
import type { WordEntry } from "./words";

export type ClueSet = [string, string, string];

/** Longest clue allowed, in characters (about 30 words). */
export const MAX_CLUE_LENGTH = 220;

/** The same crude stem lib/words.test.ts forbids in any clue. */
export function forbiddenFragments(word: string): string[] {
  const lower = word.toLowerCase();
  const stem = lower.replace(/(ing|tion|ed|es|s|y)$/i, "");
  return [...new Set([lower, stem])];
}

/** Everything wrong with a clue set, mechanically. Empty means it passes. */
export function clueProblems(clues: unknown, word: string): string[] {
  if (!Array.isArray(clues) || clues.length !== 3 || !clues.every((c) => typeof c === "string" && c.trim())) {
    return ["there must be exactly 3 non-empty clues"];
  }
  const problems: string[] = [];
  const fragments = forbiddenFragments(word);
  clues.forEach((clue: string, i) => {
    const n = i + 1;
    const lower = clue.toLowerCase();
    for (const f of fragments) {
      if (lower.includes(f)) problems.push(`clue ${n} contains "${f}", which gives away the answer`);
    }
    if (clue.length > MAX_CLUE_LENGTH) problems.push(`clue ${n} is ${clue.length} characters (max ${MAX_CLUE_LENGTH})`);
    if (/[—–]/.test(clue)) problems.push(`clue ${n} uses an em or en dash`);
    if (n === 3 && /\b(letters?|starts with|begins with)\b/i.test(clue)) {
      problems.push("clue 3 mentions letters; the game already adds the letter count and first letter");
    }
    const jargon = JARGON.exec(clue);
    if (jargon) problems.push(`clue ${n} uses jargon players can't use ("${jargon[0]}")`);
    if (/[^\p{Script=Latin}\p{P}\p{N}\p{Zs}\p{S}]/u.test(clue) || /\*\w/.test(clue)) {
      problems.push(`clue ${n} uses a non-Latin script or a starred reconstructed form`);
    }
    if (/[āēīōūȳăĕĭŏŭ]/i.test(clue)) problems.push(`clue ${n} uses a macron or breve; write the plain spelling`);
    if (n === 1) {
      const near = sharedPrefixWord(clue, word);
      if (near) problems.push(`clue 1 quotes "${near}", which shares most of its opening letters with the answer`);
    }
  });
  return problems;
}

const JARGON = /\b(proto-[a-z-]+|doublets?|reconstructed|PIE)\b/i;

/** A word in `clue` (4+ letters) whose shared opening with `answer` is 4+ letters and at least
 * 60% of the answer, e.g. "salve" for salvo. Catches clue-1 giveaways the stem check misses. */
export function sharedPrefixWord(clue: string, answer: string): string | null {
  const a = answer.toLowerCase();
  for (const token of clue.toLowerCase().match(/\p{L}+/gu) ?? []) {
    if (token.length < 4) continue;
    let n = 0;
    while (n < token.length && n < a.length && token[n] === a[n]) n++;
    if (n >= 4 && n >= 0.6 * a.length) return token;
  }
  return null;
}

/** The writer prompt. History may come only from the entry's own text. */
export function buildCluePrompt(entry: WordEntry, feedback?: string[]): string {
  const avoid = forbiddenFragments(entry.word).map((f) => `"${f}"`).join(" or ");
  return `You write the three clues for Curio's daily word puzzle. Players see clue 1, guess, then see clue 2 under it, guess, then clue 3 under both, with a hint like "5 letters, starts with D" added under clue 3. A wrong guess or asking for another clue uses a turn; three turns in all.

The answer is: "${entry.word}" (${entry.partOfSpeech})

Its Curio story (the ONLY source you may use for anything about the word's history):
- Teaser: ${entry.teaser}
- Origin: ${entry.origin}
- Journey: ${entry.journey}
- Related: ${entry.related}
- Languages it passed through: ${entry.lineage.join(" → ")}

The current clues are too hard: they only describe history, so players can't guess until the end. Write new ones:
1. Clue 1 opens by saying plainly what kind of thing, action or quality the word names today, as a broad category that does not give it away (for example "This spring flower…", "This verb for offering or asking…", "A figure of evil in many religions…"), then adds one surprising fact from its history. It must not include a defining detail that makes it instant (for a muscle, no "flexing bicep"; for a salary, no "pay").
2. Clue 2 describes the modern meaning specifically enough that an ordinary adult could name the word with a little thought. It should rule out the obvious near-synonym a player might guess instead (for menagerie, say it is grander or more private than a zoo; for repugnant, stronger than merely unpleasant). It may add a different fact from its history.
3. Clue 3 is nearly a giveaway from a new angle: a usage, a second meaning, a familiar phrase, or a related word from the story. Never mention letters, length or the first letter; the game adds that.

Rules:
- Facts about the word's history, origin, languages or relatives must come from the story above. Do not add any that it does not state. Keep every hedge ("probably", "likely", "is believed to") on exactly the fact the story hedges. Describing what the word means today is fine, plainly and accurately.
- Never use the answer, any form of it, or any word containing ${avoid}. Never spell the answer out as its parts (prefix + base, base + suffix, or two words joined, like "re- plus place" or "Mag plus pie"), and in clue 1 never quote a source or related word that carries most of the answer's letters.
- Every sentence must help a player: a usage, context, image or surprising fact. No filler such as dates of first use, routes through languages ("came via Old French into Middle English") or spelling histories.
- Players don't know linguistics: no "Proto-…" languages, "doublet", "reconstructed", starred forms, macrons, or words in non-Latin scripts. Say "an ancient root meaning…" instead.
- Each clue is one or two plain sentences, at most 30 words. Warm and precise, no puns. No em or en dashes. Don't start with "This word".
- Later clues may build on earlier ones (they stay on screen) but must not repeat them.
${feedback && feedback.length > 0 ? `\nYour previous attempt failed these checks; fix them:\n${feedback.map((f) => `- ${f}`).join("\n")}\n` : ""}
Reply with only a JSON object, no markdown: {"clues": ["clue 1", "clue 2", "clue 3"]}`;
}

function stripFence(raw: string): string {
  const m = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(raw.trim());
  return m ? m[1] : raw;
}

export type ParsedClues = { ok: true; clues: ClueSet } | { ok: false; problems: string[] };

export function parseClueResponse(raw: string, word: string): ParsedClues {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(raw));
  } catch {
    return { ok: false, problems: ["the reply was not valid JSON"] };
  }
  const clues = (parsed as { clues?: unknown } | null)?.clues;
  const problems = clueProblems(clues, word);
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, clues: (clues as string[]).map((c) => c.trim()) as ClueSet };
}

/** The blind-solver prompt for one stage (1, 2 or 3). Stage 3 includes the game's letter hint. */
export function buildSolverPrompt(clues: ClueSet, stage: 1 | 2 | 3, letterHint: string): string {
  const shown = clues.slice(0, stage).map((c, i) => `Clue ${i + 1}: ${c}`);
  if (stage === 3) shown.push(`Hint: ${letterHint}`);
  return `You are playing a daily word-guessing game as an ordinary adult: a good everyday English vocabulary, but no special knowledge of etymology, word histories or foreign languages. Do not use any etymology you happen to know; guess only from what the clues tell you about the word's meaning and use. The answer is a single English word.

${shown.join("\n")}

Reply with only a JSON object, no markdown: {"guess": "your single best guess"}`;
}

export function parseSolverGuess(raw: string): string | null {
  try {
    const guess = (JSON.parse(stripFence(raw)) as { guess?: unknown } | null)?.guess;
    return typeof guess === "string" && guess.trim() ? guess.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Replaces one entry's clue array in lib/words.ts source text. Finds the entry by its exact
 * `slug: "<slug>"` literal, then the next `clues: [` and its closing bracket (string-aware, so a
 * bracket inside a clue can't end the scan). Writes the new clues as one JSON line.
 */
export function replaceCluesInSource(source: string, slug: string, clues: ClueSet): string {
  const at = source.indexOf(`slug: ${JSON.stringify(slug)},`);
  if (at === -1) throw new Error(`no entry with slug "${slug}"`);
  const open = source.indexOf("clues: [", at);
  const nextEntry = source.indexOf("slug: ", at + 1);
  if (open === -1 || (nextEntry !== -1 && open > nextEntry)) throw new Error(`no clues for "${slug}"`);
  let i = open + "clues: [".length;
  let inString = false;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "]") break;
  }
  if (i >= source.length) throw new Error(`unterminated clues for "${slug}"`);
  return `${source.slice(0, open)}clues: ${JSON.stringify(clues)}${source.slice(i + 1)}`;
}
