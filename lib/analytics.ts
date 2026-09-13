import { track as vercelTrack } from "@vercel/analytics";

/** Every custom event this app fires, in one place — adding a new one
 * means adding a name here, not inventing a new string at the call site. */
export type AnalyticsEvent =
  | "arrival_view"
  | "signup_submitted"
  | "story_view"
  | "collection_view";

/** Thin wrapper around Vercel Analytics' custom-event API — the only place
 * in the app that imports `@vercel/analytics` directly, so swapping
 * providers later means rewriting this one function, not every call site.
 * Analytics failing (blocked script, ad blocker, etc.) must never break
 * the feature it's attached to. */
export function track(event: AnalyticsEvent, props?: Record<string, string | number | boolean>): void {
  try {
    vercelTrack(event, props);
  } catch {
    // best-effort only
  }
}
