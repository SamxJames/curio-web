import { NextRequest, NextResponse } from "next/server";
import { getSubscriberByEmail } from "@/lib/db";
import { isTrafficSource } from "@/lib/traffic";
import { recordTrafficEvent } from "@/lib/trafficStats";
import { normaliseEmail, unsubscribeSecret } from "@/lib/unsubscribeToken";
import { claimConfirmSend, releaseConfirmSend } from "@/lib/confirmCooldown";
import { claimDailyConfirmSlot } from "@/lib/confirmDailyCap";
import { confirmUrl, sendConfirmEmail } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The same reply whether the address is new, already subscribed, or
 * cooling down: the response never reveals who's on the list. */
const PENDING = { ok: true, pending: true } as const;

/** Double opt-in: stores nothing. Emails a signed 7-day link to the
 * confirm page (lib/confirmToken.ts); the address joins the digest only
 * when that page's button is pressed (app/api/subscribe/confirm). Signed-in
 * users subscribe from /account directly — their address is already proven. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { email, source } = (body ?? {}) as { email?: unknown; source?: unknown };
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  // Fails closed, like the daily cron: without the secret no link can be
  // signed (unsubscribeSecret() is null in production when it's unset).
  const secret = unsubscribeSecret();
  if (!secret) {
    console.error("[curio:subscribe] UNSUBSCRIBE_SECRET is not set; signups paused");
    return NextResponse.json({ error: "Signups are paused right now. Please try again later." }, { status: 503 });
  }

  const address = normaliseEmail(email);
  const src = isTrafficSource(source) ? source : "direct";

  // A Redis error here must not escape as an HTML 500 (the client's
  // res.json() would fail). Fail closed: no email is sent.
  try {
    if (await getSubscriberByEmail(address)) return NextResponse.json(PENDING);
    if (!(await claimConfirmSend(address))) return NextResponse.json(PENDING);
    // Site-wide daily cap (lib/confirmDailyCap.ts), checked after the
    // per-address checks so a repeat or cooled-down request doesn't use a
    // slot. Past it the reply is unchanged; only the owner's log says so.
    if (!(await claimDailyConfirmSlot())) {
      console.warn("[curio:subscribe] daily confirmation cap reached; not sending");
      return NextResponse.json(PENDING);
    }
  } catch (err) {
    console.error("[curio:subscribe] lookup failed:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json(
      { error: "Something went wrong on our side. Please try again in a few minutes." },
      { status: 500 }
    );
  }

  try {
    await sendConfirmEmail(address, confirmUrl(address, src, secret));
  } catch (err) {
    console.error("[curio:subscribe] confirm email failed:", err instanceof Error ? err.name : "unknown");
    await releaseConfirmSend(address).catch(() => {});
    return NextResponse.json(
      { error: "We couldn't send the confirmation email. Please try again in a few minutes." },
      { status: 502 }
    );
  }

  try {
    await recordTrafficEvent({ kind: "request", source: src });
  } catch (err) {
    console.error("traffic: request record failed", err instanceof Error ? err.name : "unknown");
  }
  return NextResponse.json(PENDING);
}
