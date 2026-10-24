"use client";

import { useSyncExternalStore } from "react";
import type { Tier } from "./types";

/** localStorage key curio:dig, version 1 (architecture §7). No account sync in the MVP. */
const KEY = "curio:dig";
const MAX_GAMES = 400;

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

export function parseStore(raw: string | null): DigStore {
  if (!raw) return empty();
  try {
    const s = JSON.parse(raw) as Partial<DigStore>;
    if (s?.v !== 1 || typeof s.games !== "object" || !s.games) return empty();
    return { v: 1, settings: { noTimer: !!s.settings?.noTimer }, games: s.games };
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
const SERVER_STORE = empty();

function readStore(): DigStore {
  if (typeof window === "undefined") return SERVER_STORE;
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(KEY); } catch { /* private mode */ }
  if (cache && cache.raw === raw) return cache.value;
  cache = { raw, value: parseStore(raw) };
  return cache.value;
}

function writeStore(store: DigStore) {
  try { window.localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* full or private: play still works */ }
  cache = null;
  listeners.forEach((l) => l());
}

export function useDigStore(): DigStore {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    readStore,
    () => SERVER_STORE
  );
}

export function saveGame(date: string, game: StoredGame) { writeStore(withGame(readStore(), date, game)); }
export function setNoTimer(on: boolean) { const s = readStore(); writeStore({ ...s, settings: { noTimer: on } }); }
export function markReported(date: string, spread: Record<string, number> | null) {
  const s = readStore();
  const g = s.games[date];
  if (g) writeStore(withGame(s, date, { ...g, reported: true, ...(spread ? { spread } : {}) }));
}
