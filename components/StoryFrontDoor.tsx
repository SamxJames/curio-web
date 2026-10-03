"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import clsx from "clsx";
import { useSession } from "next-auth/react";
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
 * morning and shouldn't be pitched the thing they already have. Also hidden
 * for anyone signed in — they manage the email from /account, so a
 * "join" pitch reads as Curio not recognising them. */
export default function StoryFrontDoor() {
  const subscribedHere = useHasSubscribedHere();
  const arrivedFromEmailThisSession = useHasArrivedFromEmailThisSession();
  const { status: sessionStatus } = useSession();
  // Pinned open after a signup on this page, so the "You're in" message
  // isn't unmounted the instant markSubscribedHere() flips the flag.
  const [justJoined, setJustJoined] = useState(false);

  useEffect(() => {
    if (isEmailArrival(window.location.search)) markArrivedFromEmailThisSession();
  }, []);

  if ((subscribedHere || arrivedFromEmailThisSession || sessionStatus === "authenticated") && !justJoined) {
    return null;
  }

  return (
    <section
      aria-label="About Curio"
      // While useSession() is still loading, the pre-paint session hint
      // (see lib/storage.ts readSessionHint) hides the pitch so a signed-in
      // reader never sees it flash in before their session resolves.
      className={clsx("mt-12 border-t border-line pt-8", sessionStatus === "loading" && "signed-in:hidden")}
    >
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
