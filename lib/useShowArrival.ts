"use client";

import { useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import { useHasOnboarded } from "./storage";

// No-op subscribe: the marker attribute is written once, by an inline
// script that runs before hydration (components/ServerSessionMarker.tsx),
// and never changes again during the page's life. Nothing needs to
// re-trigger this store — the useSyncExternalStore is here purely so the
// server-matching first render reads null (getServerSnapshot) and the very
// next render reads the real attribute, the same mismatch-avoidance
// pattern lib/storage.ts's hooks use for localStorage.
function subscribe() {
  return () => {};
}

function getServerSessionMarker(): string | null {
  return document.documentElement.getAttribute("data-server-session");
}

function getServerSnapshot(): string | null {
  return null;
}

/** Whether to show the first-time arrival hero instead of the normal Today
 * page. Requires the RESOLVED negative session state — either
 * useSession()'s own `"unauthenticated"`, or, while it's still `"loading"`,
 * app/page.tsx's server-known answer via
 * components/ServerSessionMarker.tsx's `data-server-session` attribute
 * (only `/` sets it — see that component's doc comment for why). Treating
 * a merely-not-yet-`"authenticated"` status as "anonymous" would flash the
 * arrival hero (and its reduced header) at any signed-in user whose
 * browser hasn't set the onboarded flag, e.g. someone signing in on a
 * second device — the marker exists precisely so `/` doesn't have to wait
 * out that ambiguity window, while every other route still does (no
 * marker there, so `"loading"` falls through unchanged). One shared hook
 * so Header and HomeContent can't independently drift on this
 * condition. */
export function useShowArrival(): boolean {
  const { status } = useSession();
  const onboarded = useHasOnboarded();
  const marker = useSyncExternalStore(subscribe, getServerSessionMarker, getServerSnapshot);

  const effectiveStatus =
    status === "loading" && marker ? (marker === "in" ? "authenticated" : "unauthenticated") : status;

  return effectiveStatus === "unauthenticated" && !onboarded;
}
