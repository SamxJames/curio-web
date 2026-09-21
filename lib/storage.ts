"use client";

import { useSyncExternalStore } from "react";

const FAVORITES_KEY = "curio:favorites";
const THEME_KEY = "curio:theme"; // "light" | "dark" | absent = system
const ONBOARDED_KEY = "curio:onboarded";

// Every localStorage-backed value in this module goes through this same
// tiny pub-sub so components can read it with useSyncExternalStore instead
// of the effect+setState pattern (which risks a hydration mismatch, since
// localStorage isn't available during server rendering).
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** For one-off browser-capability checks (e.g. `navigator.share`) that never
 * change during a session but must still resolve after hydration rather
 * than during the initial (server-matching) render. */
export function useClientOnlyValue<T>(getValue: () => T, serverValue: T): T {
  return useSyncExternalStore(
    () => () => {},
    getValue,
    () => serverValue
  );
}

// useSyncExternalStore requires getSnapshot to return a reference-stable
// value when nothing has changed (React compares with Object.is); returning
// a freshly-constructed Set on every call makes it look like the store
// changes on every render, which triggers an infinite re-render loop. So
// each key's last-read Set is cached and only rebuilt when the raw
// localStorage string actually differs from what produced it.
const EMPTY_SET: Set<string> = new Set();
const setCache = new Map<string, { raw: string | null; value: Set<string> }>();

function readSet(key: string): Set<string> {
  if (typeof window === "undefined") return EMPTY_SET;
  try {
    const raw = window.localStorage.getItem(key);
    const cached = setCache.get(key);
    if (cached && cached.raw === raw) return cached.value;
    const value = raw ? new Set<string>(JSON.parse(raw)) : EMPTY_SET;
    setCache.set(key, { raw, value });
    return value;
  } catch {
    return EMPTY_SET;
  }
}

function writeSet(key: string, set: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(Array.from(set)));
  notify();
}

export function getFavorites(): Set<string> {
  return readSet(FAVORITES_KEY);
}

export function useFavorites(): Set<string> {
  return useSyncExternalStore(subscribe, () => getFavorites(), () => EMPTY_SET);
}

export function isFavorite(slug: string): boolean {
  return getFavorites().has(slug);
}

export function toggleFavorite(slug: string): boolean {
  // Copy rather than mutate the cached Set in place — readSet/getFavorites
  // hands out that same cached reference to callers, and mutating a Set
  // that's already been returned as a snapshot would change it without a
  // new reference for useSyncExternalStore to notice.
  const next = new Set(getFavorites());
  const nowFavorited = !next.has(slug);
  if (nowFavorited) next.add(slug);
  else next.delete(slug);
  writeSet(FAVORITES_KEY, next);
  void syncFavoriteToAccount(slug, nowFavorited);
  return nowFavorited;
}

/** Best-effort background sync — local state (written just above) already
 * reflects the toggle regardless of whether this succeeds, so failures are
 * swallowed rather than surfaced. */
async function syncFavoriteToAccount(slug: string, favorited: boolean): Promise<void> {
  try {
    await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, favorited }),
    });
  } catch {
    // best-effort; nothing to do here (also swallows the 401 for signed-out users)
  }
}

/** Pulls account favorites into the local cache — used once per sign-in by
 * AccountFavoritesSync so a second device/browser immediately shows
 * favorites made elsewhere. Only ever adds slugs, never removes any. */
export function mergeFavoritesFromAccount(slugs: string[]): void {
  if (typeof window === "undefined") return;
  const current = getFavorites();
  const merged = new Set(current);
  let changed = false;
  for (const slug of slugs) {
    if (!merged.has(slug)) {
      merged.add(slug);
      changed = true;
    }
  }
  if (changed) writeSet(FAVORITES_KEY, merged);
}

export type ThemePreference = "light" | "dark" | "system";

export function getThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const value = window.localStorage.getItem(THEME_KEY);
  return value === "light" || value === "dark" ? value : "system";
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, () => getThemePreference(), () => "system");
}

export function setThemePreference(pref: ThemePreference) {
  if (typeof window === "undefined") return;
  if (pref === "system") window.localStorage.removeItem(THEME_KEY);
  else window.localStorage.setItem(THEME_KEY, pref);
  applyThemeToDocument(pref);
  notify();
}

export function applyThemeToDocument(pref: ThemePreference) {
  if (typeof document === "undefined") return;
  if (pref === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", pref);
}

export function hasOnboarded(): boolean {
  if (typeof window === "undefined") return true; // avoid SSR flash of onboarding
  return window.localStorage.getItem(ONBOARDED_KEY) === "1";
}

/** Server/pre-hydration snapshot is `true` (modal hidden) so the overlay
 * never flashes into a server-rendered page; it resolves to the real value
 * immediately after hydration, same as a first-visit reveal would anyway. */
export function useHasOnboarded(): boolean {
  return useSyncExternalStore(subscribe, () => hasOnboarded(), () => true);
}

export function markOnboarded() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ONBOARDED_KEY, "1");
  notify();
}

const SESSION_HINT_KEY = "curio:signedIn"; // "1" = this browser was signed in last time a session resolved

/** Optimistic "was this browser signed in?" hint, written whenever
 * useSession() resolves in components/Header.tsx and read BEFORE PAINT by
 * components/SessionHintInit.tsx's inline script, which sets a
 * `data-signed-in` attribute on <html> that app/globals.css's `signed-in:`
 * Tailwind variant reads. That's the same pre-hydration pattern
 * components/ThemeInit.tsx already uses for the theme preference — it runs
 * before React hydrates, so unlike a useSyncExternalStore hook (which is
 * still bound by its server snapshot during hydration) it can actually
 * affect the very first paint.
 *
 * app/layout.tsx deliberately no longer calls auth(): doing so read
 * cookies, which opted the root layout — and so every route in the app —
 * into dynamic rendering, and that is what kept 1,147 story pages from
 * being prerendered (see docs/superpowers/specs/
 * 2026-09-20-search-discoverability-design.md for the build-output
 * evidence).
 *
 * It is a DISPLAY hint only. It lives in localStorage, is trivially
 * forgeable, and must never gate an API call or an authorization
 * decision — components/AccountFavoritesSync.tsx and
 * components/PuzzleGame.tsx keep reading useSession() directly for
 * exactly that reason, and the `signed-in:` CSS variant it drives must
 * never be used to hide anything security-relevant, only to pick which
 * nav labels render before the real session resolves. A stale `true`
 * (session expired, or signed out in another tab) shows the signed-in nav
 * for the few hundred milliseconds before useSession() resolves and
 * corrects it. */
export function readSessionHint(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SESSION_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSessionHint(signedIn: boolean) {
  if (typeof window === "undefined") return;
  // Only write on a real change: the caller (Header) runs this on every
  // session resolution.
  if (readSessionHint() === signedIn) return;
  try {
    if (signedIn) window.localStorage.setItem(SESSION_HINT_KEY, "1");
    else window.localStorage.removeItem(SESSION_HINT_KEY);
    if (signedIn) document.documentElement.setAttribute("data-signed-in", "");
    else document.documentElement.removeAttribute("data-signed-in");
  } catch {
    return;
  }
}

const PLAY_STATE_KEY_PREFIX = "curio:play:"; // one key per puzzle date, e.g. curio:play:2026-10-15

export type PlayState = {
  puzzleDate: string; // YYYY-MM-DD — which puzzle this state belongs to
  cluesRevealed: 1 | 2 | 3;
  status: "playing" | "solved" | "failed";
  cluesUsedToSolve: 1 | 2 | 3 | null; // set only once status leaves "playing"
};

function playStateKey(puzzleDate: string): string {
  return `${PLAY_STATE_KEY_PREFIX}${puzzleDate}`;
}

// Same rationale as setCache above: useSyncExternalStore requires getSnapshot
// to return a reference-stable value when nothing has changed, but
// JSON.parse-ing the raw string fresh on every call would hand back a new
// object each time even when the underlying value is identical — which
// reads to React as "the store changed on every render" and triggers an
// infinite re-render loop the moment any play state has actually been
// saved. Cached per puzzle-date key, keyed off the raw string so a real
// write (a new raw string) still invalidates it.
const playStateCache = new Map<string, { raw: string | null; value: PlayState | null }>();

export function getPlayState(puzzleDate: string): PlayState | null {
  if (typeof window === "undefined") return null;
  try {
    const key = playStateKey(puzzleDate);
    const raw = window.localStorage.getItem(key);
    const cached = playStateCache.get(key);
    if (cached && cached.raw === raw) return cached.value;
    const value = raw ? (JSON.parse(raw) as PlayState) : null;
    playStateCache.set(key, { raw, value });
    return value;
  } catch {
    return null;
  }
}

export function usePlayState(puzzleDate: string): PlayState | null {
  return useSyncExternalStore(subscribe, () => getPlayState(puzzleDate), () => null);
}

/** Persists today's play state locally (so a reload doesn't reset progress
 * or let the puzzle be replayed) and, best-effort, to the signed-in
 * account — mirroring toggleFavorite's fire-and-forget sync above. Local
 * state already reflects the change regardless of whether the sync
 * succeeds. */
export function savePlayState(state: PlayState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(playStateKey(state.puzzleDate), JSON.stringify(state));
  notify();
  void syncPlayStateToAccount(state);
}

async function syncPlayStateToAccount(state: PlayState): Promise<void> {
  try {
    await fetch("/api/play-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
  } catch {
    // best-effort; nothing to do here (also swallows the 401 for signed-out users)
  }
}

const PUZZLE_STATS_KEY = "curio:puzzleStats";

// [clues-to-solve-on-1, on-2, on-3, failed] — index 3 is "failed", not a
// 4th clue. No streak field, ever — see this plan's Global Constraints.
export type PuzzleStats = { played: number; histogram: [number, number, number, number] };

const EMPTY_STATS: PuzzleStats = { played: 0, histogram: [0, 0, 0, 0] };

// See playStateCache above for why this is needed: without it, getSnapshot
// hands useSyncExternalStore a freshly-parsed (so reference-unequal) object
// on every call once any stats have ever been recorded, which reads as a
// constantly-changing store and triggers an infinite re-render loop.
let statsCache: { raw: string | null; value: PuzzleStats } | null = null;

export function getPuzzleStats(): PuzzleStats {
  if (typeof window === "undefined") return EMPTY_STATS;
  try {
    const raw = window.localStorage.getItem(PUZZLE_STATS_KEY);
    if (statsCache && statsCache.raw === raw) return statsCache.value;
    const value = raw ? (JSON.parse(raw) as PuzzleStats) : EMPTY_STATS;
    statsCache = { raw, value };
    return value;
  } catch {
    return EMPTY_STATS;
  }
}

export function usePuzzleStats(): PuzzleStats {
  return useSyncExternalStore(subscribe, () => getPuzzleStats(), () => EMPTY_STATS);
}

/** Records one completed puzzle (solved on a given clue, or failed) into
 * the local, per-device stats histogram. Local-only by design — see this
 * plan's Flagged decision D for why this doesn't sync to the account the
 * way play state does. Call this exactly once per puzzle completion (the
 * caller — components/PuzzleGame.tsx — only calls it from the actual
 * guess-submission handler, never from an effect that could re-fire on a
 * reload of an already-completed puzzle). */
export function recordPuzzleResult(cluesUsedToSolve: 1 | 2 | 3 | null): void {
  if (typeof window === "undefined") return;
  const stats = getPuzzleStats();
  const index = cluesUsedToSolve === null ? 3 : cluesUsedToSolve - 1;
  const histogram = [...stats.histogram] as [number, number, number, number];
  histogram[index] += 1;
  const next: PuzzleStats = { played: stats.played + 1, histogram };
  window.localStorage.setItem(PUZZLE_STATS_KEY, JSON.stringify(next));
  notify();
}
