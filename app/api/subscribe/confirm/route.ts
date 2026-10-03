import { NextRequest, NextResponse } from "next/server";
import { getSubscriberByEmail, upsertSubscriber } from "@/lib/db";
import { verifyConfirmToken } from "@/lib/confirmToken";
import { recordTrafficEvent } from "@/lib/trafficStats";
import { unsubscribeSecret } from "@/lib/unsubscribeToken";

const result = (req: NextRequest, ok: boolean) =>
  NextResponse.redirect(new URL(`/subscribed?ok=${ok ? 1 : 0}`, req.url), 303);

/** The confirm page's button POSTs here (the emailed link itself only
 * opens that page — scanners prefetch GETs). Idempotent: confirming an
 * address that's already subscribed changes nothing and isn't re-counted,
 * so the original createdAt survives. */
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const secret = unsubscribeSecret();
  const claim = token && secret ? verifyConfirmToken(token, secret) : null;
  if (!claim) return result(req, false);

  try {
    if (await getSubscriberByEmail(claim.email)) return result(req, true);
    await upsertSubscriber(claim.email);
  } catch (err) {
    console.error("[curio:subscribe] confirm failed:", err instanceof Error ? err.name : "unknown");
    return result(req, false);
  }

  try {
    await recordTrafficEvent({ kind: "signup", source: claim.source });
  } catch (err) {
    console.error("traffic: signup record failed", err instanceof Error ? err.name : "unknown");
  }
  return result(req, true);
}
