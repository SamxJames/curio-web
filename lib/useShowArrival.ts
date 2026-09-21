"use client";

import { useSessionStatus } from "./useSessionStatus";
import { useHasOnboarded } from "./storage";

/** Whether to show the first-time arrival hero instead of the normal Today
 * page. Requires the RESOLVED negative session state — treating
 * useSession()'s transient "loading" as "anonymous" flashed the arrival
 * hero (and its reduced header) at any signed-in user whose browser hadn't
 * set the onboarded flag, e.g. someone signing in on a second device.
 * useSessionStatus() is what resolves that now (optimistically, from the
 * localStorage hint) so this hook never sees "loading" at all. One shared
 * hook so Header and HomeContent can't independently drift. */
export function useShowArrival(): boolean {
  const status = useSessionStatus();
  const onboarded = useHasOnboarded();
  return status === "unauthenticated" && !onboarded;
}
