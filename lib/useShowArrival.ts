"use client";

import { useSession } from "next-auth/react";
import { useHasOnboarded } from "./storage";

/** Whether to show the first-time arrival hero instead of the normal Today
 * page. Requires the RESOLVED negative session state (`"unauthenticated"`,
 * not merely "not `authenticated` yet") — `useSession()` starts at
 * `"loading"` before its client-side fetch resolves, and treating that as
 * "anonymous" would flash the arrival hero (and its reduced header) at any
 * signed-in user whose browser hasn't set the onboarded flag, e.g. someone
 * signing in on a second device. One shared hook so Header and HomeContent
 * can't independently drift on this condition. */
export function useShowArrival(): boolean {
  const { status } = useSession();
  const onboarded = useHasOnboarded();
  return status === "unauthenticated" && !onboarded;
}
