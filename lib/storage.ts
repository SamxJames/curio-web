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
