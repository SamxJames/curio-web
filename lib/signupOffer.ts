export type OfferInput = {
  session: "loading" | "authenticated" | "unauthenticated";
  subscribedHere: boolean;
  arrivedFromEmail: boolean;
  me: "unknown" | "subscribed" | "not-subscribed" | "error";
};

export type OfferMode = "none" | "form" | "form-unless-signed-in" | "one-tap";

/** What the email offer shows (spec 2026-10-18-clear-email-offer-design.md).
 * Never pitches the email to someone this browser knows already gets it.
 * While the session loads it's the signed-out form, so it's in the server
 * HTML with no layout shift, but "form-unless-signed-in": the caller hides
 * it with the pre-paint `signed-in:` variant (app/globals.css), so a
 * signed-in reader never sees it flash. Signed in, it waits for the
 * subscription status and then shows the one tap or nothing. */
export function offerMode(i: OfferInput): OfferMode {
  if (i.subscribedHere || i.arrivedFromEmail) return "none";
  if (i.session === "loading") return "form-unless-signed-in";
  if (i.session === "unauthenticated") return "form";
  return i.me === "not-subscribed" ? "one-tap" : "none";
}
