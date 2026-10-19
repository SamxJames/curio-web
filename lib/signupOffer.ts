export type OfferInput = {
  session: "loading" | "authenticated" | "unauthenticated";
  subscribedHere: boolean;
  arrivedFromEmail: boolean;
  me: "unknown" | "subscribed" | "not-subscribed" | "error";
};

/** What the email offer shows (spec 2026-10-18-clear-email-offer-design.md).
 * Never pitches the email to someone this browser knows already gets it,
 * and never flashes while the session or subscription status is unknown. */
export function offerMode(i: OfferInput): "none" | "form" | "one-tap" {
  if (i.subscribedHere || i.arrivedFromEmail || i.session === "loading") return "none";
  if (i.session === "unauthenticated") return "form";
  return i.me === "not-subscribed" ? "one-tap" : "none";
}
