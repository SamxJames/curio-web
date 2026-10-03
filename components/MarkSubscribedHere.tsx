"use client";

import { useEffect } from "react";
import { markOnboarded, markSubscribedHere } from "@/lib/storage";

/** Sets this browser's "already gets the email" flag (it hides the signup
 * pitch) once a subscription is actually confirmed — not when the form is
 * submitted, so a mistyped address never hides the pitch. Also marks the
 * browser onboarded, so a confirmed subscriber isn't shown the first-visit
 * homepage hero again. Renders nothing. */
export default function MarkSubscribedHere() {
  useEffect(() => {
    markSubscribedHere();
    markOnboarded();
  }, []);
  return null;
}
