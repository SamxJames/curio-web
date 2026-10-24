import { buildLookup, checkGuess, type Lookup } from "./match";
import { normalizeKey } from "./normalize";
import { decodeSecret } from "./payload";
import type { DigDay, PromptKind, PromptSecret, Tier } from "./types";

/** The whole game as a pure reducer (architecture §2): screens render from GameState,
 * a 1-second interval dispatches "tick", and nothing here touches the DOM or storage. */

export type DigDayResponse = DigDay & { number: number };
export type PreparedDay = {
  date: string;
  number: number;
  rejSample: number;
  prompts: { id: string; kind: PromptKind; text: string }[];
  secrets: PromptSecret[];
  lookups: Lookup[];
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
  };
}

export const READ_SECONDS = 3;
export const ANSWER_SECONDS = 25;
export const MAX_REJECTED = 3;

export type PromptResult = { answer: string | null; tier: Tier | null; rejected: string[] };
export type Feedback =
  | { kind: "near"; guess: string; suggestion: string; index: number }
  | { kind: "miss"; guess: string }
  | { kind: "empty" }
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
export type GameAction = { type: "start"; noTimer: boolean } | { type: "tick" } | { type: "submit"; guess: string } | { type: "next" };

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
        return enterPrompt({ ...s, noTimer: a.noTimer, results: day.secrets.map(() => ({ answer: null, tier: null, rejected: [] })) }, 0);
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
        if (r.kind === "empty") return { ...s, feedback: { kind: "empty" } };
        if (r.kind === "near") {
          return { ...s, feedback: { kind: "near", guess: a.guess, suggestion: day.secrets[s.current].answers[r.index][0], index: r.index } };
        }
        const prev = s.results[s.current];
        // Stored as the normalised key, so "ice cream" and "icecream" are one rejected guess (amendment N6).
        const g = normalizeKey(a.guess);
        const rejected = prev.rejected.includes(g) || prev.rejected.length >= MAX_REJECTED ? prev.rejected : [...prev.rejected, g];
        const results = [...s.results];
        results[s.current] = { ...prev, rejected };
        return { ...s, results, feedback: { kind: "miss", guess: a.guess } };
      }
      case "next":
        if (s.phase !== "reveal") return s;
        return s.current + 1 >= day.secrets.length ? { ...s, phase: "done" } : enterPrompt(s, s.current + 1);
    }
  };
}

export const resultTiers = (s: GameState): (Tier | null)[] => s.results.map((r) => r.tier);
