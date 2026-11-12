"use client";

import { getArrivalSource } from "../trafficClient";
import { firstPlayDate, isNewPlayer } from "./cohort";
import { VIA_SOURCES, type ViaSource } from "./events";
import type { PromptResult } from "./game";
import { normalizeKey } from "./normalize";
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

/** The finish event for today's game. Wrong guesses are not on it: each goes out as its own
 * `miss` event the moment it is made (missKey / newMisses), so a game left unfinished still
 * counts. The empty `rejected` list is the shape the server expects. */
export function buildFinishEvent(date: string, tiers: (Tier | null)[], score: number, isNew: boolean, vs = false) {
  return { kind: "finish" as const, date, score, tiers, rejected: [] as [number, string][], ...(isNew ? { isNew: true as const } : {}), ...(vs ? { vs: true as const } : {}) };
}

/** A wrong guess's identity for "already sent": the prompt and the guess's normalised key, so
 * "ZZZZ" and "z z z z" are one miss, as in the reducer's own dedupe. */
export const missKey = (prompt: number, guess: string): string => `${prompt}|${normalizeKey(guess)}`;

/** The wrong guesses in `results` not yet in `sent`, as miss events in the order they were made.
 * Adds each to `sent`, so calling it again with the same results returns nothing. Guesses go as
 * typed (the server normalises). */
export function newMisses(date: string, results: PromptResult[], sent: Set<string>) {
  const out: { kind: "miss"; date: string; prompt: number; guess: string }[] = [];
  results.forEach((r, prompt) => {
    for (const guess of r.rejected) {
      const k = missKey(prompt, guess);
      if (sent.has(k)) continue;
      sent.add(k);
      out.push({ kind: "miss", date, prompt, guess });
    }
  });
  return out;
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

export function buildStartEvent(date: string, games: Record<string, { finishedAt: string }>, vs = false) {
  const ret = returningBucket(games, date);
  const first = firstPlayDate(games, date);
  return { kind: "start" as const, date, ...(ret ? { ret } : {}), ...(first ? { first } : {}), ...(vs ? { vs: true as const } : {}) };
}

/** `real` means the player actually shared or copied today's dig (not a download, not a past dig).
 * Only the first real share of a dig is counted, so the 12-04 rate reads as people, not taps.
 * `sheet` means the system share sheet took it, as opposed to a copy to the clipboard. */
export function buildShareEvent(how: "text" | "image", date: string, games: Record<string, { finishedAt: string; shared?: boolean }>, real: boolean, sheet: boolean) {
  const base = { kind: "share" as const, how };
  if (!real || !games[date] || games[date].shared) return base;
  const sharingDays = Object.values(games).filter((g) => g.shared).length + 1;
  return { ...base, once: true as const, ...(sheet ? { sheet: true as const } : {}), ...(isNewPlayer(games, date) ? { isNew: true as const } : {}), ...(sharingDays === 3 ? { third: true as const } : {}) };
}
