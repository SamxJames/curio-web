"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import EmailSignupInline from "./EmailSignupInline";
import { markSubscribedHere, useHasSubscribedHere } from "@/lib/storage";
import { isEmailArrival } from "@/lib/emailArrival";

/** A story page's front door for someone who arrived from search: what
 * Curio is, and how to get tomorrow's word. Hidden for anyone this browser
 * knows already gets the email — a digest link (utm_source=email, see
 * lib/email.ts) or a signup here — since subscribers land on story pages
 * every morning and shouldn't be pitched the thing they already have. */
export default function StoryFrontDoor() {
  const subscribedHere = useHasSubscribedHere();
  // Pinned open after a signup on this page, so the "You're in" message
  // isn't unmounted the instant markSubscribedHere() flips the flag.
  const [justJoined, setJustJoined] = useState(false);

  useEffect(() => {
    if (isEmailArrival(window.location.search)) markSubscribedHere();
  }, []);

  if (subscribedHere && !justJoined) return null;

  return (
    <section aria-label="About Curio" className="mt-12 border-t border-line pt-8">
      <p className="font-sans text-sm leading-relaxed text-ink-soft">
        This is Curio: one word&apos;s origin story, every morning. No feed, no backlog.
      </p>
      <div className="mt-5">
        {/* flushSync so justJoined commits before EmailSignupInline's
         * markSubscribedHere() triggers the store re-render. */}
        <EmailSignupInline onSubscribed={() => flushSync(() => setJustJoined(true))} />
      </div>
    </section>
  );
}
