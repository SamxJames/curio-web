import { isTrafficSource, type TrafficSource } from "../traffic";
import { digKeys } from "./keys";
import { normalizeKey } from "./normalize";
import { isValidScore, scoreOf } from "./score";
import { TIERS, type Tier } from "./types";

/** The only gate between a public request body and a Redis field name (architecture §8–9),
 * modelled on lib/traffic.ts's parseTrafficEvent. Today-only events must name today. */
export type DigEvent =
  | { kind: "land"; source: TrafficSource }
  | { kind: "start"; date: string }
  | { kind: "past" }
  | { kind: "share"; how: "text" | "image" }
  | { kind: "story" }
  | { kind: "signup" }
  | { kind: "finish"; date: string; score: number; tiers: (Tier | null)[]; rejected: [number, string][] }
  | { kind: "claim"; date: string; prompt: number; guess: string };

/** Letters, apostrophes, spaces and hyphens: a word someone typed, nothing else. Non-Latin
 * letters pass this check but normalise to nothing, so cleanGuess drops them. */
export const GUESS_RE = /^[\p{L}' -]{2,40}$/u;
export const MAX_REJECTED_PER_FINISH = 21;
const PROMPTS = 7;

const isPromptIndex = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < PROMPTS;

/** A guess as stored: its normalised key ("ice cream" and "icecream" are one guess), or null
 * when nothing usable is left (too short, or no Latin letters once folded). */
const cleanGuess = (g: unknown): string | null => {
  if (typeof g !== "string") return null;
  const s = g.trim().toLowerCase();
  if (!GUESS_RE.test(s)) return null;
  const key = normalizeKey(s);
  return key.length >= 2 ? key : null;
};

export function parseDigEvent(body: unknown, today: string): DigEvent | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  switch (b.kind) {
    case "land":
      return isTrafficSource(b.source) ? { kind: "land", source: b.source } : null;
    case "start":
      return b.date === today ? { kind: "start", date: today } : null;
    case "past":
    case "story":
    case "signup":
      return { kind: b.kind };
    case "share":
      return b.how === "text" || b.how === "image" ? { kind: "share", how: b.how } : null;
    case "claim": {
      const guess = cleanGuess(b.guess);
      return b.date === today && isPromptIndex(b.prompt) && guess ? { kind: "claim", date: today, prompt: b.prompt, guess } : null;
    }
    case "finish": {
      if (b.date !== today || !isValidScore(b.score)) return null;
      if (!Array.isArray(b.tiers) || b.tiers.length !== PROMPTS) return null;
      if (!b.tiers.every((t) => t === null || (TIERS as readonly unknown[]).includes(t))) return null;
      const tiers = b.tiers as (Tier | null)[];
      if (scoreOf(tiers) !== b.score) return null;
      if (!Array.isArray(b.rejected) || b.rejected.length > MAX_REJECTED_PER_FINISH) return null;
      const rejected: [number, string][] = [];
      for (const r of b.rejected) {
        if (!Array.isArray(r) || !isPromptIndex(r[0])) return null;
        const g = cleanGuess(r[1]);
        // A junk guess is dropped, not fatal: the finish itself still counts.
        if (!g) continue;
        rejected.push([r[0], g]);
      }
      return { kind: "finish", date: today, score: b.score, tiers, rejected };
    }
    default:
      return null;
  }
}

/** The funnel hash field an event increments; null for events with their own keys. */
export function funnelField(ev: DigEvent): string | null {
  switch (ev.kind) {
    case "land": return `land:${ev.source}`;
    case "start": return "start";
    case "past": return "past:start";
    case "share": return `share:${ev.how}`;
    case "story": return "story";
    case "signup": return "signup";
    case "finish": return "finish";
    case "claim": return null;
  }
}

export type Incr = [key: string, field: string, by: number];

/** Every write a finish makes, merged so a repeated guess is one HINCRBY. */
export function planFinish(ev: Extract<DigEvent, { kind: "finish" }>): Incr[] {
  const out: Incr[] = [
    [digKeys.scores(ev.date), String(Math.floor(ev.score / 10)), 1],
    [digKeys.funnel(ev.date), "finish", 1],
  ];
  const rej = new Map<string, Incr>();
  for (const [i, g] of ev.rejected) {
    const key = `${i}|${g}`;
    const hit = rej.get(key);
    if (hit) hit[2]++;
    else rej.set(key, [digKeys.rejected(ev.date, i), g, 1]);
  }
  return [...out, ...rej.values()];
}
