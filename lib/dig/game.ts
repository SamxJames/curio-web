import { buildLookup, checkGuess, type Lookup } from "./match";
import { normalizeKey } from "./normalize";
import { decodeSecret } from "./payload";
import { TIERS, type DigDay, type PromptKind, type PromptSecret, type Tier } from "./types";

/** The whole game as a pure reducer (architecture §2): screens render from GameState,
 * a 1-second interval dispatches "tick", and nothing here touches the DOM or storage. */

/** `tomorrow` is only on /api/dig/today: tomorrow's first prompt as a plain hint, or null. */
export type DigDayResponse = DigDay & { number: number; tomorrow?: string | null };
export type PreparedDay = {
  date: string;
  number: number;
  rejSample: number;
  prompts: { id: string; kind: PromptKind; text: string }[];
  secrets: PromptSecret[];
  lookups: Lookup[];
  tomorrow?: string | null;
};

export function prepareDay(d: DigDayResponse): PreparedDay {
  const secrets = d.prompts.map((p) => decodeSecret(p.payload, d.date, p.id));
  return {
    date: d.date,
    number: d.number,
    rejSample: d.rejSample,
    prompts: d.prompts.map(({ id, kind, text }) => ({ id, kind, text })),
    secrets,
    lookups: secrets.map(buildLookup),
    ...(d.tomorrow ? { tomorrow: d.tomorrow } : {}),
  };
}

export const READ_SECONDS = 3;
export const ANSWER_SECONDS = 25;
export const MAX_REJECTED = 3;

/** `rejected` keeps up to MAX_REJECTED display forms, one per distinct key. `lastGuess` is the
 * player's most recent miss, even once the cap is full, for Reveal and the claim button. */
export type PromptResult = { answer: string | null; tier: Tier | null; rejected: string[]; lastGuess: string | null };
export type Feedback =
  | { kind: "near"; guess: string; suggestion: string; index: number }
  | { kind: "miss"; guess: string }
  | { kind: "empty" }
  /** typed something, but nothing usable once folded to A–Z (another alphabet, or only digits) */
  | { kind: "letters" }
  | null;
export type GameState = {
  phase: "intro" | "reading" | "answering" | "reveal" | "done";
  current: number;
  noTimer: boolean;
  /** seconds left in the read pause or the answer window; 0 with No timer */
  clock: number;
  feedback: Feedback;
  results: PromptResult[];
};
export type GameAction =
  | { type: "start"; noTimer: boolean }
  | { type: "tick" }
  | { type: "submit"; guess: string }
  | { type: "pass" }
  | { type: "next" }
  | { type: "timer"; noTimer: boolean };

export function initialGame(): GameState {
  return { phase: "intro", current: 0, noTimer: false, clock: 0, feedback: null, results: [] };
}

function enterPrompt(s: GameState, current: number): GameState {
  return { ...s, current, feedback: null, phase: s.noTimer ? "answering" : "reading", clock: s.noTimer ? 0 : READ_SECONDS };
}

export function createReducer(day: Pick<PreparedDay, "secrets" | "lookups">) {
  const lock = (s: GameState, index: number | null): GameState => {
    const a = index === null ? null : day.secrets[s.current].answers[index];
    const results = [...s.results];
    results[s.current] = { ...results[s.current], answer: a ? a[0] : null, tier: a ? a[1] : null };
    return { ...s, results, phase: "reveal", feedback: null, clock: 0 };
  };
  return function reduce(s: GameState, a: GameAction): GameState {
    switch (a.type) {
      case "start":
        if (s.phase !== "intro") return s;
        return enterPrompt({ ...s, noTimer: a.noTimer, results: day.secrets.map(() => ({ answer: null, tier: null, rejected: [], lastGuess: null })) }, 0);
      case "tick":
        if (s.noTimer) return s;
        if (s.phase === "reading") return s.clock > 1 ? { ...s, clock: s.clock - 1 } : { ...s, phase: "answering", clock: ANSWER_SECONDS };
        if (s.phase === "answering") return s.clock > 1 ? { ...s, clock: s.clock - 1 } : lock(s, null);
        return s;
      case "submit": {
        if (s.phase !== "answering") return s;
        if (s.feedback?.kind === "near" && normalizeKey(a.guess) === normalizeKey(s.feedback.guess)) return lock(s, s.feedback.index);
        const r = checkGuess(day.lookups[s.current], a.guess);
        if (r.kind === "match") return lock(s, r.index);
        if (r.kind === "empty") return { ...s, feedback: { kind: a.guess.trim() ? "letters" : "empty" } };
        if (r.kind === "near") {
          return { ...s, feedback: { kind: "near", guess: a.guess, suggestion: day.secrets[s.current].answers[r.index][0], index: r.index } };
        }
        const prev = s.results[s.current];
        // The display form is kept (Reveal shows what the player typed). Dedupe compares keys, so
        // "ZZZZ" and "z z z z" take one slot; normalising for the server is cleanGuess's job.
        const g = a.guess.trim();
        const slot = normalizeKey(g);
        const taken = prev.rejected.some((r) => normalizeKey(r) === slot);
        const rejected = taken || prev.rejected.length >= MAX_REJECTED ? prev.rejected : [...prev.rejected, g];
        const results = [...s.results];
        results[s.current] = { ...prev, rejected, lastGuess: g };
        return { ...s, results, feedback: { kind: "miss", guess: a.guess } };
      }
      case "pass":
        if (s.phase !== "answering") return s;
        return lock(s, null);
      case "timer":
        if (s.phase === "intro" || s.phase === "done") return s;
        if (s.phase === "reveal") return { ...s, noTimer: a.noTimer };
        if (s.phase === "reading") return a.noTimer ? { ...s, noTimer: true, phase: "answering", clock: 0 } : { ...s, noTimer: false };
        return { ...s, noTimer: a.noTimer, clock: a.noTimer ? 0 : ANSWER_SECONDS };
      case "next":
        if (s.phase !== "reveal") return s;
        return s.current + 1 >= day.secrets.length ? { ...s, phase: "done" } : enterPrompt(s, s.current + 1);
    }
  };
}

export const resultTiers = (s: GameState): (Tier | null)[] => s.results.map((r) => r.tier);

/** An unfinished run, saved after every step so a refresh resumes it rather than starting over
 * (which would let a player replay prompts with the answers and fossils already seen, and would
 * count a second start). `revealed` means the current prompt had locked; otherwise the player
 * comes back to that prompt with a fresh clock, having seen only its text. */
export type SavedRun = { v: 1; date: string; noTimer: boolean; current: number; revealed: boolean; results: PromptResult[]; passed: number[] };

export function toSavedRun(date: string, s: GameState, passed: Iterable<number>): SavedRun | null {
  if (s.phase === "intro" || s.phase === "done") return null;
  return { v: 1, date, noTimer: s.noTimer, current: s.current, revealed: s.phase === "reveal", results: s.results, passed: [...passed] };
}

const isTierOrNull = (t: unknown) => t === null || (TIERS as readonly unknown[]).includes(t);
const isStrOrNull = (v: unknown) => v === null || typeof v === "string";

function isResult(r: unknown): r is PromptResult {
  if (typeof r !== "object" || r === null) return false;
  const x = r as Record<string, unknown>;
  return isStrOrNull(x.answer) && isTierOrNull(x.tier) && isStrOrNull(x.lastGuess)
    && Array.isArray(x.rejected) && x.rejected.length <= MAX_REJECTED && x.rejected.every((g) => typeof g === "string");
}

/** The game state to resume from a saved run for `date`, or null when there is nothing valid to resume. */
export function resumeGame(run: unknown, date: string, prompts: number): { state: GameState; passed: number[] } | null {
  if (typeof run !== "object" || run === null) return null;
  const r = run as Partial<SavedRun>;
  if (r.v !== 1 || r.date !== date || typeof r.noTimer !== "boolean" || typeof r.revealed !== "boolean") return null;
  if (!Number.isInteger(r.current) || r.current! < 0 || r.current! >= prompts) return null;
  if (!Array.isArray(r.results) || r.results.length !== prompts || !r.results.every(isResult)) return null;
  const passed = Array.isArray(r.passed) ? r.passed.filter((n) => Number.isInteger(n) && n >= 0 && n < prompts) : [];
  const base: GameState = { ...initialGame(), noTimer: r.noTimer, results: r.results };
  const state = r.revealed ? { ...base, current: r.current!, phase: "reveal" as const } : enterPrompt(base, r.current!);
  return { state, passed };
}
