"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import EmailSignupInline from "./EmailSignupInline";
import {
  markArrivedFromEmailThisSession,
  useHasArrivedFromEmailThisSession,
  useHasSubscribedHere,
} from "@/lib/storage";
import { isEmailArrival } from "@/lib/emailArrival";

/** A story page's front door for someone who arrived from search: what
 * Curio is, and how to get tomorrow's word. Hidden for anyone this browser
 * knows already gets the email — a real signup here (persists forever) or a
 * digest link this session (utm_source=email, see lib/email.ts; forgotten
 * once the tab closes, so a forwarded or copied link doesn't hide the pitch
 * for whoever opens it next) — since subscribers land on story pages every
 * morning and shouldn't be pitched the thing they already have. */
export default function StoryFrontDoor() {
  const subscribedHere = useHasSubscribedHere();
  const arrivedFromEmailThisSession = useHasArrivedFromEmailThisSession();
  // Pinned open after a signup on this page, so the "check your inbox"
  // message isn't unmounted if the subscribed-here flag flips meanwhile
  // (/subscribed sets it once the emailed link is confirmed, possibly in
  // another tab).
  const [justJoined, setJustJoined] = useState(false);

  useEffect(() => {
    if (isEmailArrival(window.location.search)) markArrivedFromEmailThisSession();
  }, []);

  if ((subscribedHere || arrivedFromEmailThisSession) && !justJoined) return null;

  return (
    <section aria-label="About Curio" className="mt-12 border-t border-line pt-8">
      <p className="font-sans text-sm leading-relaxed text-ink-soft">
        This is Curio: one word&apos;s origin story, every morning. No feed, no backlog.
      </p>
      <div className="mt-5">
        {/* flushSync so justJoined commits synchronously, ahead of any
         * subscribed-here store re-render that could unmount this section. */}
        <EmailSignupInline onSubscribed={() => flushSync(() => setJustJoined(true))} />
      </div>
    </section>
  );
}
