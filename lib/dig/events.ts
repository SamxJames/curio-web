import { isTrafficSource, type TrafficSource } from "../traffic";
import { cohortDay } from "./cohort";
import { digKeys } from "./keys";
import { normalizeKey } from "./normalize";
import { isValidScore, scoreOf } from "./score";
import { TIERS, type Tier } from "./types";

/** The only gate between a public request body and a Redis field name (architecture §8–9),
 * modelled on lib/traffic.ts's parseTrafficEvent. Today-only events must name today. */
/** Coarse return-interval buckets a start may carry. Duplicated from client.ts on purpose: that is a client module. */
export const RETURN_BUCKETS = ["d1", "d2_6", "d7"] as const;

export type DigEvent =
  | { kind: "land"; source: TrafficSource }
  | { kind: "start"; date: string; ret?: (typeof RETURN_BUCKETS)[number]; first?: string }
  | { kind: "past" }
  | { kind: "share"; how: "text" | "image" }
  | { kind: "story" }
  | { kind: "signup" }
  | { kind: "timer" }
  | { kind: "row"; to: "play" | "past" }
  | { kind: "finish"; date: string; score: number; tiers: (Tier | null)[]; rejected: [number, string][]; isNew?: true }
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
    {
      if (b.date !== today) return null;
      const ret = (RETURN_BUCKETS as readonly unknown[]).includes(b.ret) ? (b.ret as (typeof RETURN_BUCKETS)[number]) : undefined;
      // The first-play date is only kept when it is a real date 1-60 days back: never trusted as sent.
      const first = typeof b.first === "string" && cohortDay(b.first, today) !== null ? b.first : undefined;
      return { kind: "start", date: today, ...(ret ? { ret } : {}), ...(first ? { first } : {}) };
    }
    case "past":
    case "story":
    case "signup":
      return { kind: b.kind };
    case "timer":
      return { kind: "timer" };
    case "row":
      return b.to === "play" || b.to === "past" ? { kind: "row", to: b.to } : null;
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
      return { kind: "finish", date: today, score: b.score, tiers, rejected, ...(b.isNew === true ? { isNew: true as const } : {}) };
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
    case "timer": return "timer:switch";
    case "row": return `row:${ev.to}`;
    case "finish": return "finish";
    case "claim": return null;
  }
}

/** Events one sender may send: any kind per minute, and finishes or claims per day. Generous for
 * a household or office sharing an address, tight enough that a script can't skew the
 * percentile or grow the rejected-guess hashes without limit. */
export function funnelFields(ev: DigEvent): string[] {
  const f = funnelField(ev);
  if (!f) return [];
  return ev.kind === "start" && ev.ret ? [f, `start:ret:${ev.ret}`] : [f];
}

export const RATE_LIMITS = { perMinute: 30, finishPerDay: 5, claimPerDay: 20 } as const;

/** True when a sender's counts (after this event) go over a limit. */
export function overRateLimit(kind: DigEvent["kind"], minuteCount: number, dayCount: number | null): boolean {
  if (minuteCount > RATE_LIMITS.perMinute) return true;
  if (kind === "finish") return (dayCount ?? 0) > RATE_LIMITS.finishPerDay;
  if (kind === "claim") return (dayCount ?? 0) > RATE_LIMITS.claimPerDay;
  return false;
}

export type Incr = [key: string, field: string, by: number];

/** Every write a finish makes, merged so a repeated guess is one HINCRBY. */
export function planFinish(ev: Extract<DigEvent, { kind: "finish" }>): Incr[] {
  const out: Incr[] = [
    [digKeys.scores(ev.date), String(Math.floor(ev.score / 10)), 1],
    [digKeys.funnel(ev.date), "finish", 1],
  ];
  const fossils = ev.tiers.filter((t) => t === "fossil").length;
  if (fossils > 0) out.push([digKeys.funnel(ev.date), "fossil", fossils]);
  if (ev.isNew) out.push([digKeys.funnel(ev.date), "finish:new", 1]);
  const rej = new Map<string, Incr>();
  for (const [i, g] of ev.rejected) {
    const key = `${i}|${g}`;
    const hit = rej.get(key);
    if (hit) hit[2]++;
    else rej.set(key, [digKeys.rejected(ev.date, i), g, 1]);
  }
  return [...out, ...rej.values()];
}
