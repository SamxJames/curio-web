"use client";

import { getArrivalSource } from "../trafficClient";
import { MAX_REJECTED_PER_FINISH } from "./events";
import type { PromptResult } from "./game";
import type { Tier } from "./types";

/** Browser side of /api/dig/event: fire-and-forget like lib/trafficClient.ts. Analytics
 * never throws into the game. */
export function sendDigEvent(ev: object): void {
  try {
    void fetch("/api/dig/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ev), keepalive: true }).catch(() => {});
  } catch {
    // best-effort only
  }
}

/** The finish event, which returns today's score spread for the percentile line. Null means
 * "no percentile": the event was refused or dropped (before launch, or the game crossed UTC
 * midnight so it is no longer today's), or the network failed. */
export async function sendFinish(ev: object): Promise<Record<string, number> | null> {
  try {
    const res = await fetch("/api/dig/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ev) });
    if (res.status !== 200) return null;
    const body = (await res.json()) as { spread?: Record<string, number> };
    return body.spread ?? null;
  } catch {
    return null;
  }
}

/** The finish event for today's game. Guesses go as the player typed them (the server
 * normalises), flattened to [prompt index, guess], and capped at what the server accepts:
 * a longer list would null the whole finish. `includeGuesses` is the day's sampling coin. */
export function buildFinishEvent(date: string, tiers: (Tier | null)[], score: number, results: PromptResult[], includeGuesses: boolean) {
  const rejected = includeGuesses
    ? results.flatMap((r, i) => r.rejected.map((g) => [i, g] as [number, string])).slice(0, MAX_REJECTED_PER_FINISH)
    : [];
  return { kind: "finish" as const, date, score, tiers, rejected };
}

const LANDED = "curio:dig:landed"; // sessionStorage: one land per tab session

/** Counts the first /dig view of a tab session, credited to the session's arrival source.
 * The send is deferred a tick so TrafficBeacon (a sibling effect) records the source first. */
export function sendLandOnce(): void {
  try {
    if (window.sessionStorage.getItem(LANDED)) return;
    window.sessionStorage.setItem(LANDED, "1");
    window.setTimeout(() => sendDigEvent({ kind: "land", source: getArrivalSource() }), 0);
  } catch {
    // private mode: better to under-count
  }
}
