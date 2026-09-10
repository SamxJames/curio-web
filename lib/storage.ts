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

function readSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
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
  return useSyncExternalStore(subscribe, () => getFavorites(), () => new Set<string>());
}

export function isFavorite(slug: string): boolean {
  return getFavorites().has(slug);
}

export function toggleFavorite(slug: string): boolean {
  const favorites = getFavorites();
  const nowFavorited = !favorites.has(slug);
  if (nowFavorited) favorites.add(slug);
  else favorites.delete(slug);
  writeSet(FAVORITES_KEY, favorites);
  return nowFavorited;
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
