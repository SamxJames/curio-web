"use client";

import { useEffect } from "react";
import SignupOffer from "./SignupOffer";
import { markArrivedFromEmailThisSession } from "@/lib/storage";
import { isEmailArrival } from "@/lib/emailArrival";

/** A story page's front door for someone who arrived from search: what
 * Curio is, and how to get tomorrow's word. Records a digest link this
 * session (utm_source=email, see lib/email.ts; forgotten once the tab
 * closes, so a forwarded or copied link doesn't hide the pitch for whoever
 * opens it next), then hands the offer to SignupOffer, which hides it, pitch
 * and all, for anyone this browser knows already gets the email (a real
 * signup here, or that digest arrival), since subscribers land on story
 * pages every morning and shouldn't be pitched the thing they already have.
 * Signed-out readers get the email form; signed-in readers who aren't
 * subscribed get the one-tap button; signed-in subscribers see nothing. */
export default function StoryFrontDoor() {
  useEffect(() => {
    if (isEmailArrival(window.location.search)) markArrivedFromEmailThisSession();
  }, []);

  return (
    <SignupOffer
      placement="story"
      ariaLabel="About Curio"
      className="mt-12 border-t border-line pt-8"
      pitch={
        <p className="font-sans text-sm leading-relaxed text-ink-soft">
          This is Curio: one word&apos;s origin story, every morning. No feed, no backlog.
        </p>
      }
    />
  );
}
