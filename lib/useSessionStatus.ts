"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useSessionHint, writeSessionHint } from "./storage";

export type ResolvedSessionStatus = "authenticated" | "unauthenticated";

/** useSession()'s status with the transient "loading" state resolved from
 * the localStorage hint, so callers get a binary answer on the very first
 * render instead of each having to special-case a third state.
 *
 * This is the one place that writes the hint. It is for chrome that has to
 * render *something* immediately (the header's nav, the arrival hero's
 * visibility) — not for anything that acts on the session. See
 * readSessionHint's comment in lib/storage.ts. */
export function useSessionStatus(): ResolvedSessionStatus {
  const { status } = useSession();
  const hint = useSessionHint();

  useEffect(() => {
    if (status === "authenticated") writeSessionHint(true);
    else if (status === "unauthenticated") writeSessionHint(false);
  }, [status]);

  if (status === "loading") return hint ? "authenticated" : "unauthenticated";
  return status;
}
