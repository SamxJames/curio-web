"use client";

import { useEffect } from "react";
import { markSubscribedHere } from "@/lib/storage";

/** Sets this browser's "already gets the email" flag (it hides the signup
 * pitch) once a subscription is actually confirmed — not when the form is
 * submitted, so a mistyped address never hides the pitch. Renders nothing. */
export default function MarkSubscribedHere() {
  useEffect(() => {
    markSubscribedHere();
  }, []);
  return null;
}
