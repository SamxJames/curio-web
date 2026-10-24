"use client";

import { useSyncExternalStore } from "react";
import { isValidScore, PROMPTS_PER_DAY, scoreOf } from "./score";
import { TIERS, type Tier } from "./types";

/** localStorage key curio:dig, version 1 (architecture §7). No account sync in the MVP. */
const KEY = "curio:dig";
const MAX_GAMES = 400;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type StoredGame = {
  answers: (string | null)[];
  tiers: (Tier | null)[];
  score: number;
  finishedAt: string;
  /** today's score spread, saved so a reload doesn't ask again */
  spread?: Record<string, number>;
  /** the finish event has been sent (one per browser per day) */
  reported?: boolean;
};
export type DigStore = { v: 1; settings: { noTimer: boolean }; games: Record<string, StoredGame> };

const empty = (): DigStore => ({ v: 1, settings: { noTimer: false }, games: {} });

const isTier = (t: unknown): t is Tier | null => t === null || (TIERS as readonly unknown[]).includes(t);

function parseSpread(v: unknown): Record<string, number> | undefined {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return undefined;
  const values = Object.values(v);
  return values.every((n) => Number.isInteger(n) && (n as number) >= 0) ? (v as Record<string, number>) : undefined;
}

/** One game entry, or null when a required field is wrong. Bad optional fields are dropped, the game kept. */
function parseGame(v: unknown): StoredGame | null {
  if (typeof v !== "object" || v === null) return null;
  const g = v as Record<string, unknown>;
  const { answers, tiers, score, finishedAt } = g;
  if (!Array.isArray(answers) || answers.length !== PROMPTS_PER_DAY) return null;
  if (!answers.every((a) => a === null || typeof a === "string")) return null;
  if (!Array.isArray(tiers) || tiers.length !== PROMPTS_PER_DAY || !tiers.every(isTier)) return null;
  if (!isValidScore(score) || score !== scoreOf(tiers as (Tier | null)[])) return null;
  if (typeof finishedAt !== "string") return null;
  const game: StoredGame = { answers: answers as (string | null)[], tiers: tiers as (Tier | null)[], score, finishedAt };
  const spread = parseSpread(g.spread);
  if (spread) game.spread = spread;
  if (typeof g.reported === "boolean") game.reported = g.reported;
  return game;
}

export function parseStore(raw: string | null): DigStore {
  if (!raw) return empty();
  try {
    const s = JSON.parse(raw) as Partial<DigStore>;
    if (s?.v !== 1 || typeof s.games !== "object" || !s.games || Array.isArray(s.games)) return empty();
    const games: Record<string, StoredGame> = {};
    for (const [date, entry] of Object.entries(s.games)) {
      if (!DATE_KEY.test(date)) continue;
      const game = parseGame(entry);
      if (game) games[date] = game;
    }
    return { v: 1, settings: { noTimer: !!s.settings?.noTimer }, games };
  } catch {
    return empty();
  }
}

export function withGame(store: DigStore, date: string, game: StoredGame): DigStore {
  const games = { ...store.games, [date]: game };
  const dates = Object.keys(games).sort();
  for (const d of dates.slice(0, Math.max(0, dates.length - MAX_GAMES))) delete games[d];
  return { ...store, games };
}

const listeners = new Set<() => void>();
let cache: { raw: string | null; value: DigStore } | null = null;
/** This session's copy when localStorage refuses a write (full, or blocked). It wins over storage
 * until a write succeeds again or another tab changes the stored value. */
let memory: DigStore | null = null;
const SERVER_STORE = empty();

export function readStore(): DigStore {
  if (typeof window === "undefined") return SERVER_STORE;
  if (memory) return memory;
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(KEY); } catch { /* blocked: reads fall back to an empty store */ }
  if (cache && cache.raw === raw) return cache.value;
  cache = { raw, value: parseStore(raw) };
  return cache.value;
}

function notify() {
  listeners.forEach((l) => l());
}

function writeStore(store: DigStore) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
    memory = null;
  } catch {
    memory = store;
  }
  cache = null;
  notify();
}

function onStorage(e: StorageEvent) {
  if (e.key !== null && e.key !== KEY) return;
  memory = null;
  cache = null;
  notify();
}

/** Module-level so the subscriber keeps one identity. The storage listener exists only while
 * someone is subscribed, so a second tab's writes reach this one. */
function subscribe(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function useDigStore(): DigStore {
  return useSyncExternalStore(subscribe, readStore, () => SERVER_STORE);
}

export function saveGame(date: string, game: StoredGame) { writeStore(withGame(readStore(), date, game)); }
export function setNoTimer(on: boolean) { const s = readStore(); writeStore({ ...s, settings: { noTimer: on } }); }
export function markReported(date: string, spread: Record<string, number> | null) {
  const s = readStore();
  const g = s.games[date];
  if (g) writeStore(withGame(s, date, { ...g, reported: true, ...(spread ? { spread } : {}) }));
}
