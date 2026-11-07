"use client";

import { getArrivalSource } from "../trafficClient";
import { firstPlayDate } from "./cohort";
import { MAX_REJECTED_PER_FINISH, VIA_SOURCES, type ViaSource } from "./events";
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
export function buildFinishEvent(date: string, tiers: (Tier | null)[], score: number, results: PromptResult[], includeGuesses: boolean, isNew: boolean) {
  const rejected = includeGuesses
    ? results.flatMap((r, i) => r.rejected.map((g) => [i, g] as [number, string])).slice(0, MAX_REJECTED_PER_FINISH)
    : [];
  return { kind: "finish" as const, date, score, tiers, rejected, ...(isNew ? { isNew: true as const } : {}) };
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

/** The Curio link a /dig visit came from (?from=), or null when absent or not a known source. */
export function viaFrom(search: string): ViaSource | null {
  const v = new URLSearchParams(search).get("from");
  return v && (VIA_SOURCES as readonly string[]).includes(v) ? (v as ViaSource) : null;
}

/** Counts which Curio link opened /dig (once per tab session per link), then drops ?from= so
 * a copied or shared URL is clean. */
export function sendViaOnce(): void {
  try {
    const from = viaFrom(window.location.search);
    if (!from) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("from");
    // Pass null, not history.state: Next's patched replaceState only syncs its router URL
    // when the state lacks its internal marker, so null lets Next update its own URL too.
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    const key = `curio:dig:via:${from}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    sendDigEvent({ kind: "via", from });
  } catch {
    // private mode: better to under-count
  }
}

export type ReturnBucket = "d1" | "d2_6" | "d7";
const DAY = 86_400_000;
const utcDay = (iso: string) => { const t = Date.parse(iso.slice(0, 10)); return Number.isNaN(t) ? null : t; };

/** Coarse "this device finished a dig on an earlier UTC day" flag, bucketed by the gap. Read
 * from the store already in memory; nothing is stored or sent about a person. */
export function returningBucket(games: Record<string, { finishedAt: string }>, today: string): ReturnBucket | null {
  const now = Date.parse(today);
  let latest: number | null = null;
  for (const g of Object.values(games)) {
    const d = typeof g.finishedAt === "string" ? utcDay(g.finishedAt) : null;
    if (d !== null && d < now && (latest === null || d > latest)) latest = d;
  }
  if (latest === null) return null;
  const gap = Math.round((now - latest) / DAY);
  return gap <= 1 ? "d1" : gap <= 6 ? "d2_6" : "d7";
}

export function buildStartEvent(date: string, games: Record<string, { finishedAt: string }>) {
  const ret = returningBucket(games, date);
  const first = firstPlayDate(games, date);
  return { kind: "start" as const, date, ...(ret ? { ret } : {}), ...(first ? { first } : {}) };
}
